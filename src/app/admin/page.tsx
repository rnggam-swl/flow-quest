import Link from "next/link";
import { getManagedSession } from "@/lib/managedSession";
import { getAdminOverview, getRecentActivity } from "@/lib/adminData";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ClickableRow } from "@/components/ClickableRow";
import { Eyebrow, Headline, StatusPill, Sub } from "@/components/ui";

export default async function AdminDashboardPage() {
  const session = await getManagedSession();

  if (!session) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 pt-9 pb-20">
        <p className="text-muted">Belum ada session. Jalankan seed script untuk membuat konten awal.</p>
      </div>
    );
  }

  const [{ rows, stats }, activity] = await Promise.all([
    getAdminOverview(session.id),
    getRecentActivity(session.id, 30),
  ]);

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Eyebrow>Session Aktif</Eyebrow>
      <Headline>{session.title}</Headline>
      <Sub>
        Kode session: <b className="text-text">{session.sessionCode}</b> · Status:{" "}
        <b className="text-text">{session.status}</b> ·{" "}
        <Link href="/admin/session" className="text-teal underline">
          Kelola aktivasi & waktu →
        </Link>{" "}
        ·{" "}
        <Link href="/admin/participants" className="text-teal underline">
          Tambah peserta →
        </Link>
      </Sub>

      <div className="mb-7 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Total Peserta" value={stats.total} />
        <StatCard label="Selesai" value={stats.completed} />
        <StatCard label="Sedang Mengerjakan" value={stats.inProgress} />
        <StatCard label="Rata-rata Skor" value={stats.avgScore} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface2 text-left text-[12px] uppercase tracking-[0.5px] text-muted">
                <th className="px-4 py-3 font-semibold">Peserta</th>
                <th className="px-4 py-3 font-semibold">XP</th>
                <th className="px-4 py-3 font-semibold">Skor</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const clickable = Boolean(r.submissionId);
                const rowContent = (
                  <>
                    <td className="border-t border-border px-4 py-3.5 text-[14px]">
                      <div>{r.displayName}</div>
                      <div className="text-[11.5px] text-muted2">{r.school ?? "—"}</div>
                    </td>
                    <td className="border-t border-border px-4 py-3.5 text-[14px]">{r.totalXp}</td>
                    <td className="border-t border-border px-4 py-3.5 text-[14px]">
                      {r.totalScore ?? "—"}
                    </td>
                    <td className="border-t border-border px-4 py-3.5 text-[14px]">
                      <StatusPill tone={r.status === "COMPLETED" ? "completed" : "progress"}>
                        {r.status}
                      </StatusPill>
                    </td>
                  </>
                );
                return clickable ? (
                  <ClickableRow key={r.sessionParticipantId} href={`/admin/submissions/${r.submissionId}`}>
                    {rowContent}
                  </ClickableRow>
                ) : (
                  <tr key={r.sessionParticipantId}>{rowContent}</tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted2">
                    Belum ada peserta terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ActivityFeed initialItems={activity} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4.5">
      <div className="font-display text-[28px] font-semibold text-teal">{value}</div>
      <div className="mt-1 text-[12.5px] text-muted">{label}</div>
    </div>
  );
}
