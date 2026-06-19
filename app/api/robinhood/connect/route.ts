import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { credentialStore } from "@/lib/credential-store";

export async function POST(req: NextRequest) {
  const { username, password, mfaCode } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ status: "error", error: "username and password required" }, { status: 400 });
  }

  const input = JSON.stringify({ username, password, mfa_code: mfaCode ?? "" });

  try {
    const output = execSync("python scripts/robinhood_connect.py", {
      input,
      cwd: process.cwd(),
      timeout: 60_000,
    }).toString().trim();

    const result = JSON.parse(output);

    if (result.status === "ok") {
      credentialStore.setAuth({ username, accessToken: result.access_token });
      credentialStore.setPendingChallenge(null);
      return NextResponse.json({ status: "ok" });
    }

    if (result.status === "challenge_required") {
      credentialStore.setPendingChallenge({
        challengeId: result.challenge_id,
        machineId: result.machine_id,
        deviceToken: result.device_token,
        username,
        password,
        mfaCode: mfaCode ?? "",
      });
      return NextResponse.json({ status: "challenge_required", type: result.challenge_type });
    }

    if (result.status === "app_approval_required") {
      // User must approve on their Robinhood mobile app — no code needed
      credentialStore.setPendingChallenge({
        challengeId: "",
        machineId: result.machine_id,
        deviceToken: result.device_token,
        username,
        password,
        mfaCode: mfaCode ?? "",
      });
      return NextResponse.json({ status: "app_approval_required" });
    }

    return NextResponse.json({ status: "error", error: result.error }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: msg }, { status: 500 });
  }
}
