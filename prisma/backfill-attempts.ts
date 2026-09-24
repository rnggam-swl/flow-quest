/**
 * Brings a case's existing sessions onto the versioned-content tables:
 *
 *   npx tsx --env-file=.env prisma/backfill-attempts.ts [case-key] [--dry-run]
 *
 * 1. Every session of the case that isn't pinned yet is pinned to the case's first published
 *    version — the content those sessions actually ran.
 * 2. Every flow quest run (FlowSubmission, one per solo team) becomes a QuestAttempt with the
 *    same status and timing.
 * 3. Every Quest 1 run recorded only in ActivityLog (QUEST_STARTED / QUEST_COMPLETED) becomes a
 *    QuestAttempt, and the chosen option a QuestionResponse scored with scoreQuestion.
 *
 * Safe to re-run at any time, including after the app writes these tables itself: it only creates
 * rows that don't exist yet, and only moves an attempt forward (a DRAFT whose source has since been
 * submitted). Anything the app recorded directly is never overwritten. Nothing in the existing
 * tables is modified.
 */
import { prisma } from "../src/lib/prisma";
import { caseContentSchema } from "../src/lib/content/case";
import { scoreQuestion, type QuizQuestion } from "../src/lib/content/questions";

function metaOf(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const caseKey = args.find((a) => !a.startsWith("--")) ?? "klub-fotografi";

  const scenario = await prisma.scenario.findUniqueOrThrow({ where: { key: caseKey }, include: { Quest: true } });
  const v1 = await prisma.scenarioVersion.findFirstOrThrow({
    where: { scenarioId: scenario.id, status: "PUBLISHED" },
    orderBy: { version: "asc" },
  });
  const content = caseContentSchema.parse(v1.content);
  const questByOrder = new Map(scenario.Quest.map((q) => [q.order, q]));

  const sessions = await prisma.session.findMany({
    where: { SessionQuest: { some: { Quest: { scenarioId: scenario.id } } } },
    include: { SessionParticipant: true },
    orderBy: { createdAt: "asc" },
  });
  const unpinned = sessions.filter((s) => !s.scenarioVersionId);
  console.log(`${sessions.length} session(s) of "${scenario.title}"; ${unpinned.length} to pin to version ${v1.version}.`);

  const enrollmentOf = new Map<string, string>(); // `${sessionId}|${userId}` -> SessionParticipant.id
  for (const s of sessions) for (const sp of s.SessionParticipant) enrollmentOf.set(`${s.id}|${sp.participantId}`, sp.id);

  // Flow quests, from FlowSubmission.
  const submissions = await prisma.flowSubmission.findMany({
    where: { Quest: { scenarioId: scenario.id } },
    include: { Team: { include: { TeamMember: true } } },
  });
  type Attempt = { sessionParticipantId: string; questId: string; status: "DRAFT" | "SUBMITTED" | "TIME_EXPIRED" | "REVIEWED"; startedAt: Date; submittedAt: Date | null; timeSpentSeconds: number | null };
  const attempts = new Map<string, Attempt>();
  let skipped = 0;
  for (const s of submissions) {
    const members = s.Team.TeamMember;
    const sp = members.length === 1 ? enrollmentOf.get(`${s.Team.sessionId}|${members[0].userId}`) : undefined;
    if (!sp) {
      skipped++;
      continue;
    }
    const key = `${sp}|${s.questId}`;
    const prev = attempts.get(key);
    // A duplicate solo team's empty draft must never shadow the real run.
    if (prev && prev.status !== "DRAFT" && s.status === "DRAFT") continue;
    attempts.set(key, { sessionParticipantId: sp, questId: s.questId, status: s.status, startedAt: s.startedAt, submittedAt: s.submittedAt, timeSpentSeconds: s.timeSpentSeconds });
  }

  // Quest 1, from ActivityLog.
  const quest1 = questByOrder.get(1);
  const q1Content = content.quests.find((q) => q.order === 1);
  const q1Question = q1Content?.questions[0] as QuizQuestion | undefined;
  const responses: { attemptKey: string; questionKey: string; answer: { selected: number }; correct: number; total: number; answeredAt: Date }[] = [];
  let disagreements = 0;
  let unmappedLogs = 0;
  if (quest1 && q1Question?.type === "singlechoice") {
    const logs = await prisma.activityLog.findMany({
      where: { sessionId: { in: sessions.map((s) => s.id) }, event: { in: ["QUEST_STARTED", "QUEST_COMPLETED"] }, metadata: { path: ["order"], equals: 1 } },
      orderBy: { createdAt: "asc" },
    });
    const byEnrollment = new Map<string, { started?: Date; completed?: { at: Date; meta: Record<string, unknown> } }>();
    for (const l of logs) {
      const sp = l.userId && l.sessionId ? enrollmentOf.get(`${l.sessionId}|${l.userId}`) : undefined;
      if (!sp) {
        // e.g. the log of an account deleted since (ActivityLog keeps the row with userId set to null).
        if (l.event === "QUEST_COMPLETED") unmappedLogs++;
        continue;
      }
      const entry = byEnrollment.get(sp) ?? {};
      if (l.event === "QUEST_STARTED") entry.started ??= l.createdAt;
      else entry.completed ??= { at: l.createdAt, meta: metaOf(l.metadata) };
      byEnrollment.set(sp, entry);
    }
    for (const [sp, e] of byEnrollment) {
      const startedAt = e.started ?? e.completed!.at;
      const key = `${sp}|${quest1.id}`;
      if (!e.completed) {
        attempts.set(key, { sessionParticipantId: sp, questId: quest1.id, status: "DRAFT", startedAt, submittedAt: null, timeSpentSeconds: null });
        continue;
      }
      const selected = Number(e.completed.meta.selectedIndex);
      const score = scoreQuestion(q1Question, { selected });
      if (Boolean(e.completed.meta.correct) !== (score.correct === 1)) disagreements++;
      attempts.set(key, {
        sessionParticipantId: sp,
        questId: quest1.id,
        status: "SUBMITTED",
        startedAt,
        submittedAt: e.completed.at,
        timeSpentSeconds: Math.max(0, Math.round((e.completed.at.getTime() - startedAt.getTime()) / 1000)),
      });
      responses.push({ attemptKey: key, questionKey: q1Question.id, answer: { selected }, ...score, answeredAt: e.completed.at });
    }
  }

  const byStatus = [...attempts.values()].reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
  console.log(
    `${attempts.size} quest attempt(s) ${JSON.stringify(byStatus)}, ${responses.length} Quest 1 answer(s); ` +
      `${skipped} flow run(s) skipped (not a solo team of an enrolled participant).`
  );
  if (unmappedLogs) console.log(`  ${unmappedLogs} Quest 1 completion log(s) skipped: no enrolled participant to attach them to.`);
  if (disagreements) console.warn(`  ! ${disagreements} Quest 1 answer(s) where the logged "correct" flag disagrees with the case's answer key.`);
  if (dryRun) {
    console.log("[dry-run] Nothing written.");
    return;
  }

  await prisma.session.updateMany({ where: { id: { in: unpinned.map((s) => s.id) } }, data: { scenarioVersionId: v1.id } });

  const existing = await prisma.questAttempt.findMany({
    where: { sessionParticipantId: { in: [...new Set([...attempts.values()].map((a) => a.sessionParticipantId))] } },
    include: { QuestionResponse: { select: { questionKey: true } } },
  });
  const existingByKey = new Map(existing.map((a) => [`${a.sessionParticipantId}|${a.questId}`, a]));
  const counts = { created: 0, advanced: 0, kept: 0, responses: 0 };
  const attemptIds = new Map<string, string>();
  for (const [key, a] of attempts) {
    const { sessionParticipantId, questId, ...data } = a;
    const current = existingByKey.get(key);
    if (!current) {
      const row = await prisma.questAttempt.create({ data: { id: crypto.randomUUID(), sessionParticipantId, questId, ...data } });
      attemptIds.set(key, row.id);
      counts.created++;
    } else if (current.status === "DRAFT" && data.status !== "DRAFT") {
      await prisma.questAttempt.update({ where: { id: current.id }, data });
      attemptIds.set(key, current.id);
      counts.advanced++;
    } else {
      attemptIds.set(key, current.id);
      counts.kept++;
    }
  }
  for (const r of responses) {
    const attemptId = attemptIds.get(r.attemptKey)!;
    const answered = existing.find((a) => a.id === attemptId)?.QuestionResponse.some((x) => x.questionKey === r.questionKey);
    if (answered) continue;
    await prisma.questionResponse.create({
      data: { id: crypto.randomUUID(), attemptId, questionKey: r.questionKey, answer: r.answer, correct: r.correct, total: r.total, answeredAt: r.answeredAt },
    });
    counts.responses++;
  }
  console.log(`Done: ${counts.created} attempt(s) created, ${counts.advanced} moved forward, ${counts.kept} already up to date; ${counts.responses} answer(s) added.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
