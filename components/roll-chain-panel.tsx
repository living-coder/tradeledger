"use client";

import type { RollChain } from "@/lib/types";
import { X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface Props {
  chain: RollChain;
  onClose: () => void;
}

export function RollChainPanel({ chain, onClose }: Props) {
  const total = chain.totalRealizedPnl;

  return (
    <div className="border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">
            Roll Chain — {chain.underlying} {chain.optionType}
          </span>
          <span
            className={cn(
              "text-sm font-mono font-semibold",
              total >= 0 ? "text-emerald-600" : "text-red-500"
            )}
          >
            {total >= 0 ? "+" : ""}${total.toFixed(2)} total
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {chain.legs.map((leg, idx) => (
          <div key={leg.id} className="flex items-center gap-2">
            {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            <div className="border rounded-md p-2 bg-background space-y-0.5 min-w-[140px]">
              <div className="font-mono font-semibold">
                ${leg.strike} {leg.expiry.slice(5)}
              </div>
              <div className="text-muted-foreground">
                Opened {format(parseISO(leg.openDate), "MMM d")} @ ${leg.openPrice.toFixed(2)}
              </div>
              {leg.closeDate && (
                <div className="text-muted-foreground">
                  Closed {format(parseISO(leg.closeDate), "MMM d")} @ ${leg.closePrice?.toFixed(2)}
                </div>
              )}
              {leg.realizedPnl !== null && (
                <div
                  className={cn(
                    "font-semibold font-mono",
                    leg.realizedPnl >= 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {leg.realizedPnl >= 0 ? "+" : ""}${leg.realizedPnl.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
