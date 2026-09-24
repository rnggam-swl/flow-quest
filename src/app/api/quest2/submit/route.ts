import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeFlowSubmission, getActiveQuest } from "@/lib/questPlay";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  timeExpired: z.boolean().default(false),
});

/** Submits a quest's flow canvas: scores it with the quest's rubric and completes the quest. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const submission = await prisma.flowSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    include: { FlowNode: true, FlowConnection: true, Quest: true, Team: { include: { TeamMember: true } } },
  });
  if (!submission || !submission.Team.TeamMember.some((m) => m.userId === user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const active = await getActiveQuest(user, submission.Quest.order);
  // 409 means the quest is already closed — submitted a moment ago (a timeout racing the button) or the
  // timer running out while this request was in flight. Either way the canvas should move on to the result.
  if (!active.ok) {
    return active.status === 409 ? NextResponse.json({ ok: true }) : NextResponse.json({ error: active.error }, { status: active.status });
  }

  // Only this session's canvas for this quest: a participant's solo team from an earlier session may hold a
  // submission for a quest with the same order, and it must never be re-scored or complete the current quest.
  if (submission.teamId !== active.ctx.teamId || submission.questId !== active.item.questId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (submission.status !== "DRAFT") return NextResponse.json({ error: "Flow ini sudah dikirim" }, { status: 409 });

  const result = await finalizeFlowSubmission(submission, active.attempt, active.quest, active.ctx, parsed.data.timeExpired);
  return NextResponse.json({ result });
}
