import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { caseContentSchema, type CaseContent } from "@/lib/content/case";

/**
 * Reads the case content a session runs — the ScenarioVersion it's pinned to.
 * Versions never change once written, so each one is parsed once per server
 * process and reused.
 */

export interface SessionContent {
  versionId: string;
  version: number;
  content: CaseContent;
}

const parsedVersions = new Map<string, CaseContent>();

function parseVersion(id: string, raw: unknown): CaseContent {
  let parsed = parsedVersions.get(id);
  if (!parsed) {
    parsed = caseContentSchema.parse(raw);
    parsedVersions.set(id, parsed);
  }
  return parsed;
}

/** Null for a session that isn't pinned to any case version (sessions of cases this app doesn't run). */
export const getSessionContent = cache(async (sessionId: string): Promise<SessionContent | null> => {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { ScenarioVersion: true } });
  const v = session?.ScenarioVersion;
  if (!v) return null;
  return { versionId: v.id, version: v.version, content: parseVersion(v.id, v.content) };
});

export { questOf, lastQuestOrder, flowQuestionOf, quizQuestionsOf, paletteOf, effectiveTimeLimit } from "@/lib/content/questHelpers";
