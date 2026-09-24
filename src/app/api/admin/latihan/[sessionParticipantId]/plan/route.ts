import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { savePlan } from "@/lib/practice/planAdmin";

type Params = { params: Promise<{ sessionParticipantId: string }> };

const bodySchema = z.object({ content: z.unknown(), baseRevision: z.string().min(1) });

/** Saves a participant's Modul Latihan plan; refused (422, with the list) while any check fails. */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.content == null) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const result = await savePlan({ sessionParticipantId: (await params).sessionParticipantId, raw: parsed.data.content, baseRevision: parsed.data.baseRevision });
  if (!result.ok) return NextResponse.json({ error: result.error, problems: result.problems }, { status: result.status });
  return NextResponse.json({ revision: result.revision });
}

/** Removes the personal plan: the participant sees every module again. Progress and written answers stay. */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baseRevision = new URL(request.url).searchParams.get("rev") ?? "";
  const result = await savePlan({ sessionParticipantId: (await params).sessionParticipantId, raw: null, baseRevision });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ revision: result.revision });
}
