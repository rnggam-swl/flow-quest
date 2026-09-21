import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeLoadedSubmission } from "@/lib/quest2";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  timeExpired: z.boolean().default(false),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Single query carries everything finalizeLoadedSubmission and the ownership
  // check need — avoids the separate getOwnedSubmission/getLatestEnrollment
  // round-trips (Team.sessionId already gives us what getLatestEnrollment was for).
  const submission = await prisma.flowSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    include: {
      FlowNode: true,
      FlowConnection: true,
      Quest: true,
      Team: { include: { TeamMember: true } },
    },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMember = submission.Team.TeamMember.some((m) => m.userId === user.id);
  if (!isMember) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { validation } = await finalizeLoadedSubmission(submission, {
    teamId: submission.teamId,
    userId: user.id,
    sessionId: submission.Team.sessionId,
    timeExpired: parsed.data.timeExpired,
  });

  return NextResponse.json({ validation });
}
