interface RobinhoodAuth {
  username: string;
  accessToken: string;
}

interface PendingChallenge {
  challengeId: string;
  machineId: string;
  deviceToken: string;
  username: string;
  password: string;
  mfaCode: string;
}

const g = globalThis as typeof globalThis & {
  _robinhoodAuth?: RobinhoodAuth | null;
  _robinhoodPendingChallenge?: PendingChallenge | null;
};

if (!("_robinhoodAuth" in g)) g._robinhoodAuth = null;
if (!("_robinhoodPendingChallenge" in g)) g._robinhoodPendingChallenge = null;

export const credentialStore = {
  getAuth: (): RobinhoodAuth | null => g._robinhoodAuth ?? null,
  setAuth: (auth: RobinhoodAuth | null) => { g._robinhoodAuth = auth; },
  getPendingChallenge: (): PendingChallenge | null => g._robinhoodPendingChallenge ?? null,
  setPendingChallenge: (c: PendingChallenge | null) => { g._robinhoodPendingChallenge = c; },
};
