#!/usr/bin/env python3
"""
Phase 1: Attempt Robinhood OAuth login via direct HTTP (new Sheriff/pathfinder flow).
Reads JSON from stdin: {username, password, mfa_code?, device_token?}
Writes JSON to stdout:
  {status: "ok", access_token, device_token}
  {status: "challenge_required", challenge_id, challenge_type, machine_id, device_token}
  {status: "app_approval_required", machine_id, device_token}
  {status: "error", error}
"""

import json
import sys
import time
import uuid

try:
    import requests
except ImportError:
    print(json.dumps({"status": "error", "error": "Missing dependency: pip install requests"}))
    sys.exit(0)

CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"
TOKEN_URL = "https://api.robinhood.com/oauth2/token/"
PATHFINDER_MACHINE_URL = "https://api.robinhood.com/pathfinder/user_machine/"

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
        creds = json.loads(sys.stdin.read())
    except Exception:
        print(json.dumps({"status": "error", "error": "Invalid JSON on stdin"}))
        return

    username = creds.get("username", "")
    password = creds.get("password", "")
    mfa_code = creds.get("mfa_code", "")
    device_token = creds.get("device_token") or str(uuid.uuid4())

    if not username or not password:
        print(json.dumps({"status": "error", "error": "username and password are required"}))
        return

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
        data = resp.json()
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        return

    # Successful login — no verification needed
    if "access_token" in data:
        print(json.dumps({
            "status": "ok",
            "access_token": data["access_token"],
            "device_token": device_token,
        }))
        return

    # New Sheriff verification workflow
    if "verification_workflow" in data:
        workflow_id = data["verification_workflow"]["id"]
        machine_id = _start_workflow(device_token, workflow_id)
        if not machine_id:
            print(json.dumps({"status": "error", "error": "Could not start verification workflow"}))
            return
        _poll_for_challenge(machine_id, device_token)
        return

    # Error or unexpected response
    detail = data.get("detail") or data.get("non_field_errors") or str(data)
    print(json.dumps({"status": "error", "error": str(detail)}))


def _start_workflow(device_token, workflow_id):
    """POST to pathfinder to start the workflow and return the machine_id."""
    try:
        resp = requests.post(
            PATHFINDER_MACHINE_URL,
            json={"device_id": device_token, "flow": "suv", "input": {"workflow_id": workflow_id}},
            headers={**HEADERS, "Content-Type": "application/json"},
            timeout=30,
        )
        data = resp.json()
        return data.get("id")
    except Exception as e:
        sys.stderr.write(f"Pathfinder error: {e}\n")
        return None


def _poll_for_challenge(machine_id, device_token):
    """Poll the inquiries endpoint until we know the challenge type, then output result."""
    inquiries_url = f"https://api.robinhood.com/pathfinder/inquiries/{machine_id}/user_view/"
    deadline = time.time() + 30

    while time.time() < deadline:
        time.sleep(3)
        try:
            resp = requests.get(inquiries_url, headers=HEADERS, timeout=15)
            inq = resp.json()
        except Exception:
            continue

        if "context" not in inq or "sheriff_challenge" not in inq.get("context", {}):
            continue

        challenge = inq["context"]["sheriff_challenge"]
        ctype = challenge.get("type")
        cstatus = challenge.get("status")
        cid = challenge.get("id")

        if ctype == "prompt":
            # Requires approval in the Robinhood mobile app
            print(json.dumps({
                "status": "app_approval_required",
                "machine_id": machine_id,
                "device_token": device_token,
            }))
            return

        if ctype in ("sms", "email") and cstatus == "issued":
            print(json.dumps({
                "status": "challenge_required",
                "challenge_id": cid,
                "challenge_type": ctype,
                "machine_id": machine_id,
                "device_token": device_token,
            }))
            return

        if cstatus == "validated":
            # Already validated (rare on first attempt, but handle it)
            print(json.dumps({"status": "error", "error": "Challenge pre-validated — retry connect"}))
            return

    print(json.dumps({"status": "error", "error": "Verification workflow timed out after 30s"}))


if __name__ == "__main__":
    main()
