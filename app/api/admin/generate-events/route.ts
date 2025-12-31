// import { NextResponse } from "next/server";
// import { ObjectId } from "mongodb";
// import { dbBLD } from "@/lib/mongo";
// import { GenerateEventsSchema } from "@/lib/validators";

// type Frequency =
//     | {
//         _id: ObjectId;
//         eventTypeId: ObjectId;
//         kind: "WEEKLY";
//         byDay: Array<"SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA">;
//         startTime: string;
//         durationMinutes: number;
//         startDate?: string;
//         endDate?: string | null;
//         isActive: boolean;
//     }
//     | {
//         _id: ObjectId;
//         eventTypeId: ObjectId;
//         kind: "MONTHLY_NTH_WEEKDAY";
//         nth: number;
//         weekday: "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
//         startTime: string;
//         durationMinutes: number;
//         startDate?: string;
//         endDate?: string | null;
//         isActive: boolean;
//     };

// const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// function ymd(d: Date): string {
//     const yyyy = d.getFullYear();
//     const mm = String(d.getMonth() + 1).padStart(2, "0");
//     const dd = String(d.getDate()).padStart(2, "0");
//     return `${yyyy}-${mm}-${dd}`;
// }

// function parseTime12h(time: string): { hour24: number; minute: number } {
//     const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
//     if (!m) throw new Error(`Invalid time format: ${time}`);
//     let h = Number(m[1]);
//     const min = Number(m[2]);
//     const ampm = m[3].toUpperCase();
//     if (h === 12) h = 0;
//     if (ampm === "PM") h += 12;
//     return { hour24: h, minute: min };
// }

// function formatTime12h(hour24: number, minute: number): string {
//     const ampm = hour24 >= 12 ? "PM" : "AM";
//     let h = hour24 % 12;
//     if (h === 0) h = 12;
//     const mm = String(minute).padStart(2, "0");
//     return `${h}:${mm} ${ampm}`;
// }

// function addMinutesToTime(startTime: string, minutesToAdd: number): string {
//     const { hour24, minute } = parseTime12h(startTime);
//     const total = hour24 * 60 + minute + minutesToAdd;
//     const endTotal = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
//     const endH = Math.floor(endTotal / 60);
//     const endM = endTotal % 60;
//     return formatTime12h(endH, endM);
// }

// function clampRangeByFreq(rangeStart: Date, rangeEnd: Date, fStart?: string, fEnd?: string | null) {
//     const a = new Date(rangeStart);
//     const b = new Date(rangeEnd);
//     if (fStart) {
//         const fs = new Date(fStart + "T00:00:00");
//         if (fs > a) a.setTime(fs.getTime());
//     }
//     if (fEnd) {
//         const fe = new Date(fEnd + "T23:59:59");
//         if (fe < b) b.setTime(fe.getTime());
//     }
//     return { start: a, end: b };
// }

// function* eachDayInclusive(start: Date, end: Date) {
//     const d = new Date(start);
//     d.setHours(0, 0, 0, 0);
//     const e = new Date(end);
//     e.setHours(0, 0, 0, 0);
//     while (d <= e) {
//         yield new Date(d);
//         d.setDate(d.getDate() + 1);
//     }
// }

// function nthWeekdayOfMonth(year: number, monthIndex0: number, weekday: number, nth: number): Date | null {
//     const first = new Date(year, monthIndex0, 1);
//     const firstDow = first.getDay();
//     const delta = (weekday - firstDow + 7) % 7;
//     const day = 1 + delta + (nth - 1) * 7;
//     const candidate = new Date(year, monthIndex0, day);
//     if (candidate.getMonth() !== monthIndex0) return null;
//     return candidate;
// }

// export async function POST(req: Request) {
//     try {
//         const body = await req.json();
//         const parsed = GenerateEventsSchema.safeParse(body);
//         if (!parsed.success) {
//             return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
//         }

//         const rangeStart = new Date(parsed.data.from + "T00:00:00");
//         const rangeEnd = new Date(parsed.data.to + "T00:00:00");

//         if (rangeStart > rangeEnd) {
//             return NextResponse.json({ error: "`from` must be <= `to`" }, { status: 400 });
//         }

//         const db = await dbBLD();

//         const freqs = (await db
//             .collection<Frequency>("frequencies")
//             .find({ isActive: true })
//             .toArray()) as Frequency[];

//         // optional: only generate for active event types
//         const activeTypeIds = new Set(
//             (await db.collection("event_types").find({ isActive: true }, { projection: { _id: 1 } }).toArray()).map(
//                 (d: any) => String(d._id)
//             )
//         );

//         const ops: any[] = [];

//         for (const f of freqs) {
//             if (!activeTypeIds.has(String(f.eventTypeId))) continue;

//             const { start, end } = clampRangeByFreq(rangeStart, rangeEnd, f.startDate, f.endDate ?? null);
//             if (start > end) continue;

//             const endTime = addMinutesToTime(f.startTime, f.durationMinutes);

//             if (f.kind === "WEEKLY") {
//                 const wanted = new Set((f.byDay ?? []).map((d) => DOW[d]));
//                 for (const d of eachDayInclusive(start, end)) {
//                     if (!wanted.has(d.getDay())) continue;

//                     const dateStr = ymd(d);

//                     ops.push({
//                         updateOne: {
//                             filter: { eventTypeId: f.eventTypeId, date: dateStr, startTime: f.startTime },
//                             update: {
//                                 $setOnInsert: {
//                                     eventTypeId: f.eventTypeId,
//                                     date: dateStr,
//                                     startTime: f.startTime,
//                                     endTime,
//                                     isCancelled: false,
//                                     cancelNote: null,
//                                     substitute: null,
//                                 },
//                             },
//                             upsert: true,
//                         },
//                     });
//                 }
//             }

//             if (f.kind === "MONTHLY_NTH_WEEKDAY") {
//                 const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
//                 const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

//                 while (cursor <= endMonth) {
//                     const year = cursor.getFullYear();
//                     const month = cursor.getMonth();
//                     const target = nthWeekdayOfMonth(year, month, DOW[f.weekday], f.nth);

//                     if (target && target >= start && target <= end) {
//                         const dateStr = ymd(target);

//                         ops.push({
//                             updateOne: {
//                                 filter: { eventTypeId: f.eventTypeId, date: dateStr, startTime: f.startTime },
//                                 update: {
//                                     $setOnInsert: {
//                                         eventTypeId: f.eventTypeId,
//                                         date: dateStr,
//                                         startTime: f.startTime,
//                                         endTime,
//                                         isCancelled: false,
//                                         cancelNote: null,
//                                         substitute: null,
//                                     },
//                                 },
//                                 upsert: true,
//                             },
//                         });
//                     }

//                     cursor.setMonth(cursor.getMonth() + 1);
//                 }
//             }
//         }

//         if (ops.length === 0) {
//             return NextResponse.json({ ok: true, upserted: 0, note: "No frequencies produced events in that range." });
//         }

//         const res = await db.collection("events").bulkWrite(ops, { ordered: false });

//         return NextResponse.json({
//             ok: true,
//             upserted: res.upsertedCount,
//             matched: res.matchedCount,
//             modified: res.modifiedCount,
//             ops: ops.length,
//         });
//     } catch (e: any) {
//         return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
//     }
// }
