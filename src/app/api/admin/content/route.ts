import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createCase, importCaseAsDraft } from "@/lib/content/caseAdmin";

const bodySchema = z.discriminatedUnion("action", [
  /** A blank case, or (with `from`) a copy of an existing one under a new key. */
  z.object({ action: z.literal("create"), key: z.string(), title: z.string(), from: z.string().optional() }),
  /** A case file, stored as a draft for review in the builder. */
  z.object({ action: z.literal("import"), content: z.unknown(), replaceDraft: z.boolean().default(false) }),
]);

/** Starts a case as a draft. Nothing is published from here; that happens in the builder. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const body = parsed.data;
  const result =
    body.action === "create"
      ? await createCase({ key: body.key, title: body.title, fromKey: body.from, userId: user.id })
      : await importCaseAsDraft({ raw: body.content, replaceDraft: body.replaceDraft, userId: user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.value);
}
