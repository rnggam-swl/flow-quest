"use client";

import { useMemo } from "react";
import type { CaseNode } from "@/lib/content/case";
import { PRACTICE_NODE_KEY } from "@/lib/content/caseEdit";
import { EDGE_PATTERN, checkRules, isKnownRule } from "@/lib/practice/flowRules";
import { nodeDictionary, type NodeDictionary } from "@/lib/practice/nodes";
import type { FixerWidget } from "@/lib/practice/schema";
import { cx, removeAt, replaceAt, useBuilder } from "./fields";
import s from "./builder.module.css";

/**
 * Editors for the Modul Latihan flows a widget draws: a list of arrows
 * ("a>b", optionally :Y/:N/:R) between library nodes, and the flow fixer —
 * which arrows start switched on, which the example solution uses, and the
 * rules a participant has to satisfy, each checked live against both.
 */

const KINDS = [
  { v: "", label: "biasa" },
  { v: "Y", label: "Ya" },
  { v: "N", label: "Tidak" },
  { v: "R", label: "kembali" },
] as const;

type Kind = (typeof KINDS)[number]["v"];

export function splitEdge(e: string): { from: string; to: string; kind: Kind } {
  const [pair, k = ""] = e.split(":");
  const [from = "", to = ""] = pair.split(">");
  return { from, to, kind: (["Y", "N", "R"].includes(k) ? k : "") as Kind };
}
export const joinEdge = (from: string, to: string, kind: Kind) => `${from}>${to}${kind ? `:${kind}` : ""}`;

/** Library nodes a practice flow can use (keys of lowercase letters and digits). */
export function usePracticeNodes(): CaseNode[] {
  const { nodes } = useBuilder();
  return useMemo(() => nodes.filter((n) => PRACTICE_NODE_KEY.test(n.key)), [nodes]);
}

function NodeSelect({ value, options, onChange, dict }: { value: string; options: string[]; onChange: (k: string) => void; dict: NodeDictionary }) {
  const list = options.includes(value) || !value ? options : [value, ...options];
  return (
    <select className={s.rowSel} value={value} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">— pilih —</option>}
      {list.map((k) => (
        <option key={k} value={k}>
          {dict.label(k)}
        </option>
      ))}
    </select>
  );
}

/** One arrow: from → to, with its kind. */
function EdgeRow({ edge, nodes, dict, onChange, children }: { edge: string; nodes: string[]; dict: NodeDictionary; onChange: (e: string) => void; children?: React.ReactNode }) {
  const { from, to, kind } = splitEdge(edge);
  const valid = EDGE_PATTERN.test(edge);
  return (
    <div className={cx(s.row, s.edgeRow, !valid && s.edgeRowBad)}>
      <NodeSelect value={from} options={nodes} dict={dict} onChange={(k) => onChange(joinEdge(k, to, kind))} />
      <span className={s.edgeArrow}>{kind === "R" ? "⟲" : "→"}</span>
      <NodeSelect value={to} options={nodes} dict={dict} onChange={(k) => onChange(joinEdge(from, k, kind))} />
      <select className={s.rowSel} value={kind} onChange={(e) => onChange(joinEdge(from, to, e.target.value as Kind))} aria-label="Jenis panah">
        {KINDS.map((k) => (
          <option key={k.v} value={k.v}>
            {k.label}
          </option>
        ))}
      </select>
      {children}
    </div>
  );
}

/** A plain list of arrows, for a diagram ("flows" widget). */
export function EdgeListEditor({ edges, nodes, onChange }: { edges: string[]; nodes: string[]; onChange: (edges: string[]) => void }) {
  const { nodes: library } = useBuilder();
  const dict = useMemo(() => nodeDictionary(library), [library]);
  return (
    <div>
      {edges.map((e, i) => (
        <EdgeRow key={i} edge={e} nodes={nodes} dict={dict} onChange={(next) => onChange(replaceAt(edges, i, next))}>
          <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} aria-label="Hapus panah" onClick={() => onChange(removeAt(edges, i))}>
            ✕
          </button>
        </EdgeRow>
      ))}
      <button type="button" className={s.linkBtn} onClick={() => onChange([...edges, joinEdge(nodes[0] ?? "", nodes[1] ?? nodes[0] ?? "", "")])}>
        ＋ Panah
      </button>
    </div>
  );
}

/** Node chips: pick which library nodes a flow shows. */
export function NodePicker({ selected, onToggle, library }: { selected: string[]; onToggle: (key: string, on: boolean) => void; library: CaseNode[] }) {
  return (
    <div className={s.chips}>
      {library.map((n) => {
        const on = selected.includes(n.key);
        return (
          <button key={n.key} type="button" className={cx(s.chip, on && s.chipOn)} aria-pressed={on} onClick={() => onToggle(n.key, !on)} title={n.key}>
            <span>{n.icon}</span>
            {n.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Rules ────────────────────────────────────────────────────────────────

const RULE_TYPES = [
  { name: "reach", label: "Ada jalan dari awal sampai…", params: 1 },
  { name: "terminal", label: "…tidak punya panah keluar", params: 1 },
  { name: "before", label: "…dilewati sebelum…", params: 2 },
  { name: "twoSides", label: "…punya cabang Ya dan Tidak", params: 1 },
  { name: "branch", label: "…muncul sebagai cabang gagal", params: 1 },
  { name: "recovery", label: "…punya jalan kembali ke…", params: 2 },
  { name: "connected", label: "Semua node tersambung", params: 0 },
  { name: "not", label: "Tidak ada sambungan…", params: -1 },
] as const;

function ruleParts(rule: string): { name: string; a: string; b: string } {
  if (rule.startsWith("not:")) return { name: "not", a: rule.slice(4), b: "" };
  const [name = "", a = "", b = ""] = rule.split(":");
  return { name, a, b };
}

function buildRule(name: string, a: string, b: string): string {
  const t = RULE_TYPES.find((r) => r.name === name);
  if (!t || t.params === 0) return name;
  if (t.params === -1) return `not:${a}`;
  return t.params === 1 ? `${name}:${a}` : `${name}:${a}:${b}`;
}

function Status({ pass, label }: { pass: boolean | null; label: string }) {
  if (pass === null) return <span className={s.ruleDot}>–</span>;
  return (
    <span className={cx(s.ruleDot, pass ? s.ruleOk : s.ruleNo)} title={`${label}: ${pass ? "terpenuhi" : "belum terpenuhi"}`}>
      {pass ? "✓" : "✗"}
    </span>
  );
}

// ── Fixer ────────────────────────────────────────────────────────────────

interface Row {
  edge: string;
  on: boolean;
  sol: boolean;
}

/**
 * One row per available arrow, in order: switched on, then off, then any the
 * solution names that isn't available yet. Duplicates stay as separate rows
 * (and are flagged) so a row being edited never merges into another and vanishes.
 */
function rowsOf(w: FixerWidget): Row[] {
  const solLeft = [...w.solution];
  const takeSol = (edge: string) => {
    const j = solLeft.indexOf(edge);
    if (j < 0) return false;
    solLeft.splice(j, 1);
    return true;
  };
  const rows = [...w.initial.map((edge) => ({ edge, on: true })), ...(w.extra ?? []).map((edge) => ({ edge, on: false }))].map((r) => ({ ...r, sol: takeSol(r.edge) }));
  return [...rows, ...solLeft.map((edge) => ({ edge, on: false, sol: true }))];
}

function fromRows(w: FixerWidget, rows: Row[]): FixerWidget {
  const extra = rows.filter((r) => !r.on).map((r) => r.edge);
  const { extra: _drop, ...rest } = w;
  void _drop;
  return { ...rest, initial: rows.filter((r) => r.on).map((r) => r.edge), ...(extra.length ? { extra } : {}), solution: rows.filter((r) => r.sol).map((r) => r.edge) };
}

export function FixerEditor({ widget: w, onChange }: { widget: FixerWidget; onChange: (w: FixerWidget) => void }) {
  const { nodes: library } = useBuilder();
  const practiceNodes = usePracticeNodes();
  const dict = useMemo(() => nodeDictionary(library), [library]);
  const rows = rowsOf(w);
  const setRows = (next: Row[]) => onChange(fromRows(w, next));

  const known = w.rules.map(isKnownRule);
  const validEdges = (list: string[]) => list.filter((e) => EDGE_PATTERN.test(e));
  const checkable = w.rules.filter((_, i) => known[i]);
  const onInitial = checkRules(checkable, w.nodes, validEdges(w.initial), w.start, dict);
  const onSolution = checkRules(checkable, w.nodes, validEdges(w.solution), w.start, dict);
  const resultOf = (i: number) => {
    const j = known.slice(0, i).filter(Boolean).length;
    return known[i] ? { label: onInitial[j].label, initial: onInitial[j].pass, solution: onSolution[j].pass } : null;
  };
  const initialAll = onInitial.length > 0 && onInitial.every((r) => r.pass);
  const solutionAll = onSolution.every((r) => r.pass);

  function toggleNode(key: string, on: boolean) {
    if (on) {
      onChange({ ...w, nodes: [...w.nodes, key] });
      return;
    }
    const touches = (e: string) => {
      const { from, to } = splitEdge(e);
      return from === key || to === key;
    };
    const usedBy = rows.filter((r) => touches(r.edge)).length + w.rules.filter((r) => ruleParts(r).a.split(/[>:]/).includes(key) || ruleParts(r).b === key).length;
    if (usedBy && !window.confirm(`${dict.label(key)} dipakai ${usedBy} panah/aturan. Hapus node beserta panah dan aturannya?`)) return;
    const kept = fromRows(w, rows.filter((r) => !touches(r.edge)));
    onChange({
      ...kept,
      nodes: w.nodes.filter((k) => k !== key),
      start: w.start === key ? (w.nodes.find((k) => k !== key) ?? "") : w.start,
      rules: w.rules.filter((r) => {
        const p = ruleParts(r);
        return !(p.a.split(/[>:]/).includes(key) || p.b === key);
      }),
    });
  }

  return (
    <div className={s.fixerEd}>
      <div className={s.field}>
        <label className={s.fieldLbl}>Judul kanvas (opsional)</label>
        <input className={s.input} value={w.title ?? ""} onChange={(e) => onChange({ ...w, title: e.target.value || undefined })} placeholder="mis. Flow Quest 5 kamu" />
      </div>
      <div className={s.field}>
        <label className={s.fieldLbl}>Pengantar (opsional)</label>
        <textarea className={s.textarea} rows={2} value={w.intro ?? ""} onChange={(e) => onChange({ ...w, intro: e.target.value || undefined })} />
      </div>

      <div className={s.field}>
        <label className={s.fieldLbl}>Node di kanvas</label>
        <NodePicker library={practiceNodes} selected={w.nodes} onToggle={toggleNode} />
        {practiceNodes.length < library.length && <div className={s.fieldHint}>Node dengan kunci berisi _ tidak bisa dipakai di latihan.</div>}
      </div>
      <div className={s.field}>
        <label className={s.fieldLbl}>Mulai dari</label>
        <NodeSelect value={w.start} options={w.nodes} dict={dict} onChange={(start) => onChange({ ...w, start })} />
      </div>

      <div className={s.field}>
        <label className={s.fieldLbl}>Sambungan</label>
        <div className={s.fieldHint} style={{ marginBottom: 8 }}>
          <b>Awal</b>: menyala saat latihan dibuka. <b>Contoh</b>: dipakai contoh jawaban. Sambungan yang tidak menyala di awal tetap bisa dinyalakan peserta.
        </div>
        <div className={s.edgeHead}>
          <span>Dari → ke, jenis</span>
          <span>Awal</span>
          <span>Contoh</span>
        </div>
        {rows.map((r, i) => (
          <EdgeRow key={i} edge={r.edge} nodes={w.nodes} dict={dict} onChange={(edge) => setRows(replaceAt(rows, i, { ...r, edge }))}>
            <input type="checkbox" className={s.edgeCheck} checked={r.on} onChange={(e) => setRows(replaceAt(rows, i, { ...r, on: e.target.checked }))} aria-label="Menyala di awal" />
            <input type="checkbox" className={s.edgeCheck} checked={r.sol} onChange={(e) => setRows(replaceAt(rows, i, { ...r, sol: e.target.checked }))} aria-label="Bagian dari contoh jawaban" />
            <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} aria-label="Hapus sambungan" onClick={() => setRows(removeAt(rows, i))}>
              ✕
            </button>
          </EdgeRow>
        ))}
        <button type="button" className={s.linkBtn} onClick={() => setRows([...rows, { edge: joinEdge(w.nodes[0] ?? "", w.nodes[1] ?? w.nodes[0] ?? "", ""), on: false, sol: false }])}>
          ＋ Sambungan
        </button>
      </div>

      <div className={s.field}>
        <label className={s.fieldLbl}>Aturan</label>
        <div className={s.edgeHead}>
          <span>Aturan</span>
          <span>Awal</span>
          <span>Contoh</span>
        </div>
        {w.rules.map((rule, i) => {
          const p = ruleParts(rule);
          const t = RULE_TYPES.find((x) => x.name === p.name);
          const res = resultOf(i);
          const set = (next: string) => onChange({ ...w, rules: replaceAt(w.rules, i, next) });
          return (
            <div key={i}>
              <div className={cx(s.row, s.edgeRow)}>
                <select className={s.rowSel} value={p.name} onChange={(e) => set(buildRule(e.target.value, e.target.value === "not" ? (rows[0]?.edge ?? "") : (w.nodes[0] ?? ""), w.nodes[1] ?? ""))}>
                  {!t && <option value={p.name}>{rule}</option>}
                  {RULE_TYPES.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {t && t.params >= 1 && <NodeSelect value={p.a} options={w.nodes} dict={dict} onChange={(a) => set(buildRule(p.name, a, p.b))} />}
                {t && t.params === 2 && <NodeSelect value={p.b} options={w.nodes} dict={dict} onChange={(b) => set(buildRule(p.name, p.a, b))} />}
                {t && t.params === -1 && (
                  <select className={s.rowSel} value={p.a} onChange={(e) => set(buildRule("not", e.target.value, ""))}>
                    {!rows.some((r) => r.edge === p.a) && <option value={p.a}>{p.a || "— pilih —"}</option>}
                    {rows.map((r) => {
                      const e = splitEdge(r.edge);
                      return (
                        <option key={r.edge} value={r.edge}>
                          {dict.label(e.from)} {e.kind === "R" ? "⟲" : "→"} {dict.label(e.to)}
                          {e.kind === "Y" ? " (Ya)" : e.kind === "N" ? " (Tidak)" : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
                <span className={s.grow} />
                <Status pass={res ? res.initial : null} label="Flow awal" />
                <Status pass={res ? res.solution : null} label="Contoh jawaban" />
                <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} aria-label="Hapus aturan" onClick={() => onChange({ ...w, rules: removeAt(w.rules, i) })}>
                  ✕
                </button>
              </div>
              {res && <div className={s.ruleText}>{res.label}</div>}
            </div>
          );
        })}
        <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, rules: [...w.rules, buildRule("reach", w.nodes[w.nodes.length - 1] ?? "", "")] })}>
          ＋ Aturan
        </button>
      </div>

      <div className={s.fixerSummary}>
        <div className={initialAll ? s.warn : s.okLine}>
          {initialAll ? "✗ Flow awal sudah memenuhi semua aturan — tidak ada yang perlu diperbaiki peserta." : `✓ Flow awal belum memenuhi ${onInitial.filter((r) => !r.pass).length} aturan.`}
        </div>
        <div className={solutionAll ? s.okLine : s.warn}>
          {solutionAll ? "✓ Contoh jawaban memenuhi semua aturan." : `✗ Contoh jawaban belum memenuhi ${onSolution.filter((r) => !r.pass).length} aturan — centang kolom Contoh.`}
        </div>
      </div>

      <div className={s.field}>
        <label className={s.fieldLbl}>Catatan setelah selesai (opsional)</label>
        <textarea className={s.textarea} rows={2} value={w.afterNote ?? ""} onChange={(e) => onChange({ ...w, afterNote: e.target.value || undefined })} />
      </div>
    </div>
  );
}
