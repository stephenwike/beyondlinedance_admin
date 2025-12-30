// app/api/frequencies/route.ts
import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await dbBLD();

    const docs = await db.collection("frequencies").find({}).toArray();

    const out = docs.map((f: any) => ({
      ...f,
      _id: String(f._id),
      eventTypeId: f.eventTypeId ? String(f.eventTypeId) : undefined,
    }));

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
