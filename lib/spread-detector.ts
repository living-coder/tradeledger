import { randomUUID } from "crypto";
import type { Contract, Spread, SpreadRollChain } from "./types";

// A vertical spread is two option legs with:
// - Same account, underlying, optionType, expiry, openDate
// - One short (qty < 0), one long (qty > 0) with matching |qty|
export function detectSpreads(contracts: Contract[]): {
  spreads: Spread[];
  standalone: Contract[];
  spreadContractIds: Set<string>;
} {
  // Group by (accountId, underlying, optionType, expiry, openDate)
  const groups = new Map<string, Contract[]>();
  for (const c of contracts) {
    const key = `${c.accountId}|${c.underlying}|${c.optionType}|${c.expiry}|${c.openDate}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const spreads: Spread[] = [];
  const spreadContractIds = new Set<string>();
  const standalone: Contract[] = [];

  for (const [, group] of groups) {
    const shorts = group.filter((c) => c.quantity < 0);
    const longs = group.filter((c) => c.quantity > 0);
    const used = new Set<string>();

    for (const shortLeg of shorts) {
      const longLeg = longs.find(
        (l) => !used.has(l.id) && !used.has(shortLeg.id) && Math.abs(l.quantity) === Math.abs(shortLeg.quantity)
      );
      if (!longLeg) continue;

      used.add(shortLeg.id);
      used.add(longLeg.id);
      spreadContractIds.add(shortLeg.id);
      spreadContractIds.add(longLeg.id);

      const status =
        shortLeg.status === "closed" && longLeg.status === "closed" ? "closed" : "open";

      const closeDate =
        status === "closed"
          ? ([shortLeg.closeDate, longLeg.closeDate].filter(Boolean) as string[])
              .sort()
              .pop() ?? null
          : null;

      const netCredit = shortLeg.openPrice - longLeg.openPrice;

      const closeNetCredit =
        status === "closed" &&
        shortLeg.closePrice !== null &&
        longLeg.closePrice !== null
          ? shortLeg.closePrice - longLeg.closePrice
          : null;

      const realizedPnl =
        status === "closed"
          ? (shortLeg.realizedPnl ?? 0) + (longLeg.realizedPnl ?? 0)
          : null;

      spreads.push({
        id: randomUUID(),
        accountId: shortLeg.accountId,
        accountName: shortLeg.accountName,
        broker: shortLeg.broker,
        underlying: shortLeg.underlying,
        optionType: shortLeg.optionType,
        shortLeg,
        longLeg,
        quantity: Math.abs(shortLeg.quantity),
        openDate: shortLeg.openDate,
        closeDate,
        status,
        netCredit,
        closeNetCredit,
        realizedPnl,
        unrealizedPnl: null,
        unrealizedCloseDebit: null,
        rollChainId: null,
        rollOrder: null,
      });
    }

    for (const c of group) {
      if (!used.has(c.id)) standalone.push(c);
    }
  }

  return { spreads, standalone, spreadContractIds };
}

export function detectSpreadRollChains(spreads: Spread[]): {
  spreads: Spread[];
  chains: SpreadRollChain[];
} {
  const updated = spreads.map((s) => ({ ...s }));
  const chains: SpreadRollChain[] = [];

  // Group by (accountId, underlying, optionType)
  const groups = new Map<string, Spread[]>();
  for (const s of updated) {
    const key = `${s.accountId}|${s.underlying}|${s.optionType}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.openDate.localeCompare(b.openDate));

    const used = new Set<string>();
    let chainBuffer: Spread[] = [];

    for (const spread of group) {
      if (used.has(spread.id) || !spread.closeDate) continue;

      const rolled = group.find(
        (other) =>
          other.id !== spread.id &&
          !used.has(other.id) &&
          other.openDate === spread.closeDate
      );

      if (rolled) {
        if (chainBuffer.length === 0) chainBuffer.push(spread);
        used.add(spread.id);
        used.add(rolled.id);
        chainBuffer.push(rolled);
      }
    }

    if (chainBuffer.length < 2) continue;

    const chainId = randomUUID();

    // Stamp legs first; non-final legs are "open" — position was rolled, not realized
    chainBuffer.forEach((s, idx) => {
      const target = updated.find((u) => u.id === s.id)!;
      target.rollChainId = chainId;
      target.rollOrder = idx;
      if (idx < chainBuffer.length - 1) {
        target.status = "open";
        // Keep closeDate/closeNetCredit for chain panel history display
        // Null realizedPnl so the roll debit doesn't count as realized P&L
        target.realizedPnl = null;
      }
    });

    // Build chain from already-modified objects so legs and totalRealizedPnl are consistent
    const chainLegs = chainBuffer.map((s) => updated.find((u) => u.id === s.id)!);
    chains.push({
      id: chainId,
      underlying: chainLegs[0].underlying,
      optionType: chainLegs[0].optionType,
      accountId: chainLegs[0].accountId,
      legs: chainLegs,
      totalRealizedPnl: chainLegs.reduce((sum, s) => sum + (s.realizedPnl ?? 0), 0),
    });
  }

  return { spreads: updated, chains };
}
