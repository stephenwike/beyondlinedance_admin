"use client";

import { useEffect, useRef, useState } from "react";

export type DanceHit = {
  _id: string;
  danceName: string;
  stepsheet: string | null;
  difficulty: string | null;
};

export type LessonSlot = {
  time: string | null;
  danceId?: string | null;
  dance: string | null;
  level: string | null;
  link: string | null;
  committed?: boolean;
};

function clean(s: any) {
  if (s === null || s === undefined) return "";
  return String(s);
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

function suggestedNextLessonTime(lessons: LessonSlot[], fallback: string): string {
  const last = lessons.length ? lessons[lessons.length - 1] : null;
  const base = last?.time ? parseTime12ToMinutes(last.time) : null;
  const fb = parseTime12ToMinutes(fallback);
  const start = base ?? fb ?? null;
  if (start === null) return fallback;
  return minutesToTime12(start + 30);
}

function suggestedNextLessonTimeAfterIndex(lessons: LessonSlot[], index: number, fallback: string): string {
  const baseTime = lessons[index]?.time ? parseTime12ToMinutes(lessons[index]!.time as string) : null;
  const fb = parseTime12ToMinutes(fallback);
  const start = baseTime ?? fb ?? null;
  if (start === null) return fallback;
  return minutesToTime12(start + 30);
}

export default function LessonsEditor(props: {
  lessons: LessonSlot[];
  eventStartTime: string;
  disabled?: boolean;
  onChange: (nextLessons: LessonSlot[]) => void;

  showHeader?: boolean;

  // Optional: open picker on initial row
  initialOpenDancePickerRow?: number | null;

  // NEW: If provided, "Add lesson" inserts after this index (and bumps it)
  insertAfterIndex?: number | null;
  onInsertAfterIndexChange?: (next: number | null) => void;
}) {
  const { lessons, eventStartTime, disabled, onChange } = props;

  // Dance search (shared popup)
  const [danceQ, setDanceQ] = useState("");
  const [danceHits, setDanceHits] = useState<DanceHit[]>([]);
  const [danceLoading, setDanceLoading] = useState(false);
  const [activeDanceRow, setActiveDanceRow] = useState<number | null>(props.initialOpenDancePickerRow ?? null);
  const searchAbort = useRef<AbortController | null>(null);

  // Debounced dance search
  useEffect(() => {
    if (activeDanceRow === null) return;

    const q = danceQ.trim();
    if (q.length < 2) {
      setDanceHits([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        setDanceLoading(true);
        searchAbort.current?.abort();
        const ac = new AbortController();
        searchAbort.current = ac;

        const res = await fetch(`/api/dances?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        if (!res.ok) throw new Error(await res.text());
        const hits = (await res.json()) as DanceHit[];
        setDanceHits(hits);
      } catch {
        // ignore aborts
      } finally {
        setDanceLoading(false);
      }
    }, 200);

    return () => clearTimeout(t);
  }, [danceQ, activeDanceRow]);

  function updateLesson(i: number, patch: Partial<LessonSlot>) {
    const next = [...(lessons ?? [])];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function insertLessonAfter(i: number) {
    const next = [...(lessons ?? [])];
    const nextTime = suggestedNextLessonTimeAfterIndex(next, i, eventStartTime);
    next.splice(i + 1, 0, { time: nextTime, dance: null, level: null, link: null });
    onChange(next);

    // bump anchor so repeated "Add lesson" keeps inserting after the latest inserted
    props.onInsertAfterIndexChange?.(i + 1);
  }

  function addLesson() {
    const anchor = props.insertAfterIndex;
    if (typeof anchor === "number" && anchor >= 0 && anchor < lessons.length) {
      insertLessonAfter(anchor);
      return;
    }

    // default: append to end
    const next = [...(lessons ?? [])];
    const nextTime = suggestedNextLessonTime(next, eventStartTime);
    next.push({ time: nextTime, dance: null, level: null, link: null });
    onChange(next);
  }

  function addThreeLessons() {
    addLesson();
    setTimeout(addLesson, 0);
    setTimeout(addLesson, 0);
  }

  function removeLesson(i: number) {
    const next = [...(lessons ?? [])];
    next.splice(i, 1);
    onChange(next);

    // if removing before/at anchor, adjust anchor to stay stable
    const anchor = props.insertAfterIndex;
    if (typeof anchor === "number") {
      if (i < anchor) props.onInsertAfterIndexChange?.(anchor - 1);
      if (i === anchor) props.onInsertAfterIndexChange?.(Math.max(0, anchor - 1));
    }
  }

  function clearDance(i: number) {
    updateLesson(i, { danceId: null, dance: null, link: null });
  }

  function openDancePicker(rowIndex: number, currentDance: string | null) {
    setActiveDanceRow(rowIndex);
    setDanceQ(currentDance ?? "");
    setDanceHits([]);
  }

  function chooseDance(hit: DanceHit) {
    if (activeDanceRow === null) return;

    updateLesson(activeDanceRow, {
      danceId: hit._id,
      dance: hit.danceName,
      link: hit.stepsheet,
    });

    setActiveDanceRow(null);
    setDanceQ("");
    setDanceHits([]);
  }

  const showHeader = props.showHeader !== false;

  return (
    <section className="rounded-lg border p-4 space-y-3">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Lessons</h2>

          <div className="flex items-center gap-2">
            <button className="border rounded px-4 py-2 text-sm" onClick={addLesson} type="button" disabled={disabled}>
              Add lesson
            </button>
            <button className="border rounded px-4 py-2 text-sm" onClick={addThreeLessons} type="button" disabled={disabled}>
              Add 3 lessons
            </button>
          </div>
        </div>
      )}

      {lessons.length === 0 ? (
        <div className="text-gray-600">No lessons yet. Click “Add lesson”.</div>
      ) : (
        <ul className="space-y-2">
          {lessons.map((l, i) => {
            const missingDance = !(l.dance ?? "").trim();

            return (
              <li key={i} className="border rounded p-3 space-y-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-700">
                    Lesson {i + 1}
                    {missingDance && <span className="text-yellow-800"> • needs dance</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="border rounded px-3 py-1 text-sm"
                      onClick={() => openDancePicker(i, l.dance)}
                      type="button"
                      disabled={disabled}
                    >
                      Pick dance
                    </button>
                    <button
                      className="border rounded px-3 py-1 text-sm"
                      onClick={() => clearDance(i)}
                      type="button"
                      disabled={disabled}
                    >
                      Clear
                    </button>
                    <button
                      className="border rounded px-3 py-1 text-sm"
                      onClick={() => removeLesson(i)}
                      type="button"
                      disabled={disabled}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Time</div>
                    <input
                      className="border rounded px-3 py-2 w-full"
                      value={clean(l.time)}
                      onChange={(e) => updateLesson(i, { time: e.target.value })}
                      placeholder="e.g. 7:00 PM"
                      disabled={disabled}
                    />
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Level</div>
                    <input
                      className="border rounded px-3 py-2 w-full"
                      value={clean(l.level)}
                      onChange={(e) => updateLesson(i, { level: e.target.value })}
                      placeholder="e.g. Improver"
                      disabled={disabled}
                    />
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Dance</div>
                    <input
                      className="border rounded px-3 py-2 w-full"
                      value={clean(l.dance)}
                      onChange={(e) => {
                        // manual entry should clear danceId (normal case)
                        updateLesson(i, { dance: e.target.value, danceId: null });
                      }}
                      placeholder="Type or use Pick dance…"
                      disabled={disabled}
                    />
                  </label>
                </div>

                <label className="text-sm">
                  <div className="text-gray-600 mb-1">Link (optional)</div>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={clean(l.link)}
                    onChange={(e) => updateLesson(i, { link: e.target.value })}
                    placeholder="Stepsheet URL"
                    disabled={disabled}
                  />
                </label>

                {l.link && (
                  <div className="text-sm">
                    <a className="text-blue-600 underline" href={l.link} target="_blank" rel="noreferrer">
                      Open stepsheet
                    </a>
                  </div>
                )}

                {/* Dance picker popup */}
                {activeDanceRow === i && (
                  <div className="border rounded p-2 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <input
                        className="border rounded px-3 py-2 flex-1 bg-white"
                        value={danceQ}
                        onChange={(e) => setDanceQ(e.target.value)}
                        placeholder="Search dances (type 2+ letters)…"
                        autoFocus
                        disabled={disabled}
                      />
                      <button
                        className="border rounded px-3 py-2 text-sm bg-white"
                        onClick={() => {
                          setActiveDanceRow(null);
                          setDanceQ("");
                          setDanceHits([]);
                        }}
                        type="button"
                        disabled={disabled}
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      {danceLoading ? "Searching…" : "Click a result to fill dance + stepsheet."}
                    </div>

                    <ul className="mt-2 space-y-1">
                      {danceHits.map((hit) => (
                        <li key={hit._id}>
                          <button
                            className="w-full text-left border rounded px-3 py-2 bg-white hover:bg-gray-100 disabled:opacity-50"
                            onClick={() => chooseDance(hit)}
                            type="button"
                            disabled={disabled}
                          >
                            <div className="font-medium">{hit.danceName}</div>
                            <div className="text-xs text-gray-600">
                              {hit.difficulty ?? "—"}
                              {hit.stepsheet ? " • has stepsheet" : ""}
                            </div>
                          </button>
                        </li>
                      ))}

                      {!danceLoading && danceQ.trim().length >= 2 && danceHits.length === 0 && (
                        <li className="text-sm text-gray-600 px-2 py-2">No matches.</li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
