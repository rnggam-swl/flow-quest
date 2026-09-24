import { findPlanWidgetProblems, type CaseContent, type ModuleContent, type ModuleWidget } from "@/lib/content/case";
import { practicePlanContentSchema, type PlanWidget, type PracticePlanContent } from "@/lib/practice/schema";

/**
 * Turns a PracticePlan row into what the Modul Latihan page renders, against
 * the modules of the case the participant's session runs, and sanity-checks
 * mentor-authored plans before they're imported.
 */

export const MAIN_PART = "main";

/** Shown to a participant who finished the quests but has no personal plan yet. */
export const DEFAULT_PLAN_INTRO =
  "Semua modul inti ada di sini. Kerjakan berurutan dari modul pertama, atau langsung buka modul yang paling ingin kamu perkuat.";

export interface ResolvedPlan {
  /** Hero heading, e.g. "Halo, Mirra" — or the page title when there's no one to greet. */
  heading: string;
  /** Shown under the sidebar brand. */
  subtitle: string;
  content: PracticePlanContent;
  personal: boolean;
}

/** The mentor's "every module on one page" view. */
export function allModulesView(modules: ModuleContent[]): ResolvedPlan {
  return {
    heading: "Semua Modul Latihan Flow",
    subtitle: "Semua Modul Latihan Flow",
    content: {
      first: null,
      strengths: [],
      intro: "Semua modul inti dalam satu halaman. Cocok untuk mentor yang ingin meninjau materi, atau untuk peserta batch berikutnya.",
      modules: modules.map((m) => m.key),
      main: null,
    },
    personal: false,
  };
}

/**
 * Parses stored plan content, falling back to every module of the case when
 * there isn't a (valid) personal plan, so a malformed row never breaks the
 * page. Module keys the case doesn't have are dropped.
 */
export function resolvePlan(raw: unknown, displayName: string, modules: ModuleContent[]): ResolvedPlan {
  const parsed = raw == null ? null : practicePlanContentSchema.safeParse(raw);
  if (parsed && !parsed.success) {
    console.error("Ignoring invalid PracticePlan.content", parsed.error.issues);
  }
  const known = new Set(modules.map((m) => m.key));
  const content: PracticePlanContent = parsed?.success
    ? { ...parsed.data, modules: parsed.data.modules.filter((k) => known.has(k)) }
    : { first: null, strengths: [], intro: DEFAULT_PLAN_INTRO, modules: [...known], main: null };
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

export const ANSWER_KEY_PATTERN = /^(?:(?!main\.)[a-z0-9][a-z0-9_-]*\.(?:coba|latihan)|main\.main)\.\d{1,2}$/i;

/** Looks up the write widget an answer key points at, so the mentor view can show the question next to the answer. */
export function widgetForAnswerKey(content: PracticePlanContent, key: string, modules: ModuleContent[]): ModuleWidget | PlanWidget | null {
  const [part, stage, idx] = key.split(".");
  const index = Number(idx);
  if (part === MAIN_PART) return content.main?.widgets[index] ?? null;
  const mod = modules.find((m) => m.key === part);
  if (!mod || (stage !== "coba" && stage !== "latihan")) return null;
  return mod[stage][index] ?? null;
}

export function answeredQuestion(content: PracticePlanContent, key: string, modules: ModuleContent[]): string {
  const widget = widgetForAnswerKey(content, key, modules);
  return widget?.type === "write" ? widget.q : key;
}

/**
 * Everything that can be wrong with a plan for a given case beyond its
 * schema: modules the case doesn't have, and main-exercise widgets that don't
 * hold up (unknown nodes, a fixer whose example solution breaks its own rules).
 */
export function findPlanProblems(content: PracticePlanContent, caseContent: CaseContent): string[] {
  const problems: string[] = [];
  const known = new Set(caseContent.modules.map((m) => m.key));
  const unknown = content.modules.filter((k) => !known.has(k));
  if (unknown.length) problems.push(`modul tidak ada di kasus "${caseContent.title}": ${unknown.join(", ")}`);
  if (new Set(content.modules).size !== content.modules.length) problems.push("daftar modul punya duplikat");
  if (content.modules.length === 0 && !content.main) problems.push("rencana tidak punya modul maupun latihan utama");
  content.main?.widgets.forEach((w, i) => problems.push(...findPlanWidgetProblems(w, `latihan utama, widget ${i + 1}`, caseContent)));
  return problems;
}
