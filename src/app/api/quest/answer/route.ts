import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quizQuestionsOf } from "@/lib/content/sessionContent";
import { questionSeed, revealFor, toInternalAnswer } from "@/lib/content/publicQuestion";
import { scoreQuestion } from "@/lib/content/questions";
import { getActiveQuest } from "@/lib/questPlay";

const bodySchema = z.object({
  order: z.number().int().positive(),
  questionId: z.string().min(1),
  answer: z.unknown(),
});

/**
 * Saves (and scores) the answer to one quiz question. In "instant" quests the
 * answer is final and the reply reveals the result; in "end" quests it can be
 * changed until the quest is submitted, and nothing is revealed yet.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const active = await getActiveQuest(await getCurrentUser(), parsed.data.order);
  if (!active.ok) return NextResponse.json({ error: active.error }, { status: active.status });
  const { quest, attempt } = active;

  const question = quizQuestionsOf(quest).find((q) => q.id === parsed.data.questionId);
  if (!question) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  const seed = questionSeed(attempt.id, question.id);
  let answer: unknown;
  try {
    answer = toInternalAnswer(question, seed, parsed.data.answer);
  } catch {
    return NextResponse.json({ error: "Jawaban tidak valid" }, { status: 400 });
  }

  const key = { attemptId_questionKey: { attemptId: attempt.id, questionKey: question.id } };
  if (quest.checkMode === "instant" && (await prisma.questionResponse.findUnique({ where: key }))) {
    return NextResponse.json({ error: "Soal ini sudah dijawab" }, { status: 409 });
  }

  const score = scoreQuestion(question, answer);
  const data = { answer: answer as object, correct: score.correct, total: score.total, answeredAt: new Date() };
  await prisma.questionResponse.upsert({
    where: key,
    update: data,
    create: { id: crypto.randomUUID(), attemptId: attempt.id, questionKey: question.id, ...data },
  });

  return NextResponse.json({ reveal: quest.checkMode === "instant" ? revealFor(question, seed, answer) : null });
}
