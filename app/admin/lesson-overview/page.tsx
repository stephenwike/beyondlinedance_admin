"use client";

import { useEffect, useMemo, useState } from "react";

type LessonSlot = {
    time: string | null;
    dance: string | null;
    level: string | null;
    link: string | null;
};

type OccurrenceRow = {
    key: string;
    eventId: string | null;

    date: string;
    startTime: string;
    endTime: string | null;
    durationMinutes: number;

    eventTypeId: string;
    frequencyId: string;

    status: "UNPLANNED" | "PLANNED" | "CANCELLED";

    isCancelled: boolean;
    cancelNote: string | null;
    substitute: string | null;
    lessons: LessonSlot[];

    eventType: {
        _id: string;
        title: string;
        level: string;
        price: string;
        venueId: string | null;
    };
};

function ymd(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function unplannedReason(r: OccurrenceRow) {
    if (r.status === "CANCELLED") return r.cancelNote ? `Cancelled: ${r.cancelNote}` : "Cancelled";
    if (!r.eventId) return "No event doc yet (virtual occurrence)";
    if (!r.lessons || r.lessons.length === 0) return "No lesson slots";
    const missing = r.lessons.filter((l) => !(l.dance ?? "").trim());
    if (missing.length > 0) return `${missing.length} slot${missing.length === 1 ? "" : "s"} missing dance`;
    return "Planned";
}

export default function LessonOverviewPage() {
    const [rows, setRows] = useState<OccurrenceRow[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const [from, setFrom] = useState(() => ymd(new Date()));
    const [to, setTo] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return ymd(d);
    });

    const [onlyUnplanned, setOnlyUnplanned] = useState(true);
    const [showCancelled, setShowCancelled] = useState(false);

    async function load() {
        setErr(null);
        try {
            const qs = new URLSearchParams({
                from,
                to,
                onlyUnplanned: String(onlyUnplanned),
            });

            const res = await fetch(`/api/occurrences?${qs.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as OccurrenceRow[];
            setRows(data);
        } catch (e: any) {
            setErr(e.message ?? String(e));
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, onlyUnplanned]);

    const visible = useMemo(() => {
        return showCancelled ? rows : rows.filter((r) => r.status !== "CANCELLED");
    }, [rows, showCancelled]);

    return (
        <main className="p-6 space-y-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold">Lesson Overview</h1>
                <p className="text-gray-600">
                    Virtual occurrences from frequencies + overlay existing events. UNPLANNED = missing any lesson/dance.
                </p>
            </header>

            <section className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                        <div className="text-gray-600 mb-1">From</div>
                        <input className="border rounded px-3 py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>

                    <label className="text-sm">
                        <div className="text-gray-600 mb-1">To</div>
                        <input className="border rounded px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>

                    <label className="flex items-center gap-2 border rounded px-3 py-2 text-sm">
                        <input type="checkbox" checked={onlyUnplanned} onChange={(e) => setOnlyUnplanned(e.target.checked)} />
                        Only unplanned
                    </label>

                    <label className="flex items-center gap-2 border rounded px-3 py-2 text-sm">
                        <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
                        Show cancelled
                    </label>

                    <button className="border rounded px-4 py-2 text-sm" onClick={load} type="button">
                        Refresh
                    </button>
                </div>

                {err && <p className="text-red-600 whitespace-pre-wrap">{err}</p>}
            </section>

            <section className="space-y-3">
                {visible.map((r) => {
                    const statusClass =
                        r.status === "CANCELLED"
                            ? "bg-gray-100 border-gray-300 text-gray-700"
                            : r.status === "PLANNED"
                                ? "bg-green-50 border-green-300 text-green-800"
                                : "bg-yellow-50 border-yellow-300 text-yellow-800";

                    const planHref =
                        `/admin/plan-lesson?` +
                        new URLSearchParams({
                            eventTypeId: r.eventTypeId,
                            date: r.date,
                            startTime: r.startTime,
                            durationMinutes: String(r.durationMinutes),
                            title: r.eventType.title, // display convenience
                        }).toString();

                    return (
                        <article key={r.key} className="border rounded-lg p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="font-medium">
                                        {r.eventType.title}{" "}
                                        <span className="text-gray-500 font-normal">
                                            • {r.date} • {r.startTime}
                                            {r.endTime ? ` – ${r.endTime}` : ""}
                                        </span>
                                    </div>

                                    {r.substitute && (
                                        <div className="text-sm text-gray-700">
                                            Substitute: <span className="font-medium">{r.substitute}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className={`text-xs border rounded-full px-3 py-1 ${statusClass}`}>{r.status}</span>

                                    {r.eventId ? (
                                        <a className="border rounded px-3 py-1 text-sm" href={`/admin/events/${r.eventId}`}>
                                            Open event
                                        </a>
                                    ) : (
                                        <a className="rounded bg-black text-white px-3 py-1 text-sm" href={planHref}>
                                            Plan lesson
                                        </a>
                                    )}
                                </div>
                            </div>

                            <div className="text-sm text-gray-700">
                                <span className="text-gray-600">Reason:</span> {unplannedReason(r)}
                            </div>

                            <div className="rounded border bg-gray-50 p-3">
                                <div className="text-sm font-medium mb-2">Lessons</div>

                                {(!r.lessons || r.lessons.length === 0) ? (
                                    <div className="text-sm text-gray-600">No lessons stored yet.</div>
                                ) : (
                                    <ul className="space-y-2">
                                        {r.lessons.map((l, idx) => {
                                            const missingDance = !(l.dance ?? "").trim();
                                            return (
                                                <li key={idx} className="flex flex-wrap items-center justify-between gap-3 border rounded bg-white p-2">
                                                    <div className="text-sm">
                                                        <span className="font-medium">{l.time ?? "(time?)"}</span>
                                                        {" • "}
                                                        <span className="text-gray-700">{l.level ?? "Level?"}</span>
                                                    </div>

                                                    <div className="text-sm">
                                                        {missingDance ? (
                                                            <span className="text-yellow-800">Dance needed</span>
                                                        ) : l.link ? (
                                                            <a className="text-blue-600 underline" href={l.link} target="_blank">
                                                                {l.dance}
                                                            </a>
                                                        ) : (
                                                            <span>{l.dance}</span>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </article>
                    );
                })}

                {visible.length === 0 && (
                    <div className="border rounded-lg p-6 text-gray-600">No occurrences match your filters.</div>
                )}
            </section>
        </main>
    );
}
