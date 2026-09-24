import { RichText } from "@/components/RichText";
import { describeAnswer, describeCorrectAnswer } from "@/lib/content/describe";
import type { QuizQuestion } from "@/lib/content/questions";

export interface ReviewedQuestion {
  question: QuizQuestion;
  answer: unknown;
  correct: number;
  total: number;
}

/** Per-question review of a quest's quiz answers, after it's submitted. */
export function QuizReview({ items, showSummary }: { items: ReviewedQuestion[]; showSummary: boolean }) {
  const correct = items.reduce((n, r) => n + r.correct, 0);
  const total = items.reduce((n, r) => n + r.total, 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="text-left">
      {showSummary && (
        <div className="mb-6 text-center">
          <div className="font-display text-[34px] font-semibold text-teal">
            {correct} / {total}
          </div>
          <div className="text-[13px] text-muted">{pct}% jawaban benar</div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {items.map(({ question, answer, correct: c, total: t }, i) => {
          const ok = t > 0 && c === t;
          const partial = !ok && c > 0;
          const feedback = ok ? question.feedback?.correct : question.feedback?.incorrect;
          return (
            <div key={question.id} className="rounded-xl border border-border bg-surface px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-ink ${
                    ok ? "bg-success" : partial ? "bg-gold" : "bg-danger"
                  }`}
                >
                  {ok ? "✓" : partial ? "●" : "✕"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-text">
                    {i + 1}. {question.prompt}
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    Jawabanmu: <span className="text-text">{answer === undefined ? "Tidak dijawab" : describeAnswer(question, answer)}</span>
                  </div>
                  {!ok && (
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      Jawaban benar: <span className="text-success">{describeCorrectAnswer(question)}</span>
                    </div>
                  )}
                  {feedback && <RichText source={feedback} className="mt-2 text-[13px] leading-[1.6] text-muted" paragraphClassName="mb-1 last:mb-0" />}
                </div>
                <span className="flex-shrink-0 text-[12.5px] font-semibold tabular-nums text-muted2">
                  {c}/{t}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
