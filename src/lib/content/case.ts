import { z } from "zod";
import { looksLikeHtml } from "@/lib/content/markdown";
import { findQuestionProblems, questionSchema, QUESTION_ID } from "@/lib/content/questions";
import { EDGE_KINDS, evaluateCondition, practiceRuleCondition, type RubricGraph } from "@/lib/content/rubric";
import { isKnownRule, EDGE_PATTERN } from "@/lib/practice/flowRules";
import { planWidgetSchema, type FixerWidget, type PlanWidget } from "@/lib/practice/schema";
import { questRewardsSchema } from "@/lib/content/rewards";

/**
 * A case ("kasus") is the unit of content: the story, the node library every
 * flow in it is built from, its quests, and its Modul Latihan modules. It is
 * exactly what a case file under prisma/cases/ holds, what a ScenarioVersion
 * row stores, and what the builder edits — one shape everywhere, so a case
 * written by hand and one made in the editor go through the same checks.
 */

export const CASE_KEY = /^[a-z0-9][a-z0-9-]*$/;

export const NODE_TYPES = ["START", "ACTION", "SCREEN", "SYSTEM", "DECISION", "OUTCOME", "ERROR"] as const;

export const libraryNodeSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9_]*$/, "kunci node hanya huruf kecil, angka, dan _"),
  label: z.string().min(1),
  nodeType: z.enum(NODE_TYPES),
  icon: z.string().min(1),
});
export type CaseNode = z.infer<typeof libraryNodeSchema>;

export const questContentSchema = z.strictObject({
  order: z.number().int().positive(),
  title: z.string().min(1),
  objective: z.string().min(1),
  xp: z.number().int().nonnegative(),
  timeLimitMinutes: z.number().int().positive().nullable(),
  /** Markdown shown above the questions, e.g. the scenario the quest opens with. */
  intro: z.string().optional(),
  /** "instant": each answer is checked (and its feedback shown) right away; "end": all at once after submitting. */
  checkMode: z.enum(["instant", "end"]).default("end"),
  questions: z.array(questionSchema).min(1),
  /** Optional gamification: XP per right answer, combo bonus, reactions (see rewards.ts). */
  rewards: questRewardsSchema.optional(),
});
export type QuestContent = z.infer<typeof questContentSchema>;

/** A Modul Latihan widget; "text" is markdown here, never HTML. */
export const moduleWidgetSchema = z.discriminatedUnion("type", [
  ...planWidgetSchema.options,
  z.strictObject({ type: z.literal("text"), md: z.string().min(1) }),
]);
export type ModuleWidget = z.infer<typeof moduleWidgetSchema>;

export const moduleContentSchema = z.strictObject({
  key: z.string().regex(QUESTION_ID),
  title: z.string().min(1),
  time: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  tagline: z.string().min(1),
  coba: z.array(moduleWidgetSchema),
  penjelasan: z.array(moduleWidgetSchema),
  latihan: z.array(moduleWidgetSchema).min(1),
});
export type ModuleContent = z.infer<typeof moduleContentSchema>;

/** The last section of the Modul Latihan page: a checklist to keep for the next flow. Markdown in intro/outro. */
export const practiceClosingSchema = z.strictObject({
  title: z.string().min(1),
  intro: z.string().optional(),
  checklist: z.array(z.string().min(1)).min(1),
  outro: z.string().optional(),
});
export type PracticeClosing = z.infer<typeof practiceClosingSchema>;

export const caseContentSchema = z.strictObject({
  key: z.string().regex(CASE_KEY, "kunci kasus hanya huruf kecil, angka, dan -"),
  title: z.string().min(1),
  /** The story participants read. */
  description: z.string().min(1),
  /** Who the user in the story is, e.g. "Rani, siswa SMK". */
  persona: z.string().optional(),
  userGoal: z.string().optional(),
  /** Markdown under the heading of the participant's quest list (/brief). */
  brief: z.string().optional(),
  nodes: z.array(libraryNodeSchema).min(1),
  quests: z.array(questContentSchema).min(1),
  modules: z.array(moduleContentSchema).default([]),
  /** Closes the Modul Latihan page; left out, the page ends after its last module. */
  practiceClosing: practiceClosingSchema.optional(),
});
export type CaseContent = z.infer<typeof caseContentSchema>;

const duplicates = <T,>(xs: T[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

/**
 * Checks a Modul Latihan fixer against this case's node library with the
 * shared rubric engine, so a case with its own nodes is validated correctly.
 */
function findFixerProblems(w: FixerWidget, where: string, library: Map<string, CaseNode>): string[] {
  const p: string[] = [];
  const available = new Set([...w.initial, ...(w.extra ?? [])]);
  const allEdges = [...available, ...w.solution];
  const endpoints = allEdges.filter((e) => EDGE_PATTERN.test(e)).flatMap((e) => e.split(":")[0].split(">"));
  const unknown = [...new Set([...w.nodes, w.start, ...endpoints])].filter((k) => !library.has(k));
  if (unknown.length) p.push(`${where}: node tidak ada di kamus kasus: ${unknown.join(", ")}`);
  if (!w.nodes.includes(w.start)) p.push(`${where}: start "${w.start}" tidak ada di daftar node`);
  const unknownRules = w.rules.filter((r) => !isKnownRule(r));
  if (unknownRules.length) p.push(`${where}: aturan tidak dikenal: ${unknownRules.join(", ")}`);
  const ruleNodes = w.rules.filter(isKnownRule).flatMap((r) => (r.startsWith("not:") ? [] : r.split(":").slice(1)));
  const offCanvas = [...new Set(ruleNodes)].filter((k) => !w.nodes.includes(k));
  if (offCanvas.length) p.push(`${where}: aturan memakai node yang tidak ada di daftar node latihan: ${offCanvas.join(", ")}`);
  const twice = duplicates([...w.initial, ...(w.extra ?? [])]);
  if (twice.length) p.push(`${where}: sambungan terduplikasi: ${twice.join(", ")}`);
  const unreachable = w.solution.filter((e) => !available.has(e));
  if (unreachable.length) p.push(`${where}: contoh jawaban memakai sambungan yang tidak bisa dinyalakan: ${unreachable.join(", ")}`);
  if (unknown.length || unknownRules.length || offCanvas.length) return p;

  const graphOf = (on: string[]): RubricGraph => {
    const edges = on.map((s) => {
      const [pair, k = ""] = s.split(":");
      const [from, to] = pair.split(">");
      const kind = k === "Y" ? "YES" : k === "N" ? "NO" : k === "R" ? "RECOVERY" : "DEFAULT";
      return { from, to, kind: kind as (typeof EDGE_KINDS)[number] };
    });
    const ids = [...new Set([...w.nodes, ...edges.flatMap((e) => [e.from, e.to])])];
    return { nodes: ids.map((id) => ({ id, key: id, type: library.get(id)?.nodeType.toLowerCase() })), edges };
  };
  const passes = (on: string[]) => w.rules.every((r) => evaluateCondition(practiceRuleCondition(r, w.start), graphOf(on)));
  if (!passes(w.solution)) p.push(`${where}: contoh jawaban belum memenuhi semua aturan`);
  if (passes(w.initial)) p.push(`${where}: flow awal sudah memenuhi semua aturan, jadi tidak ada yang perlu diperbaiki`);
  return p;
}

/** A Modul Latihan widget's problems against the case's node library: fixers and diagrams must use its nodes, and every answer key must point at a real option. */
function findWidgetProblems(w: ModuleWidget | PlanWidget, where: string, library: Map<string, CaseNode>): string[] {
  const p: string[] = [];
  switch (w.type) {
    case "text":
      if (looksLikeHtml(w.md)) p.push(`${where}: teks memakai tag HTML; gunakan markdown`);
      break;
    case "fixer":
      p.push(...findFixerProblems(w, where, library));
      break;
    case "flows": {
      const keys = w.items.flatMap((it) => [it.flow.start, ...(it.flow.nodes ?? []), ...it.flow.edges.flatMap((e) => e.split(":")[0].split(">"))]);
      const unknown = [...new Set(keys)].filter((k) => !library.has(k));
      if (unknown.length) p.push(`${where}: node tidak ada di kamus kasus: ${unknown.join(", ")}`);
      break;
    }
    case "mcq":
      if (!w.q.trim()) p.push(`${where}: pertanyaan belum diisi`);
      if (!w.options.some((o) => o.ok)) p.push(`${where}: tidak ada opsi yang benar`);
      if (w.options.some((o) => !o.t.trim())) p.push(`${where}: ada opsi yang masih kosong`);
      break;
    case "poll":
    case "write":
    case "spot":
      if (!w.q.trim()) p.push(`${where}: pertanyaan belum diisi`);
      break;
    case "rule":
      if (!w.text.trim()) p.push(`${where}: teks aturan belum diisi`);
      break;
    case "goalpick":
      w.scenarios.forEach((s, i) => {
        if (!s.text.trim()) p.push(`${where}: skenario ${i + 1} belum diisi`);
        if (s.goal >= s.items.length) p.push(`${where}: skenario ${i + 1} menunjuk jawaban di luar daftar`);
      });
      break;
    case "decisions":
      w.items.forEach((it, i) => {
        if (!it.q.trim()) p.push(`${where}: keputusan ${i + 1} belum punya pertanyaan`);
        if (![...it.ya, ...it.tidak].every((o) => it.options.includes(o))) p.push(`${where}: keputusan ${i + 1} punya jawaban yang tidak ada di pilihan`);
      });
      break;
    case "planner":
      w.rows.forEach((r, i) => {
        if (!r.problem.trim()) p.push(`${where}: baris ${i + 1} belum punya masalah`);
        if (!r.check.every((o) => w.checkOptions.includes(o)) || !r.go.every((o) => w.goOptions.includes(o)))
          p.push(`${where}: baris ${i + 1} punya jawaban yang tidak ada di pilihan`);
      });
      break;
  }
  return p;
}

/** For a participant's "latihan utama" — same checks as a module widget, against the case the plan is for. */
export function findPlanWidgetProblems(w: PlanWidget, where: string, c: CaseContent): string[] {
  return findWidgetProblems(w, where, new Map(c.nodes.map((n) => [n.key, n])));
}

function findModuleProblems(m: ModuleContent, library: Map<string, CaseNode>): string[] {
  const p: string[] = [];
  for (const stage of ["coba", "penjelasan", "latihan"] as const) {
    m[stage].forEach((w, i) => {
      const where = `modul ${m.key}, ${stage} ${i + 1}`;
      p.push(...findWidgetProblems(w, where, library));
      if (stage === "penjelasan" && w.type === "write") p.push(`${where}: soal tulisan di Penjelasan tidak akan tersimpan`);
    });
  }
  return p;
}

/** Everything that can be wrong with a case beyond its schema. An empty list means it's ready to publish. */
export function findCaseProblems(c: CaseContent): string[] {
  const p: string[] = [];
  const library = new Map(c.nodes.map((n) => [n.key, n]));
  const libraryKeys = new Set(library.keys());
  const nodeTypes = new Map(c.nodes.map((n) => [n.key, n.nodeType as string]));

  if (c.brief && looksLikeHtml(c.brief)) p.push("brief memakai tag HTML; gunakan markdown");
  for (const k of duplicates(c.nodes.map((n) => n.key))) p.push(`kunci node "${k}" terduplikasi`);
  for (const l of duplicates(c.nodes.map((n) => n.label))) p.push(`label node "${l}" terduplikasi (label harus unik karena flow peserta disimpan per label)`);

  const orders = c.quests.map((q) => q.order).sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i + 1)) p.push(`urutan quest harus 1 sampai ${c.quests.length} tanpa lompatan (sekarang: ${orders.join(", ")})`);

  for (const q of c.quests) {
    const where = `quest ${q.order}`;
    if (q.intro && looksLikeHtml(q.intro)) p.push(`${where}: intro memakai tag HTML; gunakan markdown`);
    for (const id of duplicates(q.questions.map((x) => x.id))) p.push(`${where}: id soal "${id}" terduplikasi`);
    if (q.questions.filter((x) => x.type === "flow").length > 1) p.push(`${where}: maksimal satu soal flow per quest`);
    if (q.rewards && q.questions.every((x) => x.type === "flow")) p.push(`${where}: XP per soal dan combo hanya berlaku untuk soal quiz; quest ini hanya punya soal flow`);
    q.questions.forEach((x) => p.push(...findQuestionProblems(x, `${where}, soal "${x.id}"`, libraryKeys, nodeTypes)));
  }

  for (const k of duplicates(c.modules.map((m) => m.key))) p.push(`kunci modul "${k}" terduplikasi`);
  c.modules.forEach((m) => p.push(...findModuleProblems(m, library)));
  const closing = c.practiceClosing;
  if (closing && [closing.intro, closing.outro, ...closing.checklist].some((t) => t && looksLikeHtml(t))) p.push("penutup modul latihan memakai tag HTML; gunakan markdown");
  return p;
}

/** Parses and checks a case in one go — for importers that should refuse anything not ready. */
export function parseCase(raw: unknown): { ok: true; content: CaseContent } | { ok: false; problems: string[] } {
  const parsed = caseContentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: [z.prettifyError(parsed.error)] };
  const problems = findCaseProblems(parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, content: parsed.data };
}
