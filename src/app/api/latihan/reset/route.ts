import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPracticeAccess, resetPractice } from "@/lib/practice/practiceData";

/** "Ulangi dari awal" on the Modul Latihan sidebar. */
export async function POST() {
  const access = await getPracticeAccess(await getCurrentUser());
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await resetPractice(access.practice.sessionParticipantId);
  return NextResponse.json({ success: true });
}
