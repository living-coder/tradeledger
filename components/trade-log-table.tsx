"use client";

import { useState, useMemo, Fragment } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";
import type { Contract, RollChain, Spread, SpreadRollChain, ContractStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Link2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays } from "date-fns";

// ── Normalised display row ──────────────────────────────────────────────────
interface TableItem {
  id: string;
  underlying: string;
  displayType: string;      // "PUT SPREAD" | "CALL SPREAD" | "put" | "call"
  strikeLabel: string;      // "$185 / $205" or "$205"
  expiry: string;
  quantity: number;
  isCredit: boolean;        // true → SELL direction
  openDate: string;
  openPrice: number;        // net credit or single-leg price
  closeDate: string | null;
  closePrice: number | null;
  realizedPnl: number | null;
  // Unrealized (amber) — populated when market quotes are available
  unrealizedClosePrice: number | null;
  unrealizedPnl: number | null;
  status: ContractStatus;
  broker: string;
  rollChainId: string | null;
  source: { kind: "spread"; data: Spread } | { kind: "contract"; data: Contract };
}

const BROKER_LABEL: Record<string, string> = { robinhood: "Robinhood", fidelity: "Fidelity" };

function itemFromSpread(s: Spread): TableItem {
  const lo = Math.min(s.shortLeg.strike, s.longLeg.strike);
  const hi = Math.max(s.shortLeg.strike, s.longLeg.strike);
  return {
    id: s.id,
    underlying: s.underlying,
    displayType: `${s.optionType === "put" ? "PUT" : "CALL"} SPREAD`,
    strikeLabel: `$${hi} / $${lo}`,
    expiry: s.shortLeg.expiry,
    quantity: s.quantity,
    isCredit: s.netCredit >= 0,
    openDate: s.openDate,
    openPrice: s.netCredit,
    closeDate: s.closeDate,
    closePrice: s.closeNetCredit,
    realizedPnl: s.realizedPnl,
    unrealizedClosePrice: s.unrealizedCloseDebit ?? null,
    unrealizedPnl: s.unrealizedPnl ?? null,
    status: s.status,
    broker: s.broker,
    rollChainId: s.rollChainId,
    source: { kind: "spread", data: s },
  };
}

function itemFromContract(c: Contract): TableItem {
  return {
    id: c.id,
    underlying: c.underlying,
    displayType: c.optionType,
    strikeLabel: `$${c.strike.toFixed(2)}`,
    expiry: c.expiry,
    quantity: Math.abs(c.quantity),
    isCredit: c.quantity < 0,
    openDate: c.openDate,
    openPrice: c.openPrice,
    closeDate: c.closeDate,
    closePrice: c.closePrice,
    realizedPnl: c.realizedPnl,
    unrealizedClosePrice: c.bidPrice ?? null,
    unrealizedPnl: c.unrealizedPnl ?? null,
    status: c.status,
    broker: c.broker,
    rollChainId: c.rollChainId,
    source: { kind: "contract", data: c },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function pnlColor(v: number | null) {
  if (v === null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
}
function fmt(v: number | null) {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
}
function getDTE(item: TableItem): number | null {
  const expiry = parseISO(item.expiry);
  if (item.status === "open") return Math.max(0, differenceInDays(expiry, new Date()));
  if (item.closeDate) return Math.max(0, differenceInDays(expiry, parseISO(item.closeDate)));
  return null;
}

// ── Inline roll chain panel ──────────────────────────────────────────────────
function InlineSpreadChain({ chain }: { chain: SpreadRollChain }) {
  // Cash-flow per leg: credit received on open minus debit paid on close.
  // realizedPnl is nulled on all chain legs by the detector, so we compute from raw prices.
  const legNets = chain.legs.map((s) =>
    (s.netCredit - (s.closeNetCredit ?? 0)) * s.quantity * 100
  );
  const runningTotals: number[] = [];
  legNets.forEach((n, i) => runningTotals.push((runningTotals[i - 1] ?? 0) + n));
  const grandTotal = runningTotals[runningTotals.length - 1] ?? 0;

  return (
    <div className="bg-blue-50/60 dark:bg-blue-950/20 border-y border-blue-200/60 dark:border-blue-800/40 px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="font-semibold text-sm">Roll Chain — {chain.underlying} {chain.optionType} spread</span>
        <span className={cn("font-mono font-semibold text-sm", grandTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
          {fmt(grandTotal)} running total
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {chain.legs.map((s, idx) => {
          const lo = Math.min(s.shortLeg.strike, s.longLeg.strike);
          const hi = Math.max(s.shortLeg.strike, s.longLeg.strike);
          const openLabel = s.netCredit >= 0 ? "Credit" : "Debit";
          const closeLabel = s.closeNetCredit !== null
            ? (s.closeNetCredit > 0 ? "Debit" : "Credit")
            : null;
          const legNet = legNets[idx];
          const cumulative = runningTotals[idx];
          return (
            <Fragment key={s.id}>
              {idx > 0 && (
                <div className="flex flex-col items-center justify-center gap-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className={cn("font-mono text-[10px] font-semibold", cumulative >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                    {fmt(runningTotals[idx - 1])}
                  </span>
                </div>
              )}
              <div className="border rounded-md px-3 py-2 bg-background space-y-0.5 text-xs min-w-[200px] flex flex-col">
                <div className="font-mono font-semibold">${hi} / ${lo}</div>
                <div className="text-muted-foreground text-[11px]">Expiry {format(parseISO(s.shortLeg.expiry), "MMMM dd, yyyy")}</div>
                <div className="text-muted-foreground">Open {format(parseISO(s.openDate), "MMM d")} · {openLabel} ${Math.abs(s.netCredit * s.quantity * 100).toFixed(2)}</div>
                {s.closeDate && (
                  <div className="text-muted-foreground">
                    Close {format(parseISO(s.closeDate), "MMM d")} · {closeLabel} {s.closeNetCredit !== null ? `$${Math.abs(s.closeNetCredit * s.quantity * 100).toFixed(2)}` : "—"}
                  </div>
                )}
                <div className={cn("font-semibold font-mono mt-auto pt-1", legNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  {fmt(legNet)}{!s.closeDate ? " (open)" : ""}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function InlineContractChain({ chain }: { chain: RollChain }) {
  // Per-leg cash flow: for sold legs, profit = (openPrice - closePrice) × |qty| × 100
  const legNets = chain.legs.map((leg) => {
    if (leg.realizedPnl !== null) return leg.realizedPnl;
    // Open final leg: show credit/debit received at open (unrealized)
    const qty = Math.abs(leg.quantity);
    return leg.quantity < 0
      ? leg.openPrice * qty * 100        // credit received (positive)
      : -(leg.openPrice * qty * 100);    // debit paid (negative)
  });
  const runningTotals: number[] = [];
  legNets.forEach((n, i) => runningTotals.push((runningTotals[i - 1] ?? 0) + n));
  const grandTotal = runningTotals[runningTotals.length - 1] ?? 0;

  return (
    <div className="bg-blue-50/60 dark:bg-blue-950/20 border-y border-blue-200/60 dark:border-blue-800/40 px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="font-semibold text-sm">Roll Chain — {chain.underlying} {chain.optionType}</span>
        <span className={cn("font-mono font-semibold text-sm", grandTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
          {fmt(grandTotal)} running total
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {chain.legs.map((leg, idx) => {
          const isSold = leg.quantity < 0;
          const qty = Math.abs(leg.quantity);
          const legNet = legNets[idx];
          const cumulative = runningTotals[idx];
          return (
            <Fragment key={leg.id}>
              {idx > 0 && (
                <div className="flex flex-col items-center justify-center gap-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className={cn("font-mono text-[10px] font-semibold", cumulative >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                    {fmt(runningTotals[idx - 1])}
                  </span>
                </div>
              )}
              <div className="border rounded-md px-3 py-2 bg-background space-y-0.5 text-xs min-w-[180px] flex flex-col">
                <div className="font-mono font-semibold">${leg.strike}</div>
                <div className="text-muted-foreground text-[11px]">Expiry {format(parseISO(leg.expiry), "MMMM dd, yyyy")}</div>
                <div className="text-muted-foreground">Open {format(parseISO(leg.openDate), "MMM d")} · {isSold ? "Credit" : "Debit"} ${(leg.openPrice * qty * 100).toFixed(2)}</div>
                {leg.closeDate && (
                  <div className="text-muted-foreground">Close {format(parseISO(leg.closeDate), "MMM d")} · {isSold ? "Debit" : "Credit"} ${((leg.closePrice ?? 0) * qty * 100).toFixed(2)}</div>
                )}
                <div className={cn("font-semibold font-mono mt-auto pt-1", legNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  {fmt(legNet)}{!leg.closeDate ? " (open)" : ""}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Table columns ────────────────────────────────────────────────────────────
const col = createColumnHelper<TableItem>();

const columns = [
  col.display({
    id: "roll",
    header: "",
    cell: () => null, // rendered via row click handler; icon injected in row
    enableSorting: false,
    size: 32,
  }),
  col.accessor("underlying", {
    header: "Ticker",
    cell: (i) => <span className="font-mono font-semibold tracking-wide">{i.getValue()}</span>,
  }),
  col.accessor("displayType", {
    header: "Type",
    cell: (i) => {
      const v = i.getValue();
      const isSpread = v.includes("SPREAD");
      return (
        <span className={cn(
          "text-xs font-medium px-1.5 py-0.5 rounded",
          isSpread ? "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
            : v === "call" ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
            : "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
        )}>
          {isSpread ? v : v.toUpperCase()}
        </span>
      );
    },
  }),
  col.accessor("strikeLabel", {
    header: "Strike",
    cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
  }),
  col.accessor("expiry", {
    header: "Expiry",
    cell: (i) => <span className="font-mono text-xs">{format(parseISO(i.getValue()), "MMM dd, yy")}</span>,
  }),
  col.display({
    id: "dte",
    header: "DTE",
    cell: ({ row }) => {
      const dte = getDTE(row.original);
      if (dte === null) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className={cn("font-mono text-xs", dte <= 7 && row.original.status === "open" ? "text-amber-500 font-semibold" : "")}>
          {dte}d
        </span>
      );
    },
    enableSorting: false,
  }),
  col.accessor("quantity", {
    header: "Side",
    cell: (i) => {
      const qty = i.getValue();
      const isCredit = i.row.original.isCredit;
      return (
        <span className={cn("text-xs font-medium", isCredit ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400")}>
          {qty} {isCredit ? "SELL" : "BUY"}
        </span>
      );
    },
  }),
  col.accessor("openDate", {
    header: "Opened",
    cell: (i) => <span className="text-xs">{format(parseISO(i.getValue()), "MMM dd, yy")}</span>,
  }),
  col.accessor("openPrice", {
    header: "Open $",
    cell: (i) => <span className="font-mono text-xs">${Math.abs(i.getValue()).toFixed(2)}</span>,
  }),
  col.accessor("closeDate", {
    header: "Closed",
    cell: (i) => <span className="text-xs">{i.getValue() ? format(parseISO(i.getValue()!), "MMM dd, yy") : "—"}</span>,
    sortingFn: (a, b) => (a.original.closeDate ?? "").localeCompare(b.original.closeDate ?? ""),
  }),
  col.accessor("closePrice", {
    header: "Close $",
    cell: ({ row }) => {
      const { closePrice, unrealizedClosePrice } = row.original;
      if (closePrice !== null)
        return <span className="font-mono text-xs">${Math.abs(closePrice).toFixed(2)}</span>;
      if (unrealizedClosePrice !== null)
        return (
          <span className="font-mono text-xs text-muted-foreground" title="Estimated close at current market">
            ~${Math.abs(unrealizedClosePrice).toFixed(2)}
          </span>
        );
      return <span className="text-muted-foreground">—</span>;
    },
  }),
  col.accessor("realizedPnl", {
    header: "P&L",
    cell: ({ row }) => {
      const { realizedPnl, unrealizedPnl } = row.original;
      if (realizedPnl !== null)
        return <span className={cn("font-mono font-semibold text-xs", pnlColor(realizedPnl))}>{fmt(realizedPnl)}</span>;
      if (unrealizedPnl !== null)
        return (
          <span className={cn("font-mono font-semibold text-xs", pnlColor(unrealizedPnl))} title="Unrealized P&L at current market prices">
            {fmt(unrealizedPnl)}
          </span>
        );
      return <span className="text-muted-foreground">—</span>;
    },
    sortingFn: (a, b) => {
      const av = a.original.realizedPnl ?? a.original.unrealizedPnl ?? -Infinity;
      const bv = b.original.realizedPnl ?? b.original.unrealizedPnl ?? -Infinity;
      return av - bv;
    },
  }),
  col.accessor("status", {
    header: "Status",
    cell: (i) => {
      const v = i.getValue();
      const colors: Record<string, string> = {
        open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
        closed: "bg-muted text-muted-foreground",
        expired: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        assigned: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
      };
      return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", colors[v])}>{v}</span>;
    },
  }),
  col.accessor("broker", {
    header: "Account",
    cell: (i) => <span className="text-xs text-muted-foreground">{BROKER_LABEL[i.getValue()] ?? i.getValue()}</span>,
  }),
];

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  contracts: Contract[];
  spreads: Spread[];
  rollChains: RollChain[];
  spreadRollChains: SpreadRollChain[];
}

export function TradeLogTable({ contracts, spreads, rollChains, spreadRollChains }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "closeDate", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const spreadChainMap = useMemo(() => new Map(spreadRollChains.map((c) => [c.id, c])), [spreadRollChains]);
  const contractChainMap = useMemo(() => new Map(rollChains.map((c) => [c.id, c])), [rollChains]);

  const rows = useMemo<TableItem[]>(() => {
    const items: TableItem[] = [
      ...spreads
        .filter((s) => {
          // For chained spreads, only show the final (current) leg as a top-level row
          if (!s.rollChainId) return true;
          const chain = spreadChainMap.get(s.rollChainId);
          if (!chain) return true;
          return chain.legs[chain.legs.length - 1].id === s.id;
        })
        .map(itemFromSpread),
      ...contracts.map(itemFromContract),
    ];
    if (statusFilter === "all") return items;
    return items.filter((r) => r.status === statusFilter);
  }, [spreads, contracts, statusFilter, spreadChainMap]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  function toggleChain(chainId: string) {
    setExpanded((prev) => ({ ...prev, [chainId]: !prev[chainId] }));
  }

  const renderedChains = new Set<string>();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search ticker…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center ml-auto">
          {table.getFilteredRowModel().rows.length} positions
        </span>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="whitespace-nowrap py-2 cursor-pointer select-none text-xs font-medium tracking-wide"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && <ChevronUp className="h-3 w-3" />}
                      {header.column.getIsSorted() === "desc" && <ChevronDown className="h-3 w-3" />}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8 text-sm">
                  No positions found. Click Refresh to load data.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const chainId = row.original.rollChainId;
                const isChainable = !!chainId;
                const isExpanded = chainId ? expanded[chainId] : false;

                // Render the chain panel once, after the first row that has it
                let chainEl: React.ReactNode = null;
                if (chainId && isExpanded && !renderedChains.has(chainId)) {
                  renderedChains.add(chainId);
                  const spreadChain = spreadChainMap.get(chainId);
                  const contractChain = contractChainMap.get(chainId);
                  chainEl = (
                    <tr key={`chain-${chainId}`}>
                      <td colSpan={columns.length} className="p-0">
                        {spreadChain
                          ? <InlineSpreadChain chain={spreadChain} />
                          : contractChain
                          ? <InlineContractChain chain={contractChain} />
                          : null}
                      </td>
                    </tr>
                  );
                }

                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        "transition-colors",
                        isChainable
                          ? "cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                          : "hover:bg-muted/40"
                      )}
                      onClick={() => chainId && toggleChain(chainId)}
                    >
                      {row.getVisibleCells().map((cell) => {
                        // Inject the roll icon into the first "roll" column
                        if (cell.column.id === "roll" && isChainable) {
                          return (
                            <TableCell key={cell.id} className="py-2 w-8">
                              <Link2 className={cn("h-3.5 w-3.5", isExpanded ? "text-blue-500" : "text-muted-foreground")} />
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={cell.id} className="py-2 whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {chainEl}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
