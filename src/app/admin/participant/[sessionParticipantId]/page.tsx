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
      <p className="mb-6 text-[13.5px] text-muted">
        {report.email} · {report.school ?? "—"} · {report.groupName ?? "—"}
      </p>

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

      {report.quest1 && (
        <div className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] font-semibold">Quest 1 · {report.quest1.title}</div>
            <span className="text-[12px] text-muted2">Waktu: {fmtSeconds(report.quest1.timeSpentSeconds)}</span>
          </div>
          {report.quest1.completed ? (
            <div className="text-[13.5px] leading-[1.6]">
              <span className={report.quest1.correct ? "text-success" : "text-danger"}>
                {report.quest1.correct ? "✓ Benar" : "✗ Salah"}
              </span>
              {" — "}
              <span className="text-muted">Jawaban: &quot;{report.quest1.selectedText ?? "—"}&quot;</span>
            </div>
          ) : (
            <p className="text-muted2">Belum diselesaikan.</p>
          )}
        </div>
      )}

      {report.flowQuests.map((q) => (
        <div key={q.order} className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-semibold">
              Quest {q.order} · {q.title}
            </div>
            <div className="flex gap-3 text-[12px] text-muted2">
              <span>Waktu: {fmtSeconds(q.timeSpentSeconds)}</span>
              <span>Ke aksi pertama: {fmtSeconds(q.timeToFirstActionSeconds)}</span>
              <span>Revisi: {q.revisionCount}×</span>
            </div>
          </div>

          {q.status === null ? (
            <p className="text-muted2">Belum dimulai.</p>
          ) : (
            <>
              <div className="mb-2.5 text-[13px]">
                <span className="text-muted">Skor: </span>
                <span className="font-semibold">
                  {q.totalScore !== null ? `${q.totalScore} / ${q.maxScore}` : "Belum dinilai"}
                </span>
                <span className="ml-3 text-muted2">({q.status})</span>
              </div>
              <div className="mb-2.5">
                <FlowGraphView
                  nodes={q.graph.nodes}
                  connections={q.graph.connections}
                  viewMode={report.flowViewMode}
                  idPrefix={`q${q.order}`}
                  maxHeight={480}
                />
              </div>
              {q.reflection && (
                <p className="text-[13px] italic leading-[1.6] text-muted">&quot;{q.reflection}&quot;</p>
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
