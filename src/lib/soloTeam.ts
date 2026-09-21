import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * The existing schema models teams of collaborators (Team/TeamMember/Role).
 * This app's gameplay is solo, so every participant gets an invisible
 * "team of one" so we can reuse FlowSubmission/Score/Reflection/etc. as-is
 * without any schema changes. The Role assigned is arbitrary — role-specific
 * mechanics aren't part of this solo product.
 *
 * Cached per request — the participant layout and every page under it call
 * this independently, and it's idempotent, so sharing one lookup (or one
 * create, the first time) per request avoids redundant round-trips.
 */
export const ensureSoloTeam = cache(async (sessionId: string, userId: string, displayName: string) => {
  const existing = await prisma.teamMember.findFirst({
    where: { userId, Team: { sessionId } },
    select: { teamId: true },
  });
  if (existing) return existing.teamId;

  const role = await prisma.role.findFirst({ orderBy: { code: "asc" } });
  if (!role) throw new Error("No Role rows found — cannot satisfy TeamMember.roleId");

  // Upserts against the (sessionId, soloOwnerId) unique constraint instead of a plain create —
  // the fast-path SELECT above isn't race-proof (two concurrent requests can both miss it), so
  // this is what actually prevents a user from ending up with duplicate solo teams: a second,
  // concurrent call lands on `update: {}` (a no-op) and gets back the same team row, not a new one.
  const team = await prisma.team.upsert({
    where: { sessionId_soloOwnerId: { sessionId, soloOwnerId: userId } },
    update: {},
    create: {
      id: crypto.randomUUID(),
      sessionId,
      name: `${displayName} (Solo)`,
      soloOwnerId: userId,
    },
  });
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId } },
    update: {},
    create: {
      id: crypto.randomUUID(),
      teamId: team.id,
      userId,
      roleId: role.id,
    },
  });

  return team.id;
});
