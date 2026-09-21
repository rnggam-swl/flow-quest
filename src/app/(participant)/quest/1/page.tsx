import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLatestEnrollment, getQuestList } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { canParticipantPlay } from "@/lib/sessionAccess";
import { logActivity } from "@/lib/activity";
import { Quest1Client } from "./Quest1Client";

export default async function Quest1Page() {
  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment || !canParticipantPlay(enrollment.Session, enrollment)) redirect("/brief");

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);
  const { items } = await getQuestList(enrollment.sessionId, teamId, user.id);
  const quest1 = items.find((i) => i.order === 1);
  if (!quest1 || quest1.state === "locked") redirect("/brief");

  if (quest1.state === "available") {
    const alreadyStarted = await prisma.activityLog.findFirst({
      where: { userId: user.id, sessionId: enrollment.sessionId, event: "QUEST_STARTED", metadata: { path: ["order"], equals: 1 } },
    });
    if (!alreadyStarted) {
      void logActivity({
        event: "QUEST_STARTED",
        userId: user.id,
        sessionId: enrollment.sessionId,
        metadata: { order: 1, questId: quest1.questId },
      });
    }
  }

  return <Quest1Client alreadyCompleted={quest1.state === "completed"} />;
}
