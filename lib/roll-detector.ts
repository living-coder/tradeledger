import type { Contract, RollChain } from "./types";
import { randomUUID } from "crypto";

// A roll is detected when:
// 1. Same underlying, same option type, same account
// 2. A closing transaction and an opening transaction occur on the same day
// 3. The new opening shares the same directional bias (long/short)

export function detectRollChains(contracts: Contract[]): {
  contracts: Contract[];
  rollChains: RollChain[];
} {
  const updated = contracts.map((c) => ({ ...c }));
  const chains: RollChain[] = [];

  // Index contracts by account+underlying+type
  type Key = string;
  const group = new Map<Key, Contract[]>();
  for (const c of updated) {
    const key = `${c.accountId}|${c.underlying}|${c.optionType}`;
    const list = group.get(key) ?? [];
    list.push(c);
    group.set(key, list);
  }

  for (const [, legs] of group) {
    if (legs.length < 2) continue;

    // Sort by open date
    legs.sort((a, b) => a.openDate.localeCompare(b.openDate));

    // Find pairs where one contract's closeDate matches another's openDate
    const used = new Set<string>();
    let chainBuffer: Contract[] = [];

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (used.has(leg.id)) continue;

      // See if any later leg opened on the same day this one closed
      if (!leg.closeDate) continue;

      const rolled = legs.find(
        (other) =>
          other.id !== leg.id &&
          !used.has(other.id) &&
          other.openDate === leg.closeDate &&
          // Same direction (both short or both long)
          Math.sign(other.quantity) === Math.sign(leg.quantity)
      );

      if (rolled) {
        if (chainBuffer.length === 0) chainBuffer.push(leg);
        used.add(leg.id);
        used.add(rolled.id);
        chainBuffer.push(rolled);
      }
    }

    if (chainBuffer.length < 2) continue;

    const chainId = randomUUID();
    const chain: RollChain = {
      id: chainId,
      underlying: chainBuffer[0].underlying,
      optionType: chainBuffer[0].optionType,
      accountId: chainBuffer[0].accountId,
      legs: chainBuffer,
      totalRealizedPnl: chainBuffer.reduce((sum, c) => sum + (c.realizedPnl ?? 0), 0),
    };
    chains.push(chain);

    // Stamp each leg with chain info
    chainBuffer.forEach((leg, idx) => {
      const target = updated.find((c) => c.id === leg.id)!;
      target.rollChainId = chainId;
      target.rollOrder = idx;
    });
  }

  return { contracts: updated, rollChains: chains };
}
