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
  const totalFees = data?.totalFees ?? 0;

  const { marginUsed, totalCredits } = useMemo(() => {
    if (!data) return { marginUsed: 0, totalCredits: 0 };

    // Non-final legs of spread roll chains have status set to "open" for display
    // purposes, but they represent closed-and-rolled positions — exclude from margin.
    const rolledNonFinalIds = new Set(
      data.spreadRollChains.flatMap((chain) =>
        chain.legs.slice(0, -1).map((leg) => leg.id)
      )
    );

    const openSpreads = data.spreads.filter(
      (s) => s.status === "open" && !rolledNonFinalIds.has(s.id)
    );
    const openContracts = data.contracts.filter((c) => c.status === "open");

    const marginUsed =
      openSpreads.reduce((sum, s) => sum + Math.abs(s.shortLeg.strike - s.longLeg.strike) * s.quantity * 100, 0);

    const totalCredits =
      openSpreads
        .filter((s) => s.netCredit > 0)
        .reduce((sum, s) => sum + s.netCredit * s.quantity * 100, 0) +
      openContracts
        .filter((c) => c.quantity < 0)
        .reduce((sum, c) => sum + c.openPrice * Math.abs(c.quantity) * 100, 0);

    return { marginUsed, totalCredits };
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
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <StatCard
              label="Realized P&L"
              value={`$${Math.abs(totalPnl).toFixed(2)}`}
              positive={totalPnl >= 0}
            />
            <StatCard
              label="Total Credits"
              value={`$${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={`${data.openContracts} open contracts`}
            />
            <StatCard
              label="Closed Contracts"
              value={String(data.closedContracts)}
            />
            <StatCard
              label="Current Margin Risk"
              value={`$${marginUsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              sub="spread collateral required"
            />
            <StatCard
              label="Roll Chains"
              value={String(data.rollChains.length + data.spreadRollChains.length)}
            />
            <StatCard
              label="Comm. & Fees"
              value={`$${totalFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub="ORF + contract fees"
              positive={false}
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
