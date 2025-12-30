import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await dbBLD();
    const venues = await db
      .collection("venues")
      .find({})
      .project({ name: 1, address: 1, city: 1, state: 1 })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json(
      venues.map((v: any) => ({
        _id: String(v._id),
        name: v.name ?? "",
        address: v.address ?? "",
        city: v.city ?? "",
        state: v.state ?? "",
      }))
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
