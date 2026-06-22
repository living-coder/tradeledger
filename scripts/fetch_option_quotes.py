#!/usr/bin/env python3
"""
Fetches option bid/ask prices from Yahoo Finance via yfinance.

Input  (stdin): JSON array of {key, underlying, expiry, optionType, strike}
Output (stdout): JSON object keyed by `key` -> {bid, ask}

Setup: pip install yfinance
"""
import json
import sys


def main():
    try:
        import yfinance as yf
    except ImportError:
        print("yfinance not installed — run: pip install yfinance", file=sys.stderr)
        print("{}")
        return

    try:
        contracts = json.loads(sys.stdin.read())
    except Exception as e:
        print(f"Failed to parse input: {e}", file=sys.stderr)
        print("{}")
        return

    if not contracts:
        print("{}")
        return

    # Group by (underlying, expiry) to fetch each option chain once
    groups: dict = {}
    for c in contracts:
        k = (c["underlying"], c["expiry"])
        groups.setdefault(k, []).append(c)

    from datetime import date, timedelta

    def fetch_chain(ticker, expiry_str):
        """Try expiry_str first; if not found, try the previous day (Robinhood uses OCC
        Saturday dates for standard monthly options while yfinance uses the Friday)."""
        try:
            return ticker.option_chain(expiry_str)
        except Exception as e:
            if "cannot be found" not in str(e).lower():
                raise
        prev = (date.fromisoformat(expiry_str) - timedelta(days=1)).isoformat()
        return ticker.option_chain(prev)

    quotes: dict = {}
    for (underlying, expiry), ctrs in groups.items():
        try:
            ticker = yf.Ticker(underlying)
            chain = fetch_chain(ticker, expiry)
            for c in ctrs:
                df = chain.puts if c["optionType"] == "put" else chain.calls
                strike = float(c["strike"])
                row = df[abs(df["strike"] - strike) < 0.01]
                if not row.empty:
                    bid = float(row["bid"].iloc[0])
                    ask = float(row["ask"].iloc[0])
                    quotes[c["key"]] = {
                        "bid": round(bid, 4),
                        "ask": round(ask, 4),
                    }
        except Exception as e:
            print(f"Quote error {underlying} {expiry}: {e}", file=sys.stderr)

    print(json.dumps(quotes))


if __name__ == "__main__":
    main()
