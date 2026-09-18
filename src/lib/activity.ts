import "server-only";
import { prisma } from "@/lib/prisma";
import { broadcastActivity } from "@/lib/realtime";
import type { ActivityEventType, Prisma } from "@/generated/prisma/client";

interface LogActivityParams {
  event: ActivityEventType;
  userId?: string | null;
  teamId?: string | null;
  sessionId?: string | null;
  metadata?: Prisma.InputJsonValue;
  /** Extra fields (e.g. participant display name) forwarded to the live feed only, not persisted. */
  broadcastExtra?: Record<string, unknown>;
}

export async function logActivity({
  event,
  userId = null,
  teamId = null,
  sessionId = null,
  metadata,
  broadcastExtra,
}: LogActivityParams) {
  const row = await prisma.activityLog.create({
    data: {
      id: crypto.randomUUID(),
      event,
      userId,
      teamId,
      sessionId,
      metadata: metadata ?? undefined,
    },
  });

  void broadcastActivity({
    id: row.id,
    event: row.event,
    userId: row.userId,
    sessionId: row.sessionId,
    createdAt: row.createdAt.toISOString(),
    metadata: metadata ?? null,
    ...broadcastExtra,
  });

  return row;
}
