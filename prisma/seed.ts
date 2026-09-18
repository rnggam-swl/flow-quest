/**
 * Seeds the "Pendaftaran Klub Fotografi" content (Scenario/Quest/Session) that
 * this app actually plays, as brand-new rows alongside the pre-existing
 * "Meeting Room Booking" demo data — nothing pre-existing is modified.
 * Idempotent: safe to re-run (upserts by natural keys).
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { SCENARIO_TITLE, SESSION_CODE } from "../src/lib/constants";

const QUEST_DEFS = [
  {
    order: 1,
    title: "Find the Goal",
    objective:
      "Identifikasi tujuan sebenarnya dari pengguna (Rani) yang ingin mendaftar Klub Fotografi lewat aplikasi sekolah.",
    xp: 20,
    timeLimitMinutes: null as number | null,
  },
  {
    order: 2,
    title: "Build the Path",
    objective:
      "Susun user flow lengkap dari Home sampai berhasil mendaftar (Success), termasuk menemukan klub dan menangani kemungkinan error.",
    xp: 50,
    timeLimitMinutes: 5,
  },
  {
    order: 3,
    title: "Add the Logic",
    objective:
      "Tambahkan node keputusan (Verifikasi NIS) ke flow dan tangani kedua kemungkinan hasilnya: valid lanjut ke Success, tidak valid ke Error.",
    xp: 50,
    timeLimitMinutes: 6,
  },
  {
    order: 4,
    title: "Break the Flow",
    objective:
      "Sistem bisa gagal saat mengonfirmasi pendaftaran. Susun flow yang tetap punya jalur normal, jalur gagal, dan jalur pemulihan.",
    xp: 50,
    timeLimitMinutes: 6,
  },
  {
    order: 5,
    title: "Final Challenge",
    objective:
      "Gabungkan semua yang sudah dipelajari: flow lengkap dari Home sampai Success, verifikasi NIS, dan penanganan error — plus alasan tertulis.",
    xp: 100,
    timeLimitMinutes: 8,
  },
];

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

  let scenario = await prisma.scenario.findFirst({ where: { title: SCENARIO_TITLE } });
  if (!scenario) {
    scenario = await prisma.scenario.create({
      data: {
        id: crypto.randomUUID(),
        title: SCENARIO_TITLE,
        description:
          "Rani membuka aplikasi sekolah karena ingin bergabung dengan Klub Fotografi. Ia perlu memasukkan Nomor Induk Siswa untuk bisa mendaftar.",
        userDescription: "Rani, siswa SMK",
        userGoal: "Berhasil mendaftar menjadi anggota Klub Fotografi",
      },
    });
    console.log(`Scenario created: ${scenario.title}`);
  } else {
    console.log(`Scenario already exists, reusing: ${scenario.title}`);
  }

  const quests: Record<number, { id: string }> = {};
  for (const def of QUEST_DEFS) {
    const quest = await prisma.quest.upsert({
      where: { scenarioId_order: { scenarioId: scenario.id, order: def.order } },
      update: {
        title: def.title,
        objective: def.objective,
        xp: def.xp,
        timeLimitMinutes: def.timeLimitMinutes,
        published: true,
      },
      create: {
        id: crypto.randomUUID(),
        scenarioId: scenario.id,
        order: def.order,
        title: def.title,
        objective: def.objective,
        xp: def.xp,
        timeLimitMinutes: def.timeLimitMinutes,
        published: true,
      },
    });
    quests[def.order] = { id: quest.id };
  }
  console.log(`${QUEST_DEFS.length} quests ready under scenario.`);

  const session = await prisma.session.upsert({
    where: { sessionCode: SESSION_CODE },
    update: {},
    create: {
      id: crypto.randomUUID(),
      title: "User Flow Quest — September Batch",
      description:
        "Lima quest membawa peserta dari memahami tujuan pengguna sampai menyusun flow lengkap dengan alasannya.",
      sessionCode: SESSION_CODE,
      status: "DRAFT",
      timeLimitMinutes: 60,
      createdBy: adminUser.id,
    },
  });
  console.log(`Session ready: ${session.sessionCode} (status: ${session.status})`);

  for (const def of QUEST_DEFS) {
    await prisma.sessionQuest.upsert({
      where: { sessionId_order: { sessionId: session.id, order: def.order } },
      update: { questId: quests[def.order].id },
      create: {
        id: crypto.randomUUID(),
        sessionId: session.id,
        questId: quests[def.order].id,
        order: def.order,
      },
    });
  }
  console.log("SessionQuest links ready.");

  await prisma.sessionParticipant.upsert({
    where: { sessionId_participantId: { sessionId: session.id, participantId: demoParticipant.id } },
    update: {},
    create: {
      id: crypto.randomUUID(),
      sessionId: session.id,
      participantId: demoParticipant.id,
      status: "REGISTERED",
    },
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
