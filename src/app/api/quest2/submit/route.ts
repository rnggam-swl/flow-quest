import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedSubmission } from "@/lib/ownership";
import { getLatestEnrollment } from "@/lib/participant";
import { finalizeSubmission } from "@/lib/quest2";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  timeExpired: z.boolean().default(false),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const submission = await getOwnedSubmission(user.id, parsed.data.submissionId);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 400 });

  const { validation } = await finalizeSubmission({
    submissionId: submission.id,
    teamId: submission.teamId,
    questId: submission.questId,
    userId: user.id,
    sessionId: enrollment.sessionId,
    timeExpired: parsed.data.timeExpired,
  });

  return NextResponse.json({ validation });
}
