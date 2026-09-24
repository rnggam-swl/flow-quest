import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagedSession } from "@/lib/managedSession";
import { getParticipantReport } from "@/lib/adminReport";
import { FlowGraphView } from "@/components/FlowGraphView";
import { Eyebrow, Headline } from "@/components/ui";

function fmtSeconds(sec: number | null) {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ParticipantReportPage({
  params,
}: {
  params: Promise<{ sessionParticipantId: string }>;
}) {
  const { sessionParticipantId } = await params;
  const session = await getManagedSession();
  if (!session) notFound();

  const report = await getParticipantReport(session.id, sessionParticipantId);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-text">
        ← Kembali ke Dashboard
      </Link>
      <Eyebrow>Laporan Aktivitas Lengkap</Eyebrow>
      <Headline className="text-[26px]">{report.displayName}</Headline>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">
          {report.email} · {report.school ?? "—"} · {report.groupName ?? "—"}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href={`/admin/latihan/${sessionParticipantId}`}
            className="rounded-[20px] border border-border-light px-3.5 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-teal hover:text-teal"
          >
            Modul Latihan →
          </Link>
          <a
            href={`/api/admin/participant/${sessionParticipantId}/export`}
            className="rounded-[20px] border border-teal px-3.5 py-1.5 text-[12.5px] font-semibold text-teal transition-colors hover:bg-teal hover:text-ink"
          >
            Unduh Semua Jawaban (HTML) ↓
          </a>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Total XP" value={String(report.totalXp)} />
        <StatCard label="Status" value={report.status} />
        <StatCard
          label="Berpindah Tab"
          value={`${report.focusLoss.count}×`}
          tone={report.focusLoss.count > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Total Waktu Pergi"
          value={fmtSeconds(report.focusLoss.totalAwaySeconds || null)}
          tone={report.focusLoss.totalAwaySeconds > 0 ? "warning" : undefined}
        />
      </div>

      {report.focusLoss.events.length > 0 && (
        <div className="mb-6 rounded-[14px] border border-gold-dim bg-[rgba(240,172,63,0.06)] p-5">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1px] text-gold">
            Riwayat Berpindah Tab/Window
          </div>
          <div className="flex flex-col gap-1.5">
            {report.focusLoss.events.map((e, i) => (
              <div key={i} className="flex justify-between text-[13px] text-muted">
                <span>{e.order ? `Quest ${e.order}` : "—"}</span>
                <span>{e.awaySeconds ?? "—"}s</span>
                <span className="text-muted2">{fmtDate(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.quests.map((q) => (
        <div key={q.order} className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-semibold">
              Quest {q.order} · {q.title}
            </div>
            <div className="flex gap-3 text-[12px] text-muted2">
              <span>Waktu: {fmtSeconds(q.timeSpentSeconds)}</span>
              {q.flow && (
                <>
                  <span>Ke aksi pertama: {fmtSeconds(q.flow.timeToFirstActionSeconds)}</span>
                  <span>Revisi: {q.flow.revisionCount}×</span>
                </>
              )}
            </div>
          </div>

          {q.status === null ? (
            <p className="text-muted2">Belum dimulai.</p>
          ) : (
            <>
              {q.quiz.length > 0 && (
                <div className="mb-3 flex flex-col gap-2">
                  {q.quiz.map((a) => {
                    const ok = a.total > 0 && a.correct === a.total;
                    return (
                      <div key={a.questionId} className="text-[13.5px] leading-[1.6]">
                        <div>
                          <span className={!a.answered ? "text-muted2" : ok ? "text-success" : a.correct > 0 ? "text-gold" : "text-danger"}>
                            {!a.answered ? "— Belum dijawab" : ok ? "✓ Benar" : `${a.correct}/${a.total} benar`}
                          </span>
                          <span className="text-muted2"> · {a.typeLabel}</span> — {a.prompt}
                        </div>
                        {a.answered && <div className="text-muted">Jawaban: &quot;{a.answerText}&quot;</div>}
                        {a.answered && !ok && <div className="text-muted2">Kunci: {a.correctText}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
              {q.flow && (
                <>
                  <div className="mb-2.5 text-[13px]">
                    <span className="text-muted">Skor flow: </span>
                    <span className="font-semibold">
                      {q.flow.totalScore !== null ? `${q.flow.totalScore} / ${q.flow.maxScore}` : "Belum dinilai"}
                    </span>
                    <span className="ml-3 text-muted2">({q.status})</span>
                  </div>
                  <div className="mb-2.5">
                    <FlowGraphView
                      nodes={q.flow.graph.nodes}
                      connections={q.flow.graph.connections}
                      nativeViewMode={report.flowViewMode}
                      idPrefix={`q${q.order}`}
                      maxHeight={480}
                    />
                  </div>
                  {q.flow.reflection && <p className="text-[13px] italic leading-[1.6] text-muted">&quot;{q.flow.reflection}&quot;</p>}
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4.5">
      <div className={`font-display text-[24px] font-semibold ${tone === "warning" ? "text-gold" : "text-teal"}`}>
        {value}
      </div>
      <div className="mt-1 text-[12.5px] text-muted">{label}</div>
    </div>
  );
}
