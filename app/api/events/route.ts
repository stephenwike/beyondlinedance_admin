import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function isYMD(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidObjectId(id: string | null) {
  return !!id && ObjectId.isValid(id);
}

function normalizeNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseTimeToMinutes(t: string): number {
  const m = String(t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;
  return hh * 60 + mm;
}

// ✅ UPDATED: whitelist "time" too
function normalizeLessons(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map((l: any) => ({
    time: normalizeNullableString(l?.time), // NEW
    dance: normalizeNullableString(l?.dance),
    level: normalizeNullableString(l?.level),
    link: normalizeNullableString(l?.link),
  }));
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

  // Fetch then sort in JS so "2:00 PM" comes before "5:00 PM"
  const events = await db
    .collection("events")
    .find({ date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .toArray();

  events.sort((a: any, b: any) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
  });

  const out = events.map((e: any) => ({
    ...e,
    _id: String(e._id),
    eventTypeId: e.eventTypeId ? String(e.eventTypeId) : undefined,
  }));

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const eventTypeId = body?.eventTypeId ?? null;
    const date = body?.date ?? null;
    const startTime = body?.startTime ?? null;
    const durationMinutes = Number(body?.durationMinutes);

    if (!isValidObjectId(eventTypeId)) {
      return NextResponse.json({ error: "Invalid eventTypeId" }, { status: 400 });
    }
    if (!isYMD(date)) {
      return NextResponse.json({ error: "Provide date as YYYY-MM-DD" }, { status: 400 });
    }
    if (typeof startTime !== "string" || !startTime.trim()) {
      return NextResponse.json({ error: "startTime is required" }, { status: 400 });
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: "durationMinutes must be a positive number" }, { status: 400 });
    }

    const cancelled = !!body?.cancelled;
    const cancellationNote = normalizeNullableString(body?.cancellationNote);

    // substitute: allow either { substitute: "Name" } or { substituteName }
    const substitute =
      normalizeNullableString(body?.substitute) ??
      normalizeNullableString(body?.substituteName) ??
      null;

    // cancelled events can persist empty lessons
    const lessons = cancelled ? [] : normalizeLessons(body?.lessons);

    const db = await dbBLD();
    const events = db.collection("events");

    const eventTypeObjId = new ObjectId(eventTypeId);

    // occurrence identity (idempotent)
    const filter = {
      eventTypeId: eventTypeObjId,
      date: String(date),
      startTime: String(startTime).trim(),
    };

    const update = {
      $set: {
        eventTypeId: eventTypeObjId,
        date: String(date),
        startTime: String(startTime).trim(),
        durationMinutes,
        lessons, // ✅ now contains lesson.time
        cancelled,
        cancellationNote,
        substitute,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    };

    // updateOne + read-back is robust across driver behaviors
    const u = await events.updateOne(filter, update, { upsert: true });

    const eventId =
      u.upsertedId && (u.upsertedId as any)._id ? (u.upsertedId as any)._id : null;

    let event: any | null = null;

    if (eventId) {
      event = await events.findOne({ _id: eventId });
    } else {
      event = await events.findOne(filter);
    }

    if (!event) {
      return NextResponse.json(
        { error: "Event upsert succeeded but event could not be read back" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      eventId: String(event._id),
      event: {
        ...event,
        _id: String(event._id),
        eventTypeId: event.eventTypeId ? String(event.eventTypeId) : undefined,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
