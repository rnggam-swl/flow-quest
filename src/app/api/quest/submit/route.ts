import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { flowQuestionOf, quizQuestionsOf } from "@/lib/content/sessionContent";
import { completeAttempt, getActiveQuest } from "@/lib/questPlay";

const bodySchema = z.object({ order: z.number().int().positive() });

/** Completes a quiz-only quest once every question has an answer. Flow quests complete by submitting the canvas instead. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const active = await getActiveQuest(await getCurrentUser(), parsed.data.order);
  if (!active.ok) return NextResponse.json({ error: active.error }, { status: active.status });
  const { quest, attempt, ctx } = active;
  if (flowQuestionOf(quest)) return NextResponse.json({ error: "Quest ini selesai lewat kanvas flow" }, { status: 400 });

  const answered = new Set(
    (await prisma.questionResponse.findMany({ where: { attemptId: attempt.id }, select: { questionKey: true } })).map((r) => r.questionKey)
  );
  const missing = quizQuestionsOf(quest).filter((q) => !answered.has(q.id));
  if (missing.length) return NextResponse.json({ error: `Masih ada ${missing.length} soal yang belum dijawab` }, { status: 400 });

  await completeAttempt(attempt, quest, ctx, false);
  return NextResponse.json({ ok: true });
}
