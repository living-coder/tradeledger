import { NextResponse } from "next/server";
import { tokenStore } from "@/lib/token-store";
import { credentialStore } from "@/lib/credential-store";

export async function GET() {
  const plaid = Array.from(tokenStore.entries()).map(([id, { name }]) => ({ id, name }));
  const robinhood = credentialStore.getAuth();
  return NextResponse.json({
    plaid,
    robinhood: robinhood ? { username: robinhood.username } : null,
  });
}
