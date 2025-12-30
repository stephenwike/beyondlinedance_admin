// app/api/admin/lesson-plans/route.ts
import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";
import { buildLessonPlanRows } from "@/lib/lesson-plans";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
        return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    const db = await dbBLD();

    const [eventTypes, frequencies, events, venues] = await Promise.all([
        db.collection("event_types").find({ isActive: true }).toArray(),
        db.collection("frequencies").find({}).toArray(),
        db.collection("events").find({ date: { $gte: from, $lte: to } }).toArray(),
        db.collection("venues").find({}).toArray(),
    ]);

    const rows = buildLessonPlanRows({ from, to, eventTypes, frequencies, events, venues });
    return NextResponse.json(rows);
}
