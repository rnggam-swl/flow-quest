import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { planParts } from "@/lib/practice/plan";
import { getPracticeAccess, markPartDone } from "@/lib/practice/practiceData";

const bodySchema = z.object({ part: z.string() });

/** Marks one Modul Latihan part — a module key ("A".."F") or "main" — as finished. */
export async function POST(request: Request) {
  const access = await getPracticeAccess(await getCurrentUser());
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { practice } = access;
  if (!planParts(practice.plan.content).includes(parsed.data.part)) {
    return NextResponse.json({ error: "Unknown part" }, { status: 400 });
  }

  const completedParts = await markPartDone(practice.sessionParticipantId, parsed.data.part);
  return NextResponse.json({ completedParts });
}
