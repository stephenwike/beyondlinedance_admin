// app/api/admin/one-off-event/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function isYmd(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function isTime12(s: string | null) {
  return !!s && /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.test(s.trim());
}

function parseTime12ToMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;
  return hh * 60 + mm;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const eventTypeId = typeof body.eventTypeId === "string" ? body.eventTypeId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";

    const endDayOffsetRaw = body.endDayOffset;
    const endDayOffset: 0 | 1 = endDayOffsetRaw === 1 ? 1 : 0;

    if (!ObjectId.isValid(eventTypeId)) {
      return NextResponse.json({ error: "Invalid eventTypeId" }, { status: 400 });
    }
    if (!isYmd(date)) {
      return NextResponse.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!isTime12(startTime)) {
      return NextResponse.json({ error: "Invalid startTime (e.g. 6:30 PM)" }, { status: 400 });
    }
    if (!isTime12(endTime)) {
      return NextResponse.json({ error: "Invalid endTime (e.g. 8:00 PM)" }, { status: 400 });
    }

    const startM = parseTime12ToMinutes(startTime);
    const endM = parseTime12ToMinutes(endTime);
    if (startM === null || endM === null) {
      return NextResponse.json({ error: "Invalid startTime/endTime" }, { status: 400 });
    }

    // ✅ Validation with endDayOffset
    // If same-day, end must be after start. If next-day, end can be "earlier".
    if (endDayOffset === 0 && endM <= startM) {
      return NextResponse.json({ error: "endTime must be after startTime (or mark ends after midnight)" }, { status: 400 });
    }

    const durationMinutes = endDayOffset === 1 ? endM + 24 * 60 - startM : endM - startM;

    const db = await dbBLD();
    const etObjId = new ObjectId(eventTypeId);

    // Ensure event type exists
    const et = await db.collection("event_types").findOne({ _id: etObjId });
    if (!et) return NextResponse.json({ error: "eventType not found" }, { status: 404 });

    // Create the event occurrence
    const evInsert = await db.collection("events").insertOne({
      eventTypeId: etObjId,
      date,
      startTime,
      endTime,
      endDayOffset, // ✅ persisted
      durationMinutes,

      isCancelled: false,
      cancelNote: null,
      substitute: null,
      lessons: [],

      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      eventId: String(evInsert.insertedId),
      eventTypeId: String(etObjId),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
