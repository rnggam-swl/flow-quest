import type { Prisma } from "@/generated/prisma/client";

/**
 * When a session may move to another version of its case. A session is
 * locked to its pinned version while it's ACTIVE (participants may be
 * mid-quest, holding questions from that version) and forever once anyone has
 * progress in it (answers and flows are scored against the version they were
 * made in). Every other session — a draft, scheduled or closed batch nobody
 * has started — can be moved, which is how a fix reaches a batch that hasn't
 * begun yet.
 */

export type LockReason = "active" | "progress";

export const LOCK_LABELS: Record<LockReason, string> = {
  active: "session sedang aktif",
  progress: "sudah ada progres peserta",
};

/** Prisma filter for sessions that are free to move. */
export const UNLOCKED_SESSION_WHERE = {
  status: { not: "ACTIVE" },
  SessionParticipant: { none: { QuestAttempt: { some: {} } } },
  Team: { none: { FlowSubmission: { some: {} } } },
} satisfies Prisma.SessionWhereInput;

/** Include this in a session query to read its lock with `lockOf`. */
export const LOCK_INCLUDE = {
  _count: { select: { SessionParticipant: { where: { QuestAttempt: { some: {} } } }, Team: { where: { FlowSubmission: { some: {} } } } } },
} satisfies Prisma.SessionInclude;

export function lockOf(s: { status: string; _count: { SessionParticipant: number; Team: number } }): LockReason | null {
  if (s._count.SessionParticipant > 0 || s._count.Team > 0) return "progress";
  if (s.status === "ACTIVE") return "active";
  return null;
}
