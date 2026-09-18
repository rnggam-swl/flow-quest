import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getManagedSession } from "@/lib/managedSession";

const bodySchema = z.object({
  status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "CLOSED", "ARCHIVED"]),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  timeLimitMinutes: z.number().int().positive().nullable(),
  questTimeLimits: z.record(z.string(), z.number().int().positive().nullable()),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const session = await getManagedSession();
  if (!session) return NextResponse.json({ error: "No managed session found" }, { status: 404 });

  await prisma.session.update({
    where: { id: session.id },
    data: {
      status: parsed.data.status,
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : null,
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
      timeLimitMinutes: parsed.data.timeLimitMinutes,
    },
  });

  for (const [questId, minutes] of Object.entries(parsed.data.questTimeLimits)) {
    await prisma.quest.update({ where: { id: questId }, data: { timeLimitMinutes: minutes } });
  }

  return NextResponse.json({ ok: true });
}
