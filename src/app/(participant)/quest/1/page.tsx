import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getLatestEnrollment, getQuestList } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { canParticipantPlay } from "@/lib/sessionAccess";
import { Quest1Client } from "./Quest1Client";

export default async function Quest1Page() {
  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment || !canParticipantPlay(enrollment.Session, enrollment)) redirect("/brief");

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);
  const { items } = await getQuestList(enrollment.sessionId, teamId, user.id);
  const quest1 = items.find((i) => i.order === 1);
  if (!quest1 || quest1.state === "locked") redirect("/brief");

  return <Quest1Client alreadyCompleted={quest1.state === "completed"} />;
}
