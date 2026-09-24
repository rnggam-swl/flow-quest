/**
 * Imports Modul Latihan plans — a mentor's per-participant follow-up (which
 * core modules, what they're already strong at, and a "latihan utama" built
 * from their own quest answers) — into PracticePlan rows:
 *
 *   npx tsx --env-file=.env prisma/seed-practice-plans.ts prisma/practice-plans/<file>.json [--dry-run]
 *
 * A file names one session by its code and lists plans matched to that
 * session's participants by display name (or by email, when given). Every
 * plan is validated up front against the case that session runs — its
 * modules must exist, its fixers must use the case's nodes, and each fixer's
 * model solution must satisfy its own rules —
 * and nothing is written unless all of them pass and each one resolves to
 * exactly one participant. Re-running is safe: it replaces a plan's content
 * but keeps the participant's progress and saved answers.
 *
 * Plan files hold mentors' personal notes about real participants, so they
 * are git-ignored; only example.json is committed.
 */
import { readFileSync } from "fs";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { practicePlanContentSchema } from "../src/lib/practice/schema";
import { findPlanProblems } from "../src/lib/practice/plan";
import { caseContentSchema } from "../src/lib/content/case";

const fileSchema = z.object({
  sessionCode: z.string(),
  plans: z
    .array(practicePlanContentSchema.extend({ participant: z.string(), email: z.string().optional() }))
    .min(1),
});

const normalize = (value: string) => value.trim().toLowerCase();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: npx tsx --env-file=.env prisma/seed-practice-plans.ts <plans.json> [--dry-run]");

  const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    console.error(`${file} is not a valid plan file:\n${z.prettifyError(parsed.error)}`);
    process.exit(1);
  }
  const { sessionCode, plans } = parsed.data;

  const session = await prisma.session.findUnique({
    where: { sessionCode },
    include: { SessionParticipant: { include: { User: true } }, ScenarioVersion: true },
  });
  if (!session) throw new Error(`Session ${sessionCode} not found`);
  if (!session.ScenarioVersion) throw new Error(`Session ${sessionCode} has no case content to check the plans against`);
  // Plans reference the modules and nodes of the case this session runs.
  const caseContent = caseContentSchema.parse(session.ScenarioVersion.content);

  const problems: string[] = [];
  const targets = plans.map((plan) => {
    problems.push(...findPlanProblems(plan, caseContent).map((p) => `${plan.participant}: ${p}`));
    const matches = session.SessionParticipant.filter((sp) =>
      plan.email ? normalize(sp.User.email) === normalize(plan.email) : normalize(sp.User.displayName) === normalize(plan.participant)
    );
    if (matches.length !== 1) {
      problems.push(`${plan.participant}: ${matches.length === 0 ? "not found" : "matches more than one participant"} in ${sessionCode}`);
    }
    return { plan, enrollment: matches[0] };
  });
  const enrollmentIds = targets.map((t) => t.enrollment?.id).filter(Boolean);
  if (new Set(enrollmentIds).size !== enrollmentIds.length) problems.push("Two plans target the same participant");

  if (problems.length) {
    console.error(`Nothing imported — fix these first:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }

  for (const { plan, enrollment } of targets) {
    // Re-parsing with the stored schema drops the file-only `participant`/`email` keys.
    const content = practicePlanContentSchema.parse(plan);
    const label = `${plan.participant} (${enrollment.User.email}): modules ${content.modules.join(", ") || "—"}${content.main ? ` + "${content.main.title}"` : ""}`;
    if (dryRun) {
      console.log(`[dry-run] ${label}`);
      continue;
    }
    await prisma.practicePlan.upsert({
      where: { sessionParticipantId: enrollment.id },
      update: { content },
      create: { id: crypto.randomUUID(), sessionParticipantId: enrollment.id, content },
    });
    console.log(`Plan ready: ${label}`);
  }
  console.log(`${dryRun ? "Checked" : "Imported"} ${targets.length} plan(s) for ${sessionCode}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
