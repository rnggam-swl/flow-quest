import type { Session, SessionParticipant } from "@/generated/prisma/client";

export function isSessionOpenNow(session: Pick<Session, "status" | "startAt" | "endAt">) {
  if (session.status !== "ACTIVE") return false;
  const now = new Date();
  if (session.startAt && now < session.startAt) return false;
  if (session.endAt && now > session.endAt) return false;
  return true;
}

/**
 * Enforces the admin's "batas waktu personal" (Session.timeLimitMinutes),
 * a per-participant budget counted from their own first login — separate
 * from the session's overall scheduled window. `deadlineAt` is computed
 * once at first login (see /api/auth/login) and stored on SessionParticipant.
 */
export function isWithinPersonalDeadline(enrollment: Pick<SessionParticipant, "deadlineAt">) {
  if (!enrollment.deadlineAt) return true;
  return Date.now() <= enrollment.deadlineAt.getTime();
}

export function canParticipantPlay(
  session: Pick<Session, "status" | "startAt" | "endAt">,
  enrollment: Pick<SessionParticipant, "deadlineAt">
) {
  return isSessionOpenNow(session) && isWithinPersonalDeadline(enrollment);
}
