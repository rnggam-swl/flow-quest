import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSubmission } from "@/lib/ownership";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({ submissionId: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const submission = await getOwnedSubmission(user.id, parsed.data.submissionId);
  if (!submission || submission.status !== "DRAFT") {
    return NextResponse.json({ error: "Submission not editable" }, { status: 403 });
  }

  await prisma.flowConnection.deleteMany({ where: { submissionId: submission.id } });
  await prisma.flowNode.deleteMany({ where: { submissionId: submission.id } });

  void logActivity({
    event: "NODE_DELETED",
    userId: user.id,
    teamId: submission.teamId,
    metadata: { submissionId: submission.id, reset: true },
  });

  return NextResponse.json({ ok: true });
}
