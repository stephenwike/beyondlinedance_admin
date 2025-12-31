import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function isYMD(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function normalizeTime12Input(s: any) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/\u2007/g, " ")
    .replace(/\u2009/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bA\.?M\.?\b/i, "AM")
    .replace(/\bP\.?M\.?\b/i, "PM")
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

function isTime12(s: any) {
  const t = normalizeTime12Input(s);
  return /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.test(t);
}

function parseTime12ToMinutes(tRaw: any): number | null {
  const t = normalizeTime12Input(tRaw);
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;
  return hh * 60 + mm;
}

function cleanNullable(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
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

// ✅ Create OR update by deterministic key: eventTypeId + date + startTime
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const eventTypeId = String(body.eventTypeId ?? "").trim();
    const date = String(body.date ?? "").trim();

    const startTime = normalizeTime12Input(body.startTime);
    const endTime = normalizeTime12Input(body.endTime);

    const endDayOffset: 0 | 1 = body.endDayOffset === 1 ? 1 : 0;

    // Canonical fields only
    const isCancelled = !!body.isCancelled;
    const cancelNote = cleanNullable(body.cancelNote);
    const substitute = cleanNullable(body.substitute);

    const lessonsIn = Array.isArray(body.lessons) ? body.lessons : [];
    const lessons = lessonsIn.map((l: any) => ({
      time: cleanNullable(l?.time),
      danceId: cleanNullable(l?.danceId), // ✅ keep danceId
      dance: cleanNullable(l?.dance),
      level: cleanNullable(l?.level),
      link: cleanNullable(l?.link),
      committed: false,
    }));

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
      return NextResponse.json({ error: "endTime must look like '8:00 PM'", detail: { received: endTime } }, { status: 400 });
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

    const exists = await db.collection("event_types").findOne({ _id: etId });
    if (!exists) {
      return NextResponse.json({ error: "eventType not found" }, { status: 404 });
    }

    const filter = { eventTypeId: etId, date, startTime };

    // ✅ Use $set for fields we want updated on every POST
    const update = {
      $setOnInsert: {
        eventTypeId: etId,
        date,
        startTime,
      },
      $set: {
        endTime,
        endDayOffset,
        durationMinutes,
        isCancelled,
        cancelNote,
        substitute,
        lessons,
      },
    };

    const res = await db.collection("events").updateOne(filter, update, { upsert: true });

    // ✅ Return eventId reliably
    let eventId: string | null = null;

    if (res.upsertedId) {
      eventId = String(res.upsertedId);
    } else {
      const doc = await db.collection("events").findOne(filter, { projection: { _id: 1 } });
      eventId = doc?._id ? String(doc._id) : null;
    }

    if (!eventId) {
      return NextResponse.json({ error: "Failed to resolve eventId after upsert" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, eventId, created: !!res.upsertedId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
