import type { Contract } from "./types";

const g = globalThis as typeof globalThis & {
  _fidelityContracts?: Contract[];
};

export const fidelityStore = {
  get: (): Contract[] => g._fidelityContracts ?? [],
  set: (contracts: Contract[]) => { g._fidelityContracts = contracts; },
  hasData: (): boolean => (g._fidelityContracts?.length ?? 0) > 0,
  count: (): number => g._fidelityContracts?.length ?? 0,
};
