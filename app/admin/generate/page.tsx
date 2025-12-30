"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";

export default function GenerateEventsPage() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  const [from, setFrom] = useState(`${yyyy}-${mm}-${dd}`);
  const [to, setTo] = useState(`${yyyy}-${mm}-${dd}`);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const res = await apiPost("/api/admin/generate-events", { from, to });
      setResult(res);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Generate Events</h1>
        <p className="text-gray-600 mt-1">
          Expands Frequencies into Events (upsert). Safe to run multiple times.
        </p>
      </header>

      <section className="rounded-lg border p-4 max-w-xl space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">From</div>
            <input className="border rounded px-3 py-2 w-full" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">To</div>
            <input className="border rounded px-3 py-2 w-full" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <button
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
          disabled={running || !from || !to}
          onClick={run}
        >
          {running ? "Generating..." : "Generate"}
        </button>

        {err && <p className="text-red-600 whitespace-pre-wrap">{err}</p>}

        {result && (
          <pre className="bg-gray-50 border rounded p-3 text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
