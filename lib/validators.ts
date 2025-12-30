import { z } from "zod";

/**
 * Shared validators for BLD admin + API.
 * - Virtual occurrences come from Frequencies
 * - Events are materialized only when planning begins
 * - Unplanned = missing any lesson/dance (or no event doc)
 */

// ---------- helpers ----------

export const ObjectIdString = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a 24-char hex ObjectId");

export const YmdDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const Time12h = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2}\s?(AM|PM)$/i, "Time must look like '6:30 PM'");

export const NullableTrimmedString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  });

export const NonEmptyTrimmedString = z
  .string()
  .transform((v) => String(v).trim())
  .refine((v) => v.length > 0, "Required");

// ---------- core domain ----------

export const VenueInputSchema = z.object({
  name: NonEmptyTrimmedString,
  address: NonEmptyTrimmedString,
  city: NonEmptyTrimmedString,
  state: NonEmptyTrimmedString,
});

export const EventTypeInputSchema = z.object({
  title: NonEmptyTrimmedString,
  level: NullableTrimmedString,
  price: NullableTrimmedString,
  venueId: ObjectIdString,
  isActive: z.boolean().default(true),
  legacyId: NullableTrimmedString.optional(),
});

export const FrequencyKindSchema = z.enum(["WEEKLY", "MONTHLY_NTH_WEEKDAY"]);

export const DayOfWeekSchema = z.enum(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);

export const FrequencyInputSchema = z
  .object({
    eventTypeId: ObjectIdString,
    kind: FrequencyKindSchema,

    // WEEKLY
    byDay: z.array(DayOfWeekSchema).optional(),

    // MONTHLY_NTH_WEEKDAY
    weekday: DayOfWeekSchema.optional(),
    nth: z.number().int().min(1).max(5).optional(),

    // time varies by frequency
    startTime: Time12h,
    durationMinutes: z.number().int().min(1),

    // optional date bounds
    startDate: YmdDate.optional(),
    endDate: YmdDate.nullable().optional(),

    isActive: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "WEEKLY") {
      if (!val.byDay || val.byDay.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["byDay"],
          message: "WEEKLY requires byDay[]",
        });
      }
    }

    if (val.kind === "MONTHLY_NTH_WEEKDAY") {
      if (!val.weekday) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weekday"],
          message: "MONTHLY_NTH_WEEKDAY requires weekday",
        });
      }
      if (!val.nth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nth"],
          message: "MONTHLY_NTH_WEEKDAY requires nth (1-5)",
        });
      }
    }

    // if both provided, enforce startDate <= endDate
    if (val.startDate && val.endDate) {
      if (val.startDate > val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "endDate must be >= startDate",
        });
      }
    }
  });

// ---------- lessons (inside events) ----------

export const LessonSlotSchema = z.object({
  time: NullableTrimmedString, // "5:30 PM" (free-form; you can tighten later)
  dance: NullableTrimmedString, // name string (not danceId)
  level: NullableTrimmedString,
  link: NullableTrimmedString, // URL-ish, kept loose
});

export const LessonsArraySchema = z.array(LessonSlotSchema);

// ---------- API payloads ----------

/**
 * POST /api/events
 * Materialize an Event doc from a virtual occurrence
 * Deterministic key: eventTypeId + date + startTime
 */
export const CreateEventFromOccurrenceSchema = z.object({
  eventTypeId: ObjectIdString,
  date: YmdDate,
  startTime: Time12h,
  durationMinutes: z.number().int().min(1),

  // optional: create with empty slots (Plan Lesson page)
  seedSlots: z.number().int().min(0).max(10).optional(),
});

/**
 * PATCH /api/events/[id]
 * Update event instance fields + lessons array
 */
export const PatchEventSchema = z.object({
  startTime: Time12h.optional(),
  endTime: Time12h.optional(),

  isCancelled: z.boolean().optional(),
  cancelNote: NullableTrimmedString.optional(),
  substitute: NullableTrimmedString.optional(),

  lessons: LessonsArraySchema.optional(),
});

/**
 * GET /api/occurrences
 */
export const OccurrencesQuerySchema = z.object({
  from: YmdDate,
  to: YmdDate,
  onlyUnplanned: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
});

// ---------- status rule helpers ----------

export type PlanStatus = "UNPLANNED" | "PLANNED" | "CANCELLED";

/**
 * Domain rule:
 * - UNPLANNED if: no event doc OR lessons empty OR any slot missing dance
 * - PLANNED if: has event doc AND all lesson slots have dance
 * - CANCELLED if: event doc isCancelled
 */
export function computePlanStatusFromEventDoc(ev: any): PlanStatus {
  if (!ev) return "UNPLANNED";
  if (ev.isCancelled) return "CANCELLED";

  const lessons = Array.isArray(ev.lessons) ? ev.lessons : [];
  if (lessons.length === 0) return "UNPLANNED";

  const missingDance = lessons.some((l: any) => {
    const d = String(l?.dance ?? "").trim();
    return d.length === 0;
  });

  return missingDance ? "UNPLANNED" : "PLANNED";
}
