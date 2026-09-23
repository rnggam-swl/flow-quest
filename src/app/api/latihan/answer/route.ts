import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ANSWER_KEY_PATTERN, widgetForAnswerKey } from "@/lib/practice/plan";
import { getPracticeAccess, saveAnswer } from "@/lib/practice/practiceData";

const bodySchema = z.object({
  key: z.string().regex(ANSWER_KEY_PATTERN),
  text: z.string().trim().min(3).max(4000),
});

/** Saves the participant's text for one of the Modul Latihan "write" widgets, so their mentor can read it. */
export async function POST(request: Request) {
  const access = await getPracticeAccess(await getCurrentUser());
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { practice } = access;
  if (widgetForAnswerKey(practice.plan.content, parsed.data.key)?.type !== "write") {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  await saveAnswer(practice.sessionParticipantId, parsed.data.key, parsed.data.text);
  return NextResponse.json({ success: true });
}
