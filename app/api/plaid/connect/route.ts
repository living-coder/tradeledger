import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid-client";
import { tokenStore } from "@/lib/token-store";

export async function POST(req: NextRequest) {
  try {
    const { publicToken, accountName } = await req.json();
    if (!publicToken) {
      return NextResponse.json({ error: "publicToken is required" }, { status: 400 });
    }

    const client = getPlaidClient();
    const resp = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = resp.data.access_token;
    const name = (accountName as string | undefined)?.trim() || "Account";

    // Store in server memory — no secrets written to disk
    const key = `PLAID_${name.toUpperCase().replace(/\s+/g, "_")}`;
    tokenStore.set(key, { name, accessToken });

    return NextResponse.json({ status: "ok", accountName: name });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
