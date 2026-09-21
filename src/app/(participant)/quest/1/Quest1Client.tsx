"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, CenteredShell, Eyebrow, Headline } from "@/components/ui";
import { FocusGuard } from "@/components/FocusGuard";
import { QUEST1_FEEDBACK, QUEST1_OPTIONS, QUEST1_QUESTION, QUEST1_SCENARIO } from "@/lib/quest1Content";

export function Quest1Client({ alreadyCompleted }: { alreadyCompleted: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (alreadyCompleted) {
    return (
      <CenteredShell>
        <Eyebrow>Quest 1 · Find the Goal</Eyebrow>
        <Headline className="text-[26px]">Quest ini sudah kamu selesaikan.</Headline>
        <Button onClick={() => router.push("/brief")}>← Kembali ke Session Brief</Button>
      </CenteredShell>
    );
  }

  const isCorrect = selected !== null && QUEST1_OPTIONS[selected].correct;

  async function handleContinue() {
    if (selected === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/quest1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndex: selected, correct: isCorrect }),
      });
      if (!res.ok) {
        setSubmitError("Gagal menyimpan jawaban — coba lagi.");
        setSubmitting(false);
        return;
      }
      router.push("/brief");
      router.refresh();
    } catch {
      setSubmitError("Gagal menyimpan jawaban — periksa koneksi internet kamu.");
      setSubmitting(false);
    }
  }

  return (
    <FocusGuard questOrder={1}>
    <div className="mx-auto max-w-[600px] px-5 pt-[50px] pb-20">
      <Eyebrow>Quest 1 · Find the Goal</Eyebrow>
      <Headline className="text-[26px]">{QUEST1_QUESTION}</Headline>

      <div className="mb-6 rounded-r-[10px] border-l-[3px] border-teal bg-surface2 px-[18px] py-4 text-[14.5px] leading-[1.65]">
        <b className="text-teal">Skenario:</b> {QUEST1_SCENARIO}
      </div>

      <div className="mb-6 mt-5 flex flex-col gap-2.5">
        {QUEST1_OPTIONS.map((opt, i) => {
          let stateClasses = "border-border-light hover:border-teal";
          if (answered) {
            if (opt.correct) stateClasses = "border-success bg-[rgba(123,201,126,0.1)]";
            else if (i === selected) stateClasses = "border-danger bg-[rgba(242,112,92,0.08)]";
          } else if (i === selected) {
            stateClasses = "border-teal bg-[rgba(69,217,195,0.08)]";
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => setSelected(i)}
              className={`rounded-[10px] border-[1.5px] bg-surface px-4 py-3.5 text-left text-[14.5px] text-text transition-colors ${stateClasses}`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          className={`mb-5 rounded-[10px] border px-4 py-3.5 text-[14px] leading-[1.6] ${
            isCorrect
              ? "border-success bg-[rgba(123,201,126,0.1)]"
              : "border-gold bg-[rgba(240,172,63,0.1)]"
          }`}
          dangerouslySetInnerHTML={{
            __html: isCorrect ? QUEST1_FEEDBACK.correct : QUEST1_FEEDBACK.incorrect,
          }}
        />
      )}

      {!answered ? (
        <Button disabled={selected === null} onClick={() => setAnswered(true)}>
          Konfirmasi Jawaban
        </Button>
      ) : (
        <Button variant="gold" onClick={handleContinue} disabled={submitting}>
          {submitting ? "Menyimpan…" : "Lanjut ke Quest 2 →"}
        </Button>
      )}
      {submitError && (
        <div className="mt-3 rounded-[9px] border border-danger bg-[rgba(242,112,92,0.1)] px-3.5 py-2.5 text-[13.5px] text-danger">
          ⚠️ {submitError}
        </div>
      )}
    </div>
    </FocusGuard>
  );
}
