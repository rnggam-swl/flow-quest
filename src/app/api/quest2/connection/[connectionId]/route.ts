import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function loadOwnedConnection(userId: string, connectionId: string) {
  const connection = await prisma.flowConnection.findUnique({
    where: { id: connectionId },
    include: { FlowSubmission: { include: { Team: { include: { TeamMember: true } } } } },
  });
  if (!connection) return null;
  const isMember = connection.FlowSubmission.Team.TeamMember.some((m) => m.userId === userId);
  return isMember ? connection : null;
}

const patchSchema = z.object({ targetNodeId: z.string().uuid() });

/** Rewires a connection's target end (dragging the arrowhead onto a different node), deduping onto an existing identical edge instead of creating a duplicate. */
export async function PATCH(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId } = await params;
  const connection = await loadOwnedConnection(user.id, connectionId);
  if (!connection || connection.FlowSubmission.status !== "DRAFT") {
    return NextResponse.json({ error: "Not editable" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { targetNodeId } = parsed.data;

  if (targetNodeId === connection.sourceNodeId) {
    return NextResponse.json({ error: "Cannot connect a node to itself" }, { status: 400 });
  }

  const targetNode = await prisma.flowNode.findUnique({ where: { id: targetNodeId } });
  if (!targetNode || targetNode.submissionId !== connection.submissionId) {
    return NextResponse.json({ error: "Target node not found in this flow" }, { status: 400 });
  }

  const duplicate = await prisma.flowConnection.findFirst({
    where: {
      id: { not: connectionId },
      submissionId: connection.submissionId,
      sourceNodeId: connection.sourceNodeId,
      targetNodeId,
      connectionType: connection.connectionType,
    },
  });
  if (duplicate) {
    // Rewiring onto a node that's already connected the same way is a no-op merge — drop this edge instead of duplicating.
    await prisma.flowConnection.delete({ where: { id: connectionId } });
    return NextResponse.json({ deleted: true });
  }

  await prisma.flowConnection.update({ where: { id: connectionId }, data: { targetNodeId } });

  void logActivity({
    event: "NODE_CONNECTED",
    userId: user.id,
    teamId: connection.FlowSubmission.teamId,
    metadata: { submissionId: connection.submissionId, sourceNodeId: connection.sourceNodeId, targetNodeId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId } = await params;
  const connection = await loadOwnedConnection(user.id, connectionId);
  if (!connection || connection.FlowSubmission.status !== "DRAFT") {
    return NextResponse.json({ error: "Not editable" }, { status: 403 });
  }

  await prisma.flowConnection.delete({ where: { id: connectionId } });

  void logActivity({
    event: "NODE_DISCONNECTED",
    userId: user.id,
    teamId: connection.FlowSubmission.teamId,
    metadata: { submissionId: connection.submissionId, connectionId },
  });

  return NextResponse.json({ ok: true });
}
