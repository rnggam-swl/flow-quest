import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getManagedSession } from "@/lib/managedSession";
import { parseParticipantLines, provisionParticipants } from "@/lib/provisionParticipants";

const bodySchema = z.object({
  lines: z.string().min(1),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const entries = parseParticipantLines(parsed.data.lines);
  if (entries.length === 0) {
    return NextResponse.json({ error: "Tidak ada nama peserta yang valid ditemukan." }, { status: 400 });
  }

  const session = await getManagedSession();
  if (!session) {
    return NextResponse.json({ error: "Belum ada session yang dikelola." }, { status: 404 });
  }

  const results = await provisionParticipants(entries, parsed.data.password, session.id);

  return NextResponse.json({ results });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getManagedSession();
  if (!session) return NextResponse.json({ participants: [] });

  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId: session.id },
    include: { User: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    participants: participants.map((p) => ({
      userId: p.participantId,
      name: p.User.displayName,
      email: p.User.email,
      school: p.User.school,
      group: p.User.groupName,
      status: p.status,
    })),
  });
}
