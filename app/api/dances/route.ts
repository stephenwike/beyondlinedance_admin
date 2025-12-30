import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export const runtime = "nodejs";

let _client: MongoClient | null = null;

async function getClient() {
    if (_client) return _client;
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Missing MONGODB_URI");
    _client = new MongoClient(uri);
    await _client.connect();
    return _client;
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const q = (url.searchParams.get("q") ?? "").trim();

        if (q.length < 2) {
            return NextResponse.json([]);
        }

        const client = await getClient();
        const db = client.db("ldco");

        // Simple, fast “contains” search.
        // (If you add a text index later, we can switch to $text.)
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        const docs = await db
            .collection("dances")
            .find({ danceName: { $regex: regex } })
            .project({
                _id: 1,
                danceName: 1,
                stepsheet: 1,
                difficulty: 1,
            })
            .limit(12)
            .toArray();

        const out = docs.map((d: any) => ({
            _id: String(d._id),
            danceName: d.danceName ?? "",
            stepsheet: d.stepsheet ?? null,
            difficulty: d.difficulty ?? null,
        }));

        return NextResponse.json(out);
    } catch (e: any) {
        return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
    }
}
