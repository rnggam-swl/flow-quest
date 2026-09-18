import { getManagedSession } from "@/lib/managedSession";
import { prisma } from "@/lib/prisma";
import { Eyebrow, Headline, Sub } from "@/components/ui";
import { ParticipantsManager } from "./ParticipantsManager";

export default async function AdminParticipantsPage() {
  const session = await getManagedSession();
  if (!session) {
    return (
      <div className="mx-auto max-w-[720px] px-6 pt-9 pb-20">
        <p className="text-muted">Belum ada session. Jalankan seed script untuk membuat konten awal.</p>
      </div>
    );
  }

  const existing = await prisma.sessionParticipant.findMany({
    where: { sessionId: session.id },
    include: { User: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-[820px] px-6 pt-4 pb-20">
      <Eyebrow>Kelola Peserta</Eyebrow>
      <Headline className="text-[26px]">Tambah Peserta ke {session.title}</Headline>
      <Sub>
        Tempel satu nama per baris. Format opsional: <b className="text-text">Nama, Sekolah, Kelompok</b>.
        Email &amp; password login akan dibuatkan otomatis dan hanya ditampilkan sekali di sini setelah
        dibuat — catat atau salin sebelum meninggalkan halaman ini.
      </Sub>

      <ParticipantsManager
        existing={existing.map((p) => ({
          userId: p.participantId,
          name: p.User.displayName,
          email: p.User.email,
          school: p.User.school,
          group: p.User.groupName,
          status: p.status,
        }))}
      />
    </div>
  );
}
