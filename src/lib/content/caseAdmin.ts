import "server-only";
import { prisma } from "@/lib/prisma";
import { caseContentSchema, type CaseContent } from "@/lib/content/case";
import { blankCase, duplicateCaseContent, isValidCaseKey } from "@/lib/content/caseEdit";
import { DRAFT_VERSION, type DraftResult } from "@/lib/content/drafts";
import { latestPublished, repinSession } from "@/lib/content/importCase";
import { LOCK_INCLUDE, lockOf, type LockReason } from "@/lib/content/versionLock";

/**
 * Whole-case operations for /admin/konten (Fase 4): starting a case (blank,
 * as a copy, or from an imported file), exporting one, deleting one that
 * never went live, and moving a session that hasn't started onto the newest
 * version. A new case exists only as a draft until it's published from the
 * builder, so none of this can change what a running session shows.
 */

const MAX_TITLE = 200;

async function keyTaken(key: string) {
  return Boolean(await prisma.scenario.findUnique({ where: { key }, select: { id: true } }));
}

function checkKeyAndTitle(key: string, title: string): string | null {
  if (!isValidCaseKey(key)) return "Kunci kasus hanya huruf kecil, angka, dan tanda - (maks. 60 karakter).";
  if (!title.trim() || title.length > MAX_TITLE) return "Judul kasus wajib diisi (maks. 200 karakter).";
  return null;
}

/** Stores `content` as the draft of a brand-new case. */
async function createCaseWithDraft(content: CaseContent, userId: string) {
  return prisma.$transaction(async (tx) => {
    const scenario = await tx.scenario.create({
      data: { id: crypto.randomUUID(), key: content.key, title: content.title, description: content.description ?? "", userDescription: content.persona ?? null, userGoal: content.userGoal ?? null },
    });
    await tx.scenarioVersion.create({
      data: { id: crypto.randomUUID(), scenarioId: scenario.id, version: DRAFT_VERSION, status: "DRAFT", content: content as object, createdBy: userId },
    });
    return scenario;
  });
}

/** The content the builder would open: the draft if there is one, else the latest published version. */
async function currentContent(caseKey: string): Promise<{ content: unknown; version: number } | null> {
  const scenario = await prisma.scenario.findUnique({ where: { key: caseKey } });
  if (!scenario) return null;
  const draft = await prisma.scenarioVersion.findUnique({ where: { scenarioId_version: { scenarioId: scenario.id, version: DRAFT_VERSION } } });
  const row = draft ?? (await latestPublished(prisma, scenario.id));
  return row ? { content: row.content, version: row.version } : null;
}

export async function createCase(params: { key: string; title: string; userId: string; fromKey?: string }): Promise<DraftResult<{ key: string }>> {
  const key = params.key.trim();
  const title = params.title.trim();
  const invalid = checkKeyAndTitle(key, title);
  if (invalid) return { ok: false, status: 400, error: invalid };
  if (await keyTaken(key)) return { ok: false, status: 409, error: `Kunci "${key}" sudah dipakai kasus lain.` };

  let content: CaseContent;
  if (params.fromKey) {
    const source = await currentContent(params.fromKey);
    if (!source) return { ok: false, status: 404, error: "Kasus sumber tidak ditemukan." };
    content = duplicateCaseContent(source.content as CaseContent, key, title);
  } else {
    content = blankCase(key, title);
  }
  await createCaseWithDraft(content, params.userId);
  return { ok: true, value: { key } };
}

/**
 * Imports a case file as a draft: a new case when its key is new, otherwise
 * the existing case's draft — replacing a draft already in progress only when
 * asked to. Nothing is published; the author reviews it in the builder first.
 */
export async function importCaseAsDraft(params: { raw: unknown; userId: string; replaceDraft: boolean }): Promise<DraftResult<{ key: string; created: boolean }>> {
  const parsed = caseContentSchema.safeParse(params.raw);
  // The builder's own shape check already ran client-side; this is the server's guard.
  const content = (parsed.success ? parsed.data : params.raw) as CaseContent;
  if (!content || typeof content !== "object" || !Array.isArray(content.quests) || !Array.isArray(content.nodes)) {
    return { ok: false, status: 400, error: "Isi file bukan kasus." };
  }
  const invalid = checkKeyAndTitle(String(content.key ?? ""), String(content.title ?? ""));
  if (invalid) return { ok: false, status: 400, error: invalid };
  if (JSON.stringify(content).length > 2_000_000) return { ok: false, status: 413, error: "File kasus terlalu besar." };

  const scenario = await prisma.scenario.findUnique({ where: { key: content.key } });
  if (!scenario) {
    await createCaseWithDraft(content, params.userId);
    return { ok: true, value: { key: content.key, created: true } };
  }
  const draft = await prisma.scenarioVersion.findUnique({ where: { scenarioId_version: { scenarioId: scenario.id, version: DRAFT_VERSION } } });
  if (draft && !params.replaceDraft) {
    return { ok: false, status: 409, error: `Kasus "${scenario.title}" sedang punya draf. Centang "ganti draf" untuk menimpanya.` };
  }
  if (draft) await prisma.scenarioVersion.update({ where: { id: draft.id }, data: { content: content as object, createdBy: params.userId } });
  else {
    await prisma.scenarioVersion.create({
      data: { id: crypto.randomUUID(), scenarioId: scenario.id, version: DRAFT_VERSION, status: "DRAFT", content: content as object, createdBy: params.userId },
    });
  }
  return { ok: true, value: { key: content.key, created: false } };
}

/** A case's content for download: "draft", "latest" (published), or a version number. */
export async function exportCaseContent(caseKey: string, which: string): Promise<{ content: unknown; version: number | "draft"; title: string } | null> {
  const scenario = await prisma.scenario.findUnique({ where: { key: caseKey } });
  if (!scenario) return null;
  let row;
  if (which === "draft") row = await prisma.scenarioVersion.findUnique({ where: { scenarioId_version: { scenarioId: scenario.id, version: DRAFT_VERSION } } });
  else if (which === "latest" || !which) row = await latestPublished(prisma, scenario.id);
  else {
    const n = Number(which);
    row = Number.isInteger(n) && n > 0 ? await prisma.scenarioVersion.findFirst({ where: { scenarioId: scenario.id, version: n, status: "PUBLISHED" } }) : null;
  }
  if (!row) return null;
  return { content: row.content, version: row.version === DRAFT_VERSION ? "draft" : row.version, title: scenario.title };
}

export interface VersionSessionInfo {
  id: string;
  title: string;
  sessionCode: string;
  status: string;
  lock: LockReason | null;
}

export interface CaseVersionInfo {
  version: number;
  publishedAt: Date | null;
  note: string | null;
  latest: boolean;
  sessions: VersionSessionInfo[];
}

/** Per case key: its published versions that sessions use (plus the latest), each with its sessions and their locks. */
export async function listCaseVersions(): Promise<Map<string, CaseVersionInfo[]>> {
  const versions = await prisma.scenarioVersion.findMany({
    where: { status: "PUBLISHED", Scenario: { key: { not: null } } },
    orderBy: { version: "desc" },
    select: {
      version: true,
      publishedAt: true,
      note: true,
      Scenario: { select: { key: true } },
      Session: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, sessionCode: true, status: true, ...LOCK_INCLUDE } },
    },
  });
  const byKey = new Map<string, CaseVersionInfo[]>();
  for (const v of versions) {
    const key = v.Scenario.key!;
    const list = byKey.get(key) ?? [];
    const latest = list.length === 0;
    if (latest || v.Session.length) {
      list.push({
        version: v.version,
        publishedAt: v.publishedAt,
        note: v.note,
        latest,
        sessions: v.Session.map((s) => ({ id: s.id, title: s.title, sessionCode: s.sessionCode, status: s.status, lock: lockOf(s) })),
      });
    }
    byKey.set(key, list);
  }
  return byKey;
}

/**
 * Moves a session that hasn't started onto its case's newest published
 * version (the admin's "Perbarui versi"), refusing while it's locked.
 */
export async function upgradeSessionVersion(sessionId: string): Promise<DraftResult<{ version: number }>> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { ScenarioVersion: true, ...LOCK_INCLUDE } });
  if (!session?.ScenarioVersion) return { ok: false, status: 404, error: "Session tidak ditemukan." };
  const lock = lockOf(session);
  if (lock === "active") return { ok: false, status: 423, error: "Session sedang aktif, jadi versinya dikunci. Ubah status session dulu jika memang belum dimulai." };
  if (lock === "progress") return { ok: false, status: 423, error: "Peserta sudah punya progres di session ini, jadi versinya dikunci." };

  const latest = await latestPublished(prisma, session.ScenarioVersion.scenarioId);
  if (!latest || latest.version <= session.ScenarioVersion.version) return { ok: false, status: 400, error: "Session ini sudah memakai versi terbaru." };
  const content = caseContentSchema.parse(latest.content);
  await prisma.$transaction(async (tx) => {
    // Re-checked inside the transaction so a session that just started isn't moved.
    const still = await tx.session.findUnique({ where: { id: sessionId }, include: LOCK_INCLUDE });
    if (!still || lockOf(still)) throw new Error("Session berubah saat diperbarui; coba lagi.");
    await repinSession(tx, sessionId, { id: latest.id, scenarioId: latest.scenarioId, content });
  });
  return { ok: true, value: { version: latest.version } };
}

