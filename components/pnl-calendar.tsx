"use client";

import { useMemo, useState } from "react";
import type { Contract, Spread } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
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
  label: string;
  side: "SELL" | "BUY";
  pnl: number | null;
  isClose: boolean;
  // Details for popup
  underlying: string;
  optionType: string;
  strikeLabel: string;
  expiry: string;
  quantity: number;
  price: number;
  totalValue: number;
  fees: number | null;
  broker: string;
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
const BROKER_LABEL: Record<string, string> = { robinhood: "Robinhood", fidelity: "Fidelity" };

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

function DayDetailDialog({
  day,
  activity,
  onClose,
}: {
  day: string | null;
  activity: DayActivity | null;
  onClose: () => void;
}) {
  if (!day || !activity) return null;

  const opens = activity.entries.filter((e) => !e.isClose);
  const closes = activity.entries.filter((e) => e.isClose);
  const dayPnl = activity.dayPnl;

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span>{format(parseISO(day), "MMMM d, yyyy")}</span>
          {dayPnl !== 0 && (
            <span className={cn(
              "font-mono text-sm font-semibold",
              dayPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            )}>
              {dayPnl >= 0 ? "+" : ""}${Math.abs(dayPnl).toFixed(2)}
            </span>
          )}
        </div>
      }
      className="max-w-lg"
    >
      <div className="space-y-4 text-sm">
        {closes.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Closed / Settled
            </div>
            <div className="space-y-2">
              {closes.map((e, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          e.side === "SELL"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                        )}>
                          {e.side}
                        </span>
                        <span className="font-mono font-semibold text-sm">{e.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {e.quantity} × ${e.price.toFixed(2)} = ${e.totalValue.toFixed(2)} ·{" "}
                        {BROKER_LABEL[e.broker] ?? e.broker}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expiry {format(parseISO(e.expiry), "MMM d, yyyy")}
                      </div>
                    </div>
                    {e.pnl !== null && (
                      <div className="text-right shrink-0">
                        <div className={cn(
                          "font-mono font-semibold text-base",
                          e.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                        )}>
                          {e.pnl >= 0 ? "+" : ""}${Math.abs(e.pnl).toFixed(2)}
                        </div>
                        {e.fees !== null && e.fees > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            fees −${e.fees.toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {opens.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Opened
            </div>
            <div className="space-y-2">
              {opens.map((e, i) => (
                <div key={i} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          e.side === "SELL"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                        )}>
                          {e.side}
                        </span>
                        <span className="font-mono font-semibold text-sm">{e.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {e.quantity} × ${e.price.toFixed(2)} = ${e.totalValue.toFixed(2)} ·{" "}
                        {BROKER_LABEL[e.broker] ?? e.broker}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expiry {format(parseISO(e.expiry), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className={cn(
                      "text-xs font-mono font-medium shrink-0",
                      e.side === "SELL" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"
                    )}>
                      {e.side === "SELL" ? "+" : "-"}${e.totalValue.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dayPnl !== 0 && closes.length > 0 && (
          <div className="border-t pt-3 flex justify-between font-semibold">
            <span>Day Total</span>
            <span className={cn(
              "font-mono",
              dayPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            )}>
              {dayPnl >= 0 ? "+" : ""}${Math.abs(dayPnl).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function PnlCalendar({ contracts, spreads }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const activityByDay = useMemo(() => {
    const map = new Map<string, DayActivity>();

    function addEntry(date: string, entry: ActivityEntry, pnl: number) {
      if (!map.has(date)) map.set(date, { entries: [], dayPnl: 0 });
      const day = map.get(date)!;
      day.entries.push(entry);
      day.dayPnl += pnl;
    }

    const spreadContractIds = new Set<string>();
    for (const s of spreads) {
      spreadContractIds.add(s.shortLeg.id);
      spreadContractIds.add(s.longLeg.id);
    }

    for (const s of spreads) {
      const lo = Math.min(s.shortLeg.strike, s.longLeg.strike);
      const hi = Math.max(s.shortLeg.strike, s.longLeg.strike);
      const typeLabel = `${s.underlying} ${s.optionType === "put" ? "PUT" : "CALL"} SPREAD $${hi}/$${lo}`;
      const openSide: "SELL" | "BUY" = s.netCredit >= 0 ? "SELL" : "BUY";
      const openValue = Math.abs(s.netCredit * s.quantity * 100);
      const openFees = (s.shortLeg.totalFees ?? 0) + (s.longLeg.totalFees ?? 0);

      addEntry(s.openDate, {
        label: typeLabel,
        side: openSide,
        pnl: null,
        isClose: false,
        underlying: s.underlying,
        optionType: s.optionType,
        strikeLabel: `$${hi}/$${lo}`,
        expiry: s.shortLeg.expiry,
        quantity: s.quantity,
        price: Math.abs(s.netCredit),
        totalValue: openValue,
        fees: null,
        broker: s.broker,
      }, 0);

      if (s.closeDate) {
        const closeSide: "SELL" | "BUY" = openSide === "SELL" ? "BUY" : "SELL";
        addEntry(s.closeDate, {
          label: typeLabel,
          side: closeSide,
          pnl: s.realizedPnl,
          isClose: true,
          underlying: s.underlying,
          optionType: s.optionType,
          strikeLabel: `$${hi}/$${lo}`,
          expiry: s.shortLeg.expiry,
          quantity: s.quantity,
          price: Math.abs(s.closeNetCredit ?? 0),
          totalValue: Math.abs((s.closeNetCredit ?? 0) * s.quantity * 100),
          fees: openFees,
          broker: s.broker,
        }, s.realizedPnl ?? 0);
      }
    }

    for (const c of contracts) {
      if (spreadContractIds.has(c.id)) continue;
      const typeLabel = `${c.underlying} ${c.optionType.toUpperCase()} $${c.strike}`;
      const openSide: "SELL" | "BUY" = c.quantity < 0 ? "SELL" : "BUY";
      const qty = Math.abs(c.quantity);
      const openValue = c.openPrice * qty * 100;

      addEntry(c.openDate, {
        label: typeLabel,
        side: openSide,
        pnl: null,
        isClose: false,
        underlying: c.underlying,
        optionType: c.optionType,
        strikeLabel: `$${c.strike}`,
        expiry: c.expiry,
        quantity: qty,
        price: c.openPrice,
        totalValue: openValue,
        fees: null,
        broker: c.broker,
      }, 0);

      if (c.closeDate) {
        const closeSide: "SELL" | "BUY" = openSide === "SELL" ? "BUY" : "SELL";
        addEntry(c.closeDate, {
          label: typeLabel,
          side: closeSide,
          pnl: c.realizedPnl,
          isClose: true,
          underlying: c.underlying,
          optionType: c.optionType,
          strikeLabel: `$${c.strike}`,
          expiry: c.expiry,
          quantity: qty,
          price: c.closePrice ?? 0,
          totalValue: (c.closePrice ?? 0) * qty * 100,
          fees: c.totalFees ?? null,
          broker: c.broker,
        }, c.realizedPnl ?? 0);
      }
    }

    return map;
  }, [contracts, spreads]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const monthlyTotal = useMemo(() => {
    let total = 0;
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      total += activityByDay.get(key)?.dayPnl ?? 0;
    }
    return total;
  }, [days, activityByDay]);

  const selectedActivity = selectedDay ? activityByDay.get(selectedDay) ?? null : null;

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
              onClick={() => hasActivity && setSelectedDay(key)}
              className={cn(
                "min-h-[100px] rounded-md border p-1.5 text-xs transition-colors",
                hasActivity && hasClose
                  ? dayPnl > 0
                    ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : dayPnl < 0
                    ? "border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/20"
                    : "border-border bg-muted/20"
                  : hasActivity
                  ? "border-blue-200/60 dark:border-blue-800/40 bg-blue-50/20 dark:bg-blue-950/10"
                  : "border-border/40 bg-muted/10",
                isToday && "ring-1 ring-primary/40",
                hasActivity && "cursor-pointer hover:ring-1 hover:ring-primary/30 hover:shadow-sm"
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

      <DayDetailDialog
        day={selectedDay}
        activity={selectedActivity}
        onClose={() => setSelectedDay(null)}
      />
    </div>
  );
}
