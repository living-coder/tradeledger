interface PlaidAccount {
  name: string;
  accessToken: string;
}

// Survive HMR in Next.js dev mode by attaching to globalThis
const g = globalThis as typeof globalThis & { _plaidTokens?: Map<string, PlaidAccount> };
if (!g._plaidTokens) g._plaidTokens = new Map();

export const tokenStore = g._plaidTokens;
