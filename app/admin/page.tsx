// app/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";

type Row = any;

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function freqSummary(f: any) {
  if (f.kind === "WEEKLY") return `Weekly: ${(f.byDay ?? []).join(", ")}`;
  if (f.kind === "MONTHLY_NTH_WEEKDAY") return `Monthly: ${f.nth} ${f.weekday}`;
  return f.kind;
}

function buildPlanLessonHref(r: any) {
  const p = new URLSearchParams();

  p.set("eventTypeId", String(r.eventTypeId ?? ""));
  p.set("date", String(r.date ?? ""));
  p.set("startTime", String(r.startTime ?? ""));
  p.set("durationMinutes", String(r.durationMinutes ?? ""));

  // display-only params for the plan-lesson page header (uneditable)
  if (r.eventType?.title) p.set("title", String(r.eventType.title));
  if (r.eventType?.level) p.set("level", String(r.eventType.level));
  if (r.venue?.name) p.set("venueName", String(r.venue.name));

  return `/admin/plan-lesson?${p.toString()}`;
}

export default function LessonPlansDashboard() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(ymd(today));
  const [to, setTo] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21)));

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyUnplanned, setOnlyUnplanned] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet<Row[]>(`/api/admin/lesson-plans?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter((r) => (onlyUnplanned ? r.unplanned && !r.isCancelled : true));

  return (
    <main className="p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Lesson Plans</h1>
        <p className="text-gray-600 mt-1">Pick an event and fill in dances, cancellations, and substitutes.</p>
      </header>

      <section className="rounded-lg border p-4 space-y-3 max-w-3xl">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">From</div>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label className="text-sm">
            <div className="text-gray-600 mb-1">To</div>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyUnplanned}
              onChange={(e) => setOnlyUnplanned(e.target.checked)}
            />
            Only unplanned
          </label>

          <button
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>

        {err && <p className="text-red-600 whitespace-pre-wrap">{err}</p>}
      </section>

      <section className="space-y-2">
        {filtered.map((r) => {
          const href = r.eventId
            ? `/admin/plan/${String(r.eventId)}`
            : buildPlanLessonHref(r);

          return (
            <Link
              key={String(r._id)}
              href={href}
              className="block border rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-medium">
                  {r.eventType?.title ?? "Unknown Event"}{" "}
                  {r.isCancelled ? (
                    <span className="text-xs text-red-600">(cancelled)</span>
                  ) : null}
                </div>
                <div className="text-sm text-gray-600">
                  {r.date} • {r.startTime}–{r.endTime}
                </div>
              </div>

              <div className="text-sm text-gray-700 mt-1">
                {r.venue?.name ?? "Unknown venue"}
                {r.substitute ? (
                  <span className="text-gray-500"> • Sub: {r.substitute}</span>
                ) : null}
              </div>

              <div className="text-xs text-gray-500 mt-2">
                {(r.frequencies ?? []).map(freqSummary).join(" | ") || "No frequency"}
              </div>
            </Link>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="text-gray-600">No matching events in that range.</div>
        )}
      </section>
    </main>
  );
}
