"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

type Phase = "idle" | "connecting" | "challenge" | "verifying" | "app_approval" | "connected" | "error";

export function RobinhoodConnectForm({ onConnected }: { onConnected?: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeCode, setChallengeCode] = useState("");
  const [challengeType, setChallengeType] = useState("sms");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectedUser, setConnectedUser] = useState<string | null>(null);

  async function connect() {
    setPhase("connecting");
    setError(null);
    try {
      const resp = await fetch("/api/robinhood/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, mfaCode: mfaCode || undefined }),
      });
      const data = await resp.json();

      if (data.status === "ok") {
        setPhase("connected");
        setConnectedUser(username);
        onConnected?.(username);
      } else if (data.status === "challenge_required") {
        setChallengeType(data.type ?? "sms");
        setPhase("challenge");
      } else if (data.status === "app_approval_required") {
        setPhase("app_approval");
      } else {
        setError(data.error ?? "Connection failed");
        setPhase("error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function submitAppApproval() {
    setPhase("verifying");
    setError(null);
    try {
      const resp = await fetch("/api/robinhood/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "" }),
      });
      const data = await resp.json();
      if (data.status === "ok") {
        setPhase("connected");
        setConnectedUser(username);
        onConnected?.(username);
      } else {
        setError(data.error ?? "Verification failed — did you approve the request in the app?");
        setPhase("app_approval");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("app_approval");
    }
  }

  async function submitChallenge() {
    setPhase("verifying");
    setError(null);
    try {
      const resp = await fetch("/api/robinhood/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: challengeCode }),
      });
      const data = await resp.json();

      if (data.status === "ok") {
        setPhase("connected");
        setConnectedUser(username);
        onConnected?.(username);
      } else {
        setError(data.error ?? "Verification failed");
        setPhase("challenge");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("challenge");
    }
  }

  if (phase === "connected" && connectedUser) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Check className="h-4 w-4" />
        <span>{connectedUser} connected — credentials stored in memory</span>
      </div>
    );
  }

  if (phase === "app_approval") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Open the Robinhood app on your phone and approve the login request, then click Continue.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={submitAppApproval} disabled={(phase as string) === "verifying"}>
            I approved it — Continue
          </Button>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => { setPhase("idle"); setError(null); }}
          >
            Start over
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (phase === "challenge" || phase === "verifying") {
    const label = challengeType === "email"
      ? "Check your email for a Robinhood verification code"
      : "Check your phone — Robinhood sent an SMS code";
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <Input
            value={challengeCode}
            onChange={(e) => setChallengeCode(e.target.value)}
            placeholder="Enter 6-digit code"
            className="max-w-[160px] h-8 text-sm font-mono tracking-widest"
            maxLength={6}
          />
          <Button size="sm" onClick={submitChallenge} disabled={phase === "verifying" || !challengeCode}>
            {phase === "verifying" ? "Verifying…" : "Verify"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => { setPhase("idle"); setError(null); setChallengeCode(""); }}
        >
          Start over
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-foreground">Email</label>
          <Input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@example.com"
            className="h-8 text-sm"
            autoComplete="username"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-8 text-sm"
            autoComplete="current-password"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          MFA / TOTP code{" "}
          <span className="font-normal">(leave blank if none, or enter your current 6-digit code)</span>
        </label>
        <Input
          type="text"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          placeholder="123456"
          className="max-w-[120px] h-8 text-sm font-mono"
          maxLength={6}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        size="sm"
        onClick={connect}
        disabled={phase === "connecting" || !username || !password}
      >
        {phase === "connecting" ? "Connecting…" : "Connect Robinhood"}
      </Button>
    </div>
  );
}
