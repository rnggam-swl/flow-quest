import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function loadOwnedNode(userId: string, nodeId: string) {
  const node = await prisma.flowNode.findUnique({
    where: { id: nodeId },
    include: { FlowSubmission: { include: { Team: { include: { TeamMember: true } } } } },
  });
  if (!node) return null;
  const isMember = node.FlowSubmission.Team.TeamMember.some((m) => m.userId === userId);
  return isMember ? node : null;
}

const patchSchema = z.object({ positionX: z.number(), positionY: z.number() });

export async function PATCH(request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nodeId } = await params;
  const node = await loadOwnedNode(user.id, nodeId);
  if (!node || node.FlowSubmission.status !== "DRAFT") {
    return NextResponse.json({ error: "Not editable" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.flowNode.update({
    where: { id: nodeId },
    data: { positionX: parsed.data.positionX, positionY: parsed.data.positionY },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nodeId } = await params;
  const node = await loadOwnedNode(user.id, nodeId);
  if (!node || node.FlowSubmission.status !== "DRAFT") {
    return NextResponse.json({ error: "Not editable" }, { status: 403 });
  }

  await prisma.flowConnection.deleteMany({
    where: { OR: [{ sourceNodeId: nodeId }, { targetNodeId: nodeId }] },
  });
  await prisma.flowNode.delete({ where: { id: nodeId } });

  void logActivity({
    event: "NODE_DELETED",
    userId: user.id,
    teamId: node.FlowSubmission.teamId,
    metadata: { submissionId: node.submissionId, nodeId },
  });

  return NextResponse.json({ ok: true });
}
