"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Venue = {
  _id: string;
  name: string;
  address: string;
  city: string;
  state: string;
};

type EventType = {
  _id: string;
  legacyId?: string;
  title: string;
  level: string;
  price: string;
  venueId: string;
  defaultStartTime: string;
  defaultDurationMinutes: number;
  isActive: boolean;
};

type Frequency = {
  _id: string;
  eventTypeId: string;
  kind: "WEEKLY" | "MONTHLY_NTH_WEEKDAY";
  byDay?: Array<"SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA">;
  weekday?: "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
  nth?: number;
  startTime: string;
  durationMinutes: number;
  startDate?: string;
  endDate?: string | null;
  isActive: boolean;
};

const DOW_LABEL: Record<string, string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};

function nthLabel(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function frequencySummary(f: Frequency) {
  const time = `${f.startTime} • ${f.durationMinutes}m`;
  const window =
    f.startDate || f.endDate
      ? ` (${f.startDate ?? "any"} → ${f.endDate ?? "open"})`
      : "";

  if (f.kind === "WEEKLY") {
    const days = (f.byDay ?? []).map((d) => DOW_LABEL[d]).join(", ");
    return `Weekly: ${days || "(no days)"} • ${time}${window}`;
  }

  return `Monthly: ${nthLabel(f.nth ?? 1)} ${DOW_LABEL[f.weekday ?? "FR"]} • ${time}${window}`;
}

async function apiPatch(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function EventTypesAdminPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // UI filters
  const [showActiveOnly, setShowActiveOnly] = useState(false); // unchecked by default

  // Create form
  const [form, setForm] = useState({
    legacyId: "",
    title: "",
    level: "All Levels",
    price: "FREE",
    venueId: "",
    defaultStartTime: "5:00 PM",
    defaultDurationMinutes: 180,
    isActive: true,
  });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<null | {
    legacyId: string;
    title: string;
    level: string;
    price: string;
    venueId: string;
    defaultStartTime: string;
    defaultDurationMinutes: number;
    isActive: boolean;
  }>(null);

  const venueById = useMemo(() => {
    const map = new Map<string, Venue>();
    venues.forEach((v) => map.set(v._id, v));
    return map;
  }, [venues]);

  const frequenciesByEventType = useMemo(() => {
    const map = new Map<string, Frequency[]>();
    for (const f of frequencies) {
      const key = String(f.eventTypeId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }

    // stable ordering: active first, then kind, then startTime
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return a.startTime.localeCompare(b.startTime);
      });
      map.set(k, arr);
    }

    return map;
  }, [frequencies]);

  const visibleEventTypes = useMemo(() => {
    return showActiveOnly ? eventTypes.filter((et) => et.isActive) : eventTypes;
  }, [eventTypes, showActiveOnly]);

  async function load() {
    setErr(null);
    try {
      const [v, e, f] = await Promise.all([
        apiGet<Venue[]>("/api/venues"),
        apiGet<EventType[]>("/api/event-types"),
        apiGet<Frequency[]>("/api/frequencies"),
      ]);

      setVenues(v);
      setEventTypes(e);
      setFrequencies(f);

      // default venue for create form
      if (!form.venueId && v.length > 0) {
        setForm((prev) => ({ ...prev, venueId: v[0]._id }));
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        legacyId: form.legacyId.trim() || undefined,
        title: form.title.trim(),
        level: form.level.trim(),
        price: form.price.trim(),
        venueId: form.venueId,
        defaultStartTime: form.defaultStartTime.trim(),
        defaultDurationMinutes: Number(form.defaultDurationMinutes),
        isActive: !!form.isActive,
      };

      await apiPost("/api/event-types", payload);

      setForm((prev) => ({
        ...prev,
        legacyId: "",
        title: "",
      }));

      await load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(et: EventType) {
    setEditingId(et._id);
    setEditForm({
      legacyId: et.legacyId ?? "",
      title: et.title,
      level: et.level,
      price: et.price,
      venueId: String(et.venueId),
      defaultStartTime: et.defaultStartTime,
      defaultDurationMinutes: et.defaultDurationMinutes,
      isActive: !!et.isActive,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editingId || !editForm) return;

    setSaving(true);
    setErr(null);
    try {
      const payload = {
        legacyId: editForm.legacyId.trim() || undefined,
        title: editForm.title.trim(),
        level: editForm.level.trim(),
        price: editForm.price.trim(),
        venueId: editForm.venueId,
        defaultStartTime: editForm.defaultStartTime.trim(),
        defaultDurationMinutes: Number(editForm.defaultDurationMinutes),
        isActive: !!editForm.isActive,
      };

      await apiPatch(`/api/event-types/${editingId}`, payload);
      cancelEdit();
      await load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-gray-600 mt-1">
          (These are <code>event_types</code>.) Frequencies are shown below each event.
        </p>
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Add event</h2>

        {venues.length === 0 ? (
          <p className="text-gray-700 mt-3">
            You need at least one venue first. Go create one in{" "}
            <a className="text-blue-600 underline" href="/admin/venues">
              Venues
            </a>
            .
          </p>
        ) : (
          <form onSubmit={submitCreate} className="mt-3 grid gap-3 max-w-2xl">
            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-2"
                placeholder="Legacy Id (optional)"
                value={form.legacyId}
                onChange={(e) => setForm({ ...form, legacyId: e.target.value })}
              />
              <select
                className="border rounded px-3 py-2"
                value={form.venueId}
                onChange={(e) => setForm({ ...form, venueId: e.target.value })}
              >
                {venues.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <input
              className="border rounded px-3 py-2"
              placeholder="Title (e.g., Charlies Country Night)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-2"
                placeholder="Level (e.g., All Levels)"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Price (e.g., FREE, $5)"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <input
                className="border rounded px-3 py-2"
                placeholder="Default start time (e.g., 5:00 PM)"
                value={form.defaultStartTime}
                onChange={(e) => setForm({ ...form, defaultStartTime: e.target.value })}
              />
              <input
                className="border rounded px-3 py-2"
                type="number"
                min={1}
                placeholder="Duration (minutes)"
                value={form.defaultDurationMinutes}
                onChange={(e) =>
                  setForm({ ...form, defaultDurationMinutes: Number(e.target.value) })
                }
              />
              <label className="flex items-center gap-2 border rounded px-3 py-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>

            <button
              className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
              disabled={
                saving ||
                !form.title.trim() ||
                !form.level.trim() ||
                !form.price.trim() ||
                !form.venueId ||
                !form.defaultStartTime.trim() ||
                !form.defaultDurationMinutes
              }
            >
              {saving ? "Saving..." : "Create"}
            </button>
          </form>
        )}

        {err && <p className="text-red-600 mt-3 whitespace-pre-wrap">{err}</p>}
      </section>

      <section className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Existing events</h2>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
            />
            Show only active
          </label>
        </div>

        <ul className="mt-3 space-y-2">
          {visibleEventTypes.map((et) => {
            const v = venueById.get(String(et.venueId));
            const isEditing = editingId === et._id;

            const freqsForThis = frequenciesByEventType.get(et._id) ?? [];
            const activeFreqs = freqsForThis.filter((f) => f.isActive);
            const inactiveFreqs = freqsForThis.filter((f) => !f.isActive);

            return (
              <li key={et._id} className="border rounded p-3 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium">
                    {et.title}{" "}
                    {!et.isActive && <span className="text-xs text-gray-500">(inactive)</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      className="border rounded px-3 py-1 text-sm"
                      href={`/admin/frequencies?eventTypeId=${et._id}`}
                    >
                      Manage frequencies
                    </a>

                    <button
                      className="border rounded px-3 py-1 text-sm"
                      onClick={() => (isEditing ? cancelEdit() : startEdit(et))}
                      type="button"
                    >
                      {isEditing ? "Close" : "Edit"}
                    </button>
                  </div>
                </div>

                <div className="text-gray-700 text-sm">
                  {et.level} • {et.price}
                </div>

                <div className="text-gray-600 text-sm">
                  Venue: {v ? v.name : String(et.venueId)} • {et.defaultStartTime} •{" "}
                  {et.defaultDurationMinutes}m
                </div>

                {/* Frequencies overview */}
                <div className="rounded border bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Schedule (Frequencies)</div>
                    <a
                      className="text-sm text-blue-600 underline"
                      href={`/admin/frequencies?eventTypeId=${et._id}`}
                    >
                      Edit schedule
                    </a>
                  </div>

                  {freqsForThis.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No frequencies yet. Click “Edit schedule” to add one.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {activeFreqs.length > 0 && (
                        <>
                          <div className="text-xs text-gray-600">Active</div>
                          <ul className="space-y-1">
                            {activeFreqs.map((f) => (
                              <li key={f._id} className="text-sm">
                                • {frequencySummary(f)}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {inactiveFreqs.length > 0 && (
                        <>
                          <div className="text-xs text-gray-600 mt-2">Inactive</div>
                          <ul className="space-y-1">
                            {inactiveFreqs.map((f) => (
                              <li key={f._id} className="text-sm text-gray-500">
                                • {frequencySummary(f)}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && editForm && (
                  <div className="rounded border p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="border rounded px-3 py-2"
                        placeholder="Legacy Id (optional)"
                        value={editForm.legacyId}
                        onChange={(e) => setEditForm({ ...editForm, legacyId: e.target.value })}
                      />

                      <select
                        className="border rounded px-3 py-2"
                        value={editForm.venueId}
                        onChange={(e) => setEditForm({ ...editForm, venueId: e.target.value })}
                      >
                        {venues.map((vn) => (
                          <option key={vn._id} value={vn._id}>
                            {vn.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      className="border rounded px-3 py-2"
                      placeholder="Title"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="border rounded px-3 py-2"
                        placeholder="Level"
                        value={editForm.level}
                        onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}
                      />
                      <input
                        className="border rounded px-3 py-2"
                        placeholder="Price"
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <input
                        className="border rounded px-3 py-2"
                        placeholder="Default start time"
                        value={editForm.defaultStartTime}
                        onChange={(e) =>
                          setEditForm({ ...editForm, defaultStartTime: e.target.value })
                        }
                      />
                      <input
                        className="border rounded px-3 py-2"
                        type="number"
                        min={1}
                        placeholder="Duration minutes"
                        value={editForm.defaultDurationMinutes}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            defaultDurationMinutes: Number(e.target.value),
                          })
                        }
                      />
                      <label className="flex items-center gap-2 border rounded px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!editForm.isActive}
                          onChange={(e) =>
                            setEditForm({ ...editForm, isActive: e.target.checked })
                          }
                        />
                        Active
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                        disabled={saving}
                        onClick={saveEdit}
                        type="button"
                      >
                        {saving ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        className="border rounded px-4 py-2"
                        onClick={cancelEdit}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  id: {et._id}
                  {et.legacyId ? ` • legacyId: ${et.legacyId}` : ""}
                </div>
              </li>
            );
          })}

          {visibleEventTypes.length === 0 && (
            <li className="text-gray-600">No events match the current filter.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
