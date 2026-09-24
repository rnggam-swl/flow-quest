import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlayContext, getQuestList, scoreSubmission } from "@/lib/questPlay";
import { flowQuestionOf, lastQuestOrder, questOf, quizQuestionsOf } from "@/lib/content/sessionContent";
import { FlowResultClient } from "./FlowResultClient";
import { QuizReview } from "./QuizReview";

export default async function QuestResultPage({ params }: { params: Promise<{ order: string }> }) {
  const order = Number((await params).order);
  if (!Number.isInteger(order) || order < 1) notFound();

  const user = await requireRole("PARTICIPANT");
  const play = await getPlayContext(user.id, user.displayName);
  if (!play) redirect("/brief");
  const { ctx } = play;

  const quest = questOf(ctx.content, order);
  const item = (await getQuestList(ctx.sessionParticipantId, ctx.sessionId, ctx.content)).find((i) => i.order === order);
  if (!quest || !item) redirect("/brief");
  if (item.state !== "completed") redirect(item.state === "available" ? `/quest/${order}` : "/brief");

  const attempt = await prisma.questAttempt.findUniqueOrThrow({
    where: { sessionParticipantId_questId: { sessionParticipantId: ctx.sessionParticipantId, questId: item.questId } },
    include: { QuestionResponse: true },
  });
  const next = order < lastQuestOrder(ctx.content) ? { href: `/quest/${order + 1}`, label: `Lanjut ke Quest ${order + 1} →` } : { href: "/brief", label: "← Kembali ke Session Brief" };

  const reviewed = quizQuestionsOf(quest).map((q) => {
    const r = attempt.QuestionResponse.find((x) => x.questionKey === q.id);
    return { question: q, answer: r?.answer, correct: r?.correct ?? 0, total: r?.total ?? 0 };
  });

  const flow = flowQuestionOf(quest);
  const submission = flow
    ? await prisma.flowSubmission.findUnique({
        where: { teamId_questId: { teamId: ctx.teamId, questId: item.questId } },
        include: { Score: true, FlowNode: true, FlowConnection: true },
      })
    : null;
  // A quest can end (e.g. its timer ran out) before its flow canvas was ever submitted; then only the quiz part has a result.
  if (flow && submission?.Score) {
    // Tier and feedback come from re-running the pinned rubric on the saved canvas; the numbers are the Score saved at submit time.
    const { tier, message, max } = scoreSubmission(ctx.content, quest, submission);
    const reflection = flow.reflection
      ? await prisma.reflection.findFirst({ where: { userId: user.id, sessionId: ctx.sessionId, question: `Kenapa kamu memilih flow ini? (Quest ${order})` } })
      : null;

    return (
      <>
        {reviewed.length > 0 && (
          <div className="mx-auto max-w-[600px] px-5 pt-[50px]">
            <QuizReview items={reviewed} showSummary={false} />
          </div>
        )}
        <FlowResultClient
          submissionId={submission.id}
          questOrder={order}
          timeExpired={submission.status === "TIME_EXPIRED"}
          elapsedSeconds={submission.timeSpentSeconds ?? attempt.timeSpentSeconds ?? 0}
          score={{
            goalScore: submission.Score.goalScore,
            flowScore: submission.Score.flowScore,
            logicScore: submission.Score.logicScore,
            constraintScore: submission.Score.constraintScore,
            edgeCaseScore: submission.Score.edgeCaseScore,
            simplicityScore: submission.Score.simplicityScore,
          }}
          max={max}
          tier={tier}
          message={message}
          reflectionConfig={flow.reflection ?? null}
          existingReflection={reflection?.answer ?? ""}
          nextHref={next.href}
          nextLabel={next.label}
        />
      </>
    );
  }

  const elapsed = attempt.timeSpentSeconds ?? 0;
  return (
    <div className="mx-auto max-w-[600px] px-5 pt-[50px] pb-24">
      <div className="mb-1 text-center text-[12px] font-semibold uppercase tracking-[1.5px] text-teal">
        Quest {order} · {quest.title}
      </div>
      <p className="mb-6 text-center text-[14px] text-muted">
        {attempt.status === "TIME_EXPIRED"
          ? "Waktu habis — soal yang belum dijawab dihitung kosong."
          : `Selesai dalam ${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, "0")}s.`}
      </p>
      {flow && (
        <p className="mb-6 rounded-[10px] border border-border bg-surface px-4 py-3 text-center text-[13.5px] text-muted">
          Flow di quest ini belum sempat dikirim, jadi bagian flow tidak dinilai.
        </p>
      )}
      <QuizReview items={reviewed} showSummary />
      <Link
        href={next.href}
        className="mt-6 block w-full rounded-[9px] bg-teal px-[22px] py-3 text-center text-[14.5px] font-semibold text-[#0A2723] transition-colors hover:bg-[#5EE6D1]"
      >
        {next.label}
      </Link>
    </div>
  );
}
