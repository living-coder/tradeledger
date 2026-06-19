import { NextRequest, NextResponse } from "next/server";
import { parseFidelityCsv } from "@/lib/fidelity-csv-parser";
import { fidelityStore } from "@/lib/fidelity-store";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const { contracts, errors } = parseFidelityCsv(text, "fidelity-csv", "Fidelity");

    fidelityStore.set(contracts);

    return NextResponse.json({
      imported: contracts.length,
      open: contracts.filter(c => c.status === "open").length,
      closed: contracts.filter(c => c.status === "closed").length,
      errors,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    imported: fidelityStore.count(),
    hasData: fidelityStore.hasData(),
  });
}
