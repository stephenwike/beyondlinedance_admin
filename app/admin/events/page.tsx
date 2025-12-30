"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";

type EventType = { _id: string; title: string };
type EventDoc = {
    _id: string;
    eventTypeId: string;
    date: string;       // YYYY-MM-DD
    startTime: string;  // "5:00 PM"
    endTime: string;    // "10:00 PM"
    isCancelled: boolean;
    cancelNote?: string | null;
};

function ymd(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export default function EventsAdminPage() {
    const today = useMemo(() => new Date(), []);
    const [from, setFrom] = useState(ymd(today));
    const [to, setTo] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)));

    const [eventTypes, setEventTypes] = useState<EventType[]>([]);
    const [events, setEvents] = useState<EventDoc[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const eventTypeTitle = useMemo(() => {
        const m = new Map<string, string>();
        eventTypes.forEach((et) => m.set(et._id, et.title));
        return m;
    }, [eventTypes]);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const [ets, evs] = await Promise.all([
                apiGet<any[]>("/api/event-types"),
                apiGet<EventDoc[]>(`/api/events?from=${from}&to=${to}`),
            ]);

            setEventTypes(ets.map((x) => ({ _id: String(x._id), title: x.title })));
            setEvents(evs);
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const grouped = useMemo(() => {
        const m = new Map<string, EventDoc[]>();
        for (const ev of events) {
            const key = ev.date;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(ev);
        }
        return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [events]);

    return (
        <main className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Events</h1>
                <p className="text-gray-600 mt-1">
                    View generated events to validate schedules and ordering.
                </p>
            </header>

            <section className="rounded-lg border p-4 max-w-2xl space-y-3">
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
                    disabled={loading}
                    onClick={load}
                >
                    {loading ? "Loading..." : "Load"}
                </button>

                {err && <p className="text-red-600 whitespace-pre-wrap">{err}</p>}
            </section>

            <section className="space-y-4">
                {grouped.map(([date, evs]) => (
                    <div key={date} className="rounded-lg border p-4">
                        <div className="font-medium">{date}</div>
                        <ul className="mt-3 space-y-2">
                            {evs
                                .slice()
                                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                .map((ev) => (
                                    <li key={ev._id} className="border rounded p-3">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <div className="font-medium">
                                                {eventTypeTitle.get(String(ev.eventTypeId)) ?? String(ev.eventTypeId)}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {ev.startTime} – {ev.endTime}
                                            </div>
                                        </div>

                                        {ev.isCancelled && (
                                            <div className="text-sm text-red-600 mt-2">
                                                Cancelled{ev.cancelNote ? `: ${ev.cancelNote}` : ""}
                                            </div>
                                        )}

                                        <div className="text-xs text-gray-500 mt-2">id: {ev._id}</div>
                                    </li>
                                ))}
                        </ul>
                    </div>
                ))}

                {!loading && grouped.length === 0 && (
                    <div className="text-gray-600">No events found for that range.</div>
                )}
            </section>
        </main>
    );
}
