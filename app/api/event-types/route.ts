import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await dbBLD();

    const ets = await db
      .collection("event_types")
      .find({})
      .project({
        title: 1,
        level: 1,
        price: 1,
        venueId: 1,
        venueKey: 1,
        isActive: 1,
        defaultStartTime: 1,
        defaultDurationMinutes: 1,
        isOneOff: 1,

        // ✅ IMPORTANT: include this so the UI can pre-check the box
        endDayOffset: 1,
      })
      .sort({ title: 1 })
      .toArray();

    return NextResponse.json(
      ets.map((et: any) => ({
        _id: String(et._id),
        title: et.title ?? "",
        level: et.level ?? "",
        price: et.price ?? "",
        venueId: et.venueId ? String(et.venueId) : undefined,
        venueKey: et.venueKey ?? undefined,
        isActive: typeof et.isActive === "boolean" ? et.isActive : true,
        defaultStartTime: et.defaultStartTime ?? "",
        defaultDurationMinutes: Number(et.defaultDurationMinutes ?? 0),
        isOneOff: !!et.isOneOff,

        // ✅ normalize to 0|1 (default 0)
        endDayOffset: et.endDayOffset === 1 ? 1 : 0,
      }))
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
