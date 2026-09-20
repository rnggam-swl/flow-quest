import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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

const deleteBodySchema = z.object({ userId: z.string().uuid() });

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = deleteBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const session = await getManagedSession();
  if (!session) {
    return NextResponse.json({ error: "Belum ada session yang dikelola." }, { status: 404 });
  }

  const enrollment = await prisma.sessionParticipant.findUnique({
    where: { sessionId_participantId: { sessionId: session.id, participantId: parsed.data.userId } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Peserta tidak ditemukan di session ini." }, { status: 404 });
  }

  try {
    // Deletes the participant's account outright (each account is provisioned for one session only),
    // which cascades to their enrollment, auth sessions, and team membership for this session.
    await prisma.user.delete({ where: { id: parsed.data.userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Peserta ini sudah memiliki aktivitas di quest (chat, flow, refleksi, dll.) sehingga tidak bisa dihapus permanen.",
        },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}
