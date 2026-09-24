import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomPassword } from "@/lib/randomPassword";

const bodySchema = z.object({ userId: z.string().uuid() });

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target || target.appRole !== "PARTICIPANT") {
    return NextResponse.json({ error: "Peserta tidak ditemukan." }, { status: 404 });
  }

  const newPassword = randomPassword();
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Invalidate existing sessions for this account so the old password stops working immediately.
  await prisma.authSession.deleteMany({ where: { userId: target.id } });

  return NextResponse.json({ email: target.email, password: newPassword });
}
