"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";

type Venue = {
  _id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

function fmtVenueLine(v: Venue) {
  const parts = [v.address, v.city, v.state].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet<Venue[]>("/api/venues");
      setVenues(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const count = useMemo(() => venues.length, [venues]);

  return (
    <main className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Venues</h1>
          <p className="text-gray-600 mt-1">{count} venue{count === 1 ? "" : "s"}</p>
        </div>

        <Link className="rounded bg-black text-white px-4 py-2" href="/admin/venues/new">
          + Add venue
        </Link>
      </header>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700 whitespace-pre-wrap">
          {err}
        </div>
      )}

      <section className="space-y-2">
        {loading ? (
          <div className="text-gray-600">Loading…</div>
        ) : venues.length === 0 ? (
          <div className="text-gray-600">No venues yet.</div>
        ) : (
          venues.map((v) => (
            <div key={v._id} className="border rounded-lg p-4">
              <div className="font-medium">{v.name}</div>
              <div className="text-sm text-gray-600 mt-1">{fmtVenueLine(v)}</div>
              <div className="text-xs text-gray-400 mt-2">id: {v._id}</div>
            </div>
          ))
        )}
      </section>

      <footer className="flex items-center gap-2">
        <button className="border rounded px-4 py-2" onClick={load} disabled={loading} type="button">
          {loading ? "Loading…" : "Refresh"}
        </button>
        <Link className="border rounded px-4 py-2" href="/admin">
          Back to dashboard
        </Link>
      </footer>
    </main>
  );
}
