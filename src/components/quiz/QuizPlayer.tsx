"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Eyebrow, Headline } from "@/components/ui";
import { FocusGuard } from "@/components/FocusGuard";
import { RichText } from "@/components/RichText";
import { MediaList, QuestionInput } from "@/components/quiz/QuestionInputs";
import { emptyAnswer, isAnswered } from "@/lib/content/answerState";
import type { PublicQuestion, Reveal } from "@/lib/content/publicQuestion";
import {
  questRewards,
  reactionFor,
  type QuestRewards,
} from "@/lib/content/rewards";

/**
 * Plays the quiz questions of a quest, one per page. In "instant" quests each
 * answer is checked (and locked) before moving on, exactly like the original
 * Quest 1; in "end" quests answers are saved as the participant goes and can
 * be revised until they submit, and the review comes on the result page. The
 * server scores everything — this component only ever holds shown-space
 * answers and whatever the server chose to reveal.
 */

/**
 * Replaces the /api/quest/* calls — the builder's Play mode scores answers in
 * the browser instead, and nothing is recorded.
 */
export interface QuizTransport {
  answer(
    questionId: string,
    answer: unknown,
  ): Promise<
    { ok: true; reveal: Reveal | null } | { ok: false; error: string }
  >;
  finish(): Promise<void>;
  timeUp(): void;
}

export interface PlayerQuestion {
  question: PublicQuestion;
  answer: unknown;
  reveal: Reveal | null;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fmt(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function QuizPlayer({
  order,
  questLabel,
  intro,
  checkMode,
  rewards,
  questions: initial,
  remainingSeconds,
  hasFlowAfter,
  finishHref,
  finishLabel,
  transport,
}: {
  order: number;
  questLabel: string;
  intro?: string;
  checkMode: "instant" | "end";
  /** The quest's gamification, if any: XP, combo and reactions shown as answers are checked (instant quests). */
  rewards?: QuestRewards;
  questions: PlayerQuestion[];
  remainingSeconds: number | null;
  /** The quest continues on the flow canvas once these are answered. */
  hasFlowAfter: boolean;
  /** Where to go after the last question (next quest for instant quests, the result page otherwise). */
  finishHref: string;
  finishLabel: string;
  transport?: QuizTransport;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(() => {
    const firstOpen = initial.findIndex((q) =>
      checkMode === "instant" ? !q.reveal : q.answer === null,
    );
    return firstOpen === -1 ? initial.length - 1 : firstOpen;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(remainingSeconds);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      // The server closes the attempt on the next load and shows the result.
      if (transport) transport.timeUp();
      else router.refresh();
      return;
    }
    const t = setTimeout(
      () => setSecondsLeft((s) => (s === null ? s : s - 1)),
      1000,
    );
    return () => clearTimeout(t);
  }, [secondsLeft, router, transport]);

  const current = items[page];
  const value = current.answer ?? emptyAnswer(current.question);
  const answered = isAnswered(current.question, value);
  const isLastPage = page === items.length - 1;
  const single = items.length === 1;

  const setAnswer = (answer: unknown) =>
    setItems((prev) => prev.map((q, i) => (i === page ? { ...q, answer } : q)));

  async function save(): Promise<boolean> {
    if (transport) {
      const r = await transport.answer(current.question.id, value);
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      setItems((prev) =>
        prev.map((q, i) =>
          i === page ? { ...q, answer: value, reveal: r.reveal } : q,
        ),
      );
      return true;
    }
    const res = await post("/api/quest/answer", {
      order,
      questionId: current.question.id,
      answer: value,
    });
    if (res.status === 409 && res.data?.error === "Waktu habis") {
      router.refresh();
      return false;
    }
    if (!res.ok) {
      setError(res.data?.error ?? "Gagal menyimpan jawaban — coba lagi.");
      return false;
    }
    setItems((prev) =>
      prev.map((q, i) =>
        i === page
          ? { ...q, answer: value, reveal: res.data.reveal ?? null }
          : q,
      ),
    );
    return true;
  }

  async function finish() {
    if (transport) {
      await transport.finish();
      return;
    }
    if (hasFlowAfter) {
      router.refresh();
      return;
    }
    const res = await post("/api/quest/submit", { order });
    if (!res.ok && res.status !== 409) {
      setError(res.data?.error ?? "Gagal menyelesaikan quest — coba lagi.");
      return;
    }
    router.push(finishHref);
    router.refresh();
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("Gagal terhubung — periksa koneksi internet kamu.");
    } finally {
      setBusy(false);
    }
  }

  const primary = (() => {
    if (checkMode === "instant") {
      if (!current.reveal) {
        return {
          label: "Konfirmasi Jawaban",
          variant: "primary" as const,
          disabled: !answered,
          onClick: () => run(async () => void (await save())),
        };
      }
      if (!isLastPage)
        return {
          label: "Soal Berikutnya →",
          variant: "primary" as const,
          disabled: false,
          onClick: () => setPage(page + 1),
        };
      return {
        label: hasFlowAfter ? "Lanjut Susun Flow →" : finishLabel,
        variant: "gold" as const,
        disabled: false,
        onClick: () => run(finish),
      };
    }
    if (!isLastPage) {
      return {
        label: "Berikutnya →",
        variant: "primary" as const,
        disabled: !answered,
        onClick: () =>
          run(async () => {
            if (await save()) setPage(page + 1);
          }),
      };
    }
    return {
      label: hasFlowAfter ? "Lanjut Susun Flow →" : finishLabel,
      variant: "gold" as const,
      disabled: !answered,
      onClick: () =>
        run(async () => {
          if (await save()) await finish();
        }),
    };
  })();

  const reveal = checkMode === "instant" ? current.reveal : null;
  const fullyRight = reveal
    ? reveal.score.total > 0 && reveal.score.correct === reveal.score.total
    : false;

  // Rewards so far, from the answers the server has revealed — the same calculation it makes when the quest completes.
  const earned =
    rewards && checkMode === "instant"
      ? questRewards(
          { questions: items.map((q) => q.question), rewards },
          new Map(
            items.flatMap((q) =>
              q.reveal ? [[q.question.id, q.reveal.score] as const] : [],
            ),
          ),
          items.findIndex((q) => !q.reveal) === -1
            ? items.length
            : items.findIndex((q) => !q.reveal),
        )
      : null;
  const currentReward = reveal && earned ? earned.questions[page] : undefined;
  const reaction =
    reveal && currentReward && rewards?.reactions
      ? reactionFor(reveal.score, currentReward, page)
      : null;

  return (
    <Guard tracked={!transport} questOrder={order}>
      <div className="mx-auto max-w-[600px] px-5 pt-[50px] pb-20">
        <div className="flex items-start justify-between gap-3">
          <Eyebrow>{questLabel}</Eyebrow>
          <div className="flex flex-shrink-0 items-center gap-2">
            {earned && earned.total > 0 && (
              <span
                className="rounded-[20px] border border-gold-dim px-3 py-1 text-[12.5px] font-semibold tabular-nums text-gold"
                aria-label={`${earned.total} XP dari jawaban`}
              >
                ⚡ {earned.total} XP
              </span>
            )}
            {secondsLeft !== null && (
              <span
                className={`rounded-[20px] border px-3 py-1 text-[12.5px] font-semibold tabular-nums ${secondsLeft <= 30 ? "border-danger text-danger" : "border-border-light text-muted"}`}
              >
                ⏱ {fmt(Math.max(0, secondsLeft))}
              </span>
            )}
          </div>
        </div>

        {!single && (
          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-[12px] text-muted2">
              <span>
                Soal {page + 1} dari {items.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-surface2">
              <div
                className="h-full rounded bg-teal transition-all"
                style={{ width: `${((page + 1) / items.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!single && intro && page === 0 && <IntroCallout intro={intro} />}
        <Headline className="text-[26px]">{current.question.prompt}</Headline>
        {current.question.help && (
          <p className="-mt-1 mb-3 text-[13.5px] text-muted">
            {current.question.help}
          </p>
        )}
        {single && intro && <IntroCallout intro={intro} />}
        <MediaList media={current.question.media} className="mb-4" />

        <div className="mb-6 mt-5">
          <QuestionInput
            key={current.question.id}
            question={current.question}
            value={value}
            onChange={setAnswer}
            reveal={reveal}
            disabled={busy}
          />
        </div>

        {reveal &&
          currentReward &&
          (reaction || currentReward.xp > 0 || currentReward.combo > 0) && (
            <div
              key={`reaction-${page}`}
              className="reaction-pop mb-4 flex flex-wrap items-center gap-2.5"
              role="status"
            >
              {reaction && (
                <span className="text-[15px] font-semibold text-text">
                  <span aria-hidden className="mr-1.5 text-[20px]">
                    {reaction.emoji}
                  </span>
                  {reaction.text}
                </span>
              )}
              {currentReward.xp > 0 && (
                <span className="rounded-[20px] bg-[rgba(240,172,63,0.15)] px-2.5 py-0.5 text-[12.5px] font-bold text-gold">
                  +{currentReward.xp} XP
                </span>
              )}
              {currentReward.combo > 0 && (
                <span className="rounded-[20px] bg-[rgba(242,112,92,0.15)] px-2.5 py-0.5 text-[12.5px] font-bold text-danger">
                  🔥 Combo ×{currentReward.streak} +{currentReward.combo}
                </span>
              )}
            </div>
          )}
        {reveal && reveal.feedback.length > 0 && (
          <div
            className={`mb-5 rounded-[10px] border px-4 py-3.5 text-[14px] leading-[1.6] ${fullyRight ? "border-success bg-[rgba(123,201,126,0.1)]" : "border-gold bg-[rgba(240,172,63,0.1)]"}`}
          >
            {reveal.feedback.map((f, i) => (
              <RichText
                key={i}
                source={f}
                paragraphClassName="mb-1.5 last:mb-0"
                listClassName="mb-1.5 list-disc pl-5"
              />
            ))}
          </div>
        )}
        {reveal && reveal.feedback.length === 0 && !single && !reaction && (
          <div
            className={`mb-5 text-[13.5px] font-semibold ${fullyRight ? "text-success" : "text-gold"}`}
          >
            {fullyRight
              ? "✓ Benar!"
              : reveal.score.total <= 1
                ? "✗ Belum tepat"
                : `${reveal.score.correct} dari ${reveal.score.total} benar`}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {checkMode === "end" && page > 0 && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setPage(page - 1)}
            >
              ← Sebelumnya
            </Button>
          )}
          <Button
            variant={primary.variant}
            disabled={primary.disabled || busy}
            onClick={primary.onClick}
          >
            {busy ? "Menyimpan…" : primary.label}
          </Button>
        </div>
        {error && (
          <div className="mt-3 rounded-[9px] border border-danger bg-[rgba(242,112,92,0.1)] px-3.5 py-2.5 text-[13.5px] text-danger">
            ⚠️ {error}
          </div>
        )}
      </div>
    </Guard>
  );
}

function IntroCallout({ intro }: { intro: string }) {
  return (
    <div className="mb-6 rounded-r-[10px] border-l-[3px] border-teal bg-surface2 px-[18px] py-4 text-[14.5px] leading-[1.65]">
      <b className="text-teal">Skenario:</b>{" "}
      <RichText source={intro} className="inline" paragraphClassName="inline" />
    </div>
  );
}

/** A participant's play counts tab switches (see FocusGuard); the builder's doesn't. */
function Guard({
  tracked,
  questOrder,
  children,
}: {
  tracked: boolean;
  questOrder: number;
  children: ReactNode;
}) {
  return tracked ? (
    <FocusGuard questOrder={questOrder}>{children}</FocusGuard>
  ) : (
    <>{children}</>
  );
}
