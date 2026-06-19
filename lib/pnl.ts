import type { Contract, MonthlyPnl } from "./types";
import { format, parseISO } from "date-fns";

export function computeMonthlyPnl(contracts: Contract[]): MonthlyPnl[] {
  const closed = contracts.filter((c) => c.status === "closed" && c.closeDate && c.realizedPnl !== null);

  const map = new Map<string, MonthlyPnl>();

  for (const c of closed) {
    const date = parseISO(c.closeDate!);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;

    if (!map.has(key)) {
      map.set(key, {
        year,
        month,
        label: format(date, "MMM yyyy"),
        realizedPnl: 0,
        closedContracts: 0,
        byUnderlying: {},
      });
    }

    const entry = map.get(key)!;
    entry.realizedPnl += c.realizedPnl!;
    entry.closedContracts += 1;
    entry.byUnderlying[c.underlying] = (entry.byUnderlying[c.underlying] ?? 0) + c.realizedPnl!;
  }

  return Array.from(map.values()).sort((a, b) =>
    `${a.year}-${String(a.month).padStart(2, "0")}`.localeCompare(
      `${b.year}-${String(b.month).padStart(2, "0")}`
    )
  );
}

export function computeTotals(contracts: Contract[]) {
  const open = contracts.filter((c) => c.status === "open");
  const closed = contracts.filter((c) => c.status === "closed");
  const totalRealizedPnl = closed.reduce((s, c) => s + (c.realizedPnl ?? 0), 0);
  const totalUnrealizedPnl = open.reduce((s, c) => s + (c.unrealizedPnl ?? 0), 0);
  return { openContracts: open.length, closedContracts: closed.length, totalRealizedPnl, totalUnrealizedPnl };
}
