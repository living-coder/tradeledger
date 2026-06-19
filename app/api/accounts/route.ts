import { NextResponse } from "next/server";
import { credentialStore } from "@/lib/credential-store";

export async function GET() {
  const robinhood = credentialStore.getAuth();
  return NextResponse.json({
    robinhood: robinhood ? { username: robinhood.username } : null,
  });
}
