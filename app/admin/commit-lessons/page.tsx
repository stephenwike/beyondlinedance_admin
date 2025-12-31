"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import LessonsEditor, { DanceHit, LessonSlot } from "@/components/lessonsEditor";

type QueueItem = {
    eventId: string;
    eventTypeTitle: string;
    venueName: string;

    lessonDate: string; // YYYY-MM-DD (effective date)
    lessonIndex: number;
    lessonTime: string; // "6:30 PM"

    plannedDanceId: string | null;
    plannedDanceName: string | null;
    level: string | null;
    link: string | null;

    suggestedAction?: "SKIP_SUGGESTED" | "NONE";
};

function defaultCommitIso(lessonDate: string, lessonTime: string) {
    const m = lessonTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return `${lessonDate}T00:00:00-07:00`;
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = m[3].toUpperCase();
    if (hh === 12) hh = 0;
    if (ap === "PM") hh += 12;
    const HH = String(hh).padStart(2, "0");
    const MM = String(mm).padStart(2, "0");
    return `${lessonDate}T${HH}:${MM}:00-07:00`;
}

function keyOf(it: QueueItem) {
    return `${it.eventId}:${it.lessonIndex}`;
}

type OverrideState = {
    danceId: string | null; // required for Mark taught
    danceName: string;      // display + manual text (but manual disables Mark taught)
};

export default function CommitLessonsPage() {
    const [items, setItems] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [commitDates, setCommitDates] = useState<Record<string, string>>({});
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});

    // Dance search popup for overrides
    const [danceQ, setDanceQ] = useState("");
    const [danceHits, setDanceHits] = useState<DanceHit[]>([]);
    const [danceLoading, setDanceLoading] = useState(false);
    const [activeOverrideKey, setActiveOverrideKey] = useState<string | null>(null);
    const searchAbort = useRef<AbortController | null>(null);

    // “Add another taught lesson” drawer (batch create lessons docs)
    const [openAddKey, setOpenAddKey] = useState<string | null>(null);
    const [addDrafts, setAddDrafts] = useState<LessonSlot[]>([]);
    const [addSaving, setAddSaving] = useState(false);
    const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);

    const total = useMemo(() => items.length, [items]);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/lesson-commit-queue");
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as QueueItem[];
            const arr = Array.isArray(data) ? data : [];
            setItems(arr);

            const nextDates: Record<string, string> = {};
            const nextOverrides: Record<string, OverrideState> = { ...overrides };

            for (const it of arr) {
                const k = keyOf(it);
                nextDates[k] = defaultCommitIso(it.lessonDate, it.lessonTime);

                if (!nextOverrides[k]) {
                    nextOverrides[k] = {
                        danceId: it.plannedDanceId ?? null,
                        danceName: it.plannedDanceName ?? "",
                    };
                }
            }

            setCommitDates(nextDates);
            setOverrides(nextOverrides);

            if (openAddKey) {
                const stillThere = arr.some((it) => keyOf(it) === openAddKey);
                if (!stillThere) {
                    setOpenAddKey(null);
                    setAddDrafts([]);
                    setInsertAfterIndex(null);
                }
            }
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

    // Debounced dance search for override picker
    useEffect(() => {
        if (!activeOverrideKey) return;
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
                // ignore abort
            } finally {
                setDanceLoading(false);
            }
        }, 200);

        return () => clearTimeout(t);
    }, [danceQ, activeOverrideKey]);

    function openOverridePicker(it: QueueItem) {
        const k = keyOf(it);
        setActiveOverrideKey(k);
        const cur = overrides[k];
        setDanceQ(cur?.danceName ?? it.plannedDanceName ?? "");
        setDanceHits([]);
    }

    function chooseOverrideDance(hit: DanceHit) {
        if (!activeOverrideKey) return;
        setOverrides((p) => ({
            ...p,
            [activeOverrideKey]: { danceId: hit._id, danceName: hit.danceName },
        }));
        setActiveOverrideKey(null);
        setDanceQ("");
        setDanceHits([]);
    }

    async function actSingle(it: QueueItem, action: "TAUGHT" | "CLEAR" | "SKIP") {
        const k = keyOf(it);
        setBusyKey(k);
        setErr(null);
        try {
            const commitDate = commitDates[k] ?? defaultCommitIso(it.lessonDate, it.lessonTime);
            const ov = overrides[k];

            const body: any = {
                eventId: it.eventId,
                lessonIndex: it.lessonIndex,
                action,
                commitDate,
            };

            if (action === "TAUGHT") {
                // ✅ strict: danceId required
                const danceId = ov?.danceId ?? it.plannedDanceId ?? null;
                if (!danceId) {
                    throw new Error("Mark taught requires a danceId. Pick a dance first.");
                }
                body.danceId = danceId;
            }

            const res = await fetch("/api/admin/lesson-commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error(await res.text());

            setItems((prev) => prev.filter((x) => keyOf(x) !== k));

            if (openAddKey === k) {
                setOpenAddKey(null);
                setAddDrafts([]);
                setInsertAfterIndex(null);
            }
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setBusyKey(null);
        }
    }

    function toggleAddAnother(it: QueueItem) {
        const k = keyOf(it);
        if (openAddKey === k) {
            setOpenAddKey(null);
            setAddDrafts([]);
            setInsertAfterIndex(null);
            return;
        }

        setOpenAddKey(k);
        setErr(null);

        setAddDrafts([{ time: it.lessonTime, danceId: null, dance: null, level: it.level ?? null, link: null }]);
        setInsertAfterIndex(0);
    }

    async function commitAdditional(it: QueueItem) {
        const k = keyOf(it);
        setAddSaving(true);
        setErr(null);
        try {
            const payloadItems = addDrafts
                .map((d) => {
                    const time = (d.time ?? "").trim();
                    if (!time) return null;

                    const danceId = typeof d.danceId === "string" && d.danceId.trim() ? d.danceId.trim() : null;
                    const danceName = (d.dance ?? "").trim() ? (d.dance ?? "").trim() : null;
                    if (!danceId && !danceName) return null;

                    return {
                        commitDate: defaultCommitIso(it.lessonDate, time),
                        danceId,
                        danceName,
                    };
                })
                .filter(Boolean) as any[];

            if (payloadItems.length === 0) {
                throw new Error("Add at least one taught lesson (time + dance).");
            }

            const res = await fetch("/api/admin/lesson-commit-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventId: it.eventId,
                    sourceLessonIndex: it.lessonIndex,
                    items: payloadItems,
                    finalize: "NONE", // do not resolve planned slot
                }),
            });

            if (!res.ok) throw new Error(await res.text());

            setOpenAddKey(null);
            setAddDrafts([]);
            setInsertAfterIndex(null);

            await load();
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setAddSaving(false);
        }
    }

    return (
        <main className="p-6 space-y-5">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Commit lessons</h1>
                    <p className="text-gray-600 mt-1">
                        Mark what you taught (requires a danceId), add extra taught lessons, or skip/clear. This creates docs in the{" "}
                        <code className="px-1">lessons</code> collection.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button className="border rounded px-4 py-2" onClick={load} disabled={loading} type="button">
                        {loading ? "Loading…" : "Refresh"}
                    </button>
                    <Link className="border rounded px-4 py-2" href="/admin">
                        Back to admin
                    </Link>
                </div>
            </header>

            {err && <div className="text-red-600 whitespace-pre-wrap">{err}</div>}

            {loading ? (
                <div className="text-gray-600">Loading…</div>
            ) : total === 0 ? (
                <div className="text-gray-600">No lessons to commit right now.</div>
            ) : (
                <section className="space-y-2">
                    {items.map((it) => {
                        const k = keyOf(it);
                        const isBusy = busyKey === k;
                        const isAddOpen = openAddKey === k;

                        const ov = overrides[k] ?? { danceId: it.plannedDanceId ?? null, danceName: it.plannedDanceName ?? "" };

                        // ✅ Mark taught possible only with a danceId
                        const effectiveDanceId = ov.danceId ?? it.plannedDanceId ?? null;
                        const canMarkTaught = !!effectiveDanceId;

                        return (
                            <div key={k} className="border rounded-lg p-4 space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">
                                            {it.eventTypeTitle} • {it.venueName}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {it.lessonDate} • Slot {it.lessonIndex + 1} at {it.lessonTime}
                                        </div>
                                    </div>

                                    <span className="text-xs border rounded-full px-3 py-1 bg-gray-50 border-gray-300 text-gray-700">
                                        Planned: {it.plannedDanceName ?? "(blank)"}
                                    </span>
                                </div>

                                <div className="rounded border p-3 bg-white space-y-2">
                                    <div className="text-sm text-gray-700">
                                        <span className="text-gray-600">Taught:</span>{" "}
                                        <span className="font-medium">{ov.danceName || it.plannedDanceName || "(pick a dance)"}</span>
                                        {effectiveDanceId ? (
                                            <span className="text-xs text-gray-500"> • danceId: {effectiveDanceId}</span>
                                        ) : (
                                            <span className="text-xs text-gray-500"> • (no danceId)</span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            className="border rounded px-3 py-2 text-sm"
                                            type="button"
                                            onClick={() => openOverridePicker(it)}
                                            disabled={isBusy}
                                        >
                                            Pick dance (override)
                                        </button>

                                        <label className="text-sm">
                                            <div className="text-gray-600 mb-1">Manual name (disables Mark taught)</div>
                                            <input
                                                className="border rounded px-3 py-2 w-full"
                                                value={ov.danceId ? "" : ov.danceName}
                                                onChange={(e) =>
                                                    setOverrides((p) => ({
                                                        ...p,
                                                        [k]: { danceId: null, danceName: e.target.value },
                                                    }))
                                                }
                                                placeholder='Use this only for "additional taught lessons"'
                                                disabled={isBusy}
                                            />
                                        </label>
                                    </div>

                                    <label className="text-sm block">
                                        <div className="text-gray-600 mb-1">Commit time (editable)</div>
                                        <input
                                            className="border rounded px-3 py-2 w-full"
                                            value={commitDates[k] ?? ""}
                                            onChange={(e) => setCommitDates((p) => ({ ...p, [k]: e.target.value }))}
                                            placeholder="2025-12-20T17:00:00-07:00"
                                            disabled={isBusy}
                                        />
                                    </label>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                                            onClick={() => actSingle(it, "TAUGHT")}
                                            disabled={isBusy || !canMarkTaught}
                                            type="button"
                                            title={!canMarkTaught ? "Pick a dance (danceId required) to mark taught." : ""}
                                        >
                                            {isBusy ? "Saving…" : "Mark taught"}
                                        </button>

                                        {!canMarkTaught && (
                                            <span className="text-xs text-gray-600">
                                                Mark taught requires a selected dance (danceId).
                                            </span>
                                        )}

                                        <button
                                            className="border rounded px-4 py-2 disabled:opacity-50"
                                            onClick={() => actSingle(it, "SKIP")}
                                            disabled={isBusy}
                                            type="button"
                                        >
                                            Skip
                                        </button>

                                        <button
                                            className="border rounded px-4 py-2 disabled:opacity-50"
                                            onClick={() => actSingle(it, "CLEAR")}
                                            disabled={isBusy}
                                            type="button"
                                        >
                                            Clear
                                        </button>

                                        <button
                                            className="border rounded px-4 py-2 disabled:opacity-50"
                                            onClick={() => toggleAddAnother(it)}
                                            disabled={isBusy || addSaving}
                                            type="button"
                                        >
                                            {isAddOpen ? "Close" : "Add another taught lesson"}
                                        </button>
                                    </div>
                                </div>

                                {isAddOpen && (
                                    <div className="rounded border p-3 bg-gray-50 space-y-3">
                                        <div className="text-sm text-gray-700">
                                            Add additional taught lessons (manual names allowed here).
                                        </div>

                                        <LessonsEditor
                                            lessons={addDrafts}
                                            eventStartTime={it.lessonTime}
                                            disabled={addSaving}
                                            onChange={setAddDrafts}
                                            showHeader={true}
                                            initialOpenDancePickerRow={0}
                                            insertAfterIndex={insertAfterIndex}
                                            onInsertAfterIndexChange={setInsertAfterIndex}
                                        />

                                        <div className="flex items-center gap-2">
                                            <button
                                                className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                                                type="button"
                                                onClick={() => commitAdditional(it)}
                                                disabled={addSaving}
                                            >
                                                {addSaving ? "Committing…" : "Commit additional lessons"}
                                            </button>
                                            <span className="text-xs text-gray-600">Creates additional docs in lessons collection.</span>
                                        </div>
                                    </div>
                                )}

                                {activeOverrideKey === k && (
                                    <div className="border rounded p-3 bg-gray-50">
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
                                                    setActiveOverrideKey(null);
                                                    setDanceQ("");
                                                    setDanceHits([]);
                                                }}
                                                type="button"
                                            >
                                                Close
                                            </button>
                                        </div>

                                        <div className="mt-2 text-xs text-gray-600">
                                            {danceLoading ? "Searching…" : "Click a result to set the taught dance."}
                                        </div>

                                        <ul className="mt-2 space-y-1">
                                            {danceHits.map((hit) => (
                                                <li key={hit._id}>
                                                    <button
                                                        className="w-full text-left border rounded px-3 py-2 bg-white hover:bg-gray-100"
                                                        onClick={() => chooseOverrideDance(hit)}
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
                            </div>
                        );
                    })}
                </section>
            )}
        </main>
    );
}
