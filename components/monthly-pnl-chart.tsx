"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { MonthlyPnl } from "@/lib/types";

interface Props {
  data: MonthlyPnl[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyPnl }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pnl = d.realizedPnl;

  return (
    <div className="bg-background border rounded-lg shadow-md p-3 text-sm space-y-1.5">
      <p className="font-semibold">{d.label}</p>
      <p className={pnl >= 0 ? "text-emerald-600" : "text-red-500"}>
        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} realized
      </p>
      <p className="text-muted-foreground text-xs">{d.closedContracts} contracts closed</p>
      {Object.entries(d.byUnderlying).length > 0 && (
        <div className="border-t pt-1.5 text-xs space-y-0.5">
          {Object.entries(d.byUnderlying)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 5)
            .map(([sym, p]) => (
              <div key={sym} className="flex justify-between gap-4">
                <span className="font-mono">{sym}</span>
                <span className={p >= 0 ? "text-emerald-600" : "text-red-500"}>
                  {p >= 0 ? "+" : ""}${p.toFixed(2)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function MonthlyPnlChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        No closed contracts yet. Click Refresh to load data.
      </div>
    );
  }

  const cumulativeData = data.reduce<(MonthlyPnl & { cumulative: number })[]>((acc, d) => {
    const prev = acc[acc.length - 1]?.cumulative ?? 0;
    acc.push({ ...d, cumulative: prev + d.realizedPnl });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Monthly Realized P&L</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="realizedPnl" radius={[3, 3, 0, 0]} maxBarSize={48}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.realizedPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Cumulative P&L</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cumulativeData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`}
            />
            <Tooltip
              formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cumulative"]}
              labelFormatter={(l) => l}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="cumulative" radius={[3, 3, 0, 0]} maxBarSize={48}>
              {cumulativeData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.cumulative >= 0 ? "hsl(217 91% 60%)" : "hsl(0 84% 60%)"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
