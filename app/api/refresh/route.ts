import { NextResponse } from "next/server";
import { fetchPlaidContracts } from "@/lib/plaid-sync";
import { detectRollChains } from "@/lib/roll-detector";
import { detectSpreads, detectSpreadRollChains } from "@/lib/spread-detector";
import { computeMonthlyPnl, computeTotals } from "@/lib/pnl";
import type { Account, Contract, RefreshResult } from "@/lib/types";
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { tokenStore } from "@/lib/token-store";
import { credentialStore } from "@/lib/credential-store";
import { fidelityStore } from "@/lib/fidelity-store";

type DiscoveredAccount = Account & {
  plaidAccessToken?: string;
  robinhoodAccessToken?: string;
};

function discoverAccounts(): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];

  // Plaid accounts from in-memory token store
  for (const [id, { name, accessToken }] of tokenStore.entries()) {
    const brokerHint = name.toLowerCase().replace(/\s+/g, "");
    const broker = brokerHint === "robinhood" ? "robinhood" : "fidelity";
    accounts.push({ id, name, broker, plaidAccessToken: accessToken });
  }

  // Robinhood from in-memory credential store
  const robinhoodAuth = credentialStore.getAuth();
  if (robinhoodAuth) {
    accounts.push({
      id: "robinhood",
      name: robinhoodAuth.username,
      broker: "robinhood",
      robinhoodAccessToken: robinhoodAuth.accessToken,
    });
  }

  return accounts;
}

function fetchRobinhoodContracts(
  accountId: string,
  accountName: string,
  accessToken: string
): { contracts: Contract[]; errors: string[] } {
  const input = JSON.stringify({ access_token: accessToken });
  const result = spawnSync("python", ["scripts/sync_robinhood.py"], {
    input,
    cwd: process.cwd(),
    timeout: 120_000,
    encoding: "utf-8",
  });

  const errors: string[] = [];
  const stderr = result.stderr?.trim();
  if (stderr) errors.push(stderr);
  if (result.error) {
    errors.push(`Robinhood sync failed: ${result.error.message}`);
    return { contracts: [], errors };
  }

  try {
    const raw: Omit<Contract, "id" | "accountId" | "accountName" | "broker">[] =
      JSON.parse(result.stdout?.trim() || "[]");
    const contracts: Contract[] = raw.map((c) => ({
      ...c,
      id: randomUUID(),
      accountId,
      accountName,
      broker: "robinhood" as const,
      rollChainId: null,
      rollOrder: null,
    }));
    return { contracts, errors };
  } catch {
    errors.push(`Robinhood: could not parse output: ${result.stdout?.slice(0, 200)}`);
    return { contracts: [], errors };
  }
}

export async function POST() {
  const accounts = discoverAccounts();
  const allContracts: Contract[] = [];
  const allErrors: { source: string; message: string }[] = [];

  // Include Fidelity CSV-imported contracts
  allContracts.push(...fidelityStore.get());

  await Promise.all(
    accounts.map(async (account) => {
      if (account.plaidAccessToken) {
        const result = await fetchPlaidContracts(
          account as Account & { plaidAccessToken: string }
        );
        allContracts.push(...result.contracts);
        result.errors.forEach((e) => allErrors.push({ source: account.name, message: e }));
      } else if (account.broker === "robinhood" && account.robinhoodAccessToken) {
        const result = fetchRobinhoodContracts(
          account.id,
          account.name,
          account.robinhoodAccessToken
        );
        allContracts.push(...result.contracts);
        result.errors.forEach((e) => allErrors.push({ source: account.name, message: e }));
      }
    })
  );

  // Detect vertical spreads first; standalone legs get individual roll detection
  const { spreads: rawSpreads, standalone } = detectSpreads(allContracts);
  const { spreads, chains: spreadRollChains } = detectSpreadRollChains(rawSpreads);
  const { contracts, rollChains } = detectRollChains(standalone);

  // Create one virtual contract per spread so P&L / totals aren't double-counted
  const spreadVirtuals: Contract[] = spreads.map((s) => ({
    ...s.shortLeg,
    id: s.id,
    closeDate: s.closeDate,
    status: s.status,
    realizedPnl: s.realizedPnl,
  }));

  const monthlyPnl = computeMonthlyPnl([...contracts, ...spreadVirtuals]);
  const totals = computeTotals([...contracts, ...spreadVirtuals]);

  const result: RefreshResult = {
    accounts: accounts.map(({ plaidAccessToken: _p, robinhoodAccessToken: _r, ...a }) => a),
    contracts,
    spreads,
    rollChains,
    spreadRollChains,
    monthlyPnl,
    ...totals,
    errors: allErrors,
    lastSync: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
