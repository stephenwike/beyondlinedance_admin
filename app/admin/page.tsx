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

function ymdMinusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymd(d);
}

function freqSummary(f: any) {
  if (f.kind === "WEEKLY") return `Weekly: ${(f.byDay ?? []).join(", ")}`;
  if (f.kind === "MONTHLY_NTH_WEEKDAY") return `Monthly: ${f.nth} ${f.weekday}`;
  return f.kind;
}

function asStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function idToString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (typeof v.$oid === "string") return v.$oid;
    if (typeof v.toString === "function") {
      const s = v.toString();
      if (s && s !== "[object Object]") return s;
    }
  }
  return "";
}

function isObjectIdString(id?: string) {
  return !!id && /^[a-fA-F0-9]{24}$/.test(id);
}

function buildPlanLessonHref(r: any) {
  const eventTypeId = idToString(r.eventTypeId ?? r.eventType?._id).trim();
  const date = asStr(r.date).trim();
  const startTime = asStr(r.startTime).trim();
  const endTime = asStr(r.endTime).trim();
  const endDayOffset = r.endDayOffset === 1 ? "1" : "0";
  const title = asStr(r.eventType?.title ?? r.title).trim();

  const sp = new URLSearchParams();
  if (eventTypeId) sp.set("eventTypeId", eventTypeId);
  if (date) sp.set("date", date);
  if (startTime) sp.set("startTime", startTime);
  if (endTime) sp.set("endTime", endTime);
  sp.set("endDayOffset", endDayOffset);
  if (title) sp.set("title", title);

  return `/admin/plan-lesson?${sp.toString()}`;
}

function isUnplannedRow(r: any) {
  if (r?.isCancelled) return false;

  if (typeof r?.unplanned === "boolean") return r.unplanned;

  const eventId = idToString(r?._id);
  if (!eventId) return true;

  const lessons = Array.isArray(r?.lessons) ? r.lessons : [];
  if (lessons.length === 0) return true;

  return lessons.some((l: any) => !(asStr(l?.dance).trim().length > 0));
}

export default function LessonPlansDashboard() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(ymd(today));
  const [to, setTo] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21)));

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyUnplanned, setOnlyUnplanned] = useState(true);

  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [commitErr, setCommitErr] = useState<string | null>(null);

  async function loadCommitCount() {
    setCommitErr(null);
    try {
      const fromPast = ymdMinusDays(14);
      const toToday = ymd(new Date());

      const res = await fetch(
        `/api/admin/lesson-commit-queue?countOnly=true&from=${encodeURIComponent(fromPast)}&to=${encodeURIComponent(toToday)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCommitCount(Number(data?.count ?? 0));
    } catch (e: any) {
      setCommitErr(e.message ?? String(e));
      setCommitCount((prev) => (typeof prev === "number" ? prev : 0));
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet<Row[]>(`/api/admin/lesson-plans?from=${from}&to=${to}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }

    loadCommitCount();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter((r) => (onlyUnplanned ? isUnplannedRow(r) : true));
  const showCommitBanner = (commitCount ?? 0) > 0 || !!commitErr;

  return (
    <main className="p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Lesson Plans</h1>
        <p className="text-gray-600 mt-1">Pick an occurrence and plan lessons, cancellations, and substitutes.</p>
      </header>

      {showCommitBanner && (
        <section className="rounded-lg border p-4 max-w-3xl space-y-2 bg-yellow-50 border-yellow-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Lessons to commit</div>
              {commitErr ? (
                <div className="text-sm text-red-700 whitespace-pre-wrap">
                  Couldn’t load commit queue count: {commitErr}
                </div>
              ) : (
                <div className="text-sm text-gray-700">
                  {commitCount === null
                    ? "Checking…"
                    : commitCount === 0
                    ? "No lessons ready right now."
                    : `You have ${commitCount} lesson${commitCount === 1 ? "" : "s"} ready to confirm.`}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button className="border rounded px-4 py-2 text-sm bg-white" onClick={loadCommitCount} type="button">
                Refresh
              </button>
              <Link className="rounded bg-black text-white px-4 py-2" href="/admin/commit-lessons">
                Review
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border p-4 space-y-3 max-w-3xl">
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

        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={onlyUnplanned} onChange={(e) => setOnlyUnplanned(e.target.checked)} />
            Only unplanned
          </label>

          <button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Load"}
          </button>

          <Link className="border rounded px-4 py-2 text-sm" href="/admin/add-event">
            + Add one-off event
          </Link>

          <Link className="border rounded px-4 py-2 text-sm" href="/admin/commit-lessons">
            Commit lessons
          </Link>
        </div>

        {err && <p className="text-red-600 whitespace-pre-wrap">{err}</p>}
      </section>

      <section className="space-y-2">
        {filtered.map((r) => {
          const eventId = idToString(r.eventId ?? r._id);
          const isPersisted = isObjectIdString(eventId);

          const fallbackKey = `${idToString(r.eventTypeId ?? r.eventType?._id)}|${asStr(r.date)}|${asStr(r.startTime)}`;
          const key = isPersisted ? eventId : fallbackKey;

          const href = isPersisted ? `/admin/events/${eventId}` : buildPlanLessonHref(r);

          return (
            <Link key={key} href={href} className="block border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-medium">
                  {r.eventType?.title ?? "Unknown Event"}{" "}
                  {!isPersisted ? <span className="text-xs text-gray-500">(virtual)</span> : null}{" "}
                  {r.isCancelled ? <span className="text-xs text-red-600">(cancelled)</span> : null}
                </div>
                <div className="text-sm text-gray-600">
                  {r.date} • {r.startTime}–{r.endTime}
                  {r.endDayOffset === 1 ? " (+1 day)" : ""}
                </div>
              </div>

              <div className="text-sm text-gray-700 mt-1">
                {r.venue?.name ?? "Unknown venue"}
                {r.substitute ? <span className="text-gray-500"> • Sub: {r.substitute}</span> : null}
              </div>

              <div className="text-xs text-gray-500 mt-2">
                {(r.frequencies ?? []).map(freqSummary).join(" | ") || "No frequency"}
              </div>
            </Link>
          );
        })}

        {!loading && filtered.length === 0 && <div className="text-gray-600">No matching events in that range.</div>}
      </section>
    </main>
  );
}
