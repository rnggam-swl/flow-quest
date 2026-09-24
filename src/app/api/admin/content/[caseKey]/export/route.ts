import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportCaseContent } from "@/lib/content/caseAdmin";
import { envelope, transferFileName } from "@/lib/content/transfer";

/** Downloads a case as JSON: ?v=draft, ?v=latest (default) or ?v=<version number>. */
export async function GET(request: Request, { params }: { params: Promise<{ caseKey: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { caseKey } = await params;
  const which = new URL(request.url).searchParams.get("v") ?? "latest";
  const found = await exportCaseContent(caseKey, which);
  if (!found) return NextResponse.json({ error: "Versi tidak ditemukan" }, { status: 404 });

  const body = envelope("case", found.content, { caseKey, version: found.version });
  const name = transferFileName(caseKey, found.version === "draft" ? "draf" : `v${found.version}`);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
