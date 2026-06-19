"use client";

import { useData } from "@/context/data-context";
import { PnlCalendar } from "@/components/pnl-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { MonthlyPnl } from "@/lib/types";

function MiniBarChart({
  data,
  dataKey,
}: {
  data: MonthlyPnl[];
  dataKey: string;
}) {
  if (data.length === 0) return <div className="h-14" />;
  return (
    <ResponsiveContainer width="100%" height={56}>
      <BarChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }} barCategoryGap="20%">
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
        <Tooltip
          formatter={(v) => [`$${Number(v).toFixed(2)}`]}
          contentStyle={{ fontSize: 11 }}
        />
        <Bar dataKey={dataKey} maxBarSize={16} radius={[2, 2, 0, 0]}>
          {data.map((entry, idx) => {
            const val = Number((entry as Record<string, unknown>)[dataKey] ?? 0);
            return (
              <Cell
                key={idx}
                fill={val >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)"}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatTile({
  label,
  value,
  positive,
  sub,
}: {
  label: string;
  value: string;
  positive?: boolean;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn("text-2xl font-semibold font-mono tracking-tight mt-1",
          positive === true && "text-emerald-600 dark:text-emerald-400",
          positive === false && "text-red-500 dark:text-red-400"
        )}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ChartTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export default function PnlPage() {
  const { data, loading, refresh } = useData();

  useEffect(() => {
    if (!data && !loading) refresh();
  }, []);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const thisMonthData = data?.monthlyPnl.find(
    (m) => m.year === currentYear && m.month === currentMonth
  );
  const thisMonthTotal = thisMonthData?.realizedPnl ?? 0;
  const thisMonthClosed = thisMonthData?.closedContracts ?? 0;

  const cumulativeData = useMemo(() => {
    if (!data) return [];
    return data.monthlyPnl.reduce<(MonthlyPnl & { cumulative: number })[]>((acc, d) => {
      const prev = acc[acc.length - 1]?.cumulative ?? 0;
      acc.push({ ...d, cumulative: prev + d.realizedPnl });
      return acc;
    }, []);
  }, [data]);

  const monthLabel = format(now, "MMMM");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Monthly P&L</h1>

      {!data && !loading && (
        <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
          <BarChart2 className="h-10 w-10 opacity-30" />
          <p className="text-sm">No data loaded yet.</p>
          <Button onClick={refresh}>Load data</Button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile
              label={`${monthLabel} Realized P&L`}
              value={`${thisMonthTotal >= 0 ? "+" : ""}$${Math.abs(thisMonthTotal).toFixed(2)}`}
              positive={thisMonthTotal > 0 ? true : thisMonthTotal < 0 ? false : undefined}
              sub={`${thisMonthClosed} position${thisMonthClosed !== 1 ? "s" : ""} closed`}
            />
            <ChartTile label="Monthly P&L">
              <MiniBarChart data={data.monthlyPnl} dataKey="realizedPnl" />
            </ChartTile>
            <ChartTile label="Cumulative P&L">
              <MiniBarChart data={cumulativeData as MonthlyPnl[]} dataKey="cumulative" />
            </ChartTile>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Daily Activity</h2>
            <PnlCalendar contracts={data.contracts} spreads={data.spreads} />
          </div>
        </>
      )}
    </div>
  );
}
