"use client";

import { useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plug, Check } from "lucide-react";

export function PlaidLinkButton({ onConnected }: { onConnected?: (name: string) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("Fidelity");
  const [connected, setConnected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startLink() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/plaid/link-token", { method: "POST" });
      const { linkToken: token, error: err } = await resp.json();
      if (err) throw new Error(err);
      setLinkToken(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const onSuccess = useCallback(
    async (publicToken: string) => {
      const resp = await fetch("/api/plaid/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken, accountName }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setConnected(data.accountName);
      setLinkToken(null);
      onConnected?.(data.accountName);
    },
    [accountName, onConnected]
  );

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess });

  if (connected) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Check className="h-4 w-4" />
        <span>{connected} connected — token stored in memory</span>
      </div>
    );
  }

  if (linkToken) {
    return (
      <Button onClick={() => open()} disabled={!ready}>
        <Plug className="h-4 w-4 mr-2" />
        Authenticate with {accountName}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Account name (e.g. Fidelity)"
          className="max-w-[200px] h-8 text-sm"
        />
        <Button size="sm" onClick={startLink} disabled={loading}>
          <Plug className="h-4 w-4 mr-2" />
          {loading ? "Loading…" : "Connect via Plaid"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
