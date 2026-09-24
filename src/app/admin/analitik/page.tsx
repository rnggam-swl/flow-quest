import Link from "next/link";
import type { Metadata } from "next";
import { getManagedSession, listAllSessions } from "@/lib/managedSession";
import { loadSessionAnalytics } from "@/lib/analyticsData";
import type { FlowQuestionStats, QuestStats, QuizQuestionStats } from "@/lib/content/analytics";
import { TIER_LABELS } from "@/lib/flowScoring";
import { Eyebrow, Headline, Sub } from "@/components/ui";

export const metadata: Metadata = { title: "Analitik · Admin" };

/**
 * Per-question analytics for one session (Fase 5): which quiz questions
 * participants found hard, which options drew them, the wrong answers that
 * came up most, and which rubric checks flows missed most often.
 */

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** One horizontal bar: a single hue for magnitude, the value always written out beside it. */
function Bar({ value, label, note }: { value: number; label: string; note?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_minmax(90px,38%)_52px] items-center gap-3 py-1 text-[13px]" title={`${label}: ${note ?? `${Math.round(w)}%`}`}>
      <span className="leading-snug text-text [overflow-wrap:anywhere]">{label}</span>
      <span className="h-2 overflow-hidden rounded bg-surface2">
        <span className="block h-full rounded-[4px] bg-teal transition-[filter] group-hover:brightness-125" style={{ width: `${w}%` }} />
      </span>
      <span className="text-right tabular-nums text-muted">{note ?? `${Math.round(w)}%`}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-surface2 px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.8px] text-muted2">{label}</div>
      <div className="font-display text-[20px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QuizRow({ q, index }: { q: QuizQuestionStats; index: number }) {
  const hard = q.avgScore !== null && q.answered >= 3 && q.avgScore < 0.5;
  return (
    <details className="border-t border-border py-3">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <span>
          <span className="text-[14px] font-semibold">
            {index + 1}. {q.prompt}
          </span>
          <span className="block text-[12px] text-muted2">
            {q.typeLabel} · {q.answered} jawaban · benar penuh {pct(q.fullyRight)}
            {hard && <span className="ml-2 font-semibold text-gold">⚠ sulit</span>}
          </span>
        </span>
        <span className="w-[240px]">
          <Bar value={q.avgScore ?? 0} label="Skor" note={pct(q.avgScore)} />
        </span>
      </summary>
      <div className="mt-3 grid gap-5 pl-4 md:grid-cols-2">
        {q.options && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-muted">Pilihan peserta</div>
            {q.options.map((o, i) => (
              <Bar
                key={i}
                value={q.answered ? o.count / q.answered : 0}
                label={`${o.correct ? "✓ " : ""}${o.label}${o.correct ? " (kunci)" : ""}`}
                note={`${o.count}×`}
              />
            ))}
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-muted">Jawaban belum tepat yang paling sering</div>
          {q.commonWrong.length ? (
            <ol className="list-decimal pl-5 text-[13px] text-muted">
              {q.commonWrong.map((w) => (
                <li key={w.text} className="py-0.5">
                  <span className="text-text">{w.text}</span> · {w.count}×
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted2">{q.answered ? "Semua jawaban benar penuh." : "Belum ada jawaban."}</p>
          )}
        </div>
      </div>
    </details>
  );
}

function FlowBlock({ f }: { f: FlowQuestionStats }) {
  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 text-[14px] font-semibold">
        Soal flow · {f.submitted} flow dikirim · rata-rata {f.avgTotal === null ? "—" : `${Math.round(f.avgTotal)} / ${f.maxTotal}`}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-muted">Tier</div>
          {f.tiers.map((t) => (
            <Bar key={t.tier} value={f.submitted ? t.count / f.submitted : 0} label={`${TIER_LABELS[t.tier].badge} ${TIER_LABELS[t.tier].label}`} note={`${t.count}`} />
          ))}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-muted">Check rubrik yang terpenuhi (tersulit di atas)</div>
          {f.checks.length ? f.checks.map((c) => <Bar key={c.name} value={c.passRate} label={c.label} />) : <p className="text-[13px] text-muted2">Rubrik ini tidak punya check berlabel.</p>}
        </div>
      </div>
    </div>
  );
}

function QuestCard({ q }: { q: QuestStats }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-5">
      <div className="mb-3 font-display text-[19px] font-semibold">
        Quest {q.order} · {q.title}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Mulai" value={String(q.started)} />
        <Stat label="Selesai" value={String(q.completed)} />
        <Stat label="Waktu habis" value={String(q.timedOut)} />
        <Stat label="Median waktu" value={q.medianMinutes === null ? "—" : `${q.medianMinutes.toFixed(1)} mnt`} />
      </div>
      {q.quiz.map((x, i) => (
        <QuizRow key={x.id} q={x} index={i} />
      ))}
      {q.flow && <FlowBlock f={q.flow} />}
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const [{ session: chosen }, sessions, managed] = await Promise.all([searchParams, listAllSessions(), getManagedSession()]);
  const sessionId = sessions.some((s) => s.id === chosen) ? chosen! : managed?.id;
  const data = sessionId ? await loadSessionAnalytics(sessionId) : null;

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Eyebrow>Analitik</Eyebrow>
      <Headline>Analitik per Soal</Headline>
      <Sub>
        Seberapa sulit setiap soal bagi peserta satu session: rata-rata skor, pilihan yang paling sering diambil, jawaban keliru yang berulang, dan check rubrik flow
        yang paling sering belum terpenuhi. Klik soal untuk rinciannya.
      </Sub>

      <div className="mb-6 flex flex-wrap gap-2 text-[13px]">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/admin/analitik?session=${s.id}`}
            className={`rounded-[20px] border px-3 py-1 ${s.id === sessionId ? "border-teal bg-[rgba(69,217,195,0.1)] text-teal" : "border-border-light text-muted hover:text-text"}`}
          >
            {s.title} <span className="font-mono text-[11.5px]">{s.sessionCode}</span>
          </Link>
        ))}
      </div>

      {!data ? (
        <p className="text-muted">Belum ada session dengan konten kasus.</p>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-muted2">
            {data.caseTitle} · versi {data.version} · {data.participants} peserta
          </p>
          <div className="flex flex-col gap-4">
            {data.quests.map((q) => (
              <QuestCard key={q.order} q={q} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
