import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNewSession } from "@/lib/managedSession";

const bodySchema = z.object({
  title: z.string().min(1, "Judul wajib diisi"),
  sessionCode: z
    .string()
    .min(3, "Kode minimal 3 karakter")
    .max(30)
    .regex(/^[A-Za-z0-9-]+$/, "Kode hanya boleh huruf, angka, dan tanda -"),
});

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.session.findUnique({ where: { sessionCode: parsed.data.sessionCode } });
  if (existing) {
    return NextResponse.json({ error: "Kode session sudah dipakai — pilih kode lain." }, { status: 409 });
  }

  const session = await createNewSession({
    title: parsed.data.title,
    sessionCode: parsed.data.sessionCode,
    createdBy: admin.id,
  });

  return NextResponse.json({ session: { id: session.id, title: session.title, sessionCode: session.sessionCode } });
}
