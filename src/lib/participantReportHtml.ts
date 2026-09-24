import type { ParticipantReport } from "@/lib/adminReport";
import { buildFlowGraph, escapeHtml, flowGraphToSvg, EDGE_COLOR, LEGEND_LABEL } from "@/lib/flowGraph";

/**
 * One participant's complete answers as a single self-contained HTML file.
 *
 * HTML rather than CSV because the flow answers are graphs, not values: a
 * spreadsheet cell can only hold the flattened "A -> B -> C" reading, which
 * drops exactly the branching (decisions, their Ya/Tidak outcomes, recovery
 * paths) a grader needs to see. The diagrams are
 * embedded as inline SVG, so the file needs no network access, stays sharp at
 * any zoom, and prints straight to PDF. The flattened ordering is written
 * underneath each diagram too, so the file is still searchable as text — and
 * the session-wide CSV export is unchanged for spreadsheet work.
 */

function fmtSeconds(sec: number | null) {
  if (sec === null) return "—";
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "peserta";
}

function questSection(q: ParticipantReport["quests"][number], nativeViewMode: ParticipantReport["flowViewMode"]) {
  const flowMeta = q.flow ? ` · Ke aksi pertama: ${fmtSeconds(q.flow.timeToFirstActionSeconds)} · Revisi: ${q.flow.revisionCount}×` : "";
  const head = `<div class="row"><h2>Quest ${q.order} · ${escapeHtml(q.title)}</h2><span class="meta">Waktu: ${fmtSeconds(q.timeSpentSeconds)}${flowMeta}</span></div>`;

  if (q.status === null) {
    return `<section class="card">${head}<p class="muted">Belum dimulai.</p></section>`;
  }

  const quiz = q.quiz
    .map((a) => {
      const ok = a.total > 0 && a.correct === a.total;
      const verdict = !a.answered
        ? `<span class="muted">— Belum dijawab</span>`
        : `<span class="${ok ? "ok" : "bad"}">${ok ? "✓ Benar" : `${a.correct}/${a.total} benar`}</span>`;
      const answer = a.answered ? ` — <span class="muted">Jawaban: “${escapeHtml(a.answerText)}”</span>` : "";
      const key = a.answered && !ok ? `<br /><span class="muted">Kunci: ${escapeHtml(a.correctText)}</span>` : "";
      return `<p>${verdict} ${escapeHtml(a.prompt)}${answer}${key}</p>`;
    })
    .join("");

  let flow = "";
  if (q.flow) {
    const f = q.flow;
    const score = `<p class="score">Skor flow: <b>${f.totalScore !== null ? `${f.totalScore} / ${f.maxScore}` : "Belum dinilai"}</b> <span class="muted">(${escapeHtml(q.status)})</span></p>`;
    const graph = buildFlowGraph(f.graph.nodes, f.graph.connections, nativeViewMode, nativeViewMode);
    const diagram = graph
      ? `<div class="canvas">${flowGraphToSvg(graph, `q${q.order}`)}</div>` +
        `<p class="legend">${graph.usedKinds.map((k) => `<span><i style="background:${EDGE_COLOR[k]}"></i>${LEGEND_LABEL[k]}</span>`).join("")}</p>`
      : `<p class="muted">Belum ada node.</p>`;
    const steps = f.flowSteps.length ? `<p class="steps">Urutan node: ${f.flowSteps.map((x) => escapeHtml(x)).join(" → ")}</p>` : "";
    const reflection = f.reflection ? `<p class="quote">“${escapeHtml(f.reflection)}”</p>` : "";
    flow = `${score}${diagram}${steps}${reflection}`;
  }

  return `<section class="card">${head}${quiz}${flow}</section>`;
}

export function buildParticipantReportHtml(report: ParticipantReport, sessionTitle: string, sessionCode: string) {
  const focus = report.focusLoss.events.length
    ? `<section class="card warn"><h2>Riwayat Berpindah Tab/Window</h2><table>${report.focusLoss.events
        .map(
          (e) =>
            `<tr><td>${e.order ? `Quest ${e.order}` : "—"}</td><td>${e.awaySeconds ?? "—"}s</td><td class="muted">${escapeHtml(
              fmtDate(e.createdAt)
            )}</td></tr>`
        )
        .join("")}</table></section>`
    : "";

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jawaban ${escapeHtml(report.displayName)} — ${escapeHtml(sessionTitle)}</title>
<style>
:root{--ink:#14121f;--surface:#1e1b2e;--surface2:#262238;--border:#342e4a;--border-light:#3d3656;--gold:#f0ac3f;--gold-dim:#7a5b27;--teal:#45d9c3;--success:#7bc97e;--danger:#f2705c;--text:#f3f0e8;--muted:#9992ad;--muted2:#6e6785}
*{box-sizing:border-box}
body{margin:0;padding:28px 20px 60px;background:var(--ink);color:var(--text);font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1000px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:15px;margin:0}
.sub{color:var(--muted);font-size:13.5px;margin:0 0 20px}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.stat{flex:1 1 160px;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:14px}
.stat b{display:block;font-size:22px;color:var(--teal)}
.stat.warn b{color:var(--gold)}
.stat span{color:var(--muted);font-size:12.5px}
.card{border:1px solid var(--border);background:var(--surface);border-radius:14px;padding:20px;margin-bottom:18px}
.card.warn{border-color:var(--gold-dim);background:rgba(240,172,63,.06)}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.meta,.muted{color:var(--muted2);font-size:12px}
.score{font-size:13px;margin:0 0 10px}
.canvas{border:1px solid var(--border-light);background:var(--surface2);border-radius:10px;overflow:auto}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:var(--muted2);margin:8px 0 0}
.legend i{display:inline-block;width:16px;height:2px;border-radius:2px;margin-right:6px;vertical-align:middle}
.steps{font-size:12px;color:var(--muted);margin:10px 0 0}
.quote{font-style:italic;color:var(--muted);font-size:13px;margin:10px 0 0}
.ok{color:var(--success)}.bad{color:var(--danger)}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px}
td{padding:4px 0;color:var(--muted)}
footer{color:var(--muted2);font-size:11.5px;margin-top:28px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card{break-inside:avoid}}
</style></head>
<body><main>
<h1>${escapeHtml(report.displayName)}</h1>
<p class="sub">${escapeHtml(report.email)} · ${escapeHtml(report.school ?? "—")} · ${escapeHtml(
    report.groupName ?? "—"
  )}<br />${escapeHtml(sessionTitle)} (${escapeHtml(sessionCode)}) · diunduh ${escapeHtml(fmtDate(new Date()))}</p>
<div class="stats">
<div class="stat"><b>${report.totalXp}</b><span>Total XP</span></div>
<div class="stat"><b>${escapeHtml(report.status)}</b><span>Status</span></div>
<div class="stat${report.focusLoss.count > 0 ? " warn" : ""}"><b>${report.focusLoss.count}×</b><span>Berpindah Tab</span></div>
<div class="stat${report.focusLoss.totalAwaySeconds > 0 ? " warn" : ""}"><b>${fmtSeconds(
    report.focusLoss.totalAwaySeconds || null
  )}</b><span>Total Waktu Pergi</span></div>
</div>
${focus}
${report.quests.map((q) => questSection(q, report.flowViewMode)).join("")}
<footer>Diagram digambar dalam orientasi ${
    report.flowViewMode === "HORIZONTAL" ? "horizontal" : "vertikal"
  } — sama seperti yang dipakai peserta saat menyusun flow-nya.</footer>
</main></body></html>`;
}
