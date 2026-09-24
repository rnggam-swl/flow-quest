import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { upgradeSessionVersion } from "@/lib/content/caseAdmin";

/** Moves a session nobody has started onto its case's newest published version; refused (423) while it's locked. */
export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await upgradeSessionVersion((await params).sessionId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.value);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
