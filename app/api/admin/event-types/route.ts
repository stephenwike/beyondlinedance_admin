import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function normalizeNullableString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        const title = typeof body.title === "string" ? body.title.trim() : "";
        const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";

        const level = normalizeNullableString(body.level) ?? "";
        const price = normalizeNullableString(body.price) ?? "";

        const isActive = typeof body.isActive === "boolean" ? body.isActive : false;
        const isOneOff = typeof body.isOneOff === "boolean" ? body.isOneOff : !isActive;

        if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
        if (!ObjectId.isValid(venueId)) return NextResponse.json({ error: "Invalid venueId" }, { status: 400 });

        const db = await dbBLD();
        const venueObjId = new ObjectId(venueId);

        const venue = await db.collection("venues").findOne({ _id: venueObjId });
        if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

        const res = await db.collection("event_types").insertOne({
            title,
            level,
            price,
            venueId: venueObjId,

            // defaults may be filled later in the event type admin screen
            defaultStartTime: "",
            defaultDurationMinutes: 0,

            isActive,
            isOneOff,

            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return NextResponse.json({ ok: true, eventTypeId: String(res.insertedId) });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
}
