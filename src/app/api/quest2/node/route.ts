import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSubmission } from "@/lib/ownership";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  label: z.string().min(1).max(60),
  nodeType: z.enum(["START", "ACTION", "SCREEN", "SYSTEM", "DECISION", "OUTCOME", "ERROR"]),
  positionX: z.number(),
  positionY: z.number(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const submission = await getOwnedSubmission(user.id, parsed.data.submissionId);
  if (!submission || submission.status !== "DRAFT") {
    return NextResponse.json({ error: "Submission not editable" }, { status: 403 });
  }

  const node = await prisma.flowNode.create({
    data: {
      id: crypto.randomUUID(),
      submissionId: submission.id,
      nodeType: parsed.data.nodeType,
      label: parsed.data.label,
      positionX: parsed.data.positionX,
      positionY: parsed.data.positionY,
      createdBy: user.id,
    },
  });

  void logActivity({
    event: "NODE_CREATED",
    userId: user.id,
    teamId: submission.teamId,
    metadata: { submissionId: submission.id, nodeId: node.id, label: node.label },
  });

  return NextResponse.json({ node });
}
