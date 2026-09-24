import type { CaseContent, CaseNode, ModuleContent, ModuleWidget, QuestContent } from "@/lib/content/case";
import { CASE_KEY } from "@/lib/content/case";
import { newQuestion } from "@/lib/content/builderDefaults";
import type { Condition, FlowRubric } from "@/lib/content/rubric";
import { RUBRIC_CATEGORIES, referencedNodeKeys, rubricConditions } from "@/lib/content/rubric";
import { EDGE_PATTERN } from "@/lib/practice/flowRules";
import type { PlanWidget } from "@/lib/practice/schema";

/**
 * Pure edits over a whole case, for the builder's case, quest and module
 * editors (Fase 4): starting a case, managing its quests and modules, and
 * keeping node keys consistent when the library changes. Everything returns a
 * new CaseContent — the builder holds the case in memory and saves it as a draft.
 */

// ── Quests ───────────────────────────────────────────────────────────────

/** Quest order is always 1..n in list order; every quest edit goes through this. */
export function renumberQuests(quests: QuestContent[]): QuestContent[] {
  return quests.map((q, i) => (q.order === i + 1 ? q : { ...q, order: i + 1 }));
}

const sortedQuests = (c: CaseContent) => [...c.quests].sort((a, b) => a.order - b.order);

export function newQuest(c: CaseContent): QuestContent {
  const order = c.quests.length + 1;
  return {
    order,
    title: `Quest ${order}`,
    objective: "",
    xp: 100,
    timeLimitMinutes: null,
    checkMode: "end",
    questions: [newQuestion("singlechoice", [], c.nodes)],
  };
}

export function addQuest(c: CaseContent): CaseContent {
  return { ...c, quests: renumberQuests([...sortedQuests(c), newQuest(c)]) };
}

/** Puts a copy right after the original; question ids stay (they're unique per quest). */
export function duplicateQuest(c: CaseContent, order: number): CaseContent {
  const qs = sortedQuests(c);
  const i = qs.findIndex((q) => q.order === order);
  if (i < 0) return c;
  const copy = { ...structuredClone(qs[i]), title: `${qs[i].title} (salinan)` };
  return { ...c, quests: renumberQuests([...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)]) };
}

export function removeQuest(c: CaseContent, order: number): CaseContent {
  if (c.quests.length <= 1) return c;
  return { ...c, quests: renumberQuests(sortedQuests(c).filter((q) => q.order !== order)) };
}

/** Moves the quest at `from` (an order) to position `to` (an order) and renumbers. */
export function moveQuest(c: CaseContent, from: number, to: number): CaseContent {
  const qs = sortedQuests(c);
  const i = qs.findIndex((q) => q.order === from);
  const j = to - 1;
  if (i < 0 || j < 0 || j >= qs.length || i === j) return c;
  const next = [...qs];
  const [q] = next.splice(i, 1);
  next.splice(j, 0, q);
  return { ...c, quests: renumberQuests(next) };
}

/** Adds an imported quest at the end, or in place of the quest with `replaceOrder`. */
export function insertQuest(c: CaseContent, quest: QuestContent, replaceOrder?: number): CaseContent {
  const qs = sortedQuests(c);
  if (replaceOrder !== undefined && qs.some((q) => q.order === replaceOrder)) {
    return { ...c, quests: renumberQuests(qs.map((q) => (q.order === replaceOrder ? { ...quest, order: replaceOrder } : q))) };
  }
  return { ...c, quests: renumberQuests([...qs, quest]) };
}

// ── A new case ───────────────────────────────────────────────────────────

/** A small starter library: enough for a first flow question; the author renames or replaces it. */
export const STARTER_NODES: CaseNode[] = [
  { key: "mulai", label: "Halaman Awal", nodeType: "START", icon: "🏠" },
  { key: "formulir", label: "Isi Formulir", nodeType: "SCREEN", icon: "📝" },
  { key: "cek", label: "Data Valid?", nodeType: "DECISION", icon: "❓" },
  { key: "berhasil", label: "Berhasil", nodeType: "OUTCOME", icon: "✅" },
  { key: "gagal", label: "Gagal", nodeType: "ERROR", icon: "⚠️" },
];

/** A draft to start a case from scratch: one quest with one (still empty) question. */
export function blankCase(key: string, title: string): CaseContent {
  const base: CaseContent = { key, title, description: "", nodes: STARTER_NODES.map((n) => ({ ...n })), quests: [], modules: [] };
  return { ...base, quests: [{ ...newQuest(base), title: "Quest 1" }] };
}

/** The same content under a new key and title, e.g. to start a variant of an existing case. */
export function duplicateCaseContent(c: CaseContent, key: string, title: string): CaseContent {
  return { ...structuredClone(c), key, title };
}

export function isValidCaseKey(key: string) {
  return CASE_KEY.test(key) && key.length <= 60;
}

/** Turns a title into a suggested case key, e.g. "Pendaftaran Klub" → "pendaftaran-klub". */
export function slugifyCaseKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── Node library ─────────────────────────────────────────────────────────

/** Fixer and diagram edges are written "a>b", so only these keys can be used there. */
export const PRACTICE_NODE_KEY = /^[a-z0-9]+$/;

const edgeEnds = (edge: string) => edge.split(":")[0].split(">");

function widgetNodeKeys(w: ModuleWidget | PlanWidget): string[] {
  if (w.type === "fixer") {
    const rules = w.rules.flatMap((r) => {
      const [name, a, b] = r.split(":");
      if (name === "not") return edgeEnds(r.slice(4));
      return name === "connected" ? [] : [a, b].filter(Boolean);
    });
    return [...w.nodes, w.start, ...[...w.initial, ...(w.extra ?? []), ...w.solution].flatMap(edgeEnds), ...rules];
  }
  if (w.type === "flows") return w.items.flatMap((it) => [it.flow.start, ...(it.flow.nodes ?? []), ...it.flow.edges.flatMap(edgeEnds)]);
  return [];
}

/** Library keys a quest's flow questions use: palettes, answer keys and rubrics. */
export function questNodeKeys(q: QuestContent): string[] {
  const keys = q.questions.flatMap((x) =>
    x.type === "flow" ? [...x.palette, ...(x.answerKey?.nodes.map((n) => n.key) ?? []), ...rubricConditions(x.rubric).flatMap(referencedNodeKeys)] : []
  );
  return [...new Set(keys)];
}

/** Library keys a module's fixers and diagrams use. */
export function moduleNodeKeys(m: ModuleContent): string[] {
  return [...new Set([...m.coba, ...m.penjelasan, ...m.latihan].flatMap(widgetNodeKeys))];
}

/** The library entries for `keys`, to ship alongside an exported quest or module. */
export function libraryNodesFor(c: CaseContent, keys: string[]): CaseNode[] {
  return c.nodes.filter((n) => keys.includes(n.key));
}

/**
 * Adds nodes that came with an imported quest or module to the library.
 * A node is added only when neither its key nor its label is taken; the rest
 * are reported so the author can resolve them by hand.
 */
export function mergeLibraryNodes(c: CaseContent, incoming: CaseNode[]): { content: CaseContent; added: CaseNode[]; clashes: CaseNode[] } {
  const added: CaseNode[] = [];
  const clashes: CaseNode[] = [];
  for (const n of incoming) {
    const sameKey = c.nodes.find((x) => x.key === n.key);
    if (sameKey && sameKey.label === n.label) continue;
    if (sameKey || [...c.nodes, ...added].some((x) => x.label === n.label)) clashes.push(n);
    else added.push(n);
  }
  return { content: added.length ? { ...c, nodes: [...c.nodes, ...added] } : c, added, clashes };
}

/** Where a library node is used, in words an author can find it by — empty means it can be removed safely. */
export function nodeKeyUsage(c: CaseContent, key: string): string[] {
  const uses: string[] = [];
  for (const q of sortedQuests(c)) {
    for (const x of q.questions) {
      if (x.type !== "flow") continue;
      if (x.palette.includes(key)) uses.push(`Quest ${q.order} · palet soal flow`);
      if (x.answerKey?.nodes.some((n) => n.key === key)) uses.push(`Quest ${q.order} · kunci jawaban`);
      if (rubricConditions(x.rubric).some((cond) => referencedNodeKeys(cond).includes(key))) uses.push(`Quest ${q.order} · rubrik`);
    }
  }
  for (const m of c.modules) {
    for (const stage of ["coba", "penjelasan", "latihan"] as const) {
      m[stage].forEach((w, i) => {
        if (widgetNodeKeys(w).includes(key)) uses.push(`Modul ${m.key} · ${stage} ${i + 1}`);
      });
    }
  }
  return uses;
}

function renameInCondition(c: Condition, from: string, to: string): Condition {
  const k = (x: string) => (x === from ? to : x);
  if ("has" in c) return { has: k(c.has) };
  if ("reach" in c) return { reach: { ...c.reach, from: k(c.reach.from), to: k(c.reach.to), ...(c.reach.avoid ? { avoid: k(c.reach.avoid) } : {}) } };
  if ("branch" in c) return { branch: { ...c.branch, from: k(c.branch.from), reaches: k(c.branch.reaches) } };
  if ("edge" in c) return { edge: { ...c.edge, ...(c.edge.from ? { from: k(c.edge.from) } : {}), ...(c.edge.to ? { to: k(c.edge.to) } : {}) } };
  if ("terminal" in c) return { terminal: k(c.terminal) };
  if ("twoSides" in c) return { twoSides: k(c.twoSides) };
  if ("failBranch" in c) return { failBranch: k(c.failBranch) };
  if ("all" in c) return { all: c.all.map((x) => renameInCondition(x, from, to)) };
  if ("any" in c) return { any: c.any.map((x) => renameInCondition(x, from, to)) };
  if ("not" in c) return { not: renameInCondition(c.not, from, to) };
  if ("atLeast" in c) return { atLeast: c.atLeast, of: c.of.map((x) => renameInCondition(x, from, to)) };
  return c;
}

function renameInRubric(r: FlowRubric, from: string, to: string): FlowRubric {
  const cond = (c: Condition) => renameInCondition(c, from, to);
  const scores = { ...r.scores };
  for (const cat of RUBRIC_CATEGORIES) {
    const rule = scores[cat];
    if (rule && "cases" in rule) scores[cat] = { ...rule, cases: rule.cases.map((x) => ({ ...x, when: cond(x.when) })) };
  }
  return {
    ...r,
    checks: Object.fromEntries(Object.entries(r.checks).map(([name, c]) => [name, { ...c, when: cond(c.when) }])),
    scores,
    tiers: r.tiers.map((t) => ({ ...t, when: cond(t.when) })),
    notes: r.notes.map((n) => ({ ...n, when: cond(n.when) })),
  };
}

function renameInEdge(edge: string, from: string, to: string): string {
  const [pair, kind] = edge.split(":");
  const [a, b] = pair.split(">");
  const k = (x: string) => (x === from ? to : x);
  return `${k(a)}>${k(b)}${kind ? `:${kind}` : ""}`;
}

function renameInRule(rule: string, from: string, to: string): string {
  if (rule.startsWith("not:")) return `not:${renameInEdge(rule.slice(4), from, to)}`;
  return rule
    .split(":")
    .map((part, i) => (i > 0 && part === from ? to : part))
    .join(":");
}

/** Renames a node key inside one Modul Latihan widget (fixers and diagrams are the ones that name nodes). */
export function renameInWidget<W extends ModuleWidget | PlanWidget>(w: W, from: string, to: string): W {
  const k = (x: string) => (x === from ? to : x);
  const e = (x: string) => renameInEdge(x, from, to);
  if (w.type === "fixer") {
    return {
      ...w,
      nodes: w.nodes.map(k),
      start: k(w.start),
      initial: w.initial.map(e),
      ...(w.extra ? { extra: w.extra.map(e) } : {}),
      solution: w.solution.map(e),
      rules: w.rules.map((r) => renameInRule(r, from, to)),
    };
  }
  if (w.type === "flows") {
    return {
      ...w,
      items: w.items.map((it) => ({ ...it, flow: { ...it.flow, start: k(it.flow.start), ...(it.flow.nodes ? { nodes: it.flow.nodes.map(k) } : {}), edges: it.flow.edges.map(e) } })),
    };
  }
  return w;
}

/**
 * Renames a library key everywhere this case uses it: flow palettes, answer
 * keys, rubrics, and module fixers and diagrams. (Participant plans live
 * outside the case and keep the old key; the plan editor flags them.)
 */
export function renameNodeKey(c: CaseContent, from: string, to: string): CaseContent {
  if (from === to) return c;
  const k = (x: string) => (x === from ? to : x);
  const renameModule = (m: ModuleContent): ModuleContent => ({
    ...m,
    coba: m.coba.map((w) => renameInWidget(w, from, to)),
    penjelasan: m.penjelasan.map((w) => renameInWidget(w, from, to)),
    latihan: m.latihan.map((w) => renameInWidget(w, from, to)),
  });
  return {
    ...c,
    nodes: c.nodes.map((n) => (n.key === from ? { ...n, key: to } : n)),
    quests: c.quests.map((q) => ({
      ...q,
      questions: q.questions.map((x) =>
        x.type === "flow"
          ? {
              ...x,
              palette: x.palette.map(k),
              rubric: renameInRubric(x.rubric, from, to),
              ...(x.answerKey ? { answerKey: { ...x.answerKey, nodes: x.answerKey.nodes.map((n) => ({ ...n, key: k(n.key) })) } } : {}),
            }
          : x
      ),
    })),
    modules: c.modules.map(renameModule),
  };
}

/** The smallest "node-N" key the library doesn't have yet. */
export function nextNodeKey(nodes: CaseNode[]): string {
  const used = new Set(nodes.map((n) => n.key));
  for (let n = nodes.length + 1; ; n++) if (!used.has(`node${n}`)) return `node${n}`;
}

// ── Modules ──────────────────────────────────────────────────────────────

export const MODULE_COLORS = ["#0f9d8a", "#6d5bd0", "#c9821b", "#d4533e", "#2563eb", "#0e7490"];

/** Existing cases use A, B, C…; continue that, falling back to modul-N past Z. */
export function nextModuleKey(modules: ModuleContent[]): string {
  const used = new Set(modules.map((m) => m.key));
  for (let i = 0; i < 26; i++) {
    const k = String.fromCharCode(65 + i);
    if (!used.has(k)) return k;
  }
  for (let n = 1; ; n++) if (!used.has(`modul-${n}`)) return `modul-${n}`;
}

export function newModule(c: CaseContent): ModuleContent {
  return {
    key: nextModuleKey(c.modules),
    title: "Modul baru",
    time: "10 menit",
    color: MODULE_COLORS[c.modules.length % MODULE_COLORS.length],
    tagline: "Satu kalimat tentang apa yang dilatih modul ini.",
    coba: [newWidget("mcq", c.nodes)],
    penjelasan: [newWidget("text", c.nodes)],
    latihan: [newWidget("mcq", c.nodes)],
  };
}

export function duplicateModule(c: CaseContent, key: string): CaseContent {
  const i = c.modules.findIndex((m) => m.key === key);
  if (i < 0) return c;
  const copy = { ...structuredClone(c.modules[i]), key: nextModuleKey(c.modules), title: `${c.modules[i].title} (salinan)` };
  return { ...c, modules: [...c.modules.slice(0, i + 1), copy, ...c.modules.slice(i + 1)] };
}

/** Adds an imported module; a key the case already has is replaced in place when `replace`, else given a fresh key. */
export function insertModule(c: CaseContent, m: ModuleContent, replace: boolean): CaseContent {
  const i = c.modules.findIndex((x) => x.key === m.key);
  if (i >= 0 && replace) return { ...c, modules: c.modules.map((x, j) => (j === i ? m : x)) };
  const key = i >= 0 ? nextModuleKey(c.modules) : m.key;
  return { ...c, modules: [...c.modules, { ...m, key }] };
}

// ── Modul Latihan widgets ────────────────────────────────────────────────

export type WidgetType = ModuleWidget["type"];

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  text: "Teks penjelasan",
  rule: "Kotak aturan",
  flows: "Diagram flow",
  mcq: "Pilihan ganda",
  poll: "Polling",
  write: "Jawaban tertulis",
  goalpick: "Pilih tujuan",
  decisions: "Kartu keputusan",
  spot: "Cari yang keliru",
  selfcheck: "Cek diri",
  planner: "Perencana cabang",
  fixer: "Perbaiki flow",
};

export const WIDGET_TYPE_ICONS: Record<WidgetType, string> = {
  text: "¶",
  rule: "❗",
  flows: "⤳",
  mcq: "◉",
  poll: "▤",
  write: "✎",
  goalpick: "◎",
  decisions: "⎇",
  spot: "⚑",
  selfcheck: "☑",
  planner: "▦",
  fixer: "🔧",
};

/** Widget types a participant's "latihan utama" may use (no markdown text there). */
export const PLAN_WIDGET_TYPES = (Object.keys(WIDGET_TYPE_LABELS) as WidgetType[]).filter((t): t is PlanWidget["type"] => t !== "text");

/** Up to `n` library keys a fixer or diagram can use, starting points for a new widget. */
function practiceKeys(nodes: CaseNode[], n: number): string[] {
  const keys = nodes.map((x) => x.key).filter((k) => PRACTICE_NODE_KEY.test(k));
  return keys.slice(0, n);
}

export function newWidget(type: "text", nodes: CaseNode[]): Extract<ModuleWidget, { type: "text" }>;
export function newWidget<T extends WidgetType>(type: T, nodes: CaseNode[]): Extract<ModuleWidget, { type: T }>;
export function newWidget(type: WidgetType, nodes: CaseNode[]): ModuleWidget {
  const [a = "a", b = "b", c = "c"] = practiceKeys(nodes, 3);
  switch (type) {
    case "text":
      return { type, md: "Tulis penjelasan di sini. **Tebal** dan *miring* boleh." };
    case "rule":
      return { type, text: "Aturan singkat yang perlu diingat." };
    case "flows":
      return { type, items: [{ title: "Contoh", flow: { start: a, edges: [`${a}>${b}`] } }] };
    case "mcq":
      return {
        type,
        q: "",
        options: [
          { t: "Opsi 1", ok: true, fb: "Tepat." },
          { t: "Opsi 2", fb: "Belum tepat." },
        ],
      };
    case "poll":
      return { type, q: "", options: ["Opsi 1", "Opsi 2"], note: "Catatan yang muncul setelah memilih." };
    case "write":
      return { type, q: "", placeholder: "Tulis jawabanmu di sini…" };
    case "goalpick":
      return { type, scenarios: [{ text: "", items: ["Tujuan 1", "Tujuan 2"], goal: 0, why: "" }] };
    case "decisions":
      return { type, items: [{ q: "", options: ["Pilihan 1", "Pilihan 2"], ya: ["Pilihan 1"], tidak: ["Pilihan 2"], note: "" }] };
    case "spot":
      return {
        type,
        q: "",
        statements: [
          { t: "Pernyataan yang keliru", bad: true },
          { t: "Pernyataan yang benar", bad: false },
        ],
        note: "",
      };
    case "selfcheck":
      return { type, items: ["Hal pertama yang perlu dicek"] };
    case "planner":
      return {
        type,
        checkOptions: ["Cek 1", "Cek 2"],
        goOptions: ["Lanjut ke 1", "Lanjut ke 2"],
        rows: [{ problem: "", check: ["Cek 1"], go: ["Lanjut ke 1"], why: "" }],
      };
    case "fixer":
      return { type, nodes: [a, b, c], start: a, initial: [`${a}>${b}`], extra: [`${b}>${c}`], rules: [`reach:${c}`], solution: [`${a}>${b}`, `${b}>${c}`] };
  }
}

export const isPracticeEdge = (e: string) => EDGE_PATTERN.test(e);
