// lib/time.ts

export function parseTimeToMinutes(t: string): number {
    const s = (t || "").trim().toUpperCase();
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
    if (!m) return Number.MAX_SAFE_INTEGER;

    let hour = Number(m[1]);
    const min = Number(m[2] ?? "0");
    const ampm = m[3];

    if (hour === 12) hour = 0;
    if (ampm === "PM") hour += 12;

    return hour * 60 + min;
}
