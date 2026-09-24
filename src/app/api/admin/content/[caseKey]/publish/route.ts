import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { publishDraft } from "@/lib/content/drafts";

const bodySchema = z.object({
  baseRevision: z.string().min(1),
  note: z.string().max(500).optional(),
  moveIdleSessions: z.boolean().default(false),
});

/**
 * Publishes the saved draft as the case's next version. Refused (422, with the
 * list) while any check fails. Sessions keep the version they were created
 * with unless `moveIdleSessions` moves the ones nobody has started yet.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseKey: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const result = await publishDraft({ caseKey: (await params).caseKey, userId: user.id, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error, problems: result.problems }, { status: result.status });
  return NextResponse.json(result.value);
}
