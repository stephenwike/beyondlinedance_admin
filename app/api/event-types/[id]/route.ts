// app/api/event-types/[id]/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

function isValidObjectId(id: string) {
  return ObjectId.isValid(id);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // Next 16 dynamic params are async
) {
  const { id } = await ctx.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = await dbBLD();

  const doc = await db.collection("event_types").findOne({ _id: new ObjectId(id) });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return JSON-safe values (ObjectId -> string)
  return NextResponse.json({
    ...doc,
    _id: String(doc._id),
    venueId: doc.venueId ? String(doc.venueId) : undefined,
  });
}
