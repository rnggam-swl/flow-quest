import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { getLatestEnrollment, getQuestList, type QuestListItem } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { planParts, resolvePlan, type ResolvedPlan } from "@/lib/practice/plan";

/** Modul Latihan opens once every quest in the session is done (a timed-out Quest 5 still counts). */
export function hasFinishedAllQuests(items: QuestListItem[]) {
  return items.length > 0 && items.every((i) => i.state === "completed");
}

export type SavedAnswers = Record<string, string>;

export function readAnswers(raw: unknown): SavedAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export interface ParticipantPractice {
  sessionParticipantId: string;
  finished: boolean;
  plan: ResolvedPlan;
  completedParts: string[];
  answers: SavedAnswers;
}

/**
 * Everything the participant's /latihan page and its API routes need.
 * Deliberately not gated on the session schedule or personal deadline —
 * the modules are follow-up study, meant to be opened after the workshop.
 */
export async function loadParticipantPractice(user: CurrentUser): Promise<ParticipantPractice | null> {
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) return null;

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);
  const [{ items }, row] = await Promise.all([
    getQuestList(enrollment.sessionId, teamId, user.id),
    prisma.practicePlan.findUnique({ where: { sessionParticipantId: enrollment.id } }),
  ]);

  return {
    sessionParticipantId: enrollment.id,
    finished: hasFinishedAllQuests(items),
    plan: resolvePlan(row?.content, user.displayName),
    completedParts: row?.completedParts ?? [],
    answers: readAnswers(row?.answers),
  };
}

/** Progress line for the Modul Latihan card on /brief. */
export async function getPracticeSummary(sessionParticipantId: string, displayName: string) {
  const row = await prisma.practicePlan.findUnique({ where: { sessionParticipantId } });
  const plan = resolvePlan(row?.content, displayName);
  const parts = planParts(plan.content);
  return {
    personal: plan.personal,
    total: parts.length,
    done: parts.filter((p) => row?.completedParts.includes(p)).length,
  };
}

export type PracticeAccess =
  | { ok: true; practice: ParticipantPractice }
  | { ok: false; status: 401 | 400 | 403; error: string };

/** Shared gate for the /api/latihan/* routes: signed in, enrolled, and all quests done. */
export async function getPracticeAccess(user: CurrentUser | null): Promise<PracticeAccess> {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  const practice = await loadParticipantPractice(user);
  if (!practice) return { ok: false, status: 400, error: "Not enrolled" };
  if (!practice.finished) return { ok: false, status: 403, error: "Modul latihan terbuka setelah semua quest selesai" };
  return { ok: true, practice };
}

/**
 * Participants without a personal plan still get a row the first time they
 * save something (content stays null, so they keep seeing all six modules
 * until a mentor imports a plan for them).
 */
async function getOrCreateRow(sessionParticipantId: string) {
  return prisma.practicePlan.upsert({
    where: { sessionParticipantId },
    update: {},
    create: { id: crypto.randomUUID(), sessionParticipantId },
  });
}

export async function markPartDone(sessionParticipantId: string, part: string) {
  const row = await getOrCreateRow(sessionParticipantId);
  if (row.completedParts.includes(part)) return row.completedParts;
  const updated = await prisma.practicePlan.update({
    where: { id: row.id },
    data: { completedParts: [...row.completedParts, part] },
  });
  return updated.completedParts;
}

export async function saveAnswer(sessionParticipantId: string, key: string, text: string) {
  const row = await getOrCreateRow(sessionParticipantId);
  await prisma.practicePlan.update({
    where: { id: row.id },
    data: { answers: { ...readAnswers(row.answers), [key]: text } },
  });
}

/** "Ulangi dari awal": clears progress and saved answers, keeps the mentor's plan. */
export async function resetPractice(sessionParticipantId: string) {
  await prisma.practicePlan.updateMany({
    where: { sessionParticipantId },
    data: { completedParts: [], answers: {} },
  });
}
