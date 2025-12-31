import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen grid grid-cols-[240px_1fr]">
            <aside className="border-r p-4">
                <div className="font-semibold text-lg">BLD Admin</div>

                <nav className="mt-4 space-y-2 text-sm">
                    <Link className="block text-blue-600" href="/admin">Lesson Plans</Link>
                    <Link className="block text-blue-600" href="/admin/events">Calendar (Events)</Link>
                    <Link className="block text-blue-600" href="/admin/event-types">Events (Types)</Link>
                    <Link className="block text-blue-600" href="/admin/venues">Venues</Link>
                </nav>

                <div className="mt-6 text-xs text-gray-500">
                    “Events” here means your <code>event_types</code>.
                </div>
            </aside>

            <main>{children}</main>
        </div>
    );
}
