import { NextResponse } from "next/server";
import { getPlaidClient, PLAID_PRODUCTS, PLAID_COUNTRY_CODES } from "@/lib/plaid-client";
import { randomUUID } from "crypto";

export async function POST() {
  try {
    const client = getPlaidClient();
    const resp = await client.linkTokenCreate({
      user: { client_user_id: "personal-user" },
      client_name: "TradeLedger",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
    });
    return NextResponse.json({ linkToken: resp.data.link_token });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
