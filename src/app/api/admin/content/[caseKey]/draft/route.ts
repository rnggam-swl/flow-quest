import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { discardDraft, saveDraft } from "@/lib/content/drafts";

type Params = { params: Promise<{ caseKey: string }> };

const bodySchema = z.object({ content: z.unknown(), baseRevision: z.string().min(1) });

/** Saves the builder's working copy of a case. Unfinished content is accepted; the reply lists what's still missing. */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const result = await saveDraft({ caseKey: (await params).caseKey, content: parsed.data.content, baseRevision: parsed.data.baseRevision, userId: user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.value);
}

/** Throws the draft away. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await discardDraft((await params).caseKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.value);
}
