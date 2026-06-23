import { randomUUID } from "crypto";
import type { Contract } from "./types";

const ORF_RATE = 0.02955;      // FINRA Options Regulatory Fee per contract per side
const FIDELITY_RATE = 0.65;    // Fidelity per contract commission per side

function parseSymbol(symbol: string): {
  underlying: string;
  expiry: string;
  optionType: "call" | "put";
  strike: number;
} | null {
  // Fidelity format: -NVDA260724P160 (leading dash + ticker + YYMMDD + P/C + strike)
  const s = symbol.replace(/^-/, "").trim();
  const match = s.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([PC])(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const [, ticker, yy, mm, dd, typeChar, strikeStr] = match;
  return {
    underlying: ticker,
    expiry: `20${yy}-${mm}-${dd}`,
    optionType: typeChar === "C" ? "call" : "put",
    strike: parseFloat(strikeStr),
  };
}

function parseDate(s: string): string {
  // MM/DD/YYYY → YYYY-MM-DD
  const parts = s.trim().split("/");
  if (parts.length !== 3) return s;
  const [mm, dd, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

export function parseFidelityCsv(
  csvText: string,
  accountId: string,
  accountName: string,
): { contracts: Contract[]; errors: string[] } {
  const errors: string[] = [];

  const lines = csvText.replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim());

  const headerIdx = lines.findIndex(l => l.startsWith("Run Date,"));
  if (headerIdx === -1) {
    return { contracts: [], errors: ["Could not find header row — make sure this is a Fidelity History CSV"] };
  }

  // Detect column positions from header to handle both old and new Fidelity CSV layouts
  const headerFields = parseCsvLine(lines[headerIdx]);
  const col = (name: string) => headerFields.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const idxDate   = col("Run Date");
  const idxAction = col("Action");
  const idxSymbol = col("Symbol");
  const idxPrice  = col("Price");
  const idxQty    = col("Quantity");
  const idxComm   = col("Commission");
  const idxFees   = col("Fees");

  if ([idxDate, idxAction, idxSymbol, idxPrice, idxQty, idxComm, idxFees].some(i => i === -1)) {
    return { contracts: [], errors: ["CSV is missing expected columns (Run Date / Action / Symbol / Price / Quantity / Commission / Fees)"] };
  }

  interface Row {
    date: string;
    symbol: string;
    isOpen: boolean;
    price: number;
    quantity: number; // negative = sold, positive = bought (already signed in Fidelity CSV)
    commission: number;
    fees: number;
  }

  const rows: Row[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith('"The data') || line.startsWith('"Brokerage') || line.startsWith('"Date downloaded')) break;

    const fields = parseCsvLine(line);
    const maxIdx = Math.max(idxDate, idxAction, idxSymbol, idxPrice, idxQty, idxComm, idxFees);
    if (fields.length <= maxIdx) continue;

    const runDate = fields[idxDate];
    const action  = fields[idxAction];
    const symbol  = fields[idxSymbol];
    const priceStr = fields[idxPrice];
    const qtyStr   = fields[idxQty];
    const commStr  = fields[idxComm];
    const feesStr  = fields[idxFees];

    if (!symbol.startsWith("-")) continue;

    const isOpen = action.includes("OPENING");
    const isClose = action.includes("CLOSING");
    if (!isOpen && !isClose) continue;

    rows.push({
      date: parseDate(runDate),
      symbol,
      isOpen,
      price: Math.abs(parseFloat(priceStr) || 0),
      quantity: parseFloat(qtyStr) || 0,
      commission: parseFloat(commStr) || 0,
      fees: parseFloat(feesStr) || 0,
    });
  }

  // Sort ascending; within the same day put opens before closes so matching works
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    return 0;
  });

  type OpenContract = Contract & { _key: string };
  const opens: OpenContract[] = [];

  for (const row of rows) {
    const parsed = parseSymbol(row.symbol);
    if (!parsed) {
      errors.push(`Could not parse symbol: ${row.symbol}`);
      continue;
    }

    const { underlying, expiry, optionType, strike } = parsed;
    const key = `${underlying}|${expiry}|${optionType}|${strike}`;

    if (row.isOpen) {
      const feePerSide = Math.round(Math.abs(row.quantity) * (FIDELITY_RATE + ORF_RATE) * 100) / 100;
      opens.push({
        id: randomUUID(),
        accountId,
        accountName,
        broker: "fidelity",
        underlying,
        optionType,
        strike,
        expiry,
        quantity: row.quantity,
        openDate: row.date,
        openPrice: row.price,
        openCommission: row.commission + row.fees,
        closeDate: null,
        closePrice: null,
        closeCommission: 0,
        status: "open",
        realizedPnl: null,
        bidPrice: null,
        unrealizedPnl: null,
        totalFees: feePerSide,   // opening-side fees only while open
        estimatedClose: false,
        rollChainId: null,
        rollOrder: null,
        _key: key,
      });
    } else {
      const match = opens.find(c => c._key === key && c.closeDate === null);
      if (match) {
        match.closeDate = row.date;
        match.closePrice = row.price;
        match.closeCommission = row.commission + row.fees;
        match.status = "closed";
        // Closing side fees; total = open + close sides
        const closeFee = Math.round(Math.abs(row.quantity) * (FIDELITY_RATE + ORF_RATE) * 100) / 100;
        match.totalFees = match.totalFees + closeFee;
        match.realizedPnl = Math.round(
          ((match.closePrice - match.openPrice) * match.quantity * 100 - match.totalFees) * 100
        ) / 100;
      } else {
        errors.push(`Close without matching open: ${row.symbol} on ${row.date}`);
      }
    }
  }

  const contracts = opens.map(({ _key, ...c }) => c);
  return { contracts, errors };
}
