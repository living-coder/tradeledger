#!/usr/bin/env python3
"""
Phase 2: Submit Robinhood Sheriff verification code and complete OAuth.
Reads JSON from stdin: {challenge_id, code, machine_id, username, password, mfa_code?, device_token}
Writes JSON to stdout:
  {status: "ok", access_token}
  {status: "error", error}
"""

import json
import sys

try:
    import requests
except ImportError:
    print(json.dumps({"status": "error", "error": "Missing dependency: pip install requests"}))
    sys.exit(0)

CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"
TOKEN_URL = "https://api.robinhood.com/oauth2/token/"

HEADERS = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip,deflate,br",
    "Accept-Language": "en-US,en;q=1",
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    "X-Robinhood-API-Version": "1.431.4",
    "Connection": "keep-alive",
    "User-Agent": "*",
}


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        print(json.dumps({"status": "error", "error": "Invalid JSON on stdin"}))
        return

    challenge_id = data.get("challenge_id", "")
    code = data.get("code", "")
    machine_id = data.get("machine_id", "")
    username = data.get("username", "")
    password = data.get("password", "")
    mfa_code = data.get("mfa_code", "")
    device_token = data.get("device_token", "")

    # Step 1: Submit the verification code (skip for app-approval flow where no code exists)
    if challenge_id and code:
        challenge_url = f"https://api.robinhood.com/challenge/{challenge_id}/respond/"
        try:
            resp = requests.post(
                challenge_url,
                data={"response": code},
                headers=HEADERS,
                timeout=30,
            )
            result = resp.json()
            if result.get("status") not in ("validated", None) and resp.status_code not in (200, 201):
                detail = result.get("detail", "Challenge code rejected")
                print(json.dumps({"status": "error", "error": str(detail)}))
                return
        except Exception as e:
            print(json.dumps({"status": "error", "error": str(e)}))
            return

    # Step 2: Continue the Sheriff workflow
    if machine_id:
        inquiries_url = f"https://api.robinhood.com/pathfinder/inquiries/{machine_id}/user_view/"
        try:
            requests.post(
                inquiries_url,
                json={"sequence": 0, "user_input": {"status": "continue"}},
                headers={**HEADERS, "Content-Type": "application/json"},
                timeout=30,
            )
        except Exception:
            pass  # Non-fatal — proceed to retry login

    # Step 3: Retry login with same device_token (now trusted)
    payload = {
        "client_id": CLIENT_ID,
        "expires_in": 86400,
        "grant_type": "password",
        "password": password,
        "scope": "internal",
        "username": username,
        "device_token": device_token,
        "try_passkeys": False,
        "token_request_path": "/login",
        "create_read_only_secondary_token": True,
    }
    if mfa_code:
        payload["mfa_code"] = mfa_code

    try:
        resp = requests.post(TOKEN_URL, data=payload, headers=HEADERS, timeout=30)
        token_data = resp.json()
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        return

    if "access_token" in token_data:
        print(json.dumps({"status": "ok", "access_token": token_data["access_token"]}))
    else:
        detail = token_data.get("detail") or token_data.get("non_field_errors") or str(token_data)
        print(json.dumps({"status": "error", "error": str(detail)}))


if __name__ == "__main__":
    main()
