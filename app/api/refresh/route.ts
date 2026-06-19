import { NextResponse } from "next/server";
import { detectRollChains } from "@/lib/roll-detector";
import { detectSpreads, detectSpreadRollChains } from "@/lib/spread-detector";
import { computeMonthlyPnl, computeTotals } from "@/lib/pnl";
import type { Account, Contract, RefreshResult } from "@/lib/types";
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { credentialStore } from "@/lib/credential-store";
import { fidelityStore } from "@/lib/fidelity-store";

type DiscoveredAccount = Account & { robinhoodAccessToken?: string };

function discoverAccounts(): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];
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
      bidPrice: null,
      unrealizedPnl: null,
      estimatedClose: false,
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

  // Fidelity CSV-imported contracts
  allContracts.push(...fidelityStore.get());

  // Robinhood via direct OAuth
  for (const account of accounts) {
    if (account.broker === "robinhood" && account.robinhoodAccessToken) {
      const result = fetchRobinhoodContracts(
        account.id,
        account.name,
        account.robinhoodAccessToken
      );
      allContracts.push(...result.contracts);
      result.errors.forEach((e) => allErrors.push({ source: account.name, message: e }));
    }
  }

  // Detect vertical spreads; standalone legs go through individual roll detection
  const { spreads: rawSpreads, standalone } = detectSpreads(allContracts);
  const { spreads, chains: spreadRollChains } = detectSpreadRollChains(rawSpreads);
  const { contracts, rollChains } = detectRollChains(standalone);

  // ── Mark 0 DTE positions as expired (no quotes needed; settlement T+1) ──────
  function nextBusinessDay(fromIso: string): string {
    const d = new Date(fromIso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  for (const c of contracts) {
    if (c.status === "open" && c.expiry === today) {
      c.status = "expired";
      c.closeDate = nextBusinessDay(today);
      c.closePrice = 0;
      c.realizedPnl = c.quantity < 0
        ? Math.round(c.openPrice * Math.abs(c.quantity) * 100 * 100) / 100
        : Math.round(-c.openPrice * Math.abs(c.quantity) * 100 * 100) / 100;
      c.estimatedClose = true;
    }
  }
  for (const s of spreads) {
    if (s.status === "open" && s.shortLeg.expiry === today) {
      s.status = "expired";
      s.closeDate = nextBusinessDay(today);
      s.closeNetCredit = 0;
      s.realizedPnl = Math.round(s.netCredit * s.quantity * 100 * 100) / 100;
      s.estimatedClose = true;
    }
  }

  // ── Fetch live market quotes for open positions ────────────────────────────
  type QuoteEntry = { bid: number; ask: number };
  type QuoteMap = Record<string, QuoteEntry>;

  const legsForQuotes: { key: string; underlying: string; expiry: string; optionType: string; strike: number }[] = [];
  for (const c of contracts) {
    if (c.status === "open") {
      legsForQuotes.push({ key: `${c.underlying}|${c.expiry}|${c.optionType}|${c.strike}`, underlying: c.underlying, expiry: c.expiry, optionType: c.optionType, strike: c.strike });
    }
  }
  for (const s of spreads) {
    if (s.status === "open") {
      for (const leg of [s.shortLeg, s.longLeg]) {
        legsForQuotes.push({ key: `${leg.underlying}|${leg.expiry}|${leg.optionType}|${leg.strike}`, underlying: leg.underlying, expiry: leg.expiry, optionType: leg.optionType, strike: leg.strike });
      }
    }
  }
  const uniqueLegs = Array.from(new Map(legsForQuotes.map((c) => [c.key, c])).values());

  let quotes: QuoteMap = {};
  if (uniqueLegs.length > 0) {
    const qr = spawnSync("python", ["scripts/fetch_option_quotes.py"], {
      input: JSON.stringify(uniqueLegs),
      cwd: process.cwd(),
      timeout: 60_000,
      encoding: "utf-8",
    });
    if (qr.stderr?.trim()) allErrors.push({ source: "Market Quotes", message: qr.stderr.trim() });
    if (!qr.error && qr.stdout?.trim()) {
      try { quotes = JSON.parse(qr.stdout.trim()) as QuoteMap; } catch { /* ignore */ }
    }
  }

  // Stamp bid price + unrealized P&L onto open standalone contracts
  for (const c of contracts) {
    if (c.status !== "open") continue;
    const q = quotes[`${c.underlying}|${c.expiry}|${c.optionType}|${c.strike}`];
    if (!q) continue;
    if (c.quantity < 0) {
      c.bidPrice = q.ask;
      c.unrealizedPnl = Math.round(((c.openPrice - q.ask) * Math.abs(c.quantity) * 100) * 100) / 100;
    } else {
      c.bidPrice = q.bid;
      c.unrealizedPnl = Math.round(((q.bid - c.openPrice) * Math.abs(c.quantity) * 100) * 100) / 100;
    }
  }

  // Stamp unrealized P&L onto open spreads (close = buy short at ask, sell long at bid)
  for (const s of spreads) {
    if (s.status !== "open") continue;
    const shortQ = quotes[`${s.shortLeg.underlying}|${s.shortLeg.expiry}|${s.shortLeg.optionType}|${s.shortLeg.strike}`];
    const longQ  = quotes[`${s.longLeg.underlying}|${s.longLeg.expiry}|${s.longLeg.optionType}|${s.longLeg.strike}`];
    if (!shortQ || !longQ) continue;
    const closeDebit = shortQ.ask - longQ.bid;
    s.unrealizedCloseDebit = Math.round(closeDebit * 10000) / 10000;
    s.unrealizedPnl = Math.round(((s.netCredit - closeDebit) * s.quantity * 100) * 100) / 100;
  }

  // One virtual contract per spread so P&L / totals aren't double-counted
  const spreadVirtuals: Contract[] = spreads.map((s) => ({
    ...s.shortLeg,
    id: s.id,
    closeDate: s.closeDate,
    status: s.status,
    realizedPnl: s.realizedPnl,
    unrealizedPnl: s.unrealizedPnl ?? null,
  }));

  const monthlyPnl = computeMonthlyPnl([...contracts, ...spreadVirtuals]);
  const totals = computeTotals([...contracts, ...spreadVirtuals]);

  const result: RefreshResult = {
    accounts: accounts.map(({ robinhoodAccessToken: _r, ...a }) => a),
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
