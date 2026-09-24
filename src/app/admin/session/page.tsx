import { getManagedSession, listAllSessions, listPlayableCases } from "@/lib/managedSession";
import { effectiveTimeLimit, getSessionContent, questOf } from "@/lib/content/sessionContent";
import { prisma } from "@/lib/prisma";
import { Eyebrow, Headline, Sub } from "@/components/ui";
import { SessionSettingsForm } from "./SessionSettingsForm";
import { SessionHistory } from "./SessionHistory";

export default async function AdminSessionPage() {
  const session = await getManagedSession();
  if (!session) {
    return (
      <div className="mx-auto max-w-[720px] px-6 pt-9 pb-20">
        <p className="text-muted">Belum ada session. Jalankan seed script untuk membuat konten awal.</p>
      </div>
    );
  }

  const [sessionQuests, allSessions, cases, pinned] = await Promise.all([
    prisma.sessionQuest.findMany({ where: { sessionId: session.id }, orderBy: { order: "asc" } }),
    listAllSessions(),
    listPlayableCases(),
    getSessionContent(session.id),
  ]);
  const quests = sessionQuests.flatMap((sq) => {
    const quest = pinned ? questOf(pinned.content, sq.order) : undefined;
    return quest ? [{ id: sq.questId, order: sq.order, title: quest.title, timeLimitMinutes: effectiveTimeLimit(quest, sq.timeLimitMinutes), implemented: true }] : [];
  });

  return (
    <div className="mx-auto max-w-[720px] px-6 pt-4 pb-20">
      <Eyebrow>Pengaturan Session</Eyebrow>
      <Headline className="text-[26px]">{session.title}</Headline>
      <Sub>
        Aktifkan session dan tentukan jendela waktu supaya peserta hanya bisa menjalankan quest
        saat session benar-benar berjalan. Kode session: <b className="text-text">{session.sessionCode}</b>
      </Sub>

      <SessionSettingsForm
        session={{
          status: session.status,
          startAt: session.startAt?.toISOString() ?? null,
          endAt: session.endAt?.toISOString() ?? null,
          timeLimitMinutes: session.timeLimitMinutes,
        }}
        quests={quests}
      />

      <div className="mt-10">
        <div className="mb-2.5 text-[13px] font-semibold text-muted">Riwayat Session (Batch)</div>
        <Sub className="mb-4">
          Session paling baru di daftar ini otomatis jadi session yang aktif dikelola di atas dan di
          halaman Kelola Peserta / Dashboard. Session lama tetap tersimpan datanya, tidak terhapus.
        </Sub>
        <SessionHistory
          sessions={allSessions.map((s) => ({
            id: s.id,
            title: s.title,
            sessionCode: s.sessionCode,
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            participantCount: s.participantCount,
            caseTitle: s.caseTitle,
            caseVersion: s.caseVersion,
          }))}
          currentSessionId={session.id}
          cases={cases}
        />
      </div>
    </div>
  );
}
