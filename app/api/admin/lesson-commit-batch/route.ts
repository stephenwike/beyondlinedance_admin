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
        const sourceLessonIndex = Number(body.sourceLessonIndex);
        const finalize = clean(body.finalize) || "NONE"; // NONE | COMMIT_SOURCE | CLEAR_SOURCE

        const itemsRaw = Array.isArray(body.items) ? body.items : [];
        const items = itemsRaw.map((x: any) => ({
            commitDate: clean(x?.commitDate),
            danceId: clean(x?.danceId) || null,
            danceName: clean(x?.danceName) || null,
        }));

        if (!ObjectId.isValid(eventId)) {
            return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
        }
        if (!Number.isInteger(sourceLessonIndex) || sourceLessonIndex < 0) {
            return NextResponse.json({ error: "Invalid sourceLessonIndex" }, { status: 400 });
        }
        if (finalize !== "NONE" && finalize !== "COMMIT_SOURCE" && finalize !== "CLEAR_SOURCE") {
            return NextResponse.json({ error: "Invalid finalize" }, { status: 400 });
        }
        if (items.length === 0) {
            return NextResponse.json({ error: "items must contain at least one taught lesson" }, { status: 400 });
        }

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!isIsoLike(it.commitDate)) {
                return NextResponse.json({ error: `items[${i}].commitDate must be ISO with offset` }, { status: 400 });
            }
            if (!it.danceId && !it.danceName) {
                return NextResponse.json({ error: `items[${i}] must have danceId or danceName` }, { status: 400 });
            }
        }

        const db = await dbBLD();
        const _id = new ObjectId(eventId);

        const ev = await db.collection("events").findOne({ _id });
        if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

        const lessons = Array.isArray((ev as any).lessons) ? (ev as any).lessons : [];
        if (!lessons[sourceLessonIndex]) {
            return NextResponse.json({ error: "Source lesson not found" }, { status: 404 });
        }

        // Resolve venue name
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

        const docs = items.map((it: any) => {
            const doc: any = { venue: venueName, date: it.commitDate };
            if (it.danceId) doc.danceId = it.danceId;
            if (!it.danceId && it.danceName) doc.danceName = it.danceName;
            return doc;
        });

        await db.collection("lessons").insertMany(docs);

        const pathBase = `lessons.${sourceLessonIndex}`;

        if (finalize === "COMMIT_SOURCE") {
            await db.collection("events").updateOne(
                { _id },
                { $set: { [`${pathBase}.committed`]: true, updatedAt: new Date() } }
            );
        } else if (finalize === "CLEAR_SOURCE") {
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
        }

        return NextResponse.json({ ok: true, inserted: docs.length });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
}
