import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Insight from "@/lib/models/Insight";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get("meetingId");

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const insights = await Insight.find({ meetingId })
      .sort({ timestamp: -1 })
      .limit(50);

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("Error fetching insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      meetingId,
      text,
      category,
      urgency,
      confidence,
      speakerId,
      speakerName,
      context,
    } = body;

    if (!meetingId || !text || !category || !urgency || confidence === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await dbConnect();

    const insight = new Insight({
      meetingId,
      text,
      category,
      urgency,
      confidence,
      speakerId,
      speakerName,
      context,
      timestamp: new Date(),
      processedAt: new Date(),
    });

    await insight.save();

    return NextResponse.json({ insight });
  } catch (error) {
    console.error("Error creating insight:", error);
    return NextResponse.json(
      { error: "Failed to create insight" },
      { status: 500 }
    );
  }
}

