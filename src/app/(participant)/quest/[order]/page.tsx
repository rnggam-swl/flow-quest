import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { loadQuestPage } from "@/lib/questPlay";
import { flowQuestionOf, paletteOf, quizQuestionsOf } from "@/lib/content/sessionContent";
import { questionSeed, revealFor, toPublicAnswer, toPublicQuestion } from "@/lib/content/publicQuestion";
import { QuizPlayer, type PlayerQuestion } from "@/components/quiz/QuizPlayer";
import { PageLoading } from "@/components/ui";

const FlowBuilderCanvas = dynamic(() => import("@/components/FlowBuilderCanvas").then((m) => m.FlowBuilderCanvas), {
  loading: () => <PageLoading />,
});

/**
 * Plays any quest the session's case defines: its quiz questions first, then
 * its flow canvas if it has one. What's sent to the browser never includes the
 * answer keys (see publicQuestion.ts); scoring happens in /api/quest/*.
 */
export default async function QuestPage({ params }: { params: Promise<{ order: string }> }) {
  const order = Number((await params).order);
  if (!Number.isInteger(order) || order < 1) notFound();

  const { user, ctx, quest, attempt, responses, remaining, submission, isLast } = await loadQuestPage(order);
  const questLabel = `Quest ${order} · ${quest.title}`;
  const flow = flowQuestionOf(quest);

  if (submission && flow) {
    return (
      <FlowBuilderCanvas
        submissionId={submission.id}
        questOrder={order}
        questLabel={questLabel}
        scenarioLine={flow.prompt}
        nodeLibrary={paletteOf(ctx.content, flow)}
        library={ctx.content.nodes}
        rubric={flow.rubric}
        resultHref={`/result/${order}`}
        initialViewMode={user.flowViewMode}
        initialNodes={submission.FlowNode.map((n) => ({ id: n.id, label: n.label, nodeType: n.nodeType, positionX: n.positionX, positionY: n.positionY }))}
        initialConnections={submission.FlowConnection.map((c) => ({ id: c.id, sourceNodeId: c.sourceNodeId, targetNodeId: c.targetNodeId, connectionType: c.connectionType }))}
        initialRemainingSeconds={remaining}
      />
    );
  }

  const questions: PlayerQuestion[] = quizQuestionsOf(quest).map((q) => {
    const seed = questionSeed(attempt.id, q.id);
    const response = responses.find((r) => r.questionKey === q.id);
    return {
      question: toPublicQuestion(q, seed),
      answer: response ? toPublicAnswer(q, seed, response.answer) : null,
      reveal: response && quest.checkMode === "instant" ? revealFor(q, seed, response.answer) : null,
    };
  });

  // Instant quests have shown their feedback already, so they go straight on; "end" quests go to their review.
  const finish =
    quest.checkMode === "instant" && !isLast
      ? { href: `/quest/${order + 1}`, label: `Lanjut ke Quest ${order + 1} →` }
      : { href: `/result/${order}`, label: quest.checkMode === "instant" ? "Lihat Hasil →" : "Kirim Jawaban" };

  return (
    <QuizPlayer
      order={order}
      questLabel={questLabel}
      intro={quest.intro}
      checkMode={quest.checkMode}
      questions={questions}
      remainingSeconds={remaining}
      hasFlowAfter={Boolean(flow)}
      finishHref={finish.href}
      finishLabel={finish.label}
    />
  );
}
