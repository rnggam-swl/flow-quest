import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
  }

  const latestEnrollment = await prisma.sessionParticipant.findFirst({
    where: { participantId: user.id },
    orderBy: { createdAt: "desc" },
    include: { Session: true },
  });

  await createAuthSession(user.id, latestEnrollment?.sessionId ?? null);

  if (user.appRole === "PARTICIPANT" && latestEnrollment) {
    const isFirstStart = !latestEnrollment.startedAt;
    const startedAt = latestEnrollment.startedAt ?? new Date();
    const deadlineAt =
      isFirstStart && latestEnrollment.Session.timeLimitMinutes
        ? new Date(startedAt.getTime() + latestEnrollment.Session.timeLimitMinutes * 60 * 1000)
        : latestEnrollment.deadlineAt;

    await prisma.sessionParticipant.update({
      where: { id: latestEnrollment.id },
      data: {
        status: latestEnrollment.status === "REGISTERED" ? "IN_PROGRESS" : latestEnrollment.status,
        startedAt,
        deadlineAt,
      },
    });
    void logActivity({
      event: "SESSION_JOINED",
      userId: user.id,
      sessionId: latestEnrollment.sessionId,
      broadcastExtra: { displayName: user.displayName },
    });
  }

  return NextResponse.json({ appRole: user.appRole });
}
