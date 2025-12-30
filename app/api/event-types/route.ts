// app/api/event-types/route.ts
import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await dbBLD();

    const docs = await db
      .collection("event_types")
      .find({})
      .sort({ title: 1 })
      .toArray();

    const out = docs.map((d: any) => ({
      ...d,
      _id: String(d._id),
      venueId: d.venueId ? String(d.venueId) : undefined,
    }));

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
