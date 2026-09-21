import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLatestEnrollment, getQuestList } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { isSessionOpenNow, isWithinPersonalDeadline } from "@/lib/sessionAccess";
import { CenteredShell, Eyebrow, Headline, Sub } from "@/components/ui";

export default async function BriefPage() {
  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) return null;

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);
  const { items } = await getQuestList(enrollment.sessionId, teamId, user.id);
  const scheduleOpen = isSessionOpenNow(enrollment.Session);
  const withinDeadline = isWithinPersonalDeadline(enrollment);
  const sessionOpen = scheduleOpen && withinDeadline;

  return (
    <CenteredShell>
      <Eyebrow>Halo, {user.displayName.split(" ")[0]} 👋</Eyebrow>
      <Headline>User Flow Quest</Headline>
      <Sub>
        Lima quest membawa kamu dari memahami tujuan pengguna sampai menyusun flow lengkap dengan
        alasannya. Selesaikan berurutan untuk membuka quest berikutnya.
      </Sub>
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

          if (done && item.order >= 2) {
            const resultHref = item.order === 2 ? "/result" : `/result/${item.order}`;
            return (
              <Link key={item.questId} href={resultHref}>
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
    </CenteredShell>
  );
}
