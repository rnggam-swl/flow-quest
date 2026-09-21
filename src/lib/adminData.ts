import "server-only";
import { prisma } from "@/lib/prisma";

export interface AdminParticipantRow {
  sessionParticipantId: string;
  userId: string;
  displayName: string;
  email: string;
  school: string | null;
  groupName: string | null;
  status: string;
  totalXp: number;
  startedAt: Date | null;
  completedAt: Date | null;
  submissionId: string | null;
  totalScore: number | null;
}

/** Picks each team's most-recently-submitted FlowSubmission (submittedAt desc, DRAFT/null last) — matches the single-team `orderBy` this replaces, just computed in JS after one bulk fetch instead of one query per team. */
function pickLatestSubmission<T extends { submittedAt: Date | null }>(list: T[]): T | undefined {
  return [...list].sort((a, b) => {
    if (a.submittedAt && b.submittedAt) return b.submittedAt.getTime() - a.submittedAt.getTime();
    if (a.submittedAt) return -1;
    if (b.submittedAt) return 1;
    return 0;
  })[0];
}

export async function getAdminOverview(sessionId: string) {
  // Teams' FlowSubmissions are pulled via nested `include` (one DB round trip covering both)
  // rather than a separate query keyed off the team ids — worth doing on top of the pooler
  // this app's Supabase project runs behind, where each extra round trip costs real latency.
  const [participants, teams] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where: { sessionId },
      include: { User: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.team.findMany({
      where: { sessionId },
      include: { TeamMember: true, FlowSubmission: { include: { Score: true } } },
    }),
  ]);

  // A userId can map to more than one team row — `ensureSoloTeam`'s check-then-create isn't
  // race-proof, so a participant occasionally ends up with duplicate (mostly empty) solo teams
  // in the same session. Collect every submission across all of a user's teams rather than
  // picking one team arbitrarily, so a real submission isn't shadowed by an empty duplicate.
  const teamIdsByUserId = new Map<string, string[]>();
  const submissionsByTeam = new Map<string, (typeof teams)[number]["FlowSubmission"]>();
  teams.forEach((t) => {
    t.TeamMember.forEach((m) => {
      const list = teamIdsByUserId.get(m.userId) ?? [];
      list.push(t.id);
      teamIdsByUserId.set(m.userId, list);
    });
    submissionsByTeam.set(t.id, t.FlowSubmission);
  });

  const rows: AdminParticipantRow[] = participants.map((p) => {
    const teamIds = teamIdsByUserId.get(p.participantId) ?? [];
    const allSubmissions = teamIds.flatMap((teamId) => submissionsByTeam.get(teamId) ?? []);
    const latest = pickLatestSubmission(allSubmissions);
    return {
      sessionParticipantId: p.id,
      userId: p.participantId,
      displayName: p.User.displayName,
      email: p.User.email,
      school: p.User.school,
      groupName: p.User.groupName,
      status: p.status,
      totalXp: p.totalXp,
      startedAt: p.startedAt,
      completedAt: p.completedAt,
      submissionId: latest?.id ?? null,
      totalScore: latest?.Score?.totalScore ?? null,
    };
  });

  const completed = rows.filter((r) => r.status === "COMPLETED" || r.status === "TIME_EXPIRED");
  const inProgress = rows.filter((r) => r.status === "IN_PROGRESS");
  const scored = completed.filter((r) => r.totalScore !== null) as (AdminParticipantRow & { totalScore: number })[];
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, r) => sum + r.totalScore, 0) / scored.length)
    : 0;

  return {
    rows,
    stats: {
      total: rows.length,
      completed: completed.length,
      inProgress: inProgress.length,
      avgScore,
    },
  };
}

export async function getRecentActivity(sessionId: string, limit = 30) {
  const logs = await prisma.activityLog.findMany({
    where: { sessionId },
    include: { User: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return logs.map((l) => ({
    id: l.id,
    event: l.event,
    displayName: l.User?.displayName ?? "—",
    createdAt: l.createdAt.toISOString(),
    metadata: l.metadata,
  }));
}
