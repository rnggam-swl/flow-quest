/**
 * Seeds what this app needs to run from scratch: an admin account, a demo
 * participant, the Klub Fotografi case (imported from prisma/cases/ as a
 * published version, like prisma/import-case.ts does), and a demo session
 * pinned to that version with the demo participant enrolled. Rows that
 * already exist are left as they are, so it's safe to re-run.
 */
import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { parseCase } from "../src/lib/content/case";
import { importCase } from "../src/lib/content/importCase";

const CASE_FILE = path.join(import.meta.dirname, "cases/klub-fotografi.json");
const DEMO_SESSION_CODE = "UFQ-0926";

async function main() {
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL").toLowerCase();
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  const participantEmail = requireEnv("SEED_DEMO_PARTICIPANT_EMAIL").toLowerCase();
  const participantPassword = requireEnv("SEED_DEMO_PARTICIPANT_PASSWORD");

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: await bcrypt.hash(adminPassword, 10), appRole: "ADMIN" },
    create: {
      id: crypto.randomUUID(),
      email: adminEmail,
      displayName: "Admin User Flow Quest",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      appRole: "ADMIN",
    },
  });
  console.log(`Admin ready: ${adminUser.email}`);

  const demoParticipant = await prisma.user.upsert({
    where: { email: participantEmail },
    update: { passwordHash: await bcrypt.hash(participantPassword, 10), appRole: "PARTICIPANT" },
    create: {
      id: crypto.randomUUID(),
      email: participantEmail,
      displayName: "Peserta Demo",
      passwordHash: await bcrypt.hash(participantPassword, 10),
      appRole: "PARTICIPANT",
      school: "SMKN 2 Sumedang",
      groupName: "Tim UI/UX",
    },
  });
  console.log(`Demo participant ready: ${demoParticipant.email}`);

  const parsed = parseCase(JSON.parse(readFileSync(CASE_FILE, "utf8")));
  if (!parsed.ok) throw new Error(`${CASE_FILE} has problems:\n${parsed.problems.join("\n")}`);
  const imported = await importCase(prisma, parsed.content, { note: "Diimpor oleh prisma/seed.ts" });
  console.log(`Case "${parsed.content.title}" ${imported.status === "unchanged" ? "already at" : "imported as"} version ${imported.version}.`);
  const version = await prisma.scenarioVersion.findFirstOrThrow({ where: { scenarioId: imported.scenarioId!, version: imported.version } });
  const questRows = await prisma.quest.findMany({ where: { scenarioId: imported.scenarioId! } });

  let session = await prisma.session.findUnique({ where: { sessionCode: DEMO_SESSION_CODE } });
  if (!session) {
    session = await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        title: "User Flow Quest — Demo",
        sessionCode: DEMO_SESSION_CODE,
        status: "DRAFT",
        timeLimitMinutes: 60,
        createdBy: adminUser.id,
        scenarioVersionId: version.id,
      },
    });
    await prisma.sessionQuest.createMany({
      data: parsed.content.quests.map((q) => ({
        id: crypto.randomUUID(),
        sessionId: session!.id,
        questId: questRows.find((r) => r.order === q.order)!.id,
        order: q.order,
      })),
    });
    console.log(`Session created: ${session.sessionCode} (pinned to version ${version.version})`);
  } else {
    console.log(`Session already exists, left as is: ${session.sessionCode}`);
  }

  await prisma.sessionParticipant.upsert({
    where: { sessionId_participantId: { sessionId: session.id, participantId: demoParticipant.id } },
    update: {},
    create: { id: crypto.randomUUID(), sessionId: session.id, participantId: demoParticipant.id, status: "REGISTERED" },
  });
  console.log("Demo participant enrolled in session.");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
