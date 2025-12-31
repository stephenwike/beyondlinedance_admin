import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function isYMD(s: string | null) {
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!isYMD(from) || !isYMD(to)) {
    return NextResponse.json({ error: "Provide from/to as YYYY-MM-DD" }, { status: 400 });
  }

  if (from! > to!) {
    return NextResponse.json({ error: "`from` must be <= `to`" }, { status: 400 });
  }

  const db = await dbBLD();

  const events = await db
    .collection("events")
    .find({ date: { $gte: from, $lte: to } })
    .sort({ date: 1, startTime: 1 })
    .toArray();

  return NextResponse.json(events);
}

// ✅ Convert virtual occurrence -> persisted Event
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const eventTypeId = String(body.eventTypeId ?? "").trim();
    const date = String(body.date ?? "").trim();
    const startTime = String(body.startTime ?? "").trim();
    const endTime = String(body.endTime ?? "").trim();
    const endDayOffset: 0 | 1 = body.endDayOffset === 1 ? 1 : 0;

    if (!ObjectId.isValid(eventTypeId)) {
      return NextResponse.json({ error: "Invalid eventTypeId" }, { status: 400 });
    }
    if (!isYMD(date)) {
      return NextResponse.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!isTime12(startTime)) {
      return NextResponse.json({ error: "startTime must look like '6:30 PM'" }, { status: 400 });
    }
    if (!isTime12(endTime)) {
      return NextResponse.json({ error: "endTime must look like '8:00 PM'" }, { status: 400 });
    }

    const startM = parseTime12ToMinutes(startTime);
    const endM = parseTime12ToMinutes(endTime);
    if (startM === null || endM === null) {
      return NextResponse.json({ error: "Invalid startTime/endTime" }, { status: 400 });
    }

    if (endDayOffset === 0 && endM <= startM) {
      return NextResponse.json(
        { error: "endTime must be after startTime (or mark ends after midnight)" },
        { status: 400 }
      );
    }

    const durationMinutes = endDayOffset === 1 ? endM + 24 * 60 - startM : endM - startM;

    const db = await dbBLD();
    const etId = new ObjectId(eventTypeId);

    // Ensure event type exists
    const exists = await db.collection("event_types").findOne({ _id: etId });
    if (!exists) {
      return NextResponse.json({ error: "eventType not found" }, { status: 404 });
    }

    // Upsert by deterministic key: eventTypeId + date + startTime
    const res = await db.collection("events").findOneAndUpdate(
      { eventTypeId: etId, date, startTime },
      {
        $setOnInsert: {
          eventTypeId: etId,
          date,
          startTime,
          endTime,
          endDayOffset,
          durationMinutes,

          isCancelled: false,
          cancelNote: null,
          substitute: null,
          lessons: [],

          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    const doc = res.value;
    return NextResponse.json({
      ok: true,
      eventId: doc?._id ? String(doc._id) : null,
      created: !!res.lastErrorObject?.upserted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
