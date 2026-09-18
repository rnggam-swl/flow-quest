import "server-only";
import { prisma } from "@/lib/prisma";
import { SCENARIO_TITLE } from "@/lib/constants";

/**
 * The workshop Session this app currently manages/plays: the most recently
 * created one under our scenario. Every admin page (dashboard, settings,
 * participants) operates on this one. Creating a new session (see
 * createNewSession) makes it the new managed session going forward, which is
 * how the admin starts a new batch without touching old data.
 */
export async function getManagedSession() {
  return prisma.session.findFirst({
    where: { SessionQuest: { some: { Quest: { Scenario: { title: SCENARIO_TITLE } } } } },
    orderBy: { createdAt: "desc" },
  });
}

/** All sessions ever created under our scenario, newest first — for the admin's session history list. */
export async function listAllSessions() {
  const sessions = await prisma.session.findMany({
    where: { SessionQuest: { some: { Quest: { Scenario: { title: SCENARIO_TITLE } } } } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { SessionParticipant: true } } },
  });
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    sessionCode: s.sessionCode,
    status: s.status,
    createdAt: s.createdAt,
    participantCount: s._count.SessionParticipant,
  }));
}

/**
 * Creates a brand-new Session (a new batch/class) linked to the same 5
 * quests under our scenario, leaving every prior session's data untouched.
 * It automatically becomes the managed session (most recently created).
 */
export async function createNewSession(params: { title: string; sessionCode: string; createdBy: string }) {
  const quests = await prisma.quest.findMany({
    where: { Scenario: { title: SCENARIO_TITLE } },
    orderBy: { order: "asc" },
  });
  if (quests.length === 0) throw new Error("No quests found under the managed scenario");

  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      title: params.title,
      sessionCode: params.sessionCode,
      status: "DRAFT",
      timeLimitMinutes: 60,
      createdBy: params.createdBy,
    },
  });

  for (const quest of quests) {
    await prisma.sessionQuest.create({
      data: {
        id: crypto.randomUUID(),
        sessionId: session.id,
        questId: quest.id,
        order: quest.order,
      },
    });
  }

  return session;
}
