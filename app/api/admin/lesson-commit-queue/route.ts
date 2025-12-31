import { NextResponse } from "next/server";
import { dbBLD } from "@/lib/mongo";

export const runtime = "nodejs";

function clean(v: any) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

function isYmdString(s: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

function nowDenver() {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = dtf.formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

    const yyyy = get("year");
    const mm = get("month");
    const dd = get("day");
    const HH = Number(get("hour"));
    const Min = Number(get("minute"));

    return {
        ymd: `${yyyy}-${mm}-${dd}`,
        minutes: HH * 60 + Min,
    };
}

function addDaysYmd(ymd: string, days: number) {
    const [y, m, d] = ymd.split("-").map((x) => Number(x));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * If event crosses midnight (endDayOffset===1),
 * lessons with a time earlier than the event start time are on the next day.
 */
function effectiveLessonDate(
    eventDateYmd: string,
    eventStartTime: string | null,
    endDayOffset: number,
    lessonTime: string
) {
    if (endDayOffset !== 1) return eventDateYmd;

    const startM = eventStartTime ? parseTime12ToMinutes(eventStartTime) : null;
    const lessonM = parseTime12ToMinutes(lessonTime);
    if (startM === null || lessonM === null) return eventDateYmd;

    return lessonM < startM ? addDaysYmd(eventDateYmd, 1) : eventDateYmd;
}

function suggestedActionFromPlannedDanceName(danceNameRaw: string) {
    const d = clean(danceNameRaw).toLowerCase();
    if (d === "partner lessons" || d === "partner lesson" || d === "partner dancing") return "SKIP_SUGGESTED";
    return "NONE";
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const countOnly = url.searchParams.get("countOnly") === "true";

        const now = nowDenver();
        const db = await dbBLD();

        const events = await db
            .collection("events")
            .aggregate([
                {
                    $match: {
                        date: { $type: "string", $regex: /^\d{4}-\d{2}-\d{2}$/ },
                        // Strict field only:
                        isCancelled: { $ne: true },
                    },
                },
                {
                    $lookup: {
                        from: "event_types",
                        localField: "eventTypeId",
                        foreignField: "_id",
                        as: "eventType",
                    },
                },
                { $unwind: { path: "$eventType", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "venues",
                        localField: "eventType.venueId",
                        foreignField: "_id",
                        as: "venue",
                    },
                },
                { $unwind: { path: "$venue", preserveNullAndEmptyArrays: true } },
            ])
            .toArray();

        const queue: any[] = [];

        for (const ev of events as any[]) {
            const eventDate = clean(ev.date);
            if (!isYmdString(eventDate)) continue;

            const lessons = Array.isArray(ev.lessons) ? ev.lessons : [];
            if (lessons.length === 0) continue;

            const eventStartTime = typeof ev.startTime === "string" ? ev.startTime : null;
            const endDayOffset = Number(ev.endDayOffset ?? 0);

            for (let i = 0; i < lessons.length; i++) {
                const l = lessons[i] ?? {};
                if (l.committed) continue;

                const lessonTime = typeof l.time === "string" ? l.time : null;
                if (!lessonTime) continue;

                const lessonMinutes = parseTime12ToMinutes(lessonTime);
                if (lessonMinutes === null) continue;

                const lessonDate = effectiveLessonDate(eventDate, eventStartTime, endDayOffset, lessonTime);
                if (!isYmdString(lessonDate)) continue;

                const isPast = lessonDate < now.ymd || (lessonDate === now.ymd && lessonMinutes <= now.minutes);
                if (!isPast) continue;

                const danceId = typeof l.danceId === "string" ? l.danceId : null;
                const danceName = typeof l.dance === "string" ? l.dance : "";
                const suggestedAction = suggestedActionFromPlannedDanceName(danceName);

                queue.push({
                    eventId: String(ev._id),
                    eventTypeTitle: ev.eventType?.title ?? "Event",
                    venueName: ev.venue?.name ?? "Unknown venue",

                    lessonDate,
                    lessonTime,
                    lessonIndex: i,

                    // Planned (what was scheduled)
                    plannedDanceId: danceId,
                    plannedDanceName: danceName || null,
                    level: typeof l.level === "string" ? l.level : null,
                    link: typeof l.link === "string" ? l.link : null,

                    // UI hint only
                    suggestedAction,
                });
            }
        }

        queue.sort((a, b) => {
            if (a.lessonDate !== b.lessonDate) return a.lessonDate < b.lessonDate ? -1 : 1;
            const am = parseTime12ToMinutes(a.lessonTime) ?? 0;
            const bm = parseTime12ToMinutes(b.lessonTime) ?? 0;
            return am - bm;
        });

        if (countOnly) return NextResponse.json({ count: queue.length });
        return NextResponse.json(queue);
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
}
