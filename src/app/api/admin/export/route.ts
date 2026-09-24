import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getManagedSession } from "@/lib/managedSession";
import { getSessionFullReport, type ParticipantReport } from "@/lib/adminReport";
import { flowQuestionOf, getSessionContent, quizQuestionsOf } from "@/lib/content/sessionContent";
import type { CaseContent } from "@/lib/content/case";

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * One row per participant; the columns follow the session's case — for every
 * quest its status and time, each quiz question's answer and score, and for a
 * flow question its timing, revisions, score, flow and written reason.
 */
function buildCsv(reports: ParticipantReport[], content: CaseContent) {
  const quests = [...content.quests].sort((a, b) => a.order - b.order);
  const header = [
    "Nama",
    "Email",
    "Sekolah",
    "Kelompok",
    "Status",
    "Total XP",
    "Jumlah Berpindah Tab",
    "Total Waktu Pergi (detik)",
    ...quests.flatMap((q) => [
      `Q${q.order} Status`,
      `Q${q.order} Waktu (detik)`,
      ...quizQuestionsOf(q).flatMap((x) => [`Q${q.order} ${x.id} Jawaban`, `Q${q.order} ${x.id} Benar`]),
      ...(flowQuestionOf(q)
        ? [
            `Q${q.order} Waktu ke Aksi Pertama (detik)`,
            `Q${q.order} Jumlah Revisi`,
            `Q${q.order} Skor`,
            `Q${q.order} Skor Maks`,
            `Q${q.order} Flow`,
            `Q${q.order} Refleksi`,
          ]
        : []),
    ]),
  ];

  const lines = [csvRow(header)];
  for (const r of reports) {
    const byOrder = new Map(r.quests.map((q) => [q.order, q]));
    const row: unknown[] = [
      r.displayName,
      r.email,
      r.school ?? "",
      r.groupName ?? "",
      r.status,
      r.totalXp,
      r.focusLoss.count,
      r.focusLoss.totalAwaySeconds,
    ];
    for (const q of quests) {
      const report = byOrder.get(q.order);
      row.push(report?.status ?? "", report?.timeSpentSeconds ?? "");
      for (const x of quizQuestionsOf(q)) {
        const a = report?.quiz.find((y) => y.questionId === x.id);
        row.push(a?.answered ? a.answerText : "", a?.answered ? `${a.correct}/${a.total}` : "");
      }
      if (flowQuestionOf(q)) {
        const f = report?.flow;
        row.push(
          f?.timeToFirstActionSeconds ?? "",
          f?.revisionCount ?? "",
          f?.totalScore ?? "",
          f?.maxScore ?? "",
          f?.flowSteps.join(" -> ") ?? "",
          f?.reflection ?? ""
        );
      }
    }
    lines.push(csvRow(row));
  }
  return lines.join("\r\n");
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getManagedSession();
  if (!session) {
    return NextResponse.json({ error: "Belum ada session yang dikelola." }, { status: 404 });
  }

  const content = (await getSessionContent(session.id))?.content;
  if (!content) {
    return NextResponse.json({ error: "Session ini belum punya konten kasus." }, { status: 404 });
  }
  const reports = await getSessionFullReport(session.id);
  const csv = "﻿" + buildCsv(reports, content);
  const filename = `aktivitas-${session.sessionCode}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
