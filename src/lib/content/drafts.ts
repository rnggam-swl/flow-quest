import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { CaseContent } from "@/lib/content/case";
import { findDraftProblems, type DraftProblem } from "@/lib/content/draftProblems";
import { canonicalJson, latestPublished, repinSession, writePublishedVersion } from "@/lib/content/importCase";
import { UNLOCKED_SESSION_WHERE } from "@/lib/content/versionLock";

/**
 * The builder's working copy of a case. Each case has at most one draft,
 * stored as its ScenarioVersion 0 with status DRAFT — no session is ever
 * pinned to it, and every "latest version" lookup filters on PUBLISHED, so a
 * draft is invisible to participants until it's published as the next
 * version. A draft may be unfinished; publishing requires it to pass every
 * check parseCase runs.
 *
 * Saves are guarded by a revision (a hash of the content the editor started
 * from), so two tabs editing the same case can't silently overwrite each other.
 */

export const DRAFT_VERSION = 0;
/** A whole case is a few hundred KB at most; this only stops runaway payloads. */
const MAX_DRAFT_CHARS = 2_000_000;

export function contentRevision(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex").slice(0, 20);
}

function findDraftRow(scenarioId: string) {
  return prisma.scenarioVersion.findUnique({ where: { scenarioId_version: { scenarioId, version: DRAFT_VERSION } } });
}

export interface EditableCase {
  scenarioId: string;
  key: string;
  title: string;
  /** The draft if there is one, otherwise the latest published version. */
  content: CaseContent;
  fromDraft: boolean;
  revision: string;
  publishedVersion: number | null;
  problems: DraftProblem[];
  /** Sessions of the case that aren't locked to their version (see versionLock.ts) — publishing can move them onto the new one. */
  idleSessions: number;
  /** Sessions of the case locked to their version: active, or with participant progress. */
  lockedSessions: number;
}

/** Sessions of the case that aren't locked to their version. */
async function idleSessionIds(scenarioId: string) {
  const sessions = await prisma.session.findMany({
    where: { ScenarioVersion: { scenarioId, status: "PUBLISHED" }, ...UNLOCKED_SESSION_WHERE },
    select: { id: true },
  });
  return sessions.map((s) => s.id);
}

async function lockedSessionCount(scenarioId: string) {
  return prisma.session.count({ where: { ScenarioVersion: { scenarioId, status: "PUBLISHED" }, NOT: UNLOCKED_SESSION_WHERE } });
}

export async function loadEditableCase(caseKey: string): Promise<EditableCase | null> {
  const scenario = await prisma.scenario.findUnique({ where: { key: caseKey } });
  if (!scenario) return null;
  const [draft, published] = await Promise.all([findDraftRow(scenario.id), latestPublished(prisma, scenario.id)]);
  const row = draft ?? published;
  if (!row) return null;
  const { problems } = findDraftProblems(row.content);
  // Publishing puts every session behind the new version, including those on today's latest.
  const [idle, locked] = await Promise.all([idleSessionIds(scenario.id), lockedSessionCount(scenario.id)]);
  return {
    scenarioId: scenario.id,
    key: caseKey,
    title: scenario.title,
    // The builder only ever writes CaseContent-shaped drafts; problems lists anything unfinished.
    content: row.content as unknown as CaseContent,
    fromDraft: Boolean(draft),
    revision: contentRevision(row.content),
    publishedVersion: published?.version ?? null,
    problems,
    idleSessions: idle.length,
    lockedSessions: locked,
  };
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; problems?: DraftProblem[] };

async function currentState(caseKey: string) {
  const scenario = await prisma.scenario.findUnique({ where: { key: caseKey } });
  if (!scenario) return null;
  const [draft, published] = await Promise.all([findDraftRow(scenario.id), latestPublished(prisma, scenario.id)]);
  const current = draft ?? published;
  return { scenario, draft, published, revision: current ? contentRevision(current.content) : null };
}

const CONFLICT = "Draf ini sudah diubah di tab atau perangkat lain. Muat ulang halaman untuk melihat versi terbarunya.";

export async function saveDraft(params: {
  caseKey: string;
  content: unknown;
  baseRevision: string;
  userId: string;
}): Promise<DraftResult<{ revision: string; problems: DraftProblem[] }>> {
  const { caseKey, content, baseRevision, userId } = params;
  if (!content || typeof content !== "object" || Array.isArray(content)) return { ok: false, status: 400, error: "Isi draf tidak valid" };
  if ((content as { key?: unknown }).key !== caseKey) return { ok: false, status: 400, error: "Kunci kasus tidak boleh diubah dari builder" };
  if (JSON.stringify(content).length > MAX_DRAFT_CHARS) return { ok: false, status: 413, error: "Draf terlalu besar" };

  const state = await currentState(caseKey);
  if (!state) return { ok: false, status: 404, error: "Kasus tidak ditemukan" };
  if (state.revision !== baseRevision) return { ok: false, status: 409, error: CONFLICT };

  const json = content as object;
  if (state.draft) {
    await prisma.scenarioVersion.update({ where: { id: state.draft.id }, data: { content: json, createdBy: userId } });
  } else {
    await prisma.scenarioVersion.create({
      data: { id: crypto.randomUUID(), scenarioId: state.scenario.id, version: DRAFT_VERSION, status: "DRAFT", content: json, createdBy: userId },
    });
  }
  return { ok: true, value: { revision: contentRevision(content), problems: findDraftProblems(content).problems } };
}

/**
 * Throws the draft away; the builder falls back to the latest published
 * version. A case that was never published has nothing to fall back to, so
 * discarding its draft deletes the case itself.
 */
export async function discardDraft(caseKey: string): Promise<DraftResult<{ revision: string | null; deletedCase: boolean }>> {
  const state = await currentState(caseKey);
  if (!state) return { ok: false, status: 404, error: "Kasus tidak ditemukan" };
  if (!state.published) {
    const sessions = await prisma.session.count({ where: { ScenarioVersion: { scenarioId: state.scenario.id } } });
    if (sessions) return { ok: false, status: 409, error: "Kasus ini sudah dipakai session, jadi tidak bisa dihapus." };
    await prisma.scenario.delete({ where: { id: state.scenario.id } });
    return { ok: true, value: { revision: null, deletedCase: true } };
  }
  if (state.draft) await prisma.scenarioVersion.delete({ where: { id: state.draft.id } });
  return { ok: true, value: { revision: contentRevision(state.published.content), deletedCase: false } };
}

export async function publishDraft(params: {
  caseKey: string;
  baseRevision: string;
  userId: string;
  note?: string;
  moveIdleSessions: boolean;
}): Promise<DraftResult<{ status: "published" | "unchanged"; version: number; movedSessions: number }>> {
  const state = await currentState(params.caseKey);
  if (!state) return { ok: false, status: 404, error: "Kasus tidak ditemukan" };
  if (!state.draft) return { ok: false, status: 400, error: "Belum ada draf yang disimpan" };
  if (state.revision !== params.baseRevision) return { ok: false, status: 409, error: CONFLICT };

  const { problems, content } = findDraftProblems(state.draft.content);
  if (!content || problems.length) return { ok: false, status: 422, error: "Draf belum bisa dipublish", problems };
  if (content.key !== params.caseKey) return { ok: false, status: 400, error: "Kunci kasus tidak cocok" };

  const draftId = state.draft.id;
  if (state.published && canonicalJson(state.published.content) === canonicalJson(content)) {
    await prisma.scenarioVersion.delete({ where: { id: draftId } });
    return { ok: true, value: { status: "unchanged", version: state.published.version, movedSessions: 0 } };
  }

  const idle = params.moveIdleSessions ? await idleSessionIds(state.scenario.id) : [];
  return prisma.$transaction(async (tx) => {
    const { created } = await writePublishedVersion(tx, state.scenario.id, content, { note: params.note ?? null, createdBy: params.userId });
    await tx.scenarioVersion.delete({ where: { id: draftId } });
    // Re-checked inside the transaction: a session may have started since `idle` was read.
    const movable = idle.length ? await tx.session.findMany({ where: { id: { in: idle }, ...UNLOCKED_SESSION_WHERE }, select: { id: true } }) : [];
    for (const s of movable) await repinSession(tx, s.id, { id: created.id, scenarioId: state.scenario.id, content });
    const movedSessions = movable.length;
    return { ok: true as const, value: { status: "published" as const, version: created.version, movedSessions } };
  });
}

export interface CaseListItem {
  key: string;
  title: string;
  publishedVersion: number | null;
  publishedAt: Date | null;
  hasDraft: boolean;
  draftBy: string | null;
  sessions: number;
  modules: number;
  quests: { order: number; title: string; questions: number; types: string[] }[];
}

/** Every case that has content, for /admin/konten. */
export async function listEditableCases(): Promise<CaseListItem[]> {
  const scenarios = await prisma.scenario.findMany({
    where: { key: { not: null }, ScenarioVersion: { some: {} } },
    include: {
      ScenarioVersion: {
        where: { OR: [{ version: DRAFT_VERSION }, { status: "PUBLISHED" }] },
        orderBy: { version: "desc" },
        include: { User: { select: { displayName: true } }, _count: { select: { Session: true } } },
      },
    },
    orderBy: { title: "asc" },
  });
  return scenarios.map((s) => {
    const draft = s.ScenarioVersion.find((v) => v.version === DRAFT_VERSION);
    const published = s.ScenarioVersion.find((v) => v.status === "PUBLISHED");
    const content = (draft ?? published)?.content as unknown as CaseContent | undefined;
    return {
      key: s.key!,
      title: s.title,
      publishedVersion: published?.version ?? null,
      publishedAt: published?.publishedAt ?? null,
      hasDraft: Boolean(draft),
      draftBy: draft?.User?.displayName ?? null,
      sessions: s.ScenarioVersion.reduce((n, v) => n + v._count.Session, 0),
      modules: Array.isArray(content?.modules) ? content.modules.length : 0,
      quests: (content?.quests ?? []).map((q) => ({ order: q.order, title: q.title, questions: q.questions.length, types: q.questions.map((x) => x.type) })),
    };
  });
}
