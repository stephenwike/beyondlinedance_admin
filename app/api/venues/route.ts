import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";
import { VenueSchema } from "@/lib/validators";

export async function GET() {
  const db = await dbBLD();
  const venues = await db.collection("venues").find({}).sort({ name: 1 }).toArray();
  return NextResponse.json(venues);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = VenueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const db = await dbBLD();
  const res = await db.collection("venues").insertOne(parsed.data);
  return NextResponse.json({ insertedId: res.insertedId });
}
