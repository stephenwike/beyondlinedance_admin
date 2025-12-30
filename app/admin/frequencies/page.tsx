"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";

type EventType = {
  _id: string;
  title: string;
  defaultStartTime: string;
  defaultDurationMinutes: number;
  isActive: boolean;
};

type Frequency = {
  _id: string;
  eventTypeId: string;
  kind: "WEEKLY" | "MONTHLY_NTH_WEEKDAY";
  byDay?: Array<"SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA">;
  weekday?: "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
  nth?: number;
  startTime: string;
  durationMinutes: number;
  startDate?: string;
  endDate?: string | null;
  isActive: boolean;
};

const DOW: Array<"SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA"> = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
];

const DOW_LABEL: Record<string, string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};

function nthLabel(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function parseTime12hToMinutes(t: string): number | null {
  // "5:00 PM"
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();

  if (Number.isNaN(hh) || Number.isNaN(mm) || mm < 0 || mm > 59) return null;
  if (hh < 1 || hh > 12) return null;

  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;

  return hh * 60 + mm;
}

function minutesToTime12h(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh24 = Math.floor(m / 60);
  const mm = m % 60;

  const ap = hh24 >= 12 ? "PM" : "AM";
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;

  return `${hh12}:${String(mm).padStart(2, "0")} ${ap}`;
}

function computeDurationMinutes(startTime: string, endTime: string): number | null {
  const s = parseTime12hToMinutes(startTime);
  const e = parseTime12hToMinutes(endTime);
  if (s === null || e === null) return null;

  // Same-day assumption for now
  const diff = e - s;
  if (diff <= 0) return null;
  return diff;
}

function endTimeFromStartAndDuration(startTime: string, durationMinutes: number): string {
  const s = parseTime12hToMinutes(startTime);
  if (s === null) return startTime;
  return minutesToTime12h(s + durationMinutes);
}

export default function FrequenciesAdminPage() {
  const searchParams = useSearchParams();
  const scopedEventTypeId = searchParams.get("eventTypeId");

  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [freqs, setFreqs] = useState<Frequency[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    eventTypeId: "",
    kind: "WEEKLY" as Frequency["kind"],

    // weekly
    byDay: ["MO"] as Frequency["byDay"],

    // monthly
    nth: 1,
    weekday: "FR" as Frequency["weekday"],

    // time
    startTime: "5:00 PM",
    endTime: "8:00 PM",

    // date window
    startDate: "",
    endDate: "",

    isActive: true,
  });

  const eventTypeById = useMemo(() => {
    const m = new Map<string, EventType>();
    eventTypes.forEach((et) => m.set(et._id, et));
    return m;
  }, [eventTypes]);

  function applyDefaultsFromEventType(eventTypeId: string, ets?: EventType[]) {
    const et = (ets ?? eventTypes).find((x) => x._id === eventTypeId);
    if (!et) {
      setForm((p) => ({ ...p, eventTypeId }));
      return;
    }
    setForm((p) => ({
      ...p,
      eventTypeId,
      startTime: et.defaultStartTime || p.startTime,
      endTime: endTimeFromStartAndDuration(
        et.defaultStartTime || p.startTime,
        et.defaultDurationMinutes || 180
      ),
    }));
  }

  async function load() {
    setErr(null);
    try {
      const [ets, fs] = await Promise.all([
        apiGet<EventType[]>("/api/event-types"),
        apiGet<Frequency[]>("/api/frequencies"),
      ]);

      setEventTypes(ets);
      setFreqs(fs);

      // initialize selection
      const preferred =
        scopedEventTypeId && ets.some((x) => x._id === scopedEventTypeId)
          ? scopedEventTypeId
          : form.eventTypeId || ets[0]?._id || "";

      if (preferred) {
        applyDefaultsFromEventType(preferred, ets);
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedEventTypeId]);

  function toggleDay(day: Frequency["weekday"]) {
    setForm((prev) => {
      const set = new Set(prev.byDay ?? []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      const next = Array.from(set) as any[];
      next.sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b));
      return { ...prev, byDay: next as any };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!form.eventTypeId) {
      setErr("Choose an event.");
      return;
    }

    const durationMinutes = computeDurationMinutes(form.startTime, form.endTime);
    if (durationMinutes === null) {
      setErr("End time must be after start time (same day). Use a later end time.");
      return;
    }

    if (form.kind === "WEEKLY" && (!form.byDay || form.byDay.length === 0)) {
      setErr("Pick at least one day of week.");
      return;
    }

    if (form.kind === "MONTHLY_NTH_WEEKDAY") {
      if (!form.weekday) {
        setErr("Choose a weekday for monthly schedule.");
        return;
      }
      if (!form.nth || form.nth < 1 || form.nth > 5) {
        setErr("Choose which (nth) weekday: 1–5.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        eventTypeId: form.eventTypeId,
        kind: form.kind,
        startTime: form.startTime.trim(),
        durationMinutes,
        isActive: !!form.isActive,
      };

      if (form.kind === "WEEKLY") {
        payload.byDay = form.byDay ?? [];
      } else {
        payload.nth = Number(form.nth);
        payload.weekday = form.weekday;
      }

      if (form.startDate.trim()) payload.startDate = form.startDate.trim();
      if (form.endDate.trim()) payload.endDate = form.endDate.trim();

      await apiPost("/api/frequencies", payload);

      // reset just the schedule window bits; keep eventType selection
      setForm((p) => ({
        ...p,
        byDay: ["MO"],
        nth: 1,
        weekday: "FR",
        startDate: "",
        endDate: "",
        isActive: true,
      }));

      await load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const visibleFreqs = useMemo(() => {
    const base = scopedEventTypeId
      ? freqs.filter((f) => String(f.eventTypeId) === scopedEventTypeId)
      : freqs;

    return base.slice().sort((a, b) => {
      // stable sort for display
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.eventTypeId !== b.eventTypeId) return String(a.eventTypeId).localeCompare(String(b.eventTypeId));
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [freqs, scopedEventTypeId]);

  function summary(f: Frequency) {
    const endTime = endTimeFromStartAndDuration(f.startTime, f.durationMinutes);
    const time = `${f.startTime} – ${endTime}`;
    const window =
      f.startDate || f.endDate ? ` (${f.startDate ?? "any"} → ${f.endDate ?? "open"})` : "";

    if (f.kind === "WEEKLY") {
      const days = (f.byDay ?? []).map((d) => DOW_LABEL[d]).join(", ");
      return `Weekly: ${days || "(no days)"} • ${time}${window}`;
    }

    return `Monthly: ${nthLabel(f.nth ?? 1)} ${DOW_LABEL[f.weekday ?? "FR"]} • ${time}${window}`;
  }

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Frequencies</h1>
        <p className="text-gray-600">
          Define when an event happens. (This page creates frequency docs.)
        </p>
        {scopedEventTypeId && (
          <p className="text-xs text-gray-500">
            Scoped to eventTypeId: {scopedEventTypeId} •{" "}
            <a className="text-blue-600 underline" href="/admin/frequencies">
              show all
            </a>
          </p>
        )}
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Add frequency</h2>

        {eventTypes.length === 0 ? (
          <p className="text-gray-700 mt-3">
            Create an event first in{" "}
            <a className="text-blue-600 underline" href="/admin/event-types">
              Events
            </a>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="mt-3 grid gap-3 max-w-3xl">
            <div className="grid grid-cols-2 gap-3">
              <select
                className="border rounded px-3 py-2"
                value={form.eventTypeId}
                onChange={(e) => applyDefaultsFromEventType(e.target.value)}
              >
                {eventTypes.map((et) => (
                  <option key={et._id} value={et._id}>
                    {et.title}
                    {!et.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>

              <select
                className="border rounded px-3 py-2"
                value={form.kind}
                onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as any }))}
              >
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY_NTH_WEEKDAY">Monthly (Nth weekday)</option>
              </select>
            </div>

            {/* Weekly / Monthly controls */}
            {form.kind === "WEEKLY" ? (
              <div className="rounded border p-3">
                <div className="text-sm font-medium">Days of week</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {DOW.map((d) => {
                    const checked = (form.byDay ?? []).includes(d as any);
                    return (
                      <label
                        key={d}
                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer select-none ${
                          checked ? "border-black bg-gray-100" : "border-gray-300"
                        }`}
                        title={checked ? "Selected" : "Not selected"}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={() => toggleDay(d as any)}
                        />
                        <span className={checked ? "font-semibold" : ""}>{DOW_LABEL[d]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded border p-3">
                <div className="text-sm font-medium">Monthly pattern</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Which (nth)</div>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={form.nth}
                      onChange={(e) => setForm((p) => ({ ...p, nth: Number(e.target.value) }))}
                    >
                      <option value={1}>1st</option>
                      <option value={2}>2nd</option>
                      <option value={3}>3rd</option>
                      <option value={4}>4th</option>
                      <option value={5}>5th</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Weekday</div>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={form.weekday}
                      onChange={(e) => setForm((p) => ({ ...p, weekday: e.target.value as any }))}
                    >
                      {DOW.map((d) => (
                        <option key={d} value={d}>
                          {DOW_LABEL[d]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Example: “1st Friday” = First Fridays.
                </p>
              </div>
            )}

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-2"
                placeholder="Start time (e.g., 5:00 PM)"
                value={form.startTime}
                onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="End time (e.g., 8:00 PM)"
                value={form.endTime}
                onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>

            {/* Date window */}
            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-2"
                placeholder="Start date (YYYY-MM-DD) optional"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="End date (YYYY-MM-DD) optional"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2 border rounded px-3 py-2 w-fit">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Active
            </label>

            <button
              className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving..." : "Create"}
            </button>

            {err && <p className="text-red-600 whitespace-pre-wrap">{err}</p>}
          </form>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Existing frequencies</h2>

        <ul className="mt-3 space-y-2">
          {visibleFreqs.map((f) => {
            const et = eventTypeById.get(String(f.eventTypeId));
            return (
              <li key={f._id} className="border rounded p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium">
                    {et ? et.title : String(f.eventTypeId)}{" "}
                    {!f.isActive && <span className="text-xs text-gray-500">(inactive)</span>}
                  </div>
                  <div className="text-sm text-gray-600">{f.startTime}</div>
                </div>
                <div className="text-sm text-gray-700 mt-1">• {summary(f)}</div>
                <div className="text-xs text-gray-500 mt-1">id: {f._id}</div>
              </li>
            );
          })}

          {visibleFreqs.length === 0 && <li className="text-gray-600">No frequencies yet.</li>}
        </ul>
      </section>
    </main>
  );
}
