"use client";

import { useData } from "@/context/data-context";
import { TradeLogTable } from "@/components/trade-log-table";
import { Card, CardContent } from "@/components/ui/card";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo } from "react";

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground tracking-wide uppercase">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold mt-1 font-mono tracking-tight",
            positive === true && "text-emerald-600 dark:text-emerald-400",
            positive === false && "text-red-500 dark:text-red-400"
          )}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function TradesPage() {
  const { data, loading, error, refresh } = useData();

  useEffect(() => {
    if (!data && !loading) refresh();
  }, []);

  const totalPnl = data?.totalRealizedPnl ?? 0;

  const marginUsed = useMemo(() => {
    if (!data) return 0;
    // Margin from identified spreads: width × quantity × 100
    const fromSpreads = data.spreads
      .filter((s) => s.status === "open")
      .reduce((sum, s) => sum + Math.abs(s.shortLeg.strike - s.longLeg.strike) * s.quantity * 100, 0);
    // Margin from standalone contracts
    const fromContracts = data.contracts
      .filter((c) => c.status === "open")
      .reduce((sum, c) => sum + (-c.quantity) * c.strike * 100, 0);
    return Math.max(0, fromSpreads + fromContracts);
  }, [data]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Option Activity</h1>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data?.errors && data.errors.length > 0 && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm space-y-1">
          {data.errors.map((e, i) => (
            <p key={i}>
              <span className="font-medium">{e.source}:</span> {e.message}
            </p>
          ))}
        </div>
      )}

      {!data && !loading && (
        <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
          <List className="h-10 w-10 opacity-30" />
          <p className="text-sm">No data loaded yet.</p>
          <Button onClick={refresh}>Load data</Button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard
              label="Realized P&L"
              value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`}
              positive={totalPnl >= 0}
            />
            <StatCard
              label="Open Contracts"
              value={String(data.openContracts)}
            />
            <StatCard
              label="Closed Contracts"
              value={String(data.closedContracts)}
            />
            <StatCard
              label="Margin Used"
              value={`$${Math.max(0, marginUsed).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              sub="net short notional"
            />
            <StatCard
              label="Roll Chains"
              value={String(data.rollChains.length + data.spreadRollChains.length)}
            />
          </div>

          <TradeLogTable
            contracts={data.contracts}
            spreads={data.spreads}
            rollChains={data.rollChains}
            spreadRollChains={data.spreadRollChains}
          />
        </>
      )}
    </div>
  );
}
