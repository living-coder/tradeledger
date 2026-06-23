#!/usr/bin/env python3
"""
Robinhood options sync script.
Reads JSON from stdin: {access_token: "..."}
Outputs a JSON array of contract objects to stdout.

The Robinhood API embeds option details (expiration_date, strike_price, option_type)
directly inside each order leg — no per-leg URL fetch is needed.
chain_symbol and fees (regulatory_fees + contract_fees) live on the order object.

Setup:
  pip install robin_stocks requests
"""

import json
import sys

try:
    import robin_stocks.robinhood as rh
    import robin_stocks.robinhood.helper as rh_helper
except ImportError as e:
    print(json.dumps([]), flush=True)
    sys.stderr.write(f"Missing dependency: {e}. Run: pip install robin_stocks\n")
    sys.exit(0)

try:
    creds = json.loads(sys.stdin.read())
except Exception:
    creds = {}

access_token = creds.get("access_token", "")
if not access_token:
    sys.stderr.write("No access_token provided — connect Robinhood via the Setup page first\n")
    print(json.dumps([]))
    sys.exit(0)

# Set up the robin_stocks session with the access token (no login() call needed)
rh_helper.set_login_state(True)
rh_helper.update_session("Authorization", f"Bearer {access_token}")
# Redirect robin_stocks internal status prints away from stdout so they don't corrupt JSON
rh_helper.set_output(sys.stderr)


def fetch_option_orders() -> list[dict]:
    """Fetch filled option orders. Uses inline leg data — no per-leg URL fetch needed."""
    orders = rh.orders.get_all_option_orders() or []
    # API returns newest-first; sort ascending so opens always precede their closes
    orders = sorted(orders, key=lambda o: o.get("created_at", ""))
    contracts = []

    for order in orders:
        if order.get("state") not in ("filled", "partially_filled"):
            continue

        underlying = order.get("chain_symbol", "")
        fees = (
            float(order.get("regulatory_fees") or 0)
            + float(order.get("contract_fees") or 0)
        )

        for leg in order.get("legs", []):
            expiry = leg.get("expiration_date", "")
            opt_type = leg.get("option_type", "call")
            strike = float(leg.get("strike_price") or 0)
            side = leg.get("side", "")
            position_effect = leg.get("position_effect", "")
            executions = leg.get("executions", [])

            if not executions or not underlying or not expiry:
                continue

            avg_price = sum(float(e.get("price", 0)) for e in executions) / len(executions)
            total_qty = sum(float(e.get("quantity", 0)) for e in executions)
            exec_date = executions[0].get("timestamp", "")[:10]

            if position_effect == "open":
                quantity = total_qty if side == "buy" else -total_qty
                contracts.append({
                    "underlying": underlying,
                    "expiry": expiry,
                    "optionType": opt_type,
                    "strike": strike,
                    "quantity": quantity,
                    "openDate": exec_date,
                    "openPrice": avg_price,
                    "openCommission": fees,
                    "closeDate": None,
                    "closePrice": None,
                    "closeCommission": 0,
                    "status": "open",
                    "realizedPnl": None,
                    "unrealizedPnl": None,
                })
            elif position_effect == "close":
                matched = next(
                    (c for c in contracts
                     if c["underlying"] == underlying
                     and c["strike"] == strike
                     and c["expiry"] == expiry
                     and c["optionType"] == opt_type
                     and c["closeDate"] is None),
                    None,
                )
                if matched:
                    matched["closeDate"] = exec_date
                    matched["closePrice"] = avg_price
                    matched["closeCommission"] = fees
                    matched["status"] = "closed"
                    pnl = (avg_price - matched["openPrice"]) * matched["quantity"] * 100
                    pnl -= matched["openCommission"] + fees
                    matched["realizedPnl"] = round(pnl, 2)

    return contracts


def fetch_open_positions() -> list[dict]:
    """Fetch current open option positions."""
    positions = rh.options.get_open_option_positions() or []
    open_contracts = []

    for pos in positions:
        # Open positions embed option details at the top level
        underlying = pos.get("chain_symbol", "")
        expiry = pos.get("expiration_date", "")
        opt_type = pos.get("option_type") or ""
        if opt_type not in ("put", "call"):
            sys.stderr.write(f"Skipping position with missing option_type: {underlying} {expiry}\n")
            continue
        strike = float(pos.get("strike_price") or 0)
        qty = float(pos.get("quantity") or 0)
        avg_price = float(pos.get("average_price") or 0) / 100  # stored in cents

        if qty == 0 or not underlying or not expiry:
            continue

        open_contracts.append({
            "underlying": underlying,
            "expiry": expiry,
            "optionType": opt_type,
            "strike": strike,
            "quantity": qty if pos.get("type") == "long" else -qty,
            "openDate": (pos.get("created_at") or "")[:10],
            "openPrice": avg_price,
            "openCommission": 0,
            "closeDate": None,
            "closePrice": None,
            "closeCommission": 0,
            "status": "open",
            "realizedPnl": None,
            "unrealizedPnl": None,
        })

    return open_contracts


def main():
    try:
        order_contracts = fetch_option_orders()
        open_positions = fetch_open_positions()

        seen = {
            (c["underlying"], c["strike"], c["expiry"], c["optionType"])
            for c in order_contracts
            if c["status"] == "open"
        }
        for pos in open_positions:
            key = (pos["underlying"], pos["strike"], pos["expiry"], pos["optionType"])
            if key not in seen:
                order_contracts.append(pos)

        print(json.dumps(order_contracts))
    except Exception as e:
        sys.stderr.write(f"Robinhood sync error: {e}\n")
        print(json.dumps([]))


if __name__ == "__main__":
    main()
