import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getManagedSession } from "@/lib/managedSession";
import { getSessionFullReport, type ParticipantReport } from "@/lib/adminReport";

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function buildCsv(reports: ParticipantReport[]) {
  const flowOrders = [2, 3, 4, 5];
  const header = [
    "Nama",
    "Email",
    "Sekolah",
    "Kelompok",
    "Status",
    "Total XP",
    "Jumlah Berpindah Tab",
    "Total Waktu Pergi (detik)",
    "Q1 Waktu (detik)",
    "Q1 Benar/Salah",
    "Q1 Jawaban",
    ...flowOrders.flatMap((o) => [
      `Q${o} Status`,
      `Q${o} Waktu (detik)`,
      `Q${o} Waktu ke Aksi Pertama (detik)`,
      `Q${o} Jumlah Revisi`,
      `Q${o} Skor`,
      `Q${o} Skor Maks`,
      `Q${o} Flow`,
      `Q${o} Refleksi`,
    ]),
  ];

  const lines = [csvRow(header)];

  for (const r of reports) {
    const flowByOrder = new Map(r.flowQuests.map((q) => [q.order, q]));
    const row: unknown[] = [
      r.displayName,
      r.email,
      r.school ?? "",
      r.groupName ?? "",
      r.status,
      r.totalXp,
      r.focusLoss.count,
      r.focusLoss.totalAwaySeconds,
      r.quest1?.timeSpentSeconds ?? "",
      r.quest1 ? (r.quest1.completed ? (r.quest1.correct ? "Benar" : "Salah") : "") : "",
      r.quest1?.selectedText ?? "",
    ];
    for (const o of flowOrders) {
      const q = flowByOrder.get(o);
      row.push(
        q?.status ?? "",
        q?.timeSpentSeconds ?? "",
        q?.timeToFirstActionSeconds ?? "",
        q?.revisionCount ?? "",
        q?.totalScore ?? "",
        q?.maxScore ?? "",
        q?.flowSteps.join(" -> ") ?? "",
        q?.reflection ?? ""
      );
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

  const reports = await getSessionFullReport(session.id);
  const csv = "﻿" + buildCsv(reports);
  const filename = `aktivitas-${session.sessionCode}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
