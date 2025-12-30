import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";
import { FrequencySchema, ObjectIdString } from "@/lib/validators";

export async function GET(
    _req: Request,
    { params }: { params: { id: string } }
) {
    const parsedId = ObjectIdString.safeParse(params.id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const db = await dbBLD();
    const doc = await db.collection("frequencies").findOne({ _id: new ObjectId(params.id) });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(doc);
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const parsedId = ObjectIdString.safeParse(params.id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await req.json();
    const parsed = FrequencySchema.partial().safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const update: any = { ...parsed.data };
    if (update.eventTypeId) update.eventTypeId = new ObjectId(update.eventTypeId);

    const db = await dbBLD();
    const res = await db.collection("frequencies").updateOne(
        { _id: new ObjectId(params.id) },
        { $set: update }
    );

    if (res.matchedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
}
