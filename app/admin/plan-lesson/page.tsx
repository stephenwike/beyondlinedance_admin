// app/admin/plan-lesson/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function parseTime12ToMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();

  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;

  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;

  return hh * 60 + mm;
}

function minutesToTime12(total: number): string {
  const mins = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const ap = hh24 >= 12 ? "PM" : "AM";
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;
  return `${hh12}:${String(mm).padStart(2, "0")} ${ap}`;
}

function computeDurationMinutes(startTime: string, endTime: string): number | null {
  const start = parseTime12ToMinutes(startTime);
  const end = parseTime12ToMinutes(endTime);
  if (start === null || end === null) return null;

  // assume events don't cross midnight
  const dur = end - start;
  if (dur <= 0) return null;

  return dur;
}

function asString(v: string | null) {
  return (v ?? "").trim();
}

function normalizeNullable(s: string) {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type DanceHit = {
  _id: string;
  danceName: string;
  stepsheet: string | null;
  difficulty: string | null;
};

type LessonDraft = {
  id: string;
  time: string; // NEW: lesson start time (label: "Time")
  danceId: string | null; // selected dance doc id (locks search)
  dance: string;
  level: string;
  link: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function DanceSearchInput(props: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onPick: (d: DanceHit) => void;
  placeholder?: string;
}) {
  const { value, disabled, onChange, onPick, placeholder } = props;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<DanceHit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const latestQueryRef = useRef<string>("");

  useEffect(() => {
    if (disabled) {
      setHits([]);
      setOpen(false);
      setErr(null);
      setLoading(false);
      return;
    }

    const q = value.trim();
    latestQueryRef.current = q;

    if (q.length < 2) {
      setHits([]);
      setOpen(false);
      setErr(null);
      return;
    }

    const handle = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchJson(`/api/dances?q=${encodeURIComponent(q)}`);
        if (latestQueryRef.current !== q) return;
        setHits(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch (e: any) {
        if (latestQueryRef.current !== q) return;
        setErr(e?.message ?? String(e));
        setHits([]);
        setOpen(true);
      } finally {
        if (latestQueryRef.current === q) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [value, disabled]);

  return (
    <div className="relative">
      <input
        className={`border rounded px-3 py-2 w-full ${disabled ? "bg-gray-50 text-gray-700" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search dance…"}
        disabled={disabled}
        onFocus={() => {
          if (disabled) return;
          if (hits.length > 0 || err) setOpen(true);
        }}
        onBlur={() => {
          if (disabled) return;
          setTimeout(() => setOpen(false), 150);
        }}
      />

      {!disabled && (open || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow-sm max-h-56 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-600">Searching…</div>
          ) : err ? (
            <div className="px-3 py-2 text-sm text-red-600 whitespace-pre-wrap">{err}</div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-600">No results</div>
          ) : (
            hits.map((h) => (
              <button
                key={h._id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                onMouseDown={(e) => e.preventDefault()} // keep focus
                onClick={() => {
                  onPick(h);
                  setOpen(false);
                }}
              >
                <div className="text-sm font-medium">{h.danceName}</div>
                <div className="text-xs text-gray-600">
                  {h.difficulty ? <span>{h.difficulty}</span> : <span className="text-gray-400">No level</span>}
                  {h.stepsheet ? <span> • has stepsheet</span> : <span className="text-gray-400"> • no stepsheet</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanLessonsPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const eventTypeId = asString(sp.get("eventTypeId"));
  const date = asString(sp.get("date"));

  // overrides (rarely changed)
  const [startTime, setStartTime] = useState(asString(sp.get("startTime")));
  const [endTime, setEndTime] = useState(() => {
    const fromQuery = asString(sp.get("endTime"));
    if (fromQuery) return fromQuery;

    const dur = Number(asString(sp.get("durationMinutes")));
    const start = parseTime12ToMinutes(asString(sp.get("startTime")));
    if (Number.isFinite(dur) && dur > 0 && start !== null) {
      return minutesToTime12(start + dur);
    }
    return "";
  });

  // edge cases: cancellation + substitute
  const [isCancelled, setIsCancelled] = useState(false);
  const [cancellationNote, setCancellationNote] = useState("");
  const [hasSubstitute, setHasSubstitute] = useState(false);
  const [substituteName, setSubstituteName] = useState("");

  const [lessons, setLessons] = useState<LessonDraft[]>([
    { id: uid(), time: "", danceId: null, dance: "", level: "", link: "" },
  ]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // read-only meta
  const [eventType, setEventType] = useState<any | null>(null);
  const [venue, setVenue] = useState<any | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      if (!eventTypeId) return;

      setLoadingMeta(true);
      setErr(null);

      try {
        const et = await fetchJson(`/api/event-types/${encodeURIComponent(eventTypeId)}`);
        if (cancelled) return;
        setEventType(et);

        const venueId = et?.venueId;
        if (venueId) {
          try {
            const v = await fetchJson(`/api/venues/${encodeURIComponent(String(venueId))}`);
            if (!cancelled) setVenue(v);
          } catch {
            if (!cancelled) setVenue(null);
          }
        } else {
          setVenue(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setEventType(null);
          setVenue(null);
          setErr(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [eventTypeId]);

  // Keep the UI consistent: cancelling clears substitute (and lessons aren't required)
  useEffect(() => {
    if (isCancelled) {
      setHasSubstitute(false);
      setSubstituteName("");
    }
  }, [isCancelled]);

  useEffect(() => {
    if (!hasSubstitute) {
      setSubstituteName("");
    }
  }, [hasSubstitute]);

  const validation = useMemo(() => {
    if (!eventTypeId) return "Missing eventTypeId";
    if (!isYmd(date)) return "Missing/invalid date (expected YYYY-MM-DD)";
    if (parseTime12ToMinutes(startTime) === null) return "Start time must look like '6:30 PM'";
    if (parseTime12ToMinutes(endTime) === null) return "End time must look like '8:00 PM'";
    if (computeDurationMinutes(startTime, endTime) === null) return "End time must be after start time";

    if (isCancelled) {
      // optional note allowed; no lessons required
      return null;
    }

    if (hasSubstitute && !normalizeNullable(substituteName)) {
      return "Substitute name is required when 'Substitute' is checked";
    }

    // NEW: validate lesson time only if provided
    for (const l of lessons) {
      const t = normalizeNullable(l.time);
      if (t && parseTime12ToMinutes(t) === null) {
        return "Lesson time must look like '6:45 PM'";
      }
    }

    if (!Array.isArray(lessons) || lessons.length === 0) return "Add at least one lesson row";
    return null;
  }, [eventTypeId, date, startTime, endTime, lessons, isCancelled, cancellationNote, hasSubstitute, substituteName]);

  function updateLesson(id: string, patch: Partial<LessonDraft>) {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLesson() {
    setLessons((prev) => [...prev, { id: uid(), time: "", danceId: null, dance: "", level: "", link: "" }]);
  }

  function removeLesson(id: string) {
    setLessons((prev) => prev.filter((l) => l.id !== id));
  }

  async function createAndGo() {
    setErr(null);
    if (validation) {
      setErr(validation);
      return;
    }

    const durationMinutes = computeDurationMinutes(startTime, endTime);
    if (durationMinutes === null) {
      setErr("End time must be after start time");
      return;
    }

    const lessonsPayload = isCancelled
      ? [] // cancelled: no lessons needed (still fine to persist empty)
      : lessons.map((l) => ({
          time: normalizeNullable(l.time), // NEW
          dance: normalizeNullable(l.dance),
          level: normalizeNullable(l.level),
          link: normalizeNullable(l.link),
        }));

    const payload: any = {
      eventTypeId,
      date: date.trim(),
      startTime: startTime.trim(),
      durationMinutes,
      lessons: lessonsPayload,
      cancelled: !!isCancelled,
      cancellationNote: normalizeNullable(cancellationNote),
      substitute: hasSubstitute ? normalizeNullable(substituteName) : null,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (!data?.eventId) throw new Error("No eventId returned.");

      router.push(`/admin/events/${data.eventId}`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Plan lessons</h1>
        <p className="text-gray-600">
          EventType details are read-only. Start/end are occurrence overrides (rarely changed). Use the toggles below
          for cancellations or substitutes.
        </p>
      </header>

      <section className="rounded-lg border p-4 space-y-5 max-w-3xl">
        <div className="space-y-1">
          <div className="text-sm text-gray-600">Event</div>

          {loadingMeta ? (
            <div className="text-sm text-gray-500">Loading event details…</div>
          ) : (
            <>
              <div className="font-medium">
                {eventType?.title ?? "(unknown event type)"}
                {eventType?.level ? <span className="text-gray-500"> • {eventType.level}</span> : null}
              </div>

              <div className="text-sm text-gray-700">
                {venue?.name ?? eventType?.venueKey?.split("|")?.[0] ?? "Unknown venue"}
              </div>

              <div className="text-xs text-gray-500">{eventType?.price ? <span>Price: {eventType.price}</span> : null}</div>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 items-end">
          <div className="text-sm">
            <div className="text-gray-600 mb-1">Date</div>
            <div className="border rounded px-3 py-2 bg-gray-50 text-gray-800">{date || "—"}</div>
          </div>

          <label className="text-sm">
            <div className="text-gray-600 mb-1">Start time (override)</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="6:30 PM"
            />
          </label>

          <label className="text-sm">
            <div className="text-gray-600 mb-1">End time (override)</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="8:00 PM"
            />
          </label>
        </div>

        {/* Edge cases */}
        <div className="rounded border p-3 bg-gray-50 space-y-3">
          <div className="font-medium">Edge cases</div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCancelled} onChange={(e) => setIsCancelled(e.target.checked)} />
            Cancel this class
          </label>

          {isCancelled && (
            <label className="text-sm block">
              <div className="text-gray-600 mb-1">Cancellation note</div>
              <textarea
                className="border rounded px-3 py-2 w-full min-h-[80px]"
                value={cancellationNote}
                onChange={(e) => setCancellationNote(e.target.value)}
                placeholder="Optional: why it was cancelled, special instructions, etc."
              />
            </label>
          )}

          <label className={`flex items-center gap-2 text-sm ${isCancelled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={hasSubstitute}
              onChange={(e) => setHasSubstitute(e.target.checked)}
              disabled={isCancelled}
            />
            Substitute instructor
          </label>

          {hasSubstitute && !isCancelled && (
            <label className="text-sm block">
              <div className="text-gray-600 mb-1">Substitute name</div>
              <input
                className="border rounded px-3 py-2 w-full"
                value={substituteName}
                onChange={(e) => setSubstituteName(e.target.value)}
                placeholder="e.g. Jenna Smith"
              />
            </label>
          )}

          <div className="text-xs text-gray-600">If cancelled, lessons are optional and substitute is disabled.</div>
        </div>

        {/* Lessons */}
        <div className={`space-y-3 ${isCancelled ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Lessons</div>
              <div className="text-xs text-gray-500">Search LDCO dances or type manually. Leave blank to keep null.</div>
            </div>

            <button
              type="button"
              className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={addLesson}
              disabled={isCancelled}
            >
              + Add lesson
            </button>
          </div>

          <div className="space-y-3">
            {lessons.map((l, idx) => (
              <div key={l.id} className="rounded border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Lesson {idx + 1}</div>
                  <button
                    type="button"
                    className="text-sm text-gray-600 underline disabled:opacity-50"
                    onClick={() => removeLesson(l.id)}
                    disabled={lessons.length === 1 || isCancelled}
                    title={lessons.length === 1 ? "Keep at least one row" : "Remove lesson"}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {/* NEW: Time */}
                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Time</div>
                    <input
                      className="border rounded px-3 py-2 w-full disabled:bg-gray-50"
                      value={l.time}
                      disabled={isCancelled}
                      onChange={(e) => updateLesson(l.id, { time: e.target.value })}
                      placeholder="6:45 PM"
                    />
                  </label>

                  <div className="text-sm">
                    <div className="text-gray-600 mb-1 flex items-center justify-between">
                      <span>Dance</span>

                      {l.danceId ? (
                        <button
                          type="button"
                          className="text-xs text-gray-600 underline disabled:opacity-50"
                          disabled={isCancelled}
                          onClick={() =>
                            updateLesson(l.id, {
                              danceId: null,
                              dance: "",
                              level: "",
                              link: "",
                            })
                          }
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <DanceSearchInput
                      value={l.dance}
                      disabled={!!l.danceId || isCancelled}
                      onChange={(v) => updateLesson(l.id, { dance: v })}
                      onPick={(d) => {
                        updateLesson(l.id, {
                          danceId: d._id,
                          dance: d.danceName ?? "",
                          level: d.difficulty ?? l.level,
                          link: d.stepsheet ?? l.link,
                        });
                      }}
                      placeholder="Start typing…"
                    />
                  </div>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Level</div>
                    <input
                      className="border rounded px-3 py-2 w-full disabled:bg-gray-50"
                      value={l.level}
                      disabled={isCancelled}
                      onChange={(e) => updateLesson(l.id, { level: e.target.value })}
                      placeholder="e.g. Absolute Beginner"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Link</div>
                    <input
                      className="border rounded px-3 py-2 w-full disabled:bg-gray-50"
                      value={l.link}
                      disabled={isCancelled}
                      onChange={(e) => updateLesson(l.id, { link: e.target.value })}
                      placeholder="Stepsheet URL…"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {isCancelled && <div className="text-xs text-gray-500">Lessons are disabled because this occurrence is cancelled.</div>}
        </div>

        {err && <div className="text-red-600 whitespace-pre-wrap">{err}</div>}

        <div className="flex items-center gap-2">
          <button
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            disabled={!!validation || saving}
            onClick={createAndGo}
            type="button"
          >
            {saving ? "Creating…" : isCancelled ? "Create cancellation" : "Create & plan"}
          </button>

          <button className="border rounded px-4 py-2" onClick={() => router.back()} type="button">
            Back
          </button>
        </div>

        {validation && (
          <div className="text-xs text-gray-500">
            Fix: <span className="font-medium">{validation}</span>
          </div>
        )}
      </section>
    </main>
  );
}
