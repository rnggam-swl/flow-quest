import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Cached per request — the participant layout and every page under it (brief, quest/*) call this independently. */
export const getLatestEnrollment = cache(async (userId: string) => {
  return prisma.sessionParticipant.findFirst({
    where: { participantId: userId },
    orderBy: { createdAt: "desc" },
    include: { Session: true },
  });
});
