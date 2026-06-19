import { getPlaidClient } from "./plaid-client";
import type { Contract, Account } from "./types";
import { InvestmentTransaction, Security } from "plaid";
import { format, parseISO } from "date-fns";
import { randomUUID } from "crypto";

// Plaid returns options with security type "derivative"
// Symbol format varies by broker — we parse OCC standard: AAPL231215C00185000
function parseOccSymbol(symbol: string): {
  underlying: string;
  expiry: string;
  optionType: "call" | "put";
  strike: number;
} | null {
  // OCC: UNDERLYING(6) + YYMMDD(6) + C/P(1) + STRIKE*1000 zero-padded to 8 digits
  const match = symbol.match(/^([A-Z ]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const [, rawUnderlying, dateStr, typeChar, strikeStr] = match;
  const underlying = rawUnderlying.trim();
  const year = 2000 + parseInt(dateStr.slice(0, 2));
  const month = dateStr.slice(2, 4);
  const day = dateStr.slice(4, 6);
  const expiry = `${year}-${month}-${day}`;
  const optionType = typeChar === "C" ? "call" : "put";
  const strike = parseInt(strikeStr) / 1000;

  return { underlying, expiry, optionType, strike };
}

function securityMap(securities: Security[]): Map<string, Security> {
  return new Map(securities.map((s) => [s.security_id, s]));
}

export async function fetchPlaidContracts(
  account: Account & { plaidAccessToken: string }
): Promise<{ contracts: Contract[]; errors: string[] }> {
  const client = getPlaidClient();
  const errors: string[] = [];
  const contracts: Contract[] = [];

  // Fetch up to 500 transactions per call; loop with cursor for full history
  let hasMore = true;
  let cursor: string | undefined;

  const rawTxns: InvestmentTransaction[] = [];
  let securities: Security[] = [];

  while (hasMore) {
    try {
      const resp = await client.investmentsTransactionsGet({
        access_token: account.plaidAccessToken,
        start_date: "2020-01-01",
        end_date: format(new Date(), "yyyy-MM-dd"),
        options: { count: 500, offset: rawTxns.length },
      });

      rawTxns.push(...resp.data.investment_transactions);
      securities = resp.data.securities;
      hasMore = rawTxns.length < resp.data.total_investment_transactions;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Plaid fetch error for ${account.name}: ${msg}`);
      break;
    }
  }

  const secMap = securityMap(securities);

  // Only process option transactions
  const optionTxns = rawTxns.filter((t) => {
    const sec = secMap.get(t.security_id ?? "");
    return sec?.type === "derivative" || t.subtype === "buy" || t.subtype === "sell";
  });

  // Group by security_id to pair open/close
  const bySecurityId = new Map<string, InvestmentTransaction[]>();
  for (const txn of optionTxns) {
    if (!txn.security_id) continue;
    const sec = secMap.get(txn.security_id);
    if (!sec || sec.type !== "derivative") continue;
    const list = bySecurityId.get(txn.security_id) ?? [];
    list.push(txn);
    bySecurityId.set(txn.security_id, list);
  }

  for (const [secId, txns] of bySecurityId) {
    const sec = secMap.get(secId)!;
    const parsed =
      parseOccSymbol(sec.ticker_symbol ?? "") ??
      parseOccSymbol(sec.isin?.slice(2) ?? "");

    if (!parsed) {
      errors.push(`Could not parse option symbol: ${sec.ticker_symbol ?? sec.name}`);
      continue;
    }

    // Sort by date ascending
    txns.sort((a, b) => a.date.localeCompare(b.date));

    // Match open transactions (negative quantity = sell to open, positive = buy to open)
    // with close transactions of opposite sign
    const opens = txns.filter((t) => {
      // Plaid: quantity is positive for buys, negative for sells
      return t.subtype === "buy" || t.subtype === "sell";
    });

    for (const open of opens) {
      const qty = open.quantity ?? 0;
      if (qty === 0) continue;

      // Find matching close: opposite quantity sign after openDate
      const closeIdx = txns.findIndex(
        (t) =>
          t !== open &&
          t.date >= open.date &&
          (t.quantity ?? 0) !== 0 &&
          Math.sign(t.quantity ?? 0) !== Math.sign(qty)
      );

      const close = closeIdx >= 0 ? txns[closeIdx] : null;
      const openPrice = Math.abs((open.amount ?? 0) / (qty * 100));
      const closePrice = close
        ? Math.abs((close.amount ?? 0) / (Math.abs(close.quantity ?? 1) * 100))
        : null;

      const realizedPnl =
        close !== null && closePrice !== null
          ? (closePrice - openPrice) * qty * 100 - (open.fees ?? 0) - (close.fees ?? 0)
          : null;

      const contract: Contract = {
        id: randomUUID(),
        accountId: account.id,
        accountName: account.name,
        broker: account.broker,
        underlying: parsed.underlying,
        optionType: parsed.optionType,
        strike: parsed.strike,
        expiry: parsed.expiry,
        quantity: qty,
        openDate: open.date,
        openPrice,
        openCommission: open.fees ?? 0,
        closeDate: close?.date ?? null,
        closePrice,
        closeCommission: close?.fees ?? 0,
        status: close ? "closed" : "open",
        realizedPnl,
        unrealizedPnl: null,
        rollChainId: null,
        rollOrder: null,
      };

      contracts.push(contract);
    }
  }

  return { contracts, errors };
}
