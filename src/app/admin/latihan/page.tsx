import Link from "next/link";
import { getManagedSession } from "@/lib/managedSession";
import { prisma } from "@/lib/prisma";
import { getSessionContent } from "@/lib/content/sessionContent";
import { planParts, resolvePlan } from "@/lib/practice/plan";
import { readAnswers } from "@/lib/practice/practiceData";
import { Eyebrow, Headline, StatusPill, Sub } from "@/components/ui";

export default async function AdminPracticeHubPage() {
  const session = await getManagedSession();
  if (!session) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 pt-9 pb-20">
        <p className="text-muted">Belum ada session. Jalankan seed script untuk membuat konten awal.</p>
      </div>
    );
  }

  const content = (await getSessionContent(session.id))?.content;
  if (!content) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 pt-9 pb-20">
        <p className="text-muted">Session yang dikelola belum punya konten kasus.</p>
      </div>
    );
  }
  const titleOf = new Map(content.modules.map((m) => [m.key, m.title]));

  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId: session.id },
    include: { User: true, PracticePlan: true },
    orderBy: { createdAt: "asc" },
  });

  const cards = participants.map((p) => {
    const plan = resolvePlan(p.PracticePlan?.content, p.User.displayName, content.modules);
    const parts = planParts(plan.content);
    return {
      id: p.id,
      name: p.User.displayName,
      personal: plan.personal,
      modules: plan.content.modules.map((k) => titleOf.get(k) ?? k),
      mainTitle: plan.content.main?.title ?? null,
      total: parts.length,
      done: parts.filter((part) => p.PracticePlan?.completedParts.includes(part)).length,
      answerCount: Object.keys(readAnswers(p.PracticePlan?.answers)).length,
      // The last quest is the last to unlock, so a finished (or timed-out) enrollment means every quest is done.
      unlocked: p.status === "COMPLETED" || p.status === "TIME_EXPIRED",
    };
  });

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Eyebrow>Modul Latihan Flow</Eyebrow>
      <Headline>Jalur Belajar Peserta</Headline>
      <Sub>
        Lanjutan dari User Flow Quest. Setiap peserta punya jalur belajar sendiri: modul yang relevan dengan celahnya,
        ditambah latihan memperbaiki flow miliknya dari quest kemarin. Modul terbuka untuk peserta setelah semua quest
        selesai. ·{" "}
        <Link href="/admin/latihan/semua" className="text-teal underline">
          Buka semua modul dalam satu halaman →
        </Link>
      </Sub>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-teal">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-[18px] font-semibold leading-[1.3]">{c.name}</div>
              <StatusPill tone={c.unlocked ? "completed" : "progress"}>{c.unlocked ? "Terbuka" : "Quest belum selesai"}</StatusPill>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.modules.map((title) => (
                <span key={title} className="rounded-xl bg-surface2 px-2.5 py-0.5 text-[12px] text-muted">
                  {title}
                </span>
              ))}
            </div>
            <div className="text-[13px] text-muted">
              {c.personal
                ? c.mainTitle
                  ? `Latihan utama: ${c.mainTitle}`
                  : "Rencana personal tanpa latihan utama"
                : "Belum ada rencana personal, peserta melihat semua modul"}
            </div>
            <div className="mt-auto pt-1">
              <div className="mb-1 flex justify-between text-[12px] text-muted2">
                <span>
                  {c.done} dari {c.total} bagian selesai
                </span>
                {c.answerCount > 0 && <span>{c.answerCount} jawaban tertulis</span>}
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-surface2">
                <div className="h-full rounded bg-teal" style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="flex gap-4 border-t border-border pt-2.5 text-[13px]">
              <Link href={`/builder/rencana/${c.id}`} className="font-semibold text-teal hover:underline">
                {c.personal ? "Edit rencana" : "Buat rencana"}
              </Link>
              <Link href={`/admin/latihan/${c.id}`} className="text-muted hover:text-text">
                Pratinjau & jawaban →
              </Link>
            </div>
          </div>
        ))}
        {cards.length === 0 && <p className="text-muted2">Belum ada peserta terdaftar.</p>}
      </div>

      <p className="mt-8 text-[12.5px] leading-[1.6] text-muted2">
        Rencana personal dibuat di editor rencana: pilih modul, tulis sapaan dan kekuatan peserta, lalu buat latihan utama dari flow yang ia kirim di quest.
        Menyimpan rencana hanya mengganti isinya; progres dan jawaban peserta tetap tersimpan. Rencana juga bisa diekspor dan diimpor sebagai JSON dari editor.
        Modul sendiri diedit di{" "}
        <Link href="/admin/konten" className="text-teal underline">
          Konten
        </Link>
        .
      </p>
    </div>
  );
}
