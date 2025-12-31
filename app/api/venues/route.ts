import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function clean(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET() {
  const db = await dbBLD();

  const venues = await db
    .collection("venues")
    .find({})
    .sort({ name: 1 })
    .toArray();

  // Normalize _id to string for client use
  const out = venues.map((v: any) => ({
    ...v,
    _id: String(v._id),
  }));

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = clean(body.name);
    const address = clean(body.address) || null;
    const city = clean(body.city) || null;
    const state = clean(body.state) || null;

    if (!name) return bad("Venue name is required");

    const db = await dbBLD();

    const doc = {
      name,
      address,
      city,
      state,
    };

    const res = await db.collection("venues").insertOne(doc);

    return NextResponse.json({ ok: true, venueId: String(res.insertedId) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
