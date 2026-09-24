/**
 * Imports a case file (see caseContentSchema in src/lib/content/case.ts) as a new published
 * ScenarioVersion:
 *
 *   npx tsx --env-file=.env prisma/import-case.ts prisma/cases/<case>.json [--dry-run] [--note "what changed"] [--move-sessions]
 *
 * The file must pass parseCase — schema plus findCaseProblems — or nothing is written. A version
 * is only created when the content differs from the latest one, so re-running an unchanged file
 * is a no-op. New sessions pick up the latest version; existing sessions keep theirs.
 *
 * `--move-sessions` moves every session on the previous version onto the new one instead — only
 * for content migrations that change nothing participants were asked or graded on (added display
 * text, a new optional field), since those sessions' answers were scored against the old content.
 */
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { parseCase } from "../src/lib/content/case";
import { importCase } from "../src/lib/content/importCase";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const moveSessions = args.includes("--move-sessions");
  const noteIdx = args.indexOf("--note");
  const note = noteIdx !== -1 ? args[noteIdx + 1] : undefined;
  const file = args.find((a, i) => !a.startsWith("--") && (noteIdx === -1 || i !== noteIdx + 1));
  if (!file) throw new Error('Usage: npx tsx --env-file=.env prisma/import-case.ts <case.json> [--dry-run] [--note "..."] [--move-sessions]');

  const parsed = parseCase(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.ok) {
    console.error(`Nothing imported — fix these first:\n${parsed.problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  const content = parsed.content;
  const summary = `${content.quests.length} quest(s), ${content.quests.reduce((n, q) => n + q.questions.length, 0)} question(s), ${content.modules.length} module(s), ${content.nodes.length} node(s)`;

  const result = await importCase(prisma, content, { note, moveSessions, dryRun });
  if (result.status === "unchanged") {
    console.log(`"${content.title}" is unchanged since version ${result.version} — nothing to import.`);
    return;
  }
  const moved = result.movedSessions ? ` ${result.movedSessions} session(s) ${dryRun ? "would move" : "moved"} to it.` : "";
  console.log(`${dryRun ? "[dry-run] Would import" : "Imported"} "${content.title}" as version ${result.version}: ${summary}.${moved}`);
  result.staleQuests.forEach((q) => console.warn(`  ! Quest ${q.order} "${q.title}" isn't in the file any more; its row is kept for existing sessions.`));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
