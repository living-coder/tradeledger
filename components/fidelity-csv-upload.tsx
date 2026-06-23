"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ImportResult {
  imported: number;
  open: number;
  closed: number;
  errors: string[];
}

interface Props {
  onImported?: (result: ImportResult) => void;
}

export function FidelityCsvUpload({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleFile(file: File) {
    setStatus("uploading");
    setResult(null);
    setErrorMsg("");

    const form = new FormData();
    form.append("file", file);

    try {
      const resp = await fetch("/api/fidelity/import", { method: "POST", body: form });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Upload failed");
        return;
      }
      setResult(data);
      setStatus("done");
      onImported?.(data);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-muted rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground transition-colors"
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onInputChange}
        />
        <p className="text-sm text-muted-foreground">
          {status === "uploading"
            ? "Importing..."
            : "Drop your Fidelity History CSV here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Fidelity → Accounts → History → Download (select full date range)
        </p>
      </div>

      {status === "done" && result && (
        <div className="text-sm space-y-1">
          <p className="text-emerald-600 font-medium">
            Imported {result.imported} contracts ({result.open} open, {result.closed} closed)
          </p>
          {result.errors.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{result.errors.length} warning(s)</summary>
              <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setStatus("idle"); setResult(null); inputRef.current?.click(); }}
          >
            Replace with new CSV
          </Button>
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}
    </div>
  );
}
