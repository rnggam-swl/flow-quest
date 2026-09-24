import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getPlayContext, getQuestList } from "@/lib/questPlay";
import { isSessionOpenNow, isWithinPersonalDeadline } from "@/lib/sessionAccess";
import { getPracticeSummary, hasFinishedAllQuests } from "@/lib/practice/practiceData";
import { RichText } from "@/components/RichText";
import { CenteredShell, Eyebrow, Headline, Sub } from "@/components/ui";

export default async function BriefPage() {
  const user = await requireRole("PARTICIPANT");
  const play = await getPlayContext(user.id, user.displayName);
  if (!play) {
    return (
      <CenteredShell>
        <p className="text-muted">Session kamu belum punya konten quest. Hubungi admin/mentor kamu.</p>
      </CenteredShell>
    );
  }
  const { enrollment, ctx } = play;
  const items = await getQuestList(ctx.sessionParticipantId, ctx.sessionId, ctx.content);
  const scheduleOpen = isSessionOpenNow(enrollment.Session);
  const withinDeadline = isWithinPersonalDeadline(enrollment);
  const sessionOpen = scheduleOpen && withinDeadline;
  const practice = hasFinishedAllQuests(items) ? await getPracticeSummary(enrollment.id, user.displayName, ctx.content.modules) : null;

  return (
    <CenteredShell>
      <Eyebrow>Halo, {user.displayName.split(" ")[0]} 👋</Eyebrow>
      <Headline>User Flow Quest</Headline>
      {ctx.content.brief ? (
        <RichText source={ctx.content.brief} className="mb-7 text-[15px] leading-[1.6] text-muted" paragraphClassName="mb-2 last:mb-0" />
      ) : (
        <Sub>Selesaikan quest berurutan untuk membuka quest berikutnya.</Sub>
      )}
      <p className="-mt-3 mb-5 text-[12px] text-muted2">
        Waktu pengerjaan dan aktivitas kamu di setiap quest dicatat untuk keperluan evaluasi.
      </p>

      {!sessionOpen && (
        <div className="mb-5 rounded-xl border border-gold-dim bg-[rgba(240,172,63,0.08)] px-4 py-3 text-[13.5px] text-gold">
          {!scheduleOpen
            ? "Session belum diaktifkan oleh admin, atau sudah di luar jadwal. Hubungi admin/mentor kamu untuk mengaktifkan session ini."
            : "Batas waktu personal kamu untuk session ini sudah habis. Hubungi admin/mentor kamu kalau butuh perpanjangan waktu."}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-3">
        {items.map((item, i) => {
          const clickable = sessionOpen && item.state === "available";
          const done = item.state === "completed";
          const locked = item.state === "locked" || !sessionOpen;

          const numContent = done ? "✓" : i + 1;
          const cardClasses = [
            "flex items-center gap-3.5 rounded-xl border p-4",
            done
              ? "border-success bg-[rgba(123,201,126,0.06)]"
              : locked
                ? "border-border opacity-50"
                : "border-border-light hover:border-teal",
          ].join(" ");

          const numClasses = [
            "flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px] text-[15px] font-bold",
            done ? "bg-success text-[#0C2A0D]" : clickable ? "bg-teal text-[#0A2723]" : "bg-surface2 text-muted",
          ].join(" ");

          const content = (
            <div className={cardClasses}>
              <div className={numClasses}>{numContent}</div>
              <div className="flex-1">
                <div className="text-[14.5px] font-semibold">{item.title}</div>
                <div className="mt-0.5 text-[12px] text-muted2">
                  {locked
                    ? "Selesaikan quest sebelumnya dulu"
                    : `+${item.xp} XP${item.timeLimitMinutes ? ` · ${item.timeLimitMinutes} menit` : ""}`}
                </div>
              </div>
              {locked ? (
                <span className="text-[16px] text-muted2">🔒</span>
              ) : (
                <span className="whitespace-nowrap text-[12px] font-semibold text-gold">
                  +{item.xp} XP
                </span>
              )}
            </div>
          );

          if (done) {
            return (
              <Link key={item.questId} href={`/result/${item.order}`}>
                {content}
              </Link>
            );
          }
          if (clickable) {
            return (
              <Link key={item.questId} href={`/quest/${item.order}`}>
                {content}
              </Link>
            );
          }
          return <div key={item.questId}>{content}</div>;
        })}
      </div>

      {practice && (
        <Link
          href="/latihan"
          className="mt-6 block rounded-xl border border-gold-dim p-4 transition-colors hover:border-gold"
          style={{ background: "linear-gradient(135deg, rgba(69,217,195,0.08), rgba(240,172,63,0.1))" }}
        >
          <div className="text-[12px] font-semibold uppercase tracking-[1.5px] text-gold">Lanjutan</div>
          <div className="font-display mt-1 text-[19px] font-semibold">Modul Latihan Flow</div>
          <div className="mt-1 text-[13.5px] leading-[1.55] text-muted">
            {practice.personal
              ? "Modul yang dipilih khusus dari hasil quest kamu, ditambah latihan memperbaiki flow milikmu sendiri."
              : `${practice.total} modul inti untuk memperkuat cara kamu menyusun flow.`}
          </div>
          <div className="mt-2.5 text-[12.5px] font-semibold text-teal">
            {practice.done === 0
              ? "Mulai belajar →"
              : `${practice.done} dari ${practice.total} bagian selesai · Lanjutkan →`}
          </div>
        </Link>
      )}
    </CenteredShell>
  );
}
