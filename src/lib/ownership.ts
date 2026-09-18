import "server-only";
import { prisma } from "@/lib/prisma";

/** Verifies the submission belongs to a team the given user is a member of. */
export async function getOwnedSubmission(userId: string, submissionId: string) {
  const submission = await prisma.flowSubmission.findUnique({
    where: { id: submissionId },
    include: { Team: { include: { TeamMember: true } } },
  });
  if (!submission) return null;
  const isMember = submission.Team.TeamMember.some((m) => m.userId === userId);
  return isMember ? submission : null;
}
