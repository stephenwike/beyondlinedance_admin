// app/admin/add-event/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Venue = {
  _id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
};

type EventType = {
  _id: string;
  title: string;
  level?: string;
  price?: string;
  venueId?: string;
  venueKey?: string;
  isActive?: boolean;
  defaultStartTime?: string;
  defaultDurationMinutes?: number;
  endDayOffset?: 0 | 1;
};

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function isTime12(s: string) {
  return /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.test(s.trim());
}

function clean(s: any) {
  if (s === null || s === undefined) return "";
  return String(s);
}

function venueLabel(v?: Venue | null) {
  if (!v) return "Unknown venue";
  const cityState =
    v.city && v.state ? ` (${v.city}, ${v.state})` : v.city ? ` (${v.city})` : v.state ? ` (${v.state})` : "";
  return `${v.name}${cityState}`;
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

function minutesToTime12(total: number): string {
  const mins = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const ap = hh24 >= 12 ? "PM" : "AM";
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;
  return `${hh12}:${String(mm).padStart(2, "0")} ${ap}`;
}

function computeEndTimeFromStartAndDuration(startTime: string, durationMinutes: number): string | null {
  const start = parseTime12ToMinutes(startTime);
  if (start === null) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return minutesToTime12(start + durationMinutes);
}

export default function AddOneOffEventPage() {
  const router = useRouter();

  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  // Lookups
  const [venues, setVenues] = useState<Venue[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  // Event creation form
  const [eventTypeId, setEventTypeId] = useState("");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("6:30 PM");
  const [endTime, setEndTime] = useState("8:00 PM");
  const [endDayOffset, setEndDayOffset] = useState<0 | 1>(0);

  // Track whether user has manually edited start/end/offset
  const [touchedTimes, setTouchedTimes] = useState(false);

  // Inline "create event type"
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeTitle, setNewTypeTitle] = useState("");
  const [newTypeVenueId, setNewTypeVenueId] = useState("");
  const [newTypeLevel, setNewTypeLevel] = useState("");
  const [newTypePrice, setNewTypePrice] = useState("");
  const [newTypeActive, setNewTypeActive] = useState(false);

  const [saving, setSaving] = useState(false);
  const [creatingType, setCreatingType] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const venuesById = useMemo(() => {
    const m = new Map<string, Venue>();
    for (const v of venues) m.set(v._id, v);
    return m;
  }, [venues]);

  async function reloadLookups(selectEventTypeId?: string) {
    setLoadingLookups(true);
    setErr(null);
    try {
      const [vRes, etRes] = await Promise.all([fetch("/api/venues"), fetch("/api/event-types")]);

      if (!vRes.ok) throw new Error(await vRes.text());
      if (!etRes.ok) throw new Error(await etRes.text());

      const v = (await vRes.json()) as Venue[];
      const ets = (await etRes.json()) as EventType[];

      const vArr = Array.isArray(v) ? v : [];
      const etArr = Array.isArray(ets) ? ets : [];

      setVenues(vArr);
      setEventTypes(etArr);

      if (!newTypeVenueId && vArr.length) setNewTypeVenueId(vArr[0]._id);

      const preferred = selectEventTypeId?.trim();
      if (preferred) {
        setEventTypeId(preferred);
      } else if (!eventTypeId && etArr.length) {
        setEventTypeId(etArr[0]._id);
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoadingLookups(false);
    }
  }

  useEffect(() => {
    reloadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedType = useMemo(
    () => eventTypes.find((et) => et._id === eventTypeId) ?? null,
    [eventTypes, eventTypeId]
  );

  const selectedTypeVenue = useMemo(() => {
    if (!selectedType?.venueId) return null;
    return venuesById.get(selectedType.venueId) ?? null;
  }, [selectedType, venuesById]);

  // ✅ Auto-populate start/end + endDayOffset defaults from selected event type
  // ONLY when user hasn't manually changed them.
  useEffect(() => {
    if (!selectedType) return;
    if (touchedTimes) return;

    const defStart = (selectedType.defaultStartTime ?? "").trim();
    const defDur = Number(selectedType.defaultDurationMinutes ?? 0);

    // ✅ IMPORTANT FIX: also pull default endDayOffset from the event type
    const defOffset: 0 | 1 = selectedType.endDayOffset === 1 ? 1 : 0;
    setEndDayOffset(defOffset);

    if (defStart && isTime12(defStart)) {
      setStartTime(defStart);

      const computedEnd = computeEndTimeFromStartAndDuration(defStart, defDur);
      if (computedEnd) setEndTime(computedEnd);
    }
  }, [
    selectedType?._id,
    selectedType?.defaultStartTime,
    selectedType?.defaultDurationMinutes,
    selectedType?.endDayOffset,
    touchedTimes,
    selectedType,
  ]);

  const validation = useMemo(() => {
    if (!eventTypeId) return "Event type is required";
    if (!isYmd(date)) return "Date must be YYYY-MM-DD";
    if (!isTime12(startTime)) return "Start time must look like '6:30 PM'";
    if (!isTime12(endTime)) return "End time must look like '8:00 PM'";
    if (endDayOffset !== 0 && endDayOffset !== 1) return "Ends after midnight must be checked or unchecked";
    return null;
  }, [eventTypeId, date, startTime, endTime, endDayOffset]);

  const newTypeValidation = useMemo(() => {
    if (!showNewType) return null;
    if (!newTypeTitle.trim()) return "New event type title is required";
    if (!newTypeVenueId) return "New event type venue is required";
    return null;
  }, [showNewType, newTypeTitle, newTypeVenueId]);

  async function createEvent() {
    setErr(null);
    if (validation) {
      setErr(validation);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/one-off-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId,
          date: date.trim(),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          endDayOffset,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (!data?.eventId) throw new Error("No eventId returned");

      router.push(`/admin/events/${data.eventId}`);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function createEventTypeInline() {
    setErr(null);
    if (newTypeValidation) {
      setErr(newTypeValidation);
      return;
    }

    setCreatingType(true);
    try {
      const res = await fetch("/api/admin/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTypeTitle.trim(),
          venueId: newTypeVenueId,
          level: newTypeLevel.trim() || null,
          price: newTypePrice.trim() || null,
          isActive: !!newTypeActive,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const createdId = String(data?.eventTypeId ?? "").trim();
      if (!createdId) throw new Error("No eventTypeId returned");

      setShowNewType(false);
      setNewTypeTitle("");
      setNewTypeLevel("");
      setNewTypePrice("");
      setNewTypeActive(false);

      // allow defaults to populate again
      setTouchedTimes(false);

      await reloadLookups(createdId);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setCreatingType(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Add event (one-off / special)</h1>
        <p className="text-gray-600">
          Pick an existing Event Type (with venue), or create a new one, then create a single event occurrence and plan lessons.
        </p>
      </header>

      {err && <div className="text-red-600 whitespace-pre-wrap">{err}</div>}

      <section className="rounded-lg border p-4 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Event Type</h2>
          <button
            type="button"
            className="border rounded px-3 py-2 text-sm"
            onClick={() => setShowNewType((v) => !v)}
            disabled={loadingLookups}
          >
            {showNewType ? "Close new event type" : "+ Add new event type"}
          </button>
        </div>

        {loadingLookups ? (
          <div className="text-gray-600">Loading…</div>
        ) : (
          <>
            <label className="text-sm">
              <div className="text-gray-600 mb-1">Select Event Type</div>
              <select
                className="border rounded px-3 py-2 w-full"
                value={eventTypeId}
                onChange={(e) => {
                  setEventTypeId(e.target.value);
                  setTouchedTimes(false); // allow defaults to re-fill (including endDayOffset)
                }}
              >
                {eventTypes.map((et) => {
                  const v = et.venueId ? venuesById.get(et.venueId) : null;
                  const vName = venueLabel(v);
                  return (
                    <option key={et._id} value={et._id}>
                      {et.title} — {vName}
                      {et.isActive === false ? " (inactive)" : ""}
                    </option>
                  );
                })}
              </select>

              {selectedType && (
                <div className="text-xs text-gray-500 mt-1">
                  Venue: {venueLabel(selectedTypeVenue)} • Level: {selectedType.level || "—"} • Price:{" "}
                  {selectedType.price || "—"}
                  {selectedType.endDayOffset === 1 ? " • ends after midnight" : ""}
                </div>
              )}
            </label>

            {showNewType && (
              <div className="rounded border p-3 bg-gray-50 space-y-3">
                <div className="text-sm font-medium">New event type</div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm col-span-2">
                    <div className="text-gray-600 mb-1">Title</div>
                    <input
                      className="border rounded px-3 py-2 w-full bg-white"
                      value={newTypeTitle}
                      onChange={(e) => setNewTypeTitle(e.target.value)}
                      placeholder="e.g. Holiday Special"
                    />
                  </label>

                  <label className="text-sm col-span-2">
                    <div className="text-gray-600 mb-1">Venue</div>
                    <select
                      className="border rounded px-3 py-2 w-full bg-white"
                      value={newTypeVenueId}
                      onChange={(e) => setNewTypeVenueId(e.target.value)}
                    >
                      {venues.map((v) => (
                        <option key={v._id} value={v._id}>
                          {venueLabel(v)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Level (optional)</div>
                    <input
                      className="border rounded px-3 py-2 w-full bg-white"
                      value={newTypeLevel}
                      onChange={(e) => setNewTypeLevel(e.target.value)}
                      placeholder="e.g. Improver"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600 mb-1">Price (optional)</div>
                    <input
                      className="border rounded px-3 py-2 w-full bg-white"
                      value={newTypePrice}
                      onChange={(e) => setNewTypePrice(e.target.value)}
                      placeholder="e.g. $10"
                    />
                  </label>
                </div>

                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={newTypeActive} onChange={(e) => setNewTypeActive(e.target.checked)} />
                  Active (recurring-type) — leave off for specials/one-offs
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                    onClick={createEventTypeInline}
                    disabled={!!newTypeValidation || creatingType}
                  >
                    {creatingType ? "Creating…" : "Create event type"}
                  </button>
                  <button
                    type="button"
                    className="border rounded px-4 py-2"
                    onClick={() => setShowNewType(false)}
                    disabled={creatingType}
                  >
                    Cancel
                  </button>
                </div>

                {newTypeValidation && (
                  <div className="text-xs text-gray-500">
                    Fix: <span className="font-medium">{newTypeValidation}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-4 max-w-3xl">
        <h2 className="font-medium">Occurrence</h2>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">Date</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="text-sm">
            <div className="text-gray-600 mb-1">Start time</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={startTime}
              onChange={(e) => {
                setTouchedTimes(true);
                setStartTime(e.target.value);
              }}
              placeholder="6:30 PM"
            />
          </label>

          <label className="text-sm">
            <div className="text-gray-600 mb-1">End time</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={endTime}
              onChange={(e) => {
                setTouchedTimes(true);
                setEndTime(e.target.value);
              }}
              placeholder="8:00 PM"
            />
          </label>
        </div>

        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={endDayOffset === 1}
            onChange={(e) => {
              setTouchedTimes(true);
              setEndDayOffset(e.target.checked ? 1 : 0);
            }}
          />
          Ends after midnight (next day)
        </label>

        <div className="text-xs text-gray-600">
          Time range: {clean(startTime)} – {clean(endTime)}
          {endDayOffset === 1 ? " (+1 day)" : ""}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            onClick={createEvent}
            disabled={!!validation || saving || loadingLookups}
          >
            {saving ? "Creating…" : "Create & plan"}
          </button>

          <button type="button" className="border rounded px-4 py-2" onClick={() => router.push("/admin")}>
            Cancel
          </button>
        </div>

        {validation && (
          <div className="text-xs text-gray-500">
            Fix: <span className="font-medium">{validation}</span>
          </div>
        )}
      </section>
    </main>
  );
}
