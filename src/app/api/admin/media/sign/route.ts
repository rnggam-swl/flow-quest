import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { CASE_KEY } from "@/lib/content/case";
import { signMediaUpload } from "@/lib/mediaStorage";

const bodySchema = z.object({
  caseKey: z.string().regex(CASE_KEY),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

/** Issues a one-off signed URL for an admin to upload one image or audio file to Storage. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const result = await signMediaUpload(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ bucket: result.bucket, path: result.path, token: result.token, publicUrl: result.publicUrl });
}
