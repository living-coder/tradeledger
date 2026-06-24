#!/usr/bin/env python3
"""
Fetches option bid/ask prices using the Robinhood API (replaces yfinance when
a Robinhood token is available).

Stdin:  JSON {"access_token": "...", "contracts": [{key, underlying, expiry, optionType, strike}, ...]}
Stdout: JSON {"key": {"bid": number, "ask": number}, ...}
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import robin_stocks.robinhood as rh
    import robin_stocks.robinhood.helper as rh_helper
except ImportError as e:
    sys.stderr.write(f"Missing dependency: {e}. Run: pip install robin_stocks\n")
    print("{}")
    sys.exit(0)

try:
    payload = json.loads(sys.stdin.read())
except Exception as e:
    sys.stderr.write(f"Failed to parse input: {e}\n")
    print("{}")
    sys.exit(0)

access_token = payload.get("access_token", "")
contracts = payload.get("contracts", [])

if not access_token or not contracts:
    print("{}")
    sys.exit(0)

rh_helper.set_login_state(True)
rh_helper.update_session("Authorization", f"Bearer {access_token}")
rh_helper.set_output(sys.stderr)


def fetch_quote(c: dict):
    strike = float(c["strike"])
    strike_str = str(int(strike)) if strike == int(strike) else str(strike)
    md = rh.options.get_option_market_data(
        inputSymbols=c["underlying"],
        expirationDate=c["expiry"],
        strikePrice=strike_str,
        optionType=c["optionType"],
    )
    # robin_stocks returns [[{...}]] or [{...}] depending on version — handle both
    entry = None
    if md:
        first = md[0]
        if isinstance(first, list):
            entry = first[0] if first else None
        elif isinstance(first, dict):
            entry = first
    if not entry:
        return c["key"], None
    bid = float(entry.get("bid_price") or 0)
    ask = float(entry.get("ask_price") or 0)
    if bid == 0 and ask == 0:
        return c["key"], None
    return c["key"], {"bid": round(bid, 4), "ask": round(ask, 4)}


quotes: dict = {}
with ThreadPoolExecutor(max_workers=6) as executor:
    futures = {executor.submit(fetch_quote, c): c for c in contracts}
    for future in as_completed(futures):
        c = futures[future]
        try:
            key, result = future.result()
            if result:
                quotes[key] = result
        except Exception as e:
            sys.stderr.write(
                f"Quote error {c.get('underlying')} {c.get('expiry')} "
                f"{c.get('optionType')} {c.get('strike')}: {e}\n"
            )

print(json.dumps(quotes))
