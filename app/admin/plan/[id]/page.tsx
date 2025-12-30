"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

async function apiPatch(url: string, body: unknown) {
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

type Lesson = { time: string | null; dance: string | null; level: string | null; link: string | null };

export default function PlanEventPage({ params }: { params: { id: string } }) {
    const [ev, setEv] = useState<any>(null);
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [isCancelled, setIsCancelled] = useState(false);
    const [subEnabled, setSubEnabled] = useState(false);
    const [subName, setSubName] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function load() {
        setErr(null);
        const doc = await apiGet<any>(`/api/events/${params.id}`);
        setEv(doc);
        setLessons(Array.isArray(doc.lessons) ? doc.lessons : []);
        setIsCancelled(!!doc.isCancelled);
        setSubEnabled(!!doc.substitute);
        setSubName(doc.substitute ?? "");
    }

    useEffect(() => {
        load().catch((e) => setErr(e.message ?? String(e)));
        // eslint-disable-next-line
    }, []);

    function updateLesson(idx: number, patch: Partial<Lesson>) {
        setLessons((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    }

    function addLesson() {
        setLessons((prev) => [...prev, { time: "", dance: "", level: "", link: "" }]);
    }

    async function save() {
        setSaving(true);
        setErr(null);
        try {
            await apiPatch(`/api/events/${params.id}`, {
                isCancelled,
                substitute: subEnabled ? subName.trim() || null : null,
                lessons,
            });
            await load();
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setSaving(false);
        }
    }

    if (!ev) {
        return (
            <main className="p-6">
                <div className="text-gray-600">Loading...</div>
                {err && <div className="text-red-600 mt-3 whitespace-pre-wrap">{err}</div>}
            </main>
        );
    }

    return (
        <main className="p-6 space-y-5">
            <header>
                <h1 className="text-2xl font-semibold">Plan Event</h1>
                <div className="text-gray-700 mt-1">
                    {ev.date} • {ev.startTime}–{ev.endTime}
                </div>
            </header>

            <section className="rounded-lg border p-4 space-y-3 max-w-3xl">
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={isCancelled} onChange={(e) => setIsCancelled(e.target.checked)} />
                    Cancelled
                </label>

                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={subEnabled} onChange={(e) => setSubEnabled(e.target.checked)} />
                    Substitute
                </label>

                {subEnabled && (
                    <input
                        className="border rounded px-3 py-2"
                        placeholder="Substitute name"
                        value={subName}
                        onChange={(e) => setSubName(e.target.value)}
                    />
                )}
            </section>

            <section className="rounded-lg border p-4 space-y-3 max-w-5xl">
                <div className="flex items-center justify-between">
                    <h2 className="font-medium">Lessons</h2>
                    <button className="border rounded px-3 py-2" onClick={addLesson}>
                        + Add lesson
                    </button>
                </div>

                <div className="grid gap-2">
                    {lessons.map((l, idx) => (
                        <div key={idx} className="grid grid-cols-4 gap-2">
                            <input
                                className="border rounded px-3 py-2"
                                placeholder="Time (e.g., 5:30 PM)"
                                value={l.time ?? ""}
                                onChange={(e) => updateLesson(idx, { time: e.target.value })}
                            />
                            <input
                                className="border rounded px-3 py-2"
                                placeholder="Dance name"
                                value={l.dance ?? ""}
                                onChange={(e) => updateLesson(idx, { dance: e.target.value })}
                            />
                            <input
                                className="border rounded px-3 py-2"
                                placeholder="Level"
                                value={l.level ?? ""}
                                onChange={(e) => updateLesson(idx, { level: e.target.value })}
                            />
                            <input
                                className="border rounded px-3 py-2"
                                placeholder="Link (optional)"
                                value={l.link ?? ""}
                                onChange={(e) => updateLesson(idx, { link: e.target.value })}
                            />
                        </div>
                    ))}

                    {lessons.length === 0 && <div className="text-gray-600">No lessons yet. Add one.</div>}
                </div>

                <div className="flex items-center gap-3">
                    <button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" onClick={save} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                    {err && <div className="text-red-600 whitespace-pre-wrap">{err}</div>}
                </div>
            </section>

            <section className="text-xs text-gray-500">
                Event id: {String(ev._id)}
            </section>
        </main>
    );
}
