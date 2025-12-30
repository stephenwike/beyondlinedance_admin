// app/admin/events/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type DanceHit = {
    _id: string;
    danceName: string;
    stepsheet: string | null;
    difficulty: string | null;
};

type LessonSlot = {
    time: string | null;
    dance: string | null;
    level: string | null;
    link: string | null;
};

type EventRow = {
    _id: string;
    eventTypeId: string;
    date: string;
    startTime: string;
    endTime: string;
    isCancelled: boolean;
    cancelNote: string | null;
    substitute: string | null;
    lessons: LessonSlot[];

    eventType?: {
        _id: string;
        title: string;
        level: string;
        price: string;
    };

    venue?: {
        _id: string;
        name: string;
        address: string;
        city: string;
        state: string;
    };

    // Optional newer-schema fields the API might return
    durationMinutes?: number;
    cancelled?: boolean;
    cancellationNote?: string | null;
};

function clean(s: any) {
    if (s === null || s === undefined) return "";
    return String(s);
}

function parseTime12ToMinutes(t: string): number | null {
    // "5:30 PM"
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

function computeEndTimeFromStartAndDuration(startTime: string, durationMinutes: number): string | null {
    const start = parseTime12ToMinutes(startTime);
    if (start === null) return null;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
    return minutesToTime12(start + durationMinutes);
}

function suggestedNextLessonTime(lessons: LessonSlot[], fallback: string): string {
    // If last lesson has a parseable time, add 30 mins; else fallback to event startTime
    const last = lessons.length ? lessons[lessons.length - 1] : null;
    const base = last?.time ? parseTime12ToMinutes(last.time) : null;
    const fb = parseTime12ToMinutes(fallback);
    const start = base ?? fb ?? null;
    if (start === null) return fallback;
    return minutesToTime12(start + 30);
}

function isPlanned(ev: EventRow) {
    if (ev.isCancelled) return true;
    if (!ev.lessons || ev.lessons.length === 0) return false;
    return ev.lessons.every((l) => (l.dance ?? "").trim().length > 0);
}

/**
 * Normalize API response into the exact shape this page expects.
 * This guards against schema drift (durationMinutes/cancelled/cancellationNote vs endTime/isCancelled/cancelNote).
 */
function normalizeEventFromApi(raw: any): EventRow {
    const startTime = clean(raw?.startTime);

    const durationMinutes = Number(raw?.durationMinutes);
    const endTimeFromDuration =
        Number.isFinite(durationMinutes) && durationMinutes > 0
            ? computeEndTimeFromStartAndDuration(startTime, durationMinutes) ?? ""
            : "";

    const endTime = clean(raw?.endTime) || endTimeFromDuration;

    const isCancelled =
        typeof raw?.isCancelled === "boolean"
            ? raw.isCancelled
            : typeof raw?.cancelled === "boolean"
                ? raw.cancelled
                : false;

    const cancelNote =
        raw?.cancelNote !== undefined
            ? (raw.cancelNote ?? null)
            : raw?.cancellationNote !== undefined
                ? (raw.cancellationNote ?? null)
                : null;

    const lessonsRaw = Array.isArray(raw?.lessons) ? raw.lessons : [];

    return {
        _id: clean(raw?._id),
        eventTypeId: clean(raw?.eventTypeId),
        date: clean(raw?.date),
        startTime,
        endTime,
        isCancelled,
        cancelNote,
        substitute: raw?.substitute ?? null,
        lessons: lessonsRaw.map((l: any) => ({
            time: l?.time ?? null,
            dance: l?.dance ?? null,
            level: l?.level ?? null,
            link: l?.link ?? null,
        })),
        eventType: raw?.eventType,
        venue: raw?.venue,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : undefined,
        cancelled: raw?.cancelled,
        cancellationNote: raw?.cancellationNote ?? null,
    };
}

export default function EventPlannerPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const id = (params as any)?.id as string | undefined;

    const [draft, setDraft] = useState<EventRow | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    // Dance search (shared popup)
    const [danceQ, setDanceQ] = useState("");
    const [danceHits, setDanceHits] = useState<DanceHit[]>([]);
    const [danceLoading, setDanceLoading] = useState(false);
    const [activeDanceRow, setActiveDanceRow] = useState<number | null>(null);
    const searchAbort = useRef<AbortController | null>(null);

    async function load() {
        if (!id) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/events/${id}`);
            if (!res.ok) throw new Error(await res.text());
            const raw = await res.json();
            const ev = normalizeEventFromApi(raw);
            setDraft(ev);
        } catch (e: any) {
            setErr(e.message ?? String(e));
            setDraft(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

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

    const planned = useMemo(() => (draft ? isPlanned(draft) : false), [draft]);

    function updateField<K extends keyof EventRow>(key: K, value: EventRow[K]) {
        setDraft((p) => (p ? { ...p, [key]: value } : p));
    }

    function updateLesson(i: number, patch: Partial<LessonSlot>) {
        setDraft((p) => {
            if (!p) return p;
            const lessons = [...(p.lessons ?? [])];
            lessons[i] = { ...lessons[i], ...patch };
            return { ...p, lessons };
        });
    }

    function addLesson() {
        setDraft((p) => {
            if (!p) return p;
            const lessons = [...(p.lessons ?? [])];
            const nextTime = suggestedNextLessonTime(lessons, p.startTime);
            lessons.push({ time: nextTime, dance: null, level: null, link: null });
            return { ...p, lessons };
        });
    }

    function addThreeLessons() {
        addLesson();
        // queue twice more on next ticks so the "last lesson time" updates properly
        setTimeout(addLesson, 0);
        setTimeout(addLesson, 0);
    }

    function removeLesson(i: number) {
        setDraft((p) => {
            if (!p) return p;
            const lessons = [...(p.lessons ?? [])];
            lessons.splice(i, 1);
            return { ...p, lessons };
        });
    }

    function clearDance(i: number) {
        updateLesson(i, { dance: null, link: null });
    }

    async function save() {
        if (!draft) return;

        setSaving(true);
        setErr(null);
        try {
            const payload = {
                // event instance settings (still editable)
                startTime: draft.startTime,
                endTime: draft.endTime,
                isCancelled: draft.isCancelled,
                cancelNote: draft.cancelNote,
                substitute: draft.substitute,

                // lesson plan
                lessons: draft.lessons,
            };

            const res = await fetch(`/api/events/${draft._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(await res.text());

            // ✅ After saving, go back to admin dashboard
            router.push("/admin");
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setSaving(false);
        }
    }

    function openDancePicker(rowIndex: number, currentDance: string | null) {
        setActiveDanceRow(rowIndex);
        setDanceQ(currentDance ?? "");
        setDanceHits([]);
    }

    function chooseDance(hit: DanceHit) {
        if (activeDanceRow === null) return;

        updateLesson(activeDanceRow, {
            dance: hit.danceName,
            link: hit.stepsheet,
            // optional: auto-fill lesson level from difficulty
            // level: hit.difficulty ?? null,
        });

        setActiveDanceRow(null);
        setDanceQ("");
        setDanceHits([]);
    }

    if (loading) {
        return (
            <main className="p-6">
                <div className="text-gray-600">Loading…</div>
            </main>
        );
    }

    if (err && !draft) {
        return (
            <main className="p-6 space-y-3">
                <div className="text-red-600 whitespace-pre-wrap">{err}</div>
                <button className="border rounded px-4 py-2" onClick={load} type="button">
                    Retry
                </button>
            </main>
        );
    }

    if (!draft) return null;

    const statusText = draft.isCancelled ? "Cancelled" : planned ? "Planned" : "Needs planning";
    const statusClass = draft.isCancelled
        ? "bg-gray-100 border-gray-300 text-gray-700"
        : planned
            ? "bg-green-50 border-green-300 text-green-800"
            : "bg-yellow-50 border-yellow-300 text-yellow-800";

    return (
        <main className="p-6 space-y-6">
            <header className="space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">{draft.eventType?.title ?? "Event"}</h1>
                        <div className="text-gray-600">
                            {draft.date} • {draft.startTime} – {draft.endTime}
                        </div>
                        <div className="text-gray-600">
                            {draft.venue?.name ?? "Venue"}
                            {draft.venue?.address ? ` • ${draft.venue.address}` : ""}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`text-xs border rounded-full px-3 py-1 ${statusClass}`}>{statusText}</span>
                        <button
                            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                            onClick={save}
                            disabled={saving}
                            type="button"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {err && <div className="text-red-600 whitespace-pre-wrap mt-2">{err}</div>}
            </header>

            {/* Keep event controls minimal for now */}
            <section className="rounded-lg border p-4 space-y-3">
                <h2 className="font-medium">Event</h2>

                <div className="grid grid-cols-2 gap-3 max-w-2xl">
                    <label className="text-sm">
                        <div className="text-gray-600 mb-1">Start time</div>
                        <input
                            className="border rounded px-3 py-2 w-full"
                            value={clean(draft.startTime)}
                            onChange={(e) => updateField("startTime", e.target.value)}
                        />
                    </label>

                    <label className="text-sm">
                        <div className="text-gray-600 mb-1">End time</div>
                        <input
                            className="border rounded px-3 py-2 w-full"
                            value={clean(draft.endTime)}
                            onChange={(e) => updateField("endTime", e.target.value)}
                        />
                    </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 border rounded px-3 py-2 text-sm">
                        <input
                            type="checkbox"
                            checked={!!draft.isCancelled}
                            onChange={(e) => updateField("isCancelled", e.target.checked)}
                        />
                        Cancelled
                    </label>

                    <label className="text-sm flex-1 min-w-[240px]">
                        <div className="text-gray-600 mb-1">Substitute (optional)</div>
                        <input
                            className="border rounded px-3 py-2 w-full"
                            value={clean(draft.substitute)}
                            onChange={(e) => updateField("substitute", e.target.value)}
                        />
                    </label>
                </div>
            </section>

            {/* LESSON FOCUS */}
            <section className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-medium">Lessons</h2>

                    <div className="flex items-center gap-2">
                        <button className="border rounded px-4 py-2 text-sm" onClick={addLesson} type="button">
                            Add lesson
                        </button>
                        <button className="border rounded px-4 py-2 text-sm" onClick={addThreeLessons} type="button">
                            Add 3 lessons
                        </button>
                    </div>
                </div>

                {draft.lessons.length === 0 ? (
                    <div className="text-gray-600">No lessons yet. Click “Add lesson”.</div>
                ) : (
                    <ul className="space-y-2">
                        {draft.lessons.map((l, i) => {
                            const missingDance = !(l.dance ?? "").trim();

                            return (
                                <li key={i} className="border rounded p-3 space-y-3 bg-white">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-sm text-gray-700">
                                            Lesson {i + 1}
                                            {!draft.isCancelled && missingDance && (
                                                <span className="text-yellow-800"> • needs dance</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                className="border rounded px-3 py-1 text-sm"
                                                onClick={() => openDancePicker(i, l.dance)}
                                                type="button"
                                            >
                                                Pick dance
                                            </button>
                                            <button
                                                className="border rounded px-3 py-1 text-sm"
                                                onClick={() => clearDance(i)}
                                                type="button"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                className="border rounded px-3 py-1 text-sm"
                                                onClick={() => removeLesson(i)}
                                                type="button"
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
                                            />
                                        </label>

                                        <label className="text-sm">
                                            <div className="text-gray-600 mb-1">Level</div>
                                            <input
                                                className="border rounded px-3 py-2 w-full"
                                                value={clean(l.level)}
                                                onChange={(e) => updateLesson(i, { level: e.target.value })}
                                                placeholder="e.g. Improver"
                                            />
                                        </label>

                                        <label className="text-sm">
                                            <div className="text-gray-600 mb-1">Dance</div>
                                            <input
                                                className="border rounded px-3 py-2 w-full"
                                                value={clean(l.dance)}
                                                onChange={(e) => updateLesson(i, { dance: e.target.value })}
                                                placeholder="Type or use Pick dance…"
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
                                                />
                                                <button
                                                    className="border rounded px-3 py-2 text-sm bg-white"
                                                    onClick={() => {
                                                        setActiveDanceRow(null);
                                                        setDanceQ("");
                                                        setDanceHits([]);
                                                    }}
                                                    type="button"
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
                                                            className="w-full text-left border rounded px-3 py-2 bg-white hover:bg-gray-100"
                                                            onClick={() => chooseDance(hit)}
                                                            type="button"
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

            <footer className="flex items-center gap-3">
                <a className="border rounded px-4 py-2 text-sm" href="/admin/lesson-overview">
                    Back to Lesson Overview
                </a>
                <button
                    className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                    onClick={save}
                    disabled={saving}
                    type="button"
                >
                    {saving ? "Saving…" : "Save"}
                </button>
            </footer>
        </main>
    );
}
