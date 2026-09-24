import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CaseContent } from "@/lib/content/case";

/**
 * Stores a validated case as a new published ScenarioVersion (see
 * prisma/import-case.ts for the CLI, prisma/seed.ts for the demo data, and
 * drafts.ts for the builder's publish). The Scenario is found by the content's
 * key — or, for a case that predates keys, by its exact title — and created if
 * it doesn't exist. Nothing is written when the content equals the latest
 * published version.
 *
 * Quest rows are kept in sync with the content because SessionQuest,
 * FlowSubmission and QuestAttempt point at them; what participants see and
 * are scored on comes from the version their session is pinned to.
 */

/** JSON with sorted keys, so content read back from JSONB compares equal regardless of key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface ImportResult {
  status: "unchanged" | "created" | "would-create";
  scenarioId: string | null;
  version: number;
  movedSessions: number;
  staleQuests: { order: number; title: string }[];
}

type Tx = Prisma.TransactionClient;

/** The latest published version of a scenario; drafts (version 0) never count. */
export function latestPublished(db: Tx | PrismaClient, scenarioId: string) {
  return db.scenarioVersion.findFirst({ where: { scenarioId, status: "PUBLISHED" }, orderBy: { version: "desc" } });
}

/**
 * Writes `content` as the scenario's next published version, and brings the
 * Scenario and Quest rows in line with it. Returns the new version and any
 * Quest rows the content no longer has (kept for the sessions that used them).
 */
export async function writePublishedVersion(
  tx: Tx,
  scenarioId: string,
  content: CaseContent,
  meta: { note?: string | null; createdBy?: string | null }
) {
  const latest = await latestPublished(tx, scenarioId);
  const version = (latest?.version ?? 0) + 1;
  await tx.scenario.update({
    where: { id: scenarioId },
    data: { key: content.key, title: content.title, description: content.description, userDescription: content.persona ?? null, userGoal: content.userGoal ?? null },
  });
  const created = await tx.scenarioVersion.create({
    data: {
      id: crypto.randomUUID(),
      scenarioId,
      version,
      status: "PUBLISHED",
      publishedAt: new Date(),
      content,
      note: meta.note ?? null,
      createdBy: meta.createdBy ?? null,
    },
  });
  for (const q of content.quests) {
    const questData = { title: q.title, objective: q.objective, xp: q.xp, timeLimitMinutes: q.timeLimitMinutes, published: true };
    await tx.quest.upsert({
      where: { scenarioId_order: { scenarioId, order: q.order } },
      update: questData,
      create: { id: crypto.randomUUID(), scenarioId, order: q.order, ...questData },
    });
  }
  const stale = await tx.quest.findMany({ where: { scenarioId, order: { notIn: content.quests.map((q) => q.order) } } });
  return { created, previous: latest, staleQuests: stale.map((q) => ({ order: q.order, title: q.title })) };
}

/**
 * Points a session at another version of its case and brings its SessionQuest
 * rows in line with that version's quests: quests the version no longer has
 * are dropped from the session, new ones are added, and the rest keep their
 * per-session timer. Quest rows are per (case, order), so an order that exists
 * in both versions keeps its row. Callers decide whether the session may move
 * (see versionLock.ts); participant data is never touched here.
 */
export async function repinSession(tx: Tx, sessionId: string, version: { id: string; scenarioId: string; content: CaseContent }) {
  const orders = version.content.quests.map((q) => q.order);
  const questRows = await tx.quest.findMany({ where: { scenarioId: version.scenarioId, order: { in: orders } } });
  const questIdByOrder = new Map(questRows.map((q) => [q.order, q.id]));
  const missing = orders.filter((o) => !questIdByOrder.has(o));
  if (missing.length) throw new Error(`Quest rows missing for order(s) ${missing.join(", ")}`);

  const existing = await tx.sessionQuest.findMany({ where: { sessionId } });
  const stale = existing.filter((sq) => questIdByOrder.get(sq.order) !== sq.questId);
  if (stale.length) await tx.sessionQuest.deleteMany({ where: { id: { in: stale.map((sq) => sq.id) } } });
  const kept = new Set(existing.filter((sq) => !stale.includes(sq)).map((sq) => sq.order));
  const toCreate = orders.filter((o) => !kept.has(o));
  if (toCreate.length) {
    await tx.sessionQuest.createMany({ data: toCreate.map((order) => ({ id: crypto.randomUUID(), sessionId, questId: questIdByOrder.get(order)!, order })) });
  }
  await tx.session.update({ where: { id: sessionId }, data: { scenarioVersionId: version.id } });
}

export async function importCase(
  prisma: PrismaClient,
  content: CaseContent,
  options: { note?: string; moveSessions?: boolean; dryRun?: boolean } = {}
): Promise<ImportResult> {
  const scenario =
    (await prisma.scenario.findUnique({ where: { key: content.key } })) ??
    (await prisma.scenario.findFirst({ where: { title: content.title, key: null } }));
  const latest = scenario ? await latestPublished(prisma, scenario.id) : null;

  if (latest && canonicalJson(latest.content) === canonicalJson(content)) {
    return { status: "unchanged", scenarioId: scenario!.id, version: latest.version, movedSessions: 0, staleQuests: [] };
  }
  const version = (latest?.version ?? 0) + 1;
  if (options.dryRun) {
    const moving = options.moveSessions && latest ? await prisma.session.count({ where: { scenarioVersionId: latest.id } }) : 0;
    return { status: "would-create", scenarioId: scenario?.id ?? null, version, movedSessions: moving, staleQuests: [] };
  }

  return prisma.$transaction(async (tx) => {
    const scenarioId =
      scenario?.id ??
      (await tx.scenario.create({ data: { id: crypto.randomUUID(), key: content.key, title: content.title, description: content.description } })).id;
    const { created, previous, staleQuests } = await writePublishedVersion(tx, scenarioId, content, { note: options.note });

    let movedSessions = 0;
    if (options.moveSessions && previous) {
      const sessions = await tx.session.findMany({ where: { scenarioVersionId: previous.id }, select: { id: true } });
      for (const s of sessions) await repinSession(tx, s.id, { id: created.id, scenarioId, content });
      movedSessions = sessions.length;
    }
    return { status: "created" as const, scenarioId, version: created.version, movedSessions, staleQuests };
  });
}
