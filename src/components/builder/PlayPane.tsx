"use client";

import { useMemo, useState } from "react";
import { FlowBuilderCanvas, localPersistence, type CanvasGraph } from "@/components/FlowBuilderCanvas";
import { QuizPlayer, type QuizTransport } from "@/components/quiz/QuizPlayer";
import { MediaList, QuestionInput } from "@/components/quiz/QuestionInputs";
import { RichText } from "@/components/RichText";
import { emptyAnswer, isAnswered } from "@/lib/content/answerState";
import type { CaseNode, QuestContent } from "@/lib/content/case";
import { describeAnswer, describeCorrectAnswer } from "@/lib/content/describe";
import { revealFor, toInternalAnswer, toPublicQuestion, type Reveal } from "@/lib/content/publicQuestion";
import { flowQuestionOf, paletteItems, quizQuestionsOf } from "@/lib/content/questHelpers";
import { scoreQuestion, type Question, type QuizQuestion } from "@/lib/content/questions";
import { RUBRIC_CATEGORIES, graphFromFlow, scoreFlow, type RubricResult } from "@/lib/content/rubric";
import { RUBRIC_CATEGORY_LABELS } from "@/lib/content/rubricDescribe";
import { TIER_LABELS } from "@/lib/flowScoring";
import { cx } from "./fields";
import s from "./builder.module.css";

/**
 * Preview and Play: the author sees exactly what a participant sees — the
 * participant's own components, dark theme and all — but every answer is
 * scored right here in the browser and nothing is saved or logged.
 */

const SEED = "builder-preview";

function Frame({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cx(s.previewFrame, s.darkZone)}>
      <div className={s.previewBar}>
        <span>👁 {title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function FlowResultCard({ result }: { result: RubricResult }) {
  const max = RUBRIC_CATEGORIES.reduce((sum, c) => sum + result.max[c], 0);
  return (
    <div className="rounded-[14px] border border-border bg-surface p-5">
      <div className="mb-1 text-[12px] uppercase tracking-[1px] text-muted2">Hasil flow</div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="font-display text-[22px] font-semibold">
          {TIER_LABELS[result.tier].badge} {TIER_LABELS[result.tier].label}
        </div>
        <div className="text-[20px] font-bold text-gold">
          {result.total} <span className="text-[13px] text-muted">/ {max}</span>
        </div>
      </div>
      <p className="mb-3 text-[14px] leading-[1.6] text-muted">{result.message}</p>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        {RUBRIC_CATEGORIES.filter((c) => result.max[c] > 0).map((c) => (
          <div key={c} className="flex justify-between rounded-lg bg-surface2 px-3 py-2">
            <span className="text-muted">{RUBRIC_CATEGORY_LABELS[c]}</span>
            <b>
              {result.scores[c]} / {result.max[c]}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowPlay({ question, nodes, onDone, height }: { question: Extract<Question, { type: "flow" }>; nodes: CaseNode[]; onDone: (r: RubricResult) => void; height: string }) {
  return (
    <FlowBuilderCanvas
      sandbox
      persistence={localPersistence}
      questOrder={0}
      questLabel="Pratinjau"
      scenarioLine={question.prompt || "—"}
      nodeLibrary={paletteItems(nodes, question.palette)}
      library={nodes}
      rubric={question.rubric}
      initialNodes={[]}
      initialConnections={[]}
      initialRemainingSeconds={null}
      initialViewMode="HORIZONTAL"
      onSubmitted={(g: CanvasGraph) => onDone(scoreFlow(question.rubric, graphFromFlow(g.nodes, g.connections, nodes)))}
      heightClassName={height}
    />
  );
}

/** One question as the participant sees it, with a local "check" button. */
export function QuestionPreview({ question, checkMode, nodes }: { question: Question; checkMode: "instant" | "end"; nodes: CaseNode[] }) {
  const [answer, setAnswer] = useState<unknown>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [flowResult, setFlowResult] = useState<RubricResult | null>(null);
  const [run, setRun] = useState(0);

  if (question.type === "flow") {
    return (
      <Frame title="Pratinjau soal flow — kirim flow untuk melihat nilainya" right={<button type="button" className={cx(s.btn, s.btnGhost)} style={{ color: "#f3f0e8" }} onClick={() => (setFlowResult(null), setRun((r) => r + 1))}>Ulangi</button>}>
        {flowResult ? (
          <div className={s.previewBody}>
            <FlowResultCard result={flowResult} />
          </div>
        ) : (
          <FlowPlay key={run} question={question} nodes={nodes} onDone={setFlowResult} height="h-[620px]" />
        )}
      </Frame>
    );
  }

  const pq = toPublicQuestion(question, SEED);
  const value = answer ?? emptyAnswer(pq);
  const fullyRight = reveal ? reveal.score.total > 0 && reveal.score.correct === reveal.score.total : false;
  function check() {
    try {
      setReveal(revealFor(question as QuizQuestion, SEED, toInternalAnswer(question as QuizQuestion, SEED, value)));
    } catch {
      setReveal(null);
    }
  }
  return (
    <Frame title={`Pratinjau · mode ${checkMode === "instant" ? "cek langsung" : "cek di akhir"}`}>
      <div className={s.previewBody}>
        <div className="mx-auto max-w-[600px]">
          <h2 className="mb-2 font-display text-[26px] font-semibold leading-tight">{question.prompt || <span className="text-muted2">(pertanyaan belum diisi)</span>}</h2>
          {question.help && <p className="-mt-1 mb-3 text-[13.5px] text-muted">{question.help}</p>}
          <MediaList media={question.media} className="mb-4" />
          <div className="mb-6 mt-5">
            <QuestionInput key={run} question={pq} value={value} onChange={setAnswer} reveal={reveal} />
          </div>
          {reveal && (
            <div className={`mb-5 rounded-[10px] border px-4 py-3.5 text-[14px] leading-[1.6] ${fullyRight ? "border-success bg-[rgba(123,201,126,0.1)]" : "border-gold bg-[rgba(240,172,63,0.1)]"}`}>
              <b>{fullyRight ? "✓ Benar!" : `${reveal.score.correct} dari ${reveal.score.total} benar`}</b>
              {reveal.feedback.map((f, i) => (
                <RichText key={i} source={f} paragraphClassName="mt-1.5" listClassName="mt-1.5 list-disc pl-5" />
              ))}
              {checkMode === "end" && <p className="mt-2 text-[12.5px] text-muted2">Di mode cek di akhir, peserta melihat ini di halaman hasil setelah mengirim.</p>}
            </div>
          )}
          <div className="flex gap-3">
            {reveal ? (
              <button type="button" className="rounded-[10px] border border-border-light px-5 py-2.5 text-[14px] font-semibold text-text" onClick={() => (setReveal(null), setAnswer(null), setRun((r) => r + 1))}>
                Ulangi
              </button>
            ) : (
              <button type="button" disabled={!isAnswered(pq, value)} className="rounded-[10px] bg-teal px-5 py-2.5 text-[14px] font-semibold text-ink disabled:opacity-40" onClick={check}>
                Cek Jawaban
              </button>
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}

type Played = { question: QuizQuestion; answer: unknown };

/** The whole quest from the first question, as a participant plays it. */
export function QuestPlay({ quest, nodes }: { quest: QuestContent; nodes: CaseNode[] }) {
  const quiz = useMemo(() => quizQuestionsOf(quest), [quest]);
  const flow = flowQuestionOf(quest);
  const [phase, setPhase] = useState<"quiz" | "flow" | "result">(quiz.length ? "quiz" : flow ? "flow" : "result");
  const [timedOut, setTimedOut] = useState(false);
  const [flowResult, setFlowResult] = useState<RubricResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, Played>>({});

  const transport: QuizTransport = {
    async answer(questionId, raw) {
      const q = quiz.find((x) => x.id === questionId);
      if (!q) return { ok: false, error: "Soal tidak ditemukan" };
      try {
        const internal = toInternalAnswer(q, SEED, raw);
        setAnswers((a) => ({ ...a, [q.id]: { question: q, answer: internal } }));
        return { ok: true, reveal: quest.checkMode === "instant" ? revealFor(q, SEED, internal) : null };
      } catch {
        return { ok: false, error: "Jawaban tidak valid" };
      }
    },
    async finish() {
      setPhase(flow ? "flow" : "result");
    },
    timeUp() {
      setTimedOut(true);
      setPhase("result");
    },
  };

  const label = `Quest ${quest.order} · ${quest.title}`;
  if (phase === "quiz") {
    return (
      <Frame title="Main quest — jawaban dinilai di browser, tidak ada yang disimpan">
        <QuizPlayer
          order={quest.order}
          questLabel={label}
          intro={quest.intro}
          checkMode={quest.checkMode}
          rewards={quest.rewards}
          questions={quiz.map((q) => ({ question: toPublicQuestion(q, SEED), answer: null, reveal: null }))}
          remainingSeconds={quest.timeLimitMinutes ? quest.timeLimitMinutes * 60 : null}
          hasFlowAfter={Boolean(flow)}
          finishHref="#"
          finishLabel={quest.checkMode === "instant" ? "Lihat Hasil →" : "Kirim Jawaban"}
          transport={transport}
        />
      </Frame>
    );
  }
  if (phase === "flow" && flow) {
    return (
      <Frame title="Main quest — susun flow lalu kirim">
        <FlowPlay
          question={flow}
          nodes={nodes}
          height="h-[640px]"
          onDone={(r) => {
            setFlowResult(r);
            setPhase("result");
          }}
        />
      </Frame>
    );
  }

  const played = quiz.map((q) => answers[q.id]);
  return (
    <Frame title="Hasil main quest">
      <div className={s.previewBody}>
        <div className="mx-auto flex max-w-[640px] flex-col gap-4">
          <h2 className="font-display text-[24px] font-semibold">{timedOut ? "⏱ Waktu habis" : "Quest selesai"}</h2>
          {flowResult && <FlowResultCard result={flowResult} />}
          {quiz.map((q, i) => {
            const p = played[i];
            const score = p ? scoreQuestion(q, p.answer) : null;
            return (
              <div key={q.id} className="rounded-[12px] border border-border bg-surface px-4 py-3 text-[13.5px]">
                <div className="mb-1 flex justify-between gap-3">
                  <b>{q.prompt || q.id}</b>
                  <span className={score && score.correct === score.total ? "text-success" : "text-gold"}>{score ? `${score.correct}/${score.total}` : "tidak dijawab"}</span>
                </div>
                {p && <div className="text-muted">Jawaban: {describeAnswer(q, p.answer)}</div>}
                <div className="text-muted2">Kunci: {describeCorrectAnswer(q)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}
