import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { credentialStore } from "@/lib/credential-store";

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  // code may be empty string for the app-approval flow (no SMS/email code needed)

  const pending = credentialStore.getPendingChallenge();
  if (!pending) {
    return NextResponse.json({ status: "error", error: "No pending challenge — reconnect first" }, { status: 400 });
  }

  const input = JSON.stringify({
    challenge_id: pending.challengeId,
    code,
    machine_id: pending.machineId,
    username: pending.username,
    password: pending.password,
    mfa_code: pending.mfaCode,
    device_token: pending.deviceToken,
  });

  try {
    const output = execSync("python scripts/robinhood_challenge.py", {
      input,
      cwd: process.cwd(),
      timeout: 60_000,
    }).toString().trim();

    const result = JSON.parse(output);

    if (result.status === "ok") {
      credentialStore.setAuth({ username: pending.username, accessToken: result.access_token });
      credentialStore.setPendingChallenge(null);
      return NextResponse.json({ status: "ok" });
    }

    return NextResponse.json({ status: "error", error: result.error }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: msg }, { status: 500 });
  }
}
