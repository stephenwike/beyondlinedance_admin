import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

export const runtime = "nodejs";

let _client: MongoClient | null = null;

async function getClient() {
  if (_client) return _client;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  _client = new MongoClient(uri);
  await _client.connect();
  return _client;
}

type Frequency = {
  _id: ObjectId;
  eventTypeId: ObjectId;
  kind: "WEEKLY" | "MONTHLY_NTH_WEEKDAY";
  byDay?: Array<"SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA">;
  weekday?: "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
  nth?: number;

  // important: time varies by frequency
  startTime: string;
  durationMinutes: number;

  startDate?: string;
  endDate?: string | null;
  isActive: boolean;
};

const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function* eachDayInclusive(start: Date, end: Date) {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    yield new Date(d);
    d.setDate(d.getDate() + 1);
  }
}

function clampRangeByFreq(rangeStart: Date, rangeEnd: Date, fStart?: string, fEnd?: string | null) {
  const a = new Date(rangeStart);
  const b = new Date(rangeEnd);
  if (fStart) {
    const fs = new Date(fStart + "T00:00:00");
    if (fs > a) a.setTime(fs.getTime());
  }
  if (fEnd) {
    const fe = new Date(fEnd + "T23:59:59");
    if (fe < b) b.setTime(fe.getTime());
  }
  return { start: a, end: b };
}

function nthWeekdayOfMonth(year: number, monthIndex0: number, weekday: number, nth: number): Date | null {
  const first = new Date(year, monthIndex0, 1);
  const firstDow = first.getDay();
  const delta = (weekday - firstDow + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  const candidate = new Date(year, monthIndex0, day);
  if (candidate.getMonth() !== monthIndex0) return null;
  return candidate;
}

function endTimeFromStartAndDuration(startTime: string, durationMinutes: number) {
  // Keep it simple: if parsing fails, return null
  const m = startTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();

  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;

  const startMins = hh * 60 + mm;
  const endMins = startMins + Number(durationMinutes || 0);

  const hh24 = ((Math.floor(endMins / 60) % 24) + 24) % 24;
  const endMM = ((endMins % 60) + 60) % 60;

  const endAP = hh24 >= 12 ? "PM" : "AM";
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;

  return `${hh12}:${String(endMM).padStart(2, "0")} ${endAP}`;
}

// ✅ UNPLANNED rule: missing *any* lesson (no doc, no slots, or any slot missing dance)
function computeStatus(ev: any) {
  if (!ev) return "UNPLANNED";
  if (ev.isCancelled) return "CANCELLED";

  const lessons = Array.isArray(ev.lessons) ? ev.lessons : [];
  if (lessons.length === 0) return "UNPLANNED";

  const missingDance = lessons.some((l: any) => String(l?.dance ?? "").trim().length === 0);
  if (missingDance) return "UNPLANNED";

  return "PLANNED";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = parseYmd(url.searchParams.get("from") ?? "");
    const to = parseYmd(url.searchParams.get("to") ?? "");
    const onlyUnplanned = url.searchParams.get("onlyUnplanned") === "true";

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
    }

    const rangeStart = new Date(from + "T00:00:00");
    const rangeEnd = new Date(to + "T00:00:00");

    const client = await getClient();
    const bld = client.db("bld");

    // 1) Active event types
    const eventTypes = await bld
      .collection("event_types")
      .find({ isActive: true })
      .project({ title: 1, level: 1, price: 1, venueId: 1 })
      .toArray();

    const eventTypeById = new Map(eventTypes.map((et: any) => [String(et._id), et]));
    const eventTypeIds = eventTypes.map((et: any) => et._id);

    // 2) Active frequencies for active event types
    const freqs = (await bld
      .collection<Frequency>("frequencies")
      .find({ isActive: true, eventTypeId: { $in: eventTypeIds } })
      .toArray()) as Frequency[];

    // 3) Expand into occurrences
    const occurrences: any[] = [];

    for (const f of freqs) {
      const et = eventTypeById.get(String(f.eventTypeId));
      if (!et) continue;

      const { start, end } = clampRangeByFreq(rangeStart, rangeEnd, f.startDate, f.endDate ?? null);
      if (start > end) continue;

      if (f.kind === "WEEKLY") {
        const wanted = new Set((f.byDay ?? []).map((d) => DOW[d]));
        for (const d of eachDayInclusive(start, end)) {
          if (!wanted.has(d.getDay())) continue;

          const date = ymd(d);
          occurrences.push({
            key: `${String(f.eventTypeId)}|${date}|${f.startTime}`,
            eventTypeId: String(f.eventTypeId),
            frequencyId: String(f._id),
            date,
            startTime: f.startTime,
            endTime: endTimeFromStartAndDuration(f.startTime, f.durationMinutes),
            durationMinutes: f.durationMinutes,
            eventType: {
              _id: String(et._id),
              title: et.title,
              level: et.level,
              price: et.price,
              venueId: et.venueId ? String(et.venueId) : null,
            },
          });
        }
      }

      if (f.kind === "MONTHLY_NTH_WEEKDAY") {
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

        while (cursor <= endMonth) {
          const target = nthWeekdayOfMonth(
            cursor.getFullYear(),
            cursor.getMonth(),
            DOW[f.weekday!],
            f.nth!
          );

          if (target && target >= start && target <= end) {
            const date = ymd(target);
            occurrences.push({
              key: `${String(f.eventTypeId)}|${date}|${f.startTime}`,
              eventTypeId: String(f.eventTypeId),
              frequencyId: String(f._id),
              date,
              startTime: f.startTime,
              endTime: endTimeFromStartAndDuration(f.startTime, f.durationMinutes),
              durationMinutes: f.durationMinutes,
              eventType: {
                _id: String(et._id),
                title: et.title,
                level: et.level,
                price: et.price,
                venueId: et.venueId ? String(et.venueId) : null,
              },
            });
          }

          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }

    // 4) Load events in the range to overlay
    const events = await bld
      .collection("events")
      .find({ date: { $gte: from, $lte: to } })
      .project({
        _id: 1,
        eventTypeId: 1,
        date: 1,
        startTime: 1,
        endTime: 1,
        isCancelled: 1,
        cancelNote: 1,
        substitute: 1,
        lessons: 1,
      })
      .toArray();

    const eventByKey = new Map<string, any>();
    for (const ev of events) {
      const key = `${String(ev.eventTypeId)}|${ev.date}|${ev.startTime}`;
      eventByKey.set(key, ev);
    }

    // 5) Merge + compute status
    const out = occurrences
      .map((o) => {
        const ev = eventByKey.get(o.key);
        const status = computeStatus(ev);

        return {
          // occurrence identity
          key: o.key,
          eventTypeId: o.eventTypeId,
          frequencyId: o.frequencyId,
          date: o.date,
          startTime: o.startTime,
          endTime: ev?.endTime ?? o.endTime, // event overrides if present
          durationMinutes: o.durationMinutes,

          // overlays
          eventId: ev?._id ? String(ev._id) : null,
          isCancelled: !!ev?.isCancelled,
          cancelNote: ev?.cancelNote ?? null,
          substitute: ev?.substitute ?? null,
          lessons: Array.isArray(ev?.lessons) ? ev.lessons : [],

          // metadata
          eventType: o.eventType,

          // ✅ status
          status,
        };
      })
      .filter((x) => (onlyUnplanned ? x.status === "UNPLANNED" : true))
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
