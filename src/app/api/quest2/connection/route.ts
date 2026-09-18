import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSubmission } from "@/lib/ownership";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  connectionType: z.enum(["DEFAULT", "YES", "NO", "RECOVERY"]).default("DEFAULT"),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { submissionId, sourceNodeId, targetNodeId, connectionType } = parsed.data;

  if (sourceNodeId === targetNodeId) {
    return NextResponse.json({ error: "Cannot connect a node to itself" }, { status: 400 });
  }

  const submission = await getOwnedSubmission(user.id, submissionId);
  if (!submission || submission.status !== "DRAFT") {
    return NextResponse.json({ error: "Submission not editable" }, { status: 403 });
  }

  const existing = await prisma.flowConnection.findFirst({
    where: { submissionId, sourceNodeId, targetNodeId, connectionType },
  });
  if (existing) return NextResponse.json({ connection: existing });

  const connection = await prisma.flowConnection.create({
    data: {
      id: crypto.randomUUID(),
      submissionId,
      sourceNodeId,
      targetNodeId,
      connectionType,
      createdBy: user.id,
    },
  });

  void logActivity({
    event: "NODE_CONNECTED",
    userId: user.id,
    teamId: submission.teamId,
    metadata: { submissionId, sourceNodeId, targetNodeId },
  });

  return NextResponse.json({ connection });
}
