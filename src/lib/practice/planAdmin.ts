import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { contentRevision } from "@/lib/content/drafts";
import { getSessionContent } from "@/lib/content/sessionContent";
import { flowQuestionOf } from "@/lib/content/questHelpers";
import { getParticipantReport } from "@/lib/adminReport";
import type { CaseContent } from "@/lib/content/case";
import { findPlanProblems } from "@/lib/practice/plan";
import { practicePlanContentSchema, type PracticePlanContent } from "@/lib/practice/schema";
import type { ParticipantFlow } from "@/lib/practice/fixerFromFlow";
import { readAnswers } from "@/lib/practice/practiceData";

/**
 * The mentor's plan editor (replacing the JSON import of
 * prisma/seed-practice-plans.ts): loading a participant's plan with what the
 * editor needs around it, and saving it with the same checks the importer
 * ran. Saving replaces only the plan; the participant's progress and written
 * answers stay. Edits are guarded by a revision of the stored plan, so two
 * mentors can't silently overwrite each other.
 */

export interface QuestFlowSource {
  order: number;
  title: string;
  /** The participant's submitted canvas; null when they never built one. */
  flow: ParticipantFlow | null;
  status: string | null;
}

export interface PlanEditorData {
  sessionParticipantId: string;
  displayName: string;
  sessionTitle: string;
  sessionCode: string;
  content: CaseContent;
  /** The stored plan, or null when the participant has none yet (they see every module). */
  plan: PracticePlanContent | null;
  /** Raw content that no longer passes the schema, e.g. after a case change — shown so it isn't silently lost. */
  invalidPlan: unknown;
  revision: string;
  completedParts: string[];
  answerCount: number;
  flows: QuestFlowSource[];
}

function planRevision(content: unknown) {
  return contentRevision(content ?? null);
}

export async function loadPlanEditor(sessionParticipantId: string): Promise<PlanEditorData | null> {
  const enrollment = await prisma.sessionParticipant.findUnique({
    where: { id: sessionParticipantId },
    include: { User: true, Session: true, PracticePlan: true },
  });
  if (!enrollment) return null;
  const pinned = await getSessionContent(enrollment.sessionId);
  if (!pinned) return null;

  const report = await getParticipantReport(enrollment.sessionId, sessionParticipantId);
  const flows: QuestFlowSource[] = pinned.content.quests.flatMap((q) => {
    if (!flowQuestionOf(q)) return [];
    const r = report?.quests.find((x) => x.order === q.order);
    const graph = r?.flow?.graph;
    return [{ order: q.order, title: q.title, status: r?.status ?? null, flow: graph && graph.nodes.length ? { nodes: graph.nodes, connections: graph.connections } : null }];
  });

  const row = enrollment.PracticePlan;
  const parsed = row?.content == null ? null : practicePlanContentSchema.safeParse(row.content);
  return {
    sessionParticipantId,
    displayName: enrollment.User.displayName,
    sessionTitle: enrollment.Session.title,
    sessionCode: enrollment.Session.sessionCode,
    content: pinned.content,
    plan: parsed?.success ? parsed.data : null,
    invalidPlan: parsed && !parsed.success ? row!.content : null,
    revision: planRevision(row?.content),
    completedParts: row?.completedParts ?? [],
    answerCount: Object.keys(readAnswers(row?.answers)).length,
    flows,
  };
}

export type PlanSaveResult = { ok: true; revision: string } | { ok: false; status: number; error: string; problems?: string[] };

const CONFLICT = "Rencana ini sudah diubah di tab atau perangkat lain. Muat ulang halaman untuk melihat versi terbarunya.";

/** Saves (or, with `raw` null, removes) a participant's plan, checked against the case their session runs. */
export async function savePlan(params: { sessionParticipantId: string; raw: unknown; baseRevision: string }): Promise<PlanSaveResult> {
  const enrollment = await prisma.sessionParticipant.findUnique({ where: { id: params.sessionParticipantId }, include: { PracticePlan: true } });
  if (!enrollment) return { ok: false, status: 404, error: "Peserta tidak ditemukan" };
  if (planRevision(enrollment.PracticePlan?.content) !== params.baseRevision) return { ok: false, status: 409, error: CONFLICT };

  if (params.raw === null) {
    // Back to "every module"; progress and answers stay for when a plan returns.
    await prisma.practicePlan.updateMany({ where: { sessionParticipantId: params.sessionParticipantId }, data: { content: Prisma.DbNull } });
    return { ok: true, revision: planRevision(null) };
  }

  const pinned = await getSessionContent(enrollment.sessionId);
  if (!pinned) return { ok: false, status: 400, error: "Session peserta ini belum punya konten kasus" };
  const parsed = practicePlanContentSchema.safeParse(params.raw);
  if (!parsed.success) return { ok: false, status: 422, error: "Rencana belum lengkap", problems: [z.prettifyError(parsed.error)] };
  const problems = findPlanProblems(parsed.data, pinned.content);
  if (problems.length) return { ok: false, status: 422, error: "Rencana belum bisa disimpan", problems };

  const content = parsed.data;
  await prisma.practicePlan.upsert({
    where: { sessionParticipantId: params.sessionParticipantId },
    update: { content },
    create: { id: crypto.randomUUID(), sessionParticipantId: params.sessionParticipantId, content },
  });
  return { ok: true, revision: planRevision(content) };
}
