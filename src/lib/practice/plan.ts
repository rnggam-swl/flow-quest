import { MODULES, NODES } from "@/lib/practice/content";
import { EDGE_PATTERN, checkRules, isKnownRule } from "@/lib/practice/flowRules";
import {
  MODULE_KEYS,
  practicePlanContentSchema,
  type FlowSpec,
  type ModuleKey,
  type PracticePlanContent,
  type Widget,
} from "@/lib/practice/schema";

/**
 * Turns a PracticePlan row into what the Modul Latihan page renders, and
 * sanity-checks mentor-authored plans before they're imported.
 */

export const MAIN_PART = "main";

/** Shown to a participant who finished the quests but has no personal plan yet. */
export const DEFAULT_PLAN_INTRO =
  "Keenam modul inti ada di sini. Kerjakan berurutan dari modul pertama, atau langsung buka modul yang paling ingin kamu perkuat.";

/** The mentor's "all six modules on one page" view. */
export const ALL_MODULES_PLAN: PracticePlanContent = {
  first: null,
  strengths: [],
  intro:
    "Keenam modul inti dalam satu halaman. Cocok untuk mentor yang ingin meninjau materi, atau untuk peserta batch berikutnya.",
  modules: [...MODULE_KEYS],
  main: null,
};

export interface ResolvedPlan {
  /** Hero heading, e.g. "Halo, Mirra" — or the page title when there's no one to greet. */
  heading: string;
  /** Shown under the sidebar brand. */
  subtitle: string;
  content: PracticePlanContent;
  personal: boolean;
}

export const ALL_MODULES_VIEW: ResolvedPlan = {
  heading: "Semua Modul Latihan Flow",
  subtitle: "Semua Modul Latihan Flow",
  content: ALL_MODULES_PLAN,
  personal: false,
};

/**
 * Parses stored plan content, falling back to all six modules when there
 * isn't a (valid) personal plan so a malformed row never breaks the page.
 */
export function resolvePlan(raw: unknown, displayName: string): ResolvedPlan {
  const parsed = raw == null ? null : practicePlanContentSchema.safeParse(raw);
  if (parsed && !parsed.success) {
    console.error("Ignoring invalid PracticePlan.content", parsed.error.issues);
  }
  const content = parsed?.success ? parsed.data : { ...ALL_MODULES_PLAN, intro: DEFAULT_PLAN_INTRO };
  const first = content.first || displayName.trim().split(/\s+/)[0];
  return { heading: `Halo, ${first}`, subtitle: displayName, content, personal: Boolean(parsed?.success) };
}

/** Progress parts in page order: each module key, then "main" if the plan has a main exercise. */
export function planParts(content: PracticePlanContent): string[] {
  return [...content.modules, ...(content.main ? [MAIN_PART] : [])];
}

export type WidgetStage = "coba" | "latihan" | "main";

/** Stable id for a write widget's saved answer, e.g. "E.latihan.1" or "main.main.0". */
export function answerKey(part: string, stage: WidgetStage, index: number): string {
  return `${part}.${stage}.${index}`;
}

export const ANSWER_KEY_PATTERN = /^(?:[A-F]\.(?:coba|latihan)|main\.main)\.\d{1,2}$/;

/** Looks up the write widget an answer key points at, so the mentor view can show the question next to the answer. */
export function widgetForAnswerKey(content: PracticePlanContent, key: string): Widget | null {
  const [part, stage, idx] = key.split(".");
  const index = Number(idx);
  if (part === MAIN_PART) return content.main?.widgets[index] ?? null;
  const mod = MODULES[part as ModuleKey];
  if (!mod || (stage !== "coba" && stage !== "latihan")) return null;
  return mod[stage][index] ?? null;
}

export function answeredQuestion(content: PracticePlanContent, key: string): string {
  const widget = widgetForAnswerKey(content, key);
  return widget?.type === "write" ? widget.q : key;
}

/**
 * Everything that can be wrong with a plan yet still pass the zod schema:
 * unknown nodes or rules, answer options that don't exist, and — most
 * importantly — a fixer whose model solution doesn't satisfy its own rules,
 * or can't be reached with the switches the participant is given.
 */
export function findWidgetProblems(widget: Widget, where: string): string[] {
  const problems: string[] = [];
  const knownNode = (id: string, ctx: string) => {
    if (!NODES[id]) problems.push(`${where}: node "${id}" tidak ada di kamus node (${ctx})`);
  };
  const checkFlow = (flow: FlowSpec, ctx: string) => {
    flow.nodes?.forEach((n) => knownNode(n, ctx));
    knownNode(flow.start, `${ctx} start`);
    for (const e of flow.edges) {
      if (!EDGE_PATTERN.test(e)) problems.push(`${where}: edge "${e}" tidak valid (${ctx})`);
      else e.split(":")[0].split(">").forEach((n) => knownNode(n, `${ctx} edge ${e}`));
    }
  };

  switch (widget.type) {
    case "flows":
      widget.items.forEach((it, i) => checkFlow(it.flow, `flow ${i + 1}`));
      break;
    case "mcq":
      if (!widget.options.some((o) => o.ok)) problems.push(`${where}: tidak ada opsi yang benar`);
      break;
    case "goalpick":
      widget.scenarios.forEach((s, i) => {
        if (s.goal >= s.items.length) problems.push(`${where}: skenario ${i + 1} menunjuk jawaban di luar daftar`);
      });
      break;
    case "decisions":
      widget.items.forEach((it, i) => {
        if (![...it.ya, ...it.tidak].every((o) => it.options.includes(o)))
          problems.push(`${where}: keputusan ${i + 1} punya jawaban yang tidak ada di pilihan`);
      });
      break;
    case "planner":
      widget.rows.forEach((r, i) => {
        if (!r.check.every((o) => widget.checkOptions.includes(o)) || !r.go.every((o) => widget.goOptions.includes(o)))
          problems.push(`${where}: baris ${i + 1} punya jawaban yang tidak ada di pilihan`);
      });
      break;
    case "fixer": {
      const available = new Set([...widget.initial, ...(widget.extra ?? [])]);
      checkFlow({ start: widget.start, nodes: widget.nodes, edges: [...available, ...widget.solution] }, "fixer");
      if (!widget.nodes.includes(widget.start)) problems.push(`${where}: start "${widget.start}" tidak ada di daftar node`);
      const unknownRules = widget.rules.filter((r) => !isKnownRule(r));
      if (unknownRules.length) problems.push(`${where}: aturan tidak dikenal: ${unknownRules.join(", ")}`);
      const unreachable = widget.solution.filter((e) => !available.has(e));
      if (unreachable.length) problems.push(`${where}: contoh jawaban memakai sambungan yang tidak bisa dinyalakan: ${unreachable.join(", ")}`);
      const failing = checkRules(widget.rules, widget.nodes, widget.solution, widget.start).filter((r) => !r.pass);
      if (failing.length) problems.push(`${where}: contoh jawaban belum memenuhi aturan: ${failing.map((r) => r.label).join("; ")}`);
      if (checkRules(widget.rules, widget.nodes, widget.initial, widget.start).every((r) => r.pass))
        problems.push(`${where}: flow awal sudah memenuhi semua aturan, jadi tidak ada yang perlu diperbaiki`);
      break;
    }
  }
  return problems;
}

export function findPlanProblems(content: PracticePlanContent): string[] {
  const problems: string[] = [];
  if (new Set(content.modules).size !== content.modules.length) problems.push("daftar modul punya duplikat");
  if (content.modules.length === 0 && !content.main) problems.push("rencana tidak punya modul maupun latihan utama");
  content.main?.widgets.forEach((w, i) => problems.push(...findWidgetProblems(w, `latihan utama, widget ${i + 1}`)));
  return problems;
}
