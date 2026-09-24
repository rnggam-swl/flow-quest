import "server-only";
import { prisma } from "@/lib/prisma";
import { caseContentSchema } from "@/lib/content/case";
import { LOCK_INCLUDE, lockOf } from "@/lib/content/versionLock";

/**
 * The workshop Session the admin pages manage: the most recently created one
 * that runs a case (is pinned to a ScenarioVersion). Creating a new session
 * (see createNewSession) makes it the managed one, which is how the admin
 * starts a new batch without touching old data.
 */
export async function getManagedSession() {
  return prisma.session.findFirst({
    where: { scenarioVersionId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
}

/** Every session that runs a case, newest first — for the admin's session history list, with each one's version lock. */
export async function listAllSessions() {
  const [sessions, latest] = await Promise.all([
    prisma.session.findMany({
      where: { scenarioVersionId: { not: null } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { SessionParticipant: true } },
        ScenarioVersion: { include: { Scenario: true } },
      },
    }),
    prisma.scenarioVersion.groupBy({ by: ["scenarioId"], where: { status: "PUBLISHED" }, _max: { version: true } }),
  ]);
  const locks = new Map(
    (await prisma.session.findMany({ where: { id: { in: sessions.map((s) => s.id) } }, select: { id: true, status: true, ...LOCK_INCLUDE } })).map((s) => [s.id, lockOf(s)])
  );
  const latestByScenario = new Map(latest.map((l) => [l.scenarioId, l._max.version]));
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    sessionCode: s.sessionCode,
    status: s.status,
    createdAt: s.createdAt,
    participantCount: s._count.SessionParticipant,
    caseTitle: s.ScenarioVersion?.Scenario.title ?? "—",
    caseVersion: s.ScenarioVersion?.version ?? null,
    latestVersion: s.ScenarioVersion ? (latestByScenario.get(s.ScenarioVersion.scenarioId) ?? null) : null,
    lock: locks.get(s.id) ?? null,
  }));
}

/** Cases a new session can run: every case with a published version, and its latest one. */
export async function listPlayableCases() {
  const scenarios = await prisma.scenario.findMany({
    where: { ScenarioVersion: { some: { status: "PUBLISHED" } } },
    include: { ScenarioVersion: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 } },
    orderBy: { title: "asc" },
  });
  return scenarios.map((s) => ({ id: s.id, title: s.title, version: s.ScenarioVersion[0].version }));
}

/**
 * Creates a brand-new Session (a new batch/class) running the latest
 * published version of a case, pinned so later edits to the case never
 * change it. Leaves every prior session's data untouched, and becomes the
 * managed session (most recently created).
 */
export async function createNewSession(params: { title: string; sessionCode: string; createdBy: string; scenarioId: string }) {
  const version = await prisma.scenarioVersion.findFirst({
    where: { scenarioId: params.scenarioId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!version) throw new Error("This case has no published version");
  const content = caseContentSchema.parse(version.content);
  const questRows = await prisma.quest.findMany({ where: { scenarioId: params.scenarioId } });
  const questIdByOrder = new Map(questRows.map((q) => [q.order, q.id]));
  const missing = content.quests.filter((q) => !questIdByOrder.has(q.order));
  if (missing.length) throw new Error(`Quest rows missing for order(s) ${missing.map((q) => q.order).join(", ")} — re-import the case`);

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        id: crypto.randomUUID(),
        title: params.title,
        sessionCode: params.sessionCode,
        status: "DRAFT",
        timeLimitMinutes: 60,
        createdBy: params.createdBy,
        scenarioVersionId: version.id,
      },
    });
    await tx.sessionQuest.createMany({
      data: content.quests.map((q) => ({ id: crypto.randomUUID(), sessionId: session.id, questId: questIdByOrder.get(q.order)!, order: q.order })),
    });
    return session;
  });
}
