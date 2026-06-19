"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RobinhoodConnectForm } from "@/components/robinhood-connect-form";
import { FidelityCsvUpload } from "@/components/fidelity-csv-upload";
import { Badge } from "@/components/ui/badge";

interface ConnectionState {
  robinhood: { username: string } | null;
  fidelity: { imported: number; hasData: boolean } | null;
}

export default function SetupPage() {
  const [connections, setConnections] = useState<ConnectionState>({ robinhood: null, fidelity: null });

  async function fetchConnections() {
    const [rhResp, fidResp] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/fidelity/import"),
    ]);
    const rh = rhResp.ok ? await rhResp.json() : {};
    const fid = fidResp.ok ? await fidResp.json() : null;
    setConnections({
      robinhood: rh.robinhood ?? null,
      fidelity: fid,
    });
  }

  useEffect(() => { fetchConnections(); }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Accounts</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Fidelity — CSV Import</CardTitle>
            <Badge variant="outline">CSV</Badge>
          </div>
          <CardDescription className="text-sm">
            Download your trade history from Fidelity and import it here. In Fidelity: go to
            Accounts → History → select full date range → Download. The CSV is parsed in memory
            and never written to disk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.fidelity?.hasData ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>{connections.fidelity.imported} contracts loaded</span>
              <Badge variant="secondary" className="text-xs">Imported</Badge>
            </div>
          ) : null}
          <FidelityCsvUpload onImported={() => fetchConnections()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Robinhood</CardTitle>
            <Badge variant="outline">Direct OAuth</Badge>
          </div>
          <CardDescription className="text-sm">
            Enter your Robinhood credentials below. They are sent directly to Robinhood
            and never written to disk — only the resulting access token is kept in server
            memory for the current session. If Robinhood requires device verification, you
            will be prompted for the code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.robinhood ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>{connections.robinhood.username}</span>
              <Badge variant="secondary" className="text-xs">Connected</Badge>
            </div>
          ) : null}
          <RobinhoodConnectForm onConnected={() => fetchConnections()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How data flows</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Click <strong>Refresh</strong> in the top bar to fetch all data on demand.</p>
          <p>2. Fidelity CSV and Robinhood data are merged in memory — nothing is persisted to disk.</p>
          <p>3. Roll chains are detected automatically: when the same underlying closes and reopens on the same day, the legs are linked.</p>
          <p>4. Robinhood connection resets on server restart. Re-import your Fidelity CSV after restart too.</p>
        </CardContent>
      </Card>
    </div>
  );
}
