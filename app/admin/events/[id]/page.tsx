// app/admin/events/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LessonsEditor, { LessonSlot } from "@/components/lessonsEditor";

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

function computeEndTimeFromStartAndDuration(startTime: string, durationMinutes: number): string | null {
    const start = parseTime12ToMinutes(startTime);
    if (start === null) return null;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
    return minutesToTime12(start + durationMinutes);
}

function isPlanned(ev: EventRow) {
    if (ev.isCancelled) return true;
    if (!ev.lessons || ev.lessons.length === 0) return false;
    return ev.lessons.every((l) => (l.dance ?? "").trim().length > 0);
}

/**
 * Normalize API response into the exact shape this page expects.
 * Canonical fields: isCancelled + cancelNote (no cancelled/cancellationNote tolerance here).
 */
function normalizeEventFromApi(raw: any): EventRow {
    const startTime = clean(raw?.startTime);

    const durationMinutes = Number(raw?.durationMinutes);
    const endTimeFromDuration =
        Number.isFinite(durationMinutes) && durationMinutes > 0
            ? computeEndTimeFromStartAndDuration(startTime, durationMinutes) ?? ""
            : "";

    const endTime = clean(raw?.endTime) || endTimeFromDuration;

    const isCancelled = typeof raw?.isCancelled === "boolean" ? raw.isCancelled : false;
    const cancelNote = raw?.cancelNote !== undefined ? (raw.cancelNote ?? null) : null;

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
            danceId: l?.danceId ?? null,
            dance: l?.dance ?? null,
            level: l?.level ?? null,
            link: l?.link ?? null,
            committed: !!l?.committed,
        })),
        eventType: raw?.eventType,
        venue: raw?.venue,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : undefined,
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

    const planned = useMemo(() => (draft ? isPlanned(draft) : false), [draft]);

    function updateField<K extends keyof EventRow>(key: K, value: EventRow[K]) {
        setDraft((p) => (p ? { ...p, [key]: value } : p));
    }

    async function save() {
        if (!draft) return;

        setSaving(true);
        setErr(null);
        try {
            const payload = {
                startTime: draft.startTime,
                endTime: draft.endTime,
                isCancelled: draft.isCancelled,
                cancelNote: draft.cancelNote,
                substitute: draft.substitute,
                lessons: draft.lessons,
            };

            const res = await fetch(`/api/events/${draft._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(await res.text());

            router.push("/admin");
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setSaving(false);
        }
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

            {/* Event controls */}
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

            {/* LESSONS (reused component) */}
            <LessonsEditor
                lessons={draft.lessons}
                eventStartTime={draft.startTime}
                disabled={saving}
                onChange={(nextLessons) => setDraft((p) => (p ? { ...p, lessons: nextLessons } : p))}
            />

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
