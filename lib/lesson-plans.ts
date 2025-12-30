// lib/lesson-plans.ts
import { parseTimeToMinutes } from "@/lib/time";

const DAY_TO_INDEX: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function timeToEndTime(startTime: string, durationMinutes: number) {
  const mins = parseTimeToMinutes(startTime);
  if (!Number.isFinite(mins) || mins === Number.MAX_SAFE_INTEGER) return "";

  const end = mins + (Number(durationMinutes) || 0);
  const h24 = Math.floor(end / 60) % 24;
  const m = end % 60;

  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function buildKey(eventTypeId: string, date: string, startTime: string) {
  return `${eventTypeId}|${date}|${startTime}`;
}

function computeUnplanned(eventDoc: any) {
  // Per your domain rule: UNPLANNED if no event OR zero lessons OR any lesson missing dance name
  if (!eventDoc) return true;
  const lessons = Array.isArray(eventDoc.lessons) ? eventDoc.lessons : [];
  if (lessons.length === 0) return true;
  return lessons.some((l: any) => !l?.dance || String(l.dance).trim().length === 0);
}

export type LessonPlanRow = {
  _id: string; // for virtual rows: occurrence key string; for real rows: event _id string
  eventId?: string; // only present if backed by real event doc

  eventTypeId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;

  unplanned: boolean;
  isCancelled: boolean;
  substitute?: string;

  eventType?: any;
  venue?: any;
  frequencies?: any[];
};

export function buildLessonPlanRows(opts: {
  from: string;
  to: string;
  eventTypes: any[];
  frequencies: any[];
  events: any[];
  venues: any[];
}): LessonPlanRow[] {
  const { from, to, eventTypes, frequencies, events, venues } = opts;

  const venuesById = new Map<string, any>();
  for (const v of venues) venuesById.set(String(v._id), v);

  const eventTypeById = new Map<string, any>();
  for (const et of eventTypes) eventTypeById.set(String(et._id), et);

  const freqsByEventTypeId = new Map<string, any[]>();
  for (const f of frequencies) {
    const id = String(f.eventTypeId);
    const arr = freqsByEventTypeId.get(id) ?? [];
    arr.push(f);
    freqsByEventTypeId.set(id, arr);
  }

  const eventByKey = new Map<string, any>();
  for (const e of events) {
    // NOTE: if your event docs store eventTypeId as ObjectId, String() still works.
    const key = buildKey(String(e.eventTypeId), e.date, e.startTime);
    eventByKey.set(key, e);
  }

  const rows: LessonPlanRow[] = [];

  for (const f of frequencies) {
    const eventTypeId = String(f.eventTypeId);
    const et = eventTypeById.get(eventTypeId);
    if (!et?.isActive) continue;

    const freqStart = f.startDate ?? from;
    const freqEnd = f.endDate ?? to;

    const effectiveFrom = freqStart > from ? freqStart : from;
    const effectiveTo = freqEnd < to ? freqEnd : to;

    const startTime = f.startTime ?? et.defaultStartTime;
    const durationMinutes = Number(f.durationMinutes ?? et.defaultDurationMinutes ?? 60);

    const venue = et.venueId ? venuesById.get(String(et.venueId)) : undefined;

    if (f.kind === "WEEKLY") {
      const byDay: string[] = Array.isArray(f.byDay) ? f.byDay : [];
      const allowed = new Set(byDay.map((x) => String(x).toUpperCase()));

      const d0 = new Date(effectiveFrom + "T00:00:00");
      const d1 = new Date(effectiveTo + "T00:00:00");

      for (let d = new Date(d0); d <= d1; d = addDays(d, 1)) {
        const match = Array.from(allowed).some((abbr) => DAY_TO_INDEX[abbr] === d.getDay());
        if (!match) continue;

        const date = ymd(d);
        if (!inRange(date, effectiveFrom, effectiveTo)) continue;

        const key = buildKey(eventTypeId, date, startTime);
        const ev = eventByKey.get(key);

        rows.push({
          _id: ev?._id ? String(ev._id) : key,
          eventId: ev?._id ? String(ev._id) : undefined,

          eventTypeId,
          date,
          startTime,
          durationMinutes,
          endTime: timeToEndTime(startTime, durationMinutes),

          unplanned: computeUnplanned(ev),
          isCancelled: ev?.cancelled === true,
          substitute: ev?.substitute ?? undefined,

          eventType: et,
          venue,
          frequencies: freqsByEventTypeId.get(eventTypeId) ?? [],
        });
      }
    }

    if (f.kind === "MONTHLY_NTH_WEEKDAY") {
      const weekday = String(f.weekday ?? "").toUpperCase();
      const nth = Number(f.nth ?? 1);

      const targetDow = DAY_TO_INDEX[weekday];
      if (targetDow == null) continue;

      const d0 = new Date(effectiveFrom + "T00:00:00");
      const d1 = new Date(effectiveTo + "T00:00:00");

      for (
        let cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
        cur <= d1;
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      ) {
        const year = cur.getFullYear();
        const month = cur.getMonth();

        let first = new Date(year, month, 1);
        while (first.getDay() !== targetDow) first = addDays(first, 1);

        const target = addDays(first, (nth - 1) * 7);
        if (target.getMonth() !== month) continue;

        const date = ymd(target);
        if (!inRange(date, effectiveFrom, effectiveTo)) continue;

        const key = buildKey(eventTypeId, date, startTime);
        const ev = eventByKey.get(key);

        rows.push({
          _id: ev?._id ? String(ev._id) : key,
          eventId: ev?._id ? String(ev._id) : undefined,

          eventTypeId,
          date,
          startTime,
          durationMinutes,
          endTime: timeToEndTime(startTime, durationMinutes),

          unplanned: computeUnplanned(ev),
          isCancelled: ev?.cancelled === true,
          substitute: ev?.substitute ?? undefined,

          eventType: et,
          venue,
          frequencies: freqsByEventTypeId.get(eventTypeId) ?? [],
        });
      }
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
  });

  return rows;
}
