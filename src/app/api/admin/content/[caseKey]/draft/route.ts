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

/** Throws the draft away (?rev= the revision the editor started from); for a never-published case, deletes the case. */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rev = new URL(request.url).searchParams.get("rev");
  if (!rev) return NextResponse.json({ error: "Revisi draf wajib dikirim" }, { status: 400 });
  const result = await discardDraft((await params).caseKey, rev);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.value);
}
