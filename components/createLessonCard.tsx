"use client";

import { useMemo, useState } from "react";

export type LessonInput = {
    time: string;         // "6:30 PM"
    dance: string;        // manual name OR selected dance title
    danceId?: string | null; // optional
    level?: string | null;
    link?: string | null;
};

export function LessonUpsertCard(props: {
    defaultTime: string;
    defaultLevel?: string | null;
    initial?: Partial<LessonInput>;
    busy?: boolean;
    onSave: (lesson: LessonInput, mode: "replace" | "insertAfter") => Promise<void> | void;

    // optional hook: connect your existing “pick dance” UI here
    onPickDance?: () => Promise<{ danceId: string; title: string; link?: string | null } | null>;
}) {
    const [time, setTime] = useState(props.initial?.time ?? props.defaultTime);
    const [dance, setDance] = useState(props.initial?.dance ?? "");
    const [danceId, setDanceId] = useState<string | null>(props.initial?.danceId ?? null);
    const [level, setLevel] = useState(props.initial?.level ?? props.defaultLevel ?? "");
    const [link, setLink] = useState(props.initial?.link ?? "");

    const canSave = useMemo(() => {
        return time.trim().length > 0 && (dance.trim().length > 0 || !!danceId);
    }, [time, dance, danceId]);

    async function pick() {
        if (!props.onPickDance) return;
        const picked = await props.onPickDance();
        if (!picked) return;
        setDanceId(picked.danceId);
        setDance(picked.title);
        if (picked.link) setLink(picked.link);
    }

    function toLesson(): LessonInput {
        return {
            time: time.trim(),
            dance: dance.trim(),
            danceId,
            level: level.trim() ? level.trim() : null,
            link: link.trim() ? link.trim() : null,
        };
    }

    return (
        <div className="rounded-lg border p-3 space-y-3 bg-white">
            <div className="font-medium">Break down lesson</div>

            <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                    <div className="text-gray-600 mb-1">Time</div>
                    <input className="border rounded px-3 py-2 w-full" value={time} onChange={(e) => setTime(e.target.value)} />
                </label>

                <label className="text-sm">
                    <div className="text-gray-600 mb-1">Level</div>
                    <input className="border rounded px-3 py-2 w-full" value={level ?? ""} onChange={(e) => setLevel(e.target.value)} />
                </label>
            </div>

            <label className="text-sm block">
                <div className="text-gray-600 mb-1">Dance</div>
                <div className="flex gap-2">
                    <input
                        className="border rounded px-3 py-2 w-full"
                        value={dance}
                        onChange={(e) => {
                            setDance(e.target.value);
                            // if user types manually, clear danceId (optional but recommended)
                            setDanceId(null);
                        }}
                        placeholder='e.g. "Various" or "Copperhead Road"'
                    />
                    {props.onPickDance ? (
                        <button className="border rounded px-3 py-2" type="button" onClick={pick} disabled={props.busy}>
                            Pick
                        </button>
                    ) : null}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                    You can type a manual dance name (no danceId) or pick a dance.
                </div>
            </label>

            <label className="text-sm block">
                <div className="text-gray-600 mb-1">Link (optional)</div>
                <input className="border rounded px-3 py-2 w-full" value={link ?? ""} onChange={(e) => setLink(e.target.value)} />
            </label>

            <div className="flex items-center gap-2">
                <button
                    className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
                    type="button"
                    disabled={!canSave || props.busy}
                    onClick={() => props.onSave(toLesson(), "replace")}
                >
                    Replace this lesson
                </button>
                <button
                    className="border rounded px-3 py-2 disabled:opacity-50"
                    type="button"
                    disabled={!canSave || props.busy}
                    onClick={() => props.onSave(toLesson(), "insertAfter")}
                >
                    Add another after
                </button>
            </div>

            {danceId ? (
                <div className="text-xs text-gray-500">danceId: {danceId}</div>
            ) : (
                <div className="text-xs text-gray-500">manual dance (no danceId)</div>
            )}
        </div>
    );
}
