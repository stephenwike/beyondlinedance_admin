import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function isValidObjectId(id: string) {
  return ObjectId.isValid(id);
}

function normalizeNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function normalizeLessons(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map((l: any) => ({
    time: normalizeNullableString(l?.time),
    dance: normalizeNullableString(l?.dance),
    level: normalizeNullableString(l?.level),
    link: normalizeNullableString(l?.link),
  }));
}

async function getVenue(db: any, eventType: any) {
  // Prefer venueId if present
  const venueId = eventType?.venueId;
  if (venueId && ObjectId.isValid(String(venueId))) {
    const v = await db.collection("venues").findOne({ _id: new ObjectId(String(venueId)) });
    if (v) return { ...v, _id: String(v._id) };
  }

  // Fallback: some event types store venueKey like "Name|Address"
  if (eventType?.venueKey && typeof eventType.venueKey === "string") {
    const parts = eventType.venueKey.split("|");
    const name = (parts[0] ?? "").trim();
    const address = (parts[1] ?? "").trim();
    return {
      _id: "virtual",
      name: name || "Unknown venue",
      address: address || "",
      city: "",
      state: "",
    };
  }

  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const db = await dbBLD();

    const ev = await db.collection("events").findOne({ _id: new ObjectId(id) });
    if (!ev) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eventType
    const etId = ev.eventTypeId ? new ObjectId(String(ev.eventTypeId)) : null;
    const eventType = etId ? await db.collection("event_types").findOne({ _id: etId }) : null;

    // venue
    const venue = eventType ? await getVenue(db, eventType) : null;

    // Normalize to what your planner page expects:
    // - endTime must exist (compute from duration if missing)
    // - isCancelled/cancelNote must exist (alias from cancelled/cancellationNote if needed)
    const startTime = ev.startTime ?? "";
    const endTime =
      ev.endTime ??
      (typeof ev.durationMinutes === "number" && ev.durationMinutes > 0
        ? (() => {
            // minimal compute (assumes same day)
            const m = String(startTime).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (!m) return "";
            let hh = Number(m[1]);
            const mm = Number(m[2]);
            const ap = m[3].toUpperCase();
            if (hh === 12) hh = 0;
            if (ap === "PM") hh += 12;
            const startMins = hh * 60 + mm;
            const endMins = startMins + Number(ev.durationMinutes || 0);
            const hh24 = ((Math.floor(endMins / 60) % 24) + 24) % 24;
            const endMM = ((endMins % 60) + 60) % 60;
            const endAP = hh24 >= 12 ? "PM" : "AM";
            let hh12 = hh24 % 12;
            if (hh12 === 0) hh12 = 12;
            return `${hh12}:${String(endMM).padStart(2, "0")} ${endAP}`;
          })()
        : "");

    const isCancelled =
      typeof ev.isCancelled === "boolean"
        ? ev.isCancelled
        : typeof ev.cancelled === "boolean"
          ? ev.cancelled
          : false;

    const cancelNote =
      ev.cancelNote !== undefined ? (ev.cancelNote ?? null) : (ev.cancellationNote ?? null);

    const out = {
      ...ev,
      _id: String(ev._id),
      eventTypeId: ev.eventTypeId ? String(ev.eventTypeId) : "",
      startTime,
      endTime,
      isCancelled,
      cancelNote,
      substitute: ev.substitute ?? null,
      lessons: Array.isArray(ev.lessons) ? ev.lessons : [],
      eventType: eventType
        ? {
            _id: String(eventType._id),
            title: eventType.title ?? "",
            level: eventType.level ?? "",
            price: eventType.price ?? "",
          }
        : undefined,
      venue: venue ?? undefined,
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const db = await dbBLD();
    const events = db.collection("events");

    const patch: any = {};

    // These fields are what your planner is sending today
    if (typeof body.startTime === "string") patch.startTime = body.startTime.trim();
    if (typeof body.endTime === "string") patch.endTime = body.endTime.trim();

    if (typeof body.isCancelled === "boolean") patch.isCancelled = body.isCancelled;
    if (body.cancelNote === null || typeof body.cancelNote === "string") patch.cancelNote = body.cancelNote;

    if (body.substitute === null || typeof body.substitute === "string") patch.substitute = normalizeNullableString(body.substitute);

    if (body.lessons !== undefined) patch.lessons = normalizeLessons(body.lessons);

    patch.updatedAt = new Date();

    const res = await events.updateOne({ _id: new ObjectId(id) }, { $set: patch });
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
