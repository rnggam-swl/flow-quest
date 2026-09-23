import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getManagedSession } from "@/lib/managedSession";
import { getParticipantReport } from "@/lib/adminReport";
import { buildParticipantReportHtml, slugify } from "@/lib/participantReportHtml";

/** Serves one participant's complete answers as the self-contained HTML report built in `participantReportHtml`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionParticipantId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getManagedSession();
  if (!session) {
    return NextResponse.json({ error: "Belum ada session yang dikelola." }, { status: 404 });
  }

  const { sessionParticipantId } = await params;
  const report = await getParticipantReport(session.id, sessionParticipantId);
  if (!report) {
    return NextResponse.json({ error: "Peserta tidak ditemukan." }, { status: 404 });
  }

  const filename = `jawaban-${slugify(report.displayName)}-${new Date().toISOString().slice(0, 10)}.html`;
  return new NextResponse(buildParticipantReportHtml(report, session.title, session.sessionCode), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
