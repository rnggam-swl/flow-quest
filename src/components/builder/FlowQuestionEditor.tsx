"use client";

import { useMemo, useState } from "react";
import { FlowBuilderCanvas, localPersistence, type CanvasGraph } from "@/components/FlowBuilderCanvas";
import type { CaseNode } from "@/lib/content/case";
import { paletteItems } from "@/lib/content/questHelpers";
import { graphFromDrawing, type FlowDrawing } from "@/lib/content/questions";
import { RUBRIC_CATEGORIES, flowRubricSchema, graphFromFlow, scoreFlow, type FlowRubric, type RubricResult } from "@/lib/content/rubric";
import { RUBRIC_CATEGORY_HINTS, RUBRIC_CATEGORY_LABELS, describeCondition } from "@/lib/content/rubricDescribe";
import { suggestRubric } from "@/lib/content/rubricSuggest";
import { canonicalJson } from "@/lib/content/importCase";
import { TIER_LABELS } from "@/lib/flowScoring";
import { NumberField, Segmented, cx, replaceAt, useBuilder } from "./fields";
import type { EditorProps } from "./QuizEditors";
import s from "./builder.module.css";

/**
 * The flow question's editor: which nodes the canvas offers, the author's
 * answer key drawn on the participant's own canvas, a rubric proposed from
 * that key (then tuned — labels, points, messages — or written as JSON), and
 * a test canvas that scores any flow against the rubric as it's drawn.
 */

type Tab = "kunci" | "rubrik" | "uji";

function drawingToCanvas(d: FlowDrawing | undefined, nodes: CaseNode[]) {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const known = (d?.nodes ?? []).filter((n) => byKey.has(n.key));
  const ids = new Set(known.map((n) => n.id));
  return {
    nodes: known.map((n) => ({ id: n.id, label: byKey.get(n.key)!.label, nodeType: byKey.get(n.key)!.nodeType, positionX: n.x, positionY: n.y })),
    connections: (d?.edges ?? [])
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e, i) => ({ id: `k${i}-${e.from}-${e.to}`, sourceNodeId: e.from, targetNodeId: e.to, connectionType: e.kind })),
  };
}

function canvasToDrawing(g: CanvasGraph, nodes: CaseNode[]): FlowDrawing {
  const byLabel = new Map(nodes.map((n) => [n.label, n.key]));
  const kept = g.nodes.filter((n) => byLabel.has(n.label));
  const ids = new Set(kept.map((n) => n.id));
  return {
    nodes: kept.map((n) => ({ id: n.id, key: byLabel.get(n.label)!, x: Math.round(n.positionX), y: Math.round(n.positionY) })),
    edges: g.connections.filter((c) => ids.has(c.sourceNodeId) && ids.has(c.targetNodeId)).map((c) => ({ from: c.sourceNodeId, to: c.targetNodeId, kind: c.connectionType })),
  };
}

const totalOf = (r: RubricResult) => ({ total: r.total, max: RUBRIC_CATEGORIES.reduce((sum, c) => sum + r.max[c], 0) });

function ScoreCard({ result, rubric, label }: { result: RubricResult; rubric: FlowRubric; label: (k: string) => string }) {
  const { total, max } = totalOf(result);
  return (
    <div className={s.card}>
      <div className={s.trow} style={{ marginBottom: 10 }}>
        <b style={{ fontSize: 15 }}>
          {TIER_LABELS[result.tier].badge} {TIER_LABELS[result.tier].label}
        </b>
        <b style={{ fontSize: 18 }}>
          {total}
          <span style={{ color: "var(--t3)", fontSize: 13 }}> / {max}</span>
        </b>
      </div>
      <p style={{ fontSize: 13, color: "var(--slate600)", marginBottom: 12 }}>{result.message}</p>
      {RUBRIC_CATEGORIES.filter((c) => result.max[c] > 0).map((c) => (
        <div key={c} style={{ marginBottom: 6 }}>
          <div className={s.trow} style={{ fontSize: 12 }}>
            <span>{RUBRIC_CATEGORY_LABELS[c]}</span>
            <span>
              {result.scores[c]} / {result.max[c]}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--slate100)" }}>
            <div style={{ height: 5, borderRadius: 3, width: `${(result.scores[c] / result.max[c]) * 100}%`, background: result.scores[c] === result.max[c] ? "var(--grn)" : "var(--acc)" }} />
          </div>
        </div>
      ))}
      {Object.keys(rubric.checks).length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 3 }}>
          {Object.entries(rubric.checks).map(([name, c]) => (
            <div key={name} style={{ fontSize: 12, color: result.checks[name] ? "var(--grn)" : "var(--t3)" }}>
              {result.checks[name] ? "✓" : "○"} {c.label ?? describeCondition(c.when, rubric, label)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RubricJson({ rubric, onApply }: { rubric: FlowRubric; onApply: (r: FlowRubric) => void }) {
  const [text, setText] = useState(() => JSON.stringify(rubric, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <details className={s.sec}>
      <summary className={s.secT} style={{ cursor: "pointer" }}>
        JSON lanjutan
      </summary>
      <div className={s.secSub}>Untuk aturan yang tidak bisa diatur di atas. Bentuknya sama dengan rubrik di file kasus.</div>
      <textarea className={cx(s.textarea, s.mono)} style={{ minHeight: 260, fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {error && <div className={s.warn}>{error}</div>}
      <button
        type="button"
        className={s.addBtn}
        style={{ marginTop: 8 }}
        onClick={() => {
          try {
            const parsed = flowRubricSchema.safeParse(JSON.parse(text));
            if (!parsed.success) {
              setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
              return;
            }
            setError(null);
            onApply(parsed.data);
          } catch {
            setError("Bukan JSON yang valid.");
          }
        }}
      >
        Terapkan JSON
      </button>
    </details>
  );
}

function RubricPanel({ rubric, onChange, label }: { rubric: FlowRubric; onChange: (r: FlowRubric) => void; label: (k: string) => string }) {
  const describe = (c: Parameters<typeof describeCondition>[0]) => describeCondition(c, rubric, label);
  return (
    <>
      <div className={s.sec}>
        <div className={s.secT}>Poin per kategori</div>
        <div className={s.secSub}>Kasus pertama yang terpenuhi menentukan poin kategori itu.</div>
        {RUBRIC_CATEGORIES.map((cat) => {
          const rule = rubric.scores[cat];
          const setRule = (next: typeof rule) => onChange({ ...rubric, scores: { ...rubric.scores, [cat]: next } });
          return (
            <div key={cat} className={s.card} style={{ marginBottom: 10 }}>
              <div className={s.trow}>
                <div>
                  <b>{RUBRIC_CATEGORY_LABELS[cat]}</b> <span style={{ color: "var(--t3)", fontSize: 12 }}>{RUBRIC_CATEGORY_HINTS[cat]}</span>
                </div>
                {rule ? (
                  <span className={s.row} style={{ margin: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--t2)" }}>Maks</span>
                    <NumberField className={cx(s.pin, s.pinNum)} value={rule.max} min={0} onChange={(v) => setRule({ ...rule, max: Math.max(0, v ?? 0) })} />
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--t3)" }}>tidak dinilai</span>
                )}
              </div>
              {rule && "orphans" in rule && (
                <div className={s.row} style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5 }}>
                  Minimal
                  <NumberField className={cx(s.pin, s.pinNum)} value={rule.orphans.floor} onChange={(v) => setRule({ ...rule, orphans: { floor: v ?? 0 } })} />
                  poin walau banyak node tidak tersambung
                </div>
              )}
              {rule && "cases" in rule && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {rule.cases.map((c, i) => (
                    <div key={i} className={s.row} style={{ margin: 0, fontSize: 12.5, alignItems: "flex-start" }}>
                      <span style={{ width: 70, flexShrink: 0 }}>
                        <NumberField className={s.pin} value={c.points} onChange={(v) => setRule({ ...rule, cases: replaceAt(rule.cases, i, { ...c, points: v ?? 0 }) })} />
                      </span>
                      <span style={{ paddingTop: 7, color: "var(--slate600)" }}>poin jika {describe(c.when)}</span>
                    </div>
                  ))}
                  <div className={s.row} style={{ margin: 0, fontSize: 12.5 }}>
                    <span style={{ width: 70, flexShrink: 0 }}>
                      <NumberField className={s.pin} value={rule.otherwise} onChange={(v) => setRule({ ...rule, otherwise: v ?? 0 })} />
                    </span>
                    <span style={{ color: "var(--slate600)" }}>poin selain itu</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={s.sec}>
        <div className={s.secT}>Syarat</div>
        <div className={s.secSub}>Label ini yang dibaca admin di daftar syarat. Isi syaratnya diubah lewat usulan ulang atau JSON.</div>
        {Object.entries(rubric.checks).map(([name, c]) => (
          <div key={name} className={s.row} style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <input
                className={s.pin}
                value={c.label ?? ""}
                placeholder={describe(c.when)}
                onChange={(e) => onChange({ ...rubric, checks: { ...rubric.checks, [name]: { ...c, label: e.target.value || undefined } } })}
              />
              <div className={s.fieldHint}>
                <span className={s.mono}>{name}</span> · {describe(c.when)}
              </div>
            </div>
          </div>
        ))}
        {Object.keys(rubric.checks).length === 0 && <div className={s.hint}>Belum ada syarat. Gambar kunci jawaban lalu klik Usulkan rubrik.</div>}
      </div>

      <div className={s.sec}>
        <div className={s.secT}>Tingkat & pesan</div>
        <div className={s.secSub}>Aturan pertama yang terpenuhi menentukan tingkat dan pesan untuk peserta.</div>
        {rubric.tiers.map((t, i) => (
          <div key={i} className={s.field}>
            <label className={s.fieldLbl}>
              {TIER_LABELS[t.tier].badge} {TIER_LABELS[t.tier].label} <span style={{ color: "var(--t3)", fontWeight: 400 }}>— jika {describe(t.when)}</span>
            </label>
            <textarea className={s.textarea} rows={2} value={t.message} onChange={(e) => onChange({ ...rubric, tiers: replaceAt(rubric.tiers, i, { ...t, message: e.target.value }) })} />
          </div>
        ))}
        <div className={s.field}>
          <label className={s.fieldLbl}>
            {TIER_LABELS[rubric.otherwise.tier].badge} {TIER_LABELS[rubric.otherwise.tier].label} <span style={{ color: "var(--t3)", fontWeight: 400 }}>— selain itu</span>
          </label>
          <textarea className={s.textarea} rows={2} value={rubric.otherwise.message} onChange={(e) => onChange({ ...rubric, otherwise: { ...rubric.otherwise, message: e.target.value } })} />
        </div>
        {rubric.notes.map((n, i) => (
          <div key={i} className={s.field}>
            <label className={s.fieldLbl}>
              Catatan tambahan <span style={{ color: "var(--t3)", fontWeight: 400 }}>— jika {describe(n.when)}</span>
            </label>
            <textarea className={s.textarea} rows={2} value={n.message} onChange={(e) => onChange({ ...rubric, notes: replaceAt(rubric.notes, i, { ...n, message: e.target.value }) })} />
          </div>
        ))}
      </div>

      <RubricJson key={canonicalJson(rubric)} rubric={rubric} onApply={onChange} />
    </>
  );
}

export function FlowQuestionEditor({ question: q, onChange }: EditorProps<"flow">) {
  const { nodes, toast } = useBuilder();
  const [tab, setTab] = useState<Tab>("kunci");
  const [testGraph, setTestGraph] = useState<CanvasGraph>({ nodes: [], connections: [] });
  const [testSeed, setTestSeed] = useState<{ n: number; fromKey: boolean }>({ n: 0, fromKey: false });
  const [summary, setSummary] = useState<string[] | null>(null);

  const byKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);
  const label = (k: string) => byKey.get(k)?.label ?? k;
  const palette = paletteItems(nodes, q.palette);

  const keyResult = q.answerKey?.nodes.length ? scoreFlow(q.rubric, graphFromDrawing(q.answerKey, (k) => byKey.get(k)?.nodeType)) : null;
  const testResult = scoreFlow(q.rubric, graphFromFlow(testGraph.nodes, testGraph.connections, nodes));

  function onKeyChange(g: CanvasGraph) {
    const drawing = canvasToDrawing(g, nodes);
    const current = q.answerKey ?? { nodes: [], edges: [] };
    if (canonicalJson(drawing) === canonicalJson(current)) return;
    onChange({ ...q, answerKey: drawing.nodes.length ? drawing : undefined });
  }

  function suggest() {
    if (!q.answerKey) {
      toast("Gambar kunci jawaban dulu.", "error");
      return;
    }
    const r = suggestRubric(q.answerKey, nodes);
    if ("error" in r) {
      toast(r.error, "error");
      return;
    }
    const hasRubric = Object.keys(q.rubric.checks).length > 0;
    if (hasRubric && !window.confirm("Ganti rubrik yang sekarang dengan usulan dari kunci jawaban? Label, poin, dan pesan yang sudah diubah akan hilang.")) return;
    onChange({ ...q, rubric: r.rubric });
    setSummary(r.summary);
    toast("Rubrik diusulkan dari kunci jawaban.");
  }

  const togglePalette = (key: string) =>
    onChange({ ...q, palette: q.palette.includes(key) ? q.palette.filter((k) => k !== key) : [...q.palette, key] });

  return (
    <>
      <div className={s.sec}>
        <div className={s.secT}>Palet node</div>
        <div className={s.secSub}>Node yang bisa diseret peserta ke kanvas, sesuai urutan klik. Node dikelola di kamus kasus.</div>
        <div className={s.tiles}>
          {nodes.map((n) => {
            const on = q.palette.includes(n.key);
            return (
              <button key={n.key} type="button" className={cx(s.tile, s.tileWord)} style={on ? { borderColor: "var(--acc)", background: "var(--accs)" } : { opacity: 0.55 }} onClick={() => togglePalette(n.key)} aria-pressed={on}>
                {n.icon} {n.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={s.trow} style={{ marginBottom: 12 }}>
        <Segmented
          value={tab}
          options={[
            { value: "kunci", label: "1 · Kunci jawaban" },
            { value: "rubrik", label: "2 · Rubrik" },
            { value: "uji", label: "3 · Uji" },
          ]}
          onChange={setTab}
        />
        {keyResult && (
          <span className={cx(totalOf(keyResult).total === totalOf(keyResult).max && keyResult.tier === "great" ? s.okChip : s.problemChip)}>
            Kunci: {totalOf(keyResult).total}/{totalOf(keyResult).max} · {TIER_LABELS[keyResult.tier].label}
          </span>
        )}
      </div>

      {tab === "kunci" && (
        <>
          <div className={s.secSub}>Gambar flow yang benar di kanvas peserta. Kunci ini tidak pernah dikirim ke peserta; yang menilai adalah rubrik.</div>
          <div className={cx(s.canvasFrame, s.darkZone)}>
            <TestCanvas
              seed={drawingToCanvas(q.answerKey, nodes)}
              keepIds
              title="Kunci jawaban"
              line={q.prompt || "—"}
              question={q}
              palette={palette}
              nodes={nodes}
              onGraphChange={onKeyChange}
              height="h-[560px]"
            />
          </div>
          <div className={s.row} style={{ marginTop: 14 }}>
            <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={suggest}>
              ✨ Usulkan rubrik dari kunci
            </button>
            {summary && <span className={s.fieldHint}>{summary.join(" · ")}</span>}
          </div>
        </>
      )}

      {tab === "rubrik" && <RubricPanel rubric={q.rubric} onChange={(rubric) => onChange({ ...q, rubric })} label={label} />}

      {tab === "uji" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 14, alignItems: "start" }}>
          <div>
            <div className={s.row}>
              <button type="button" className={s.addBtn} onClick={() => setTestSeed((t) => ({ n: t.n + 1, fromKey: true }))} disabled={!q.answerKey}>
                Mulai dari kunci
              </button>
              <button type="button" className={s.addBtn} onClick={() => setTestSeed((t) => ({ n: t.n + 1, fromKey: false }))}>
                Kanvas kosong
              </button>
            </div>
            <div className={cx(s.canvasFrame, s.darkZone)}>
              <TestCanvas
                key={testSeed.n}
                seed={testSeed.fromKey ? drawingToCanvas(q.answerKey, nodes) : { nodes: [], connections: [] }}
                question={q}
                palette={palette}
                nodes={nodes}
                onGraphChange={setTestGraph}
              />
            </div>
          </div>
          <ScoreCard result={testResult} rubric={q.rubric} label={label} />
        </div>
      )}
    </>
  );
}

/**
 * A sandbox canvas starting from `seed` (read once, when it mounts — the canvas
 * owns what's drawn from then on). Test flows get fresh ids so they never
 * collide with the key's; the key canvas keeps its own.
 */
function TestCanvas({
  seed,
  keepIds,
  title = "Uji rubrik",
  line = "Susun flow apa saja; nilainya dihitung langsung di kanan.",
  question,
  palette,
  nodes,
  onGraphChange,
  height = "h-[520px]",
}: {
  seed: ReturnType<typeof drawingToCanvas>;
  keepIds?: boolean;
  title?: string;
  line?: string;
  question: EditorProps<"flow">["question"];
  palette: ReturnType<typeof paletteItems>;
  nodes: CaseNode[];
  onGraphChange: (g: CanvasGraph) => void;
  height?: string;
}) {
  const [initial] = useState(() => {
    if (keepIds) return seed;
    const ids = new Map(seed.nodes.map((n) => [n.id, crypto.randomUUID()]));
    return {
      nodes: seed.nodes.map((n) => ({ ...n, id: ids.get(n.id)! })),
      connections: seed.connections.map((c) => ({ ...c, id: crypto.randomUUID(), sourceNodeId: ids.get(c.sourceNodeId)!, targetNodeId: ids.get(c.targetNodeId)! })),
    };
  });
  return (
    <FlowBuilderCanvas
      sandbox
      persistence={localPersistence}
      questOrder={0}
      questLabel={title}
      scenarioLine={line}
      nodeLibrary={palette}
      library={nodes}
      rubric={question.rubric}
      initialNodes={initial.nodes}
      initialConnections={initial.connections}
      initialRemainingSeconds={null}
      initialViewMode="HORIZONTAL"
      showCheck={false}
      showSubmit={false}
      onGraphChange={onGraphChange}
      heightClassName={height}
    />
  );
}
