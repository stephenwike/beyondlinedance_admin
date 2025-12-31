import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function clean(v: any) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

function isIsoLike(s: string) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(s);
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        const eventId = clean(body.eventId);
        const lessonIndex = Number(body.lessonIndex);
        const action = clean(body.action); // "TAUGHT" | "CLEAR" | "SKIP"
        const commitDate = clean(body.commitDate); // ISO string with offset (used only for TAUGHT)
        const overrideDanceId = clean(body.danceId) || null;

        if (!ObjectId.isValid(eventId)) {
            return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
        }
        if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
            return NextResponse.json({ error: "Invalid lessonIndex" }, { status: 400 });
        }
        if (action !== "TAUGHT" && action !== "CLEAR" && action !== "SKIP") {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
        if (action === "TAUGHT" && !isIsoLike(commitDate)) {
            return NextResponse.json(
                { error: "commitDate must be ISO with offset (e.g. 2025-12-20T17:00:00-07:00)" },
                { status: 400 }
            );
        }

        const db = await dbBLD();
        const _id = new ObjectId(eventId);

        const ev = await db.collection("events").findOne({ _id });
        if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

        const lessons = Array.isArray((ev as any).lessons) ? (ev as any).lessons : [];
        if (!lessons[lessonIndex]) {
            return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
        }

        const lesson = lessons[lessonIndex];

        // idempotent
        if (lesson.committed) {
            return NextResponse.json({ ok: true, alreadyCommitted: true });
        }

        // Resolve venue name for TAUGHT inserts
        let venueName: string | null = null;
        if ((ev as any).venue?.name) venueName = String((ev as any).venue.name);

        if (!venueName) {
            const etId = (ev as any).eventTypeId;
            if (etId) {
                const et = await db.collection("event_types").findOne({ _id: etId });
                if (et?.venueId) {
                    const venue = await db.collection("venues").findOne({ _id: et.venueId });
                    venueName = venue?.name ? String(venue.name) : null;
                }
            }
        }

        venueName = venueName ?? "Unknown venue";

        const pathBase = `lessons.${lessonIndex}`;

        if (action === "TAUGHT") {
            const plannedDanceId = typeof lesson.danceId === "string" ? lesson.danceId : null;
            const danceId = overrideDanceId ?? plannedDanceId ?? null;

            // ✅ strict rule
            if (!danceId) {
                return NextResponse.json({ error: "Missing danceId for TAUGHT" }, { status: 400 });
            }

            await db.collection("lessons").insertOne({
                danceId,
                venue: venueName,
                date: commitDate,
            });

            await db.collection("events").updateOne(
                { _id },
                {
                    $set: {
                        [`${pathBase}.committed`]: true,
                        [`${pathBase}.danceId`]: danceId, // persist override if different
                        updatedAt: new Date(),
                    },
                }
            );

            return NextResponse.json({ ok: true });
        }

        if (action === "CLEAR") {
            await db.collection("events").updateOne(
                { _id },
                {
                    $set: {
                        [`${pathBase}.committed`]: true,
                        [`${pathBase}.danceId`]: null,
                        [`${pathBase}.dance`]: null,
                        [`${pathBase}.level`]: null,
                        [`${pathBase}.link`]: null,
                        updatedAt: new Date(),
                    },
                }
            );

            return NextResponse.json({ ok: true });
        }

        // SKIP
        await db.collection("events").updateOne(
            { _id },
            {
                $set: {
                    [`${pathBase}.committed`]: true,
                    updatedAt: new Date(),
                },
            }
        );

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
}
