import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLatestEnrollment } from "@/lib/participant";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({
  selectedIndex: z.number().int().min(0),
  correct: z.boolean(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "PARTICIPANT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) {
    return NextResponse.json({ error: "Not enrolled in any session" }, { status: 400 });
  }

  const sessionQuest = await prisma.sessionQuest.findFirst({
    where: { sessionId: enrollment.sessionId, order: 1 },
    include: { Quest: true },
  });
  if (!sessionQuest) {
    return NextResponse.json({ error: "Quest 1 not found for this session" }, { status: 404 });
  }

  await logActivity({
    event: "QUEST_COMPLETED",
    userId: user.id,
    sessionId: enrollment.sessionId,
    metadata: {
      order: 1,
      questId: sessionQuest.questId,
      selectedIndex: parsed.data.selectedIndex,
      correct: parsed.data.correct,
    },
    broadcastExtra: { displayName: user.displayName },
  });

  await prisma.sessionParticipant.update({
    where: { id: enrollment.id },
    data: { totalXp: { increment: sessionQuest.Quest.xp } },
  });

  return NextResponse.json({ ok: true });
}
