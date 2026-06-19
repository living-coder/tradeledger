import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set in .env.local");
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(config);
}

export const PLAID_PRODUCTS: Products[] = [Products.Investments];
export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];

export { getPlaidClient };
