import { requireRole } from "@/lib/auth";
import { getLatestEnrollment } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { TopBar } from "@/components/TopBar";

export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);

  if (!enrollment) {
    return (
      <>
        <TopBar user={user} />
        <div className="mx-auto max-w-[520px] px-5 pt-16 text-center">
          <p className="text-muted">
            Akun kamu belum terdaftar di session manapun. Hubungi admin/mentor untuk didaftarkan.
          </p>
        </div>
      </>
    );
  }

  await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);

  return (
    <>
      <TopBar user={user} />
      {children}
    </>
  );
}
