"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Venue = {
    _id: string;
    name: string;
    address: string;
    city: string;
    state: string;
};

export default function VenuesAdminPage() {
    const [venues, setVenues] = useState<Venue[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [form, setForm] = useState({ name: "", address: "", city: "Denver", state: "CO" });
    const [saving, setSaving] = useState(false);

    async function load() {
        setErr(null);
        try {
            const data = await apiGet<Venue[]>("/api/venues");
            setVenues(data);
        } catch (e: any) {
            setErr(e.message ?? String(e));
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setErr(null);
        try {
            await apiPost("/api/venues", form);
            setForm({ name: "", address: "", city: "Denver", state: "CO" });
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
                <h1 className="text-2xl font-semibold">Venues</h1>
                <p className="text-gray-600 mt-1">Create venues used by event types.</p>
            </header>

            <section className="rounded-lg border p-4">
                <h2 className="font-medium">Add venue</h2>
                <form onSubmit={submit} className="mt-3 grid gap-3 max-w-xl">
                    <input className="border rounded px-3 py-2" placeholder="Name"
                        value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <input className="border rounded px-3 py-2" placeholder="Address"
                        value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                    <div className="grid grid-cols-2 gap-3">
                        <input className="border rounded px-3 py-2" placeholder="City"
                            value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                        <input className="border rounded px-3 py-2" placeholder="State (CO)"
                            value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                    </div>
                    <button
                        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                        disabled={saving || !form.name || !form.address || !form.city || form.state.length !== 2}
                    >
                        {saving ? "Saving..." : "Create"}
                    </button>
                </form>

                {err && <p className="text-red-600 mt-3 whitespace-pre-wrap">{err}</p>}
            </section>

            <section className="rounded-lg border p-4">
                <h2 className="font-medium">Existing venues</h2>
                <ul className="mt-3 space-y-2">
                    {venues.map((v) => (
                        <li key={v._id} className="border rounded p-3">
                            <div className="font-medium">{v.name}</div>
                            <div className="text-gray-600 text-sm">
                                {v.address} — {v.city}, {v.state}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">id: {v._id}</div>
                        </li>
                    ))}
                    {venues.length === 0 && <li className="text-gray-600">No venues yet.</li>}
                </ul>
            </section>
        </main>
    );
}
