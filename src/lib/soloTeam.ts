import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The existing schema models teams of collaborators (Team/TeamMember/Role).
 * This app's gameplay is solo, so every participant gets an invisible
 * "team of one" so we can reuse FlowSubmission/Score/Reflection/etc. as-is
 * without any schema changes. The Role assigned is arbitrary — role-specific
 * mechanics aren't part of this solo product.
 */
export async function ensureSoloTeam(sessionId: string, userId: string, displayName: string) {
  const existing = await prisma.teamMember.findFirst({
    where: { userId, Team: { sessionId } },
    select: { teamId: true },
  });
  if (existing) return existing.teamId;

  const role = await prisma.role.findFirst({ orderBy: { code: "asc" } });
  if (!role) throw new Error("No Role rows found — cannot satisfy TeamMember.roleId");

  const teamId = crypto.randomUUID();
  await prisma.team.create({
    data: {
      id: teamId,
      sessionId,
      name: `${displayName} (Solo)`,
    },
  });
  await prisma.teamMember.create({
    data: {
      id: crypto.randomUUID(),
      teamId,
      userId,
      roleId: role.id,
    },
  });

  return teamId;
}
