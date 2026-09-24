/**
 * Re-scores every already-scored flow submission of a case with that case's
 * data rubrics and compares the result with the Score row saved at submit
 * time. Read-only; run it whenever a case file's rubrics change:
 *
 *   npx tsx --env-file=.env prisma/verify-rubrics.ts [prisma/cases/<case>.json]
 *
 * Only the six rubric categories are compared — Rationale is added later,
 * from the participant's written reason, and isn't part of the flow rubric.
 */
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { flowRubricSchema, graphFromFlow, RUBRIC_CATEGORIES, scoreFlow, type LibraryNode } from "../src/lib/content/rubric";

const COLUMN: Record<(typeof RUBRIC_CATEGORIES)[number], "goalScore" | "flowScore" | "logicScore" | "constraintScore" | "edgeCaseScore" | "simplicityScore"> = {
  goal: "goalScore",
  flow: "flowScore",
  logic: "logicScore",
  constraint: "constraintScore",
  edgeCase: "edgeCaseScore",
  simplicity: "simplicityScore",
};

async function main() {
  const file = process.argv[2] ?? "prisma/cases/klub-fotografi.json";
  const caseFile = JSON.parse(readFileSync(file, "utf8"));
  const library: LibraryNode[] = caseFile.nodes;
  const rubrics = new Map<number, ReturnType<typeof flowRubricSchema.parse>>();
  for (const q of caseFile.quests) {
    const flow = q.questions.find((x: { type: string }) => x.type === "flow");
    if (flow) rubrics.set(q.order, flowRubricSchema.parse(flow.rubric));
  }

  const submissions = await prisma.flowSubmission.findMany({
    where: { Score: { isNot: null }, Quest: { Scenario: { title: caseFile.title } } },
    include: { Score: true, Quest: true, FlowNode: true, FlowConnection: true },
    orderBy: { startedAt: "asc" },
  });

  let matched = 0;
  const mismatches: string[] = [];
  for (const s of submissions) {
    const rubric = rubrics.get(s.Quest.order);
    if (!rubric) {
      mismatches.push(`${s.id} (quest ${s.Quest.order}): no rubric in ${file}`);
      continue;
    }
    const result = scoreFlow(rubric, graphFromFlow(s.FlowNode, s.FlowConnection, library));
    const diffs = RUBRIC_CATEGORIES.filter((c) => result.scores[c] !== s.Score![COLUMN[c]]).map(
      (c) => `${c} stored ${s.Score![COLUMN[c]]} vs rubric ${result.scores[c]}`
    );
    if (diffs.length) mismatches.push(`${s.id} (quest ${s.Quest.order}, ${s.status}): ${diffs.join(", ")}`);
    else matched++;
  }

  console.log(`${submissions.length} scored submission(s) for "${caseFile.title}": ${matched} match, ${mismatches.length} differ.`);
  mismatches.forEach((m) => console.log(`  - ${m}`));
  if (mismatches.length) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
