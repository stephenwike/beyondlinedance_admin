"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function clean(v: string) {
    return v.trim();
}

export default function AddVenuePage() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");

    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const validation = useMemo(() => {
        if (!clean(name)) return "Name is required";
        if (clean(state) && clean(state).length !== 2) return "State should be a 2-letter code (e.g. CO)";
        return null;
    }, [name, state]);

    async function save() {
        setErr(null);
        if (validation) {
            setErr(validation);
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/venues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: clean(name),
                    address: clean(address) || null,
                    city: clean(city) || null,
                    state: clean(state).toUpperCase() || null,
                }),
            });

            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();

            if (!data?.venueId) throw new Error("No venueId returned");

            router.push("/admin/venues");
        } catch (e: any) {
            setErr(e.message ?? String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="p-6 space-y-6 max-w-2xl">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold">Add venue</h1>
                <p className="text-gray-600">Create a venue used by event types and events.</p>
            </header>

            <section className="rounded-lg border p-4 space-y-4">
                <label className="text-sm block">
                    <div className="text-gray-600 mb-1">Name</div>
                    <input
                        className="border rounded px-3 py-2 w-full"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Parker Dance Academy"
                    />
                </label>

                <label className="text-sm block">
                    <div className="text-gray-600 mb-1">Address (optional)</div>
                    <input
                        className="border rounded px-3 py-2 w-full"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="19557 E Parker Square Dr"
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm block">
                        <div className="text-gray-600 mb-1">City (optional)</div>
                        <input
                            className="border rounded px-3 py-2 w-full"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Parker"
                        />
                    </label>

                    <label className="text-sm block">
                        <div className="text-gray-600 mb-1">State (optional)</div>
                        <input
                            className="border rounded px-3 py-2 w-full"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            placeholder="CO"
                            maxLength={2}
                        />
                    </label>
                </div>

                {err && <div className="text-red-600 whitespace-pre-wrap">{err}</div>}

                <div className="flex items-center gap-2">
                    <button
                        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                        onClick={save}
                        disabled={saving || !!validation}
                        type="button"
                    >
                        {saving ? "Saving…" : "Save venue"}
                    </button>

                    <button className="border rounded px-4 py-2" onClick={() => router.push("/admin/venues")} type="button">
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
