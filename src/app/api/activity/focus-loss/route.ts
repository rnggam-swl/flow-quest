import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getLatestEnrollment } from "@/lib/participant";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({
  order: z.number().int().min(1).max(5),
  awaySeconds: z.number().int().min(1),
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

  void logActivity({
    event: "FOCUS_LOST",
    userId: user.id,
    sessionId: enrollment.sessionId,
    metadata: { order: parsed.data.order, awaySeconds: parsed.data.awaySeconds },
    broadcastExtra: { displayName: user.displayName },
  });

  return NextResponse.json({ ok: true });
}
