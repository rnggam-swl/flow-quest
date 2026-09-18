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

export async function getAdminOverview(sessionId: string) {
  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId },
    include: { User: true },
    orderBy: { createdAt: "asc" },
  });

  const rows: AdminParticipantRow[] = [];
  for (const p of participants) {
    const team = await prisma.team.findFirst({
      where: { sessionId, TeamMember: { some: { userId: p.participantId } } },
    });
    let submissionId: string | null = null;
    let totalScore: number | null = null;
    if (team) {
      const submission = await prisma.flowSubmission.findFirst({
        where: { teamId: team.id },
        include: { Score: true },
        orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
      });
      if (submission) {
        submissionId = submission.id;
        totalScore = submission.Score?.totalScore ?? null;
      }
    }
    rows.push({
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
      submissionId,
      totalScore,
    });
  }

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
