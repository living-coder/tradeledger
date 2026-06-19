"use client";

import { useMemo, useState } from "react";
import type { Contract, Spread } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActivityEntry {
  label: string;        // "SELL NVDA PUT SPREAD $185/$205"
  side: "SELL" | "BUY";
  pnl: number | null;   // only for closes
  isClose: boolean;
}

interface DayActivity {
  entries: ActivityEntry[];
  dayPnl: number;
}

interface Props {
  contracts: Contract[];
  spreads: Spread[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ActivityChip({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="text-[10px] leading-tight py-0.5 px-1 rounded bg-background/60 border border-border/50 space-y-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        <span className={cn("font-semibold", entry.side === "SELL" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400")}>
          {entry.side}
        </span>
        <span className="font-mono font-semibold">{entry.label}</span>
      </div>
      {entry.pnl !== null && (
        <div className={cn("font-mono font-semibold", entry.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
          {entry.pnl >= 0 ? "+" : ""}${Math.abs(entry.pnl).toFixed(2)}
        </div>
      )}
    </div>
  );
}

export function PnlCalendar({ contracts, spreads }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const activityByDay = useMemo(() => {
    const map = new Map<string, DayActivity>();

    function addEntry(date: string, entry: ActivityEntry, pnl: number) {
      if (!map.has(date)) map.set(date, { entries: [], dayPnl: 0 });
      const day = map.get(date)!;
      day.entries.push(entry);
      day.dayPnl += pnl;
    }

    // Track which contract IDs are part of a spread to avoid double-counting
    const spreadContractIds = new Set<string>();
    for (const s of spreads) {
      spreadContractIds.add(s.shortLeg.id);
      spreadContractIds.add(s.longLeg.id);
    }

    // Add spread entries
    for (const s of spreads) {
      const lo = Math.min(s.shortLeg.strike, s.longLeg.strike);
      const hi = Math.max(s.shortLeg.strike, s.longLeg.strike);
      const typeLabel = `${s.underlying} ${s.optionType === "put" ? "PUT" : "CALL"} SPREAD $${hi}/$${lo}`;
      const openSide: "SELL" | "BUY" = s.netCredit >= 0 ? "SELL" : "BUY";

      addEntry(s.openDate, { label: typeLabel, side: openSide, pnl: null, isClose: false }, 0);

      if (s.closeDate) {
        const closeSide: "SELL" | "BUY" = openSide === "SELL" ? "BUY" : "SELL";
        addEntry(s.closeDate, { label: typeLabel, side: closeSide, pnl: s.realizedPnl, isClose: true }, s.realizedPnl ?? 0);
      }
    }

    // Add standalone (non-spread) contract entries
    for (const c of contracts) {
      if (spreadContractIds.has(c.id)) continue;
      const typeLabel = `${c.underlying} ${c.optionType.toUpperCase()} $${c.strike}`;
      const openSide: "SELL" | "BUY" = c.quantity < 0 ? "SELL" : "BUY";

      addEntry(c.openDate, { label: typeLabel, side: openSide, pnl: null, isClose: false }, 0);

      if (c.closeDate) {
        const closeSide: "SELL" | "BUY" = openSide === "SELL" ? "BUY" : "SELL";
        addEntry(c.closeDate, { label: typeLabel, side: closeSide, pnl: c.realizedPnl, isClose: true }, c.realizedPnl ?? 0);
      }
    }

    return map;
  }, [contracts, spreads]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0 = Sunday

  const monthlyTotal = useMemo(() => {
    let total = 0;
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      total += activityByDay.get(key)?.dayPnl ?? 0;
    }
    return total;
  }, [days, activityByDay]);

  if (contracts.length === 0 && spreads.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        No data yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewDate((d) => subMonths(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm w-32 text-center">{format(viewDate, "MMMM yyyy")}</span>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewDate((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className={cn("text-sm font-mono font-semibold", monthlyTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
          {monthlyTotal >= 0 ? "+" : ""}${monthlyTotal.toFixed(2)} this month
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const act = activityByDay.get(key);
          const dayPnl = act?.dayPnl ?? 0;
          const hasActivity = act && act.entries.length > 0;
          const isToday = key === format(new Date(), "yyyy-MM-dd");
          const hasClose = act?.entries.some((e) => e.isClose);

          return (
            <div
              key={key}
              className={cn(
                "min-h-[100px] rounded-md border p-1.5 text-xs",
                hasActivity && hasClose
                  ? dayPnl > 0
                    ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : dayPnl < 0
                    ? "border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/20"
                    : "border-border bg-muted/20"
                  : hasActivity
                  ? "border-blue-200/60 dark:border-blue-800/40 bg-blue-50/20 dark:bg-blue-950/10"
                  : "border-border/40 bg-muted/10",
                isToday && "ring-1 ring-primary/40"
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <span className={cn("font-semibold", isToday && "text-primary")}>{format(day, "d")}</span>
                {hasClose && dayPnl !== 0 && (
                  <span className={cn("font-mono font-semibold text-[10px]", dayPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                    {dayPnl >= 0 ? "+" : ""}${Math.abs(dayPnl).toFixed(0)}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {act?.entries.map((entry, i) => (
                  <ActivityChip key={i} entry={entry} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
