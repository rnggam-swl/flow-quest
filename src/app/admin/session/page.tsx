import { getManagedSession, listAllSessions } from "@/lib/managedSession";
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

  const [sessionQuests, allSessions] = await Promise.all([
    prisma.sessionQuest.findMany({
      where: { sessionId: session.id },
      orderBy: { order: "asc" },
      include: { Quest: true },
    }),
    listAllSessions(),
  ]);

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
        quests={sessionQuests.map((sq) => ({
          id: sq.Quest.id,
          order: sq.Quest.order,
          title: sq.Quest.title,
          timeLimitMinutes: sq.Quest.timeLimitMinutes,
          implemented: sq.Quest.order !== 1,
        }))}
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
          }))}
          currentSessionId={session.id}
        />
      </div>
    </div>
  );
}
