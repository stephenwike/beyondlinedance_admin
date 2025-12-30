import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { dbBLD } from "@/lib/mongo";

function parseYmd(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = parseYmd(url.searchParams.get("from") ?? "");
    const to = parseYmd(url.searchParams.get("to") ?? "");
    const includeCancelled = url.searchParams.get("includeCancelled") === "true";

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
    }

    const db = await dbBLD();

    const match: any = {
      date: { $gte: from, $lte: to },
    };
    if (!includeCancelled) match.isCancelled = { $ne: true };

    const pipeline: any[] = [
      { $match: match },

      // Join event type
      {
        $lookup: {
          from: "event_types",
          localField: "eventTypeId",
          foreignField: "_id",
          as: "eventType",
        },
      },
      { $unwind: { path: "$eventType", preserveNullAndEmptyArrays: true } },

      // Join venue
      {
        $lookup: {
          from: "venues",
          localField: "eventType.venueId",
          foreignField: "_id",
          as: "venue",
        },
      },
      { $unwind: { path: "$venue", preserveNullAndEmptyArrays: true } },

      // Sort: date + startTime
      { $sort: { date: 1, startTime: 1 } },

      // Shape
      {
        $project: {
          _id: 1,
          date: 1,
          startTime: 1,
          endTime: 1,
          isCancelled: 1,
          cancelNote: 1,
          substitute: 1,
          lessons: 1,

          eventType: {
            _id: "$eventType._id",
            title: "$eventType.title",
            level: "$eventType.level",
            price: "$eventType.price",
          },

          venue: {
            _id: "$venue._id",
            name: "$venue.name",
            address: "$venue.address",
            city: "$venue.city",
            state: "$venue.state",
          },
        },
      },
    ];

    const rows = await db.collection("events").aggregate(pipeline).toArray();
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
