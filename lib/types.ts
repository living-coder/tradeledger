export type Broker = "fidelity" | "robinhood";
export type OptionType = "call" | "put";
export type ContractStatus = "open" | "closed" | "expired" | "assigned";

export interface Account {
  id: string;
  name: string;
  broker: Broker;
}

export interface Contract {
  id: string;
  accountId: string;
  accountName: string;
  broker: Broker;

  underlying: string; // e.g. "AAPL"
  optionType: OptionType;
  strike: number;
  expiry: string; // "YYYY-MM-DD"

  // positive = long (bought to open), negative = short (sold to open)
  quantity: number;

  openDate: string; // "YYYY-MM-DD"
  openPrice: number; // per share (multiply by 100 for contract notional)
  openCommission: number;

  closeDate: string | null;
  closePrice: number | null;
  closeCommission: number;

  status: ContractStatus;

  // (closePrice - openPrice) * quantity * 100 - commissions
  realizedPnl: number | null;

  // Current market bid (ask for shorts, bid for longs) — populated during refresh
  bidPrice: number | null;
  // P&L if closed at current market price
  unrealizedPnl: number | null;

  rollChainId: string | null;
  rollOrder: number | null; // 0 = original, 1 = first roll, ...
}

export interface RollChain {
  id: string;
  underlying: string;
  optionType: OptionType;
  accountId: string;
  legs: Contract[]; // ordered by rollOrder
  totalRealizedPnl: number; // sum of closed legs
}

// A vertical spread: one short leg + one long leg, same underlying/type/expiry/openDate
export interface Spread {
  id: string;
  accountId: string;
  accountName: string;
  broker: Broker;
  underlying: string;
  optionType: OptionType;
  shortLeg: Contract; // quantity < 0
  longLeg: Contract;  // quantity > 0
  quantity: number;   // number of spreads = |shortLeg.quantity|
  openDate: string;
  closeDate: string | null;
  status: ContractStatus;
  netCredit: number;          // per share: shortLeg.openPrice - longLeg.openPrice
  closeNetCredit: number | null; // per share when closed
  realizedPnl: number | null;
  unrealizedPnl: number | null;          // P&L if closed at current market
  unrealizedCloseDebit: number | null;   // net debit to close (shortAsk - longBid)
  rollChainId: string | null;
  rollOrder: number | null;
}

export interface SpreadRollChain {
  id: string;
  underlying: string;
  optionType: OptionType;
  accountId: string;
  legs: Spread[]; // ordered by rollOrder
  totalRealizedPnl: number;
}

export interface MonthlyPnl {
  year: number;
  month: number; // 1-12
  label: string; // "Jan 2025"
  realizedPnl: number;
  closedContracts: number;
  byUnderlying: Record<string, number>;
}

export interface RefreshResult {
  accounts: Account[];
  contracts: Contract[];
  spreads: Spread[];
  rollChains: RollChain[];
  spreadRollChains: SpreadRollChain[];
  monthlyPnl: MonthlyPnl[];
  openContracts: number;
  closedContracts: number;
  totalRealizedPnl: number;
  errors: { source: string; message: string }[];
  lastSync: string; // ISO datetime
}
