import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export interface ParticipantEntry {
  name: string;
  school?: string;
  group?: string;
}

export interface ProvisionedParticipant {
  name: string;
  email: string;
  password: string;
  status: "created" | "updated";
}

/** Parses "Nama Lengkap, Sekolah, Kelompok" lines from the bulk-add textarea (school/group optional). */
export function parseParticipantLines(text: string): ParticipantEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, school, group] = line.split(",").map((part) => part.trim());
      return { name, school: school || undefined, group: group || undefined };
    })
    .filter((entry) => entry.name.length > 0);
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .join(".") || "peserta"
  );
}

async function uniqueEmail(base: string, taken: Set<string>): Promise<string> {
  let candidate = `${base}@userflowquest.local`;
  let n = 1;
  while (taken.has(candidate) || (await prisma.user.findUnique({ where: { email: candidate } }))) {
    candidate = `${base}${n}@userflowquest.local`;
    n++;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Bulk-creates (or re-enrolls) participant accounts and enrolls them in the
 * given session. Passwords are shared across the whole batch — this is the
 * only moment the plaintext password is available, so the caller must
 * surface it to the admin immediately (it can't be recovered afterwards).
 */
export async function provisionParticipants(
  entries: ParticipantEntry[],
  password: string,
  sessionId: string
): Promise<ProvisionedParticipant[]> {
  const passwordHash = await hashPassword(password);
  const taken = new Set<string>();
  const results: ProvisionedParticipant[] = [];

  for (const entry of entries) {
    const name = entry.name.trim();
    if (!name) continue;

    const email = await uniqueEmail(slugify(name), taken);

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        displayName: name,
        passwordHash,
        appRole: "PARTICIPANT",
        school: entry.school?.trim() || null,
        groupName: entry.group?.trim() || null,
      },
    });

    await prisma.sessionParticipant.upsert({
      where: { sessionId_participantId: { sessionId, participantId: user.id } },
      update: {},
      create: {
        id: crypto.randomUUID(),
        sessionId,
        participantId: user.id,
        status: "REGISTERED",
      },
    });

    results.push({ name, email, password, status: "created" });
  }

  return results;
}
