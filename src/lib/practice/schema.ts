import { z } from "zod";
import { EDGE_PATTERN } from "@/lib/practice/flowRules";

/**
 * Shapes of everything a Modul Latihan page is built from. The zod schemas
 * are the source of truth for the types, and double as the validator for
 * plans read back from PracticePlan.content or imported by
 * prisma/seed-practice-plans.ts.
 */

export const MODULE_KEYS = ["A", "B", "C", "D", "E", "F"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

const edge = z.string().regex(EDGE_PATTERN, 'Edge harus berformat "dari>ke" atau "dari>ke:Y|N|R"');

const flowSpec = z.object({
  start: z.string(),
  nodes: z.array(z.string()).optional(),
  edges: z.array(edge),
});
export type FlowSpec = z.infer<typeof flowSpec>;

const ruleWidget = z.object({ type: z.literal("rule"), text: z.string() });

const flowsWidget = z.object({
  type: z.literal("flows"),
  items: z.array(z.object({ title: z.string().optional(), flow: flowSpec })).min(1),
});

const mcqWidget = z.object({
  type: z.literal("mcq"),
  q: z.string(),
  options: z.array(z.object({ t: z.string(), ok: z.boolean().optional(), fb: z.string() })).min(2),
});

const pollWidget = z.object({
  type: z.literal("poll"),
  q: z.string(),
  options: z.array(z.string()).min(2),
  note: z.string(),
});

const writeWidget = z.object({
  type: z.literal("write"),
  q: z.string(),
  placeholder: z.string().optional(),
  note: z.string().optional(),
});

const goalpickWidget = z.object({
  type: z.literal("goalpick"),
  intro: z.string().optional(),
  scenarios: z
    .array(z.object({ text: z.string(), items: z.array(z.string()).min(2), goal: z.number().int().nonnegative(), why: z.string() }))
    .min(1),
});

const decisionsWidget = z.object({
  type: z.literal("decisions"),
  intro: z.string().optional(),
  items: z
    .array(
      z.object({
        q: z.string(),
        options: z.array(z.string()).min(2),
        ya: z.array(z.string()).min(1),
        tidak: z.array(z.string()).min(1),
        note: z.string(),
      })
    )
    .min(1),
});

const spotWidget = z.object({
  type: z.literal("spot"),
  q: z.string(),
  statements: z.array(z.object({ t: z.string(), bad: z.boolean() })).min(1),
  note: z.string(),
});

const selfcheckWidget = z.object({
  type: z.literal("selfcheck"),
  intro: z.string().optional(),
  items: z.array(z.string()).min(1),
});

const plannerWidget = z.object({
  type: z.literal("planner"),
  intro: z.string().optional(),
  checkOptions: z.array(z.string()).min(1),
  goOptions: z.array(z.string()).min(1),
  rows: z
    .array(z.object({ problem: z.string(), check: z.array(z.string()).min(1), go: z.array(z.string()).min(1), why: z.string() }))
    .min(1),
});

const fixerWidget = z.object({
  type: z.literal("fixer"),
  title: z.string().optional(),
  intro: z.string().optional(),
  nodes: z.array(z.string()).min(1),
  start: z.string(),
  initial: z.array(edge),
  extra: z.array(edge).optional(),
  rules: z.array(z.string()).min(1),
  solution: z.array(edge),
  afterNote: z.string().optional(),
});
export type FixerWidget = z.infer<typeof fixerWidget>;

/**
 * Every widget type a stored plan may use. Deliberately excludes "text":
 * that one renders raw HTML, so it's only allowed in the static module
 * content that ships with the code, never in data read from the database.
 */
export const planWidgetSchema = z.discriminatedUnion("type", [
  ruleWidget,
  flowsWidget,
  mcqWidget,
  pollWidget,
  writeWidget,
  goalpickWidget,
  decisionsWidget,
  spotWidget,
  selfcheckWidget,
  plannerWidget,
  fixerWidget,
]);
export type PlanWidget = z.infer<typeof planWidgetSchema>;

/** Trusted, code-authored prose. Only ever appears in content.ts. */
export interface TextWidget {
  type: "text";
  html: string;
}

export type Widget = PlanWidget | TextWidget;

export interface PracticeModule {
  title: string;
  time: string;
  color: string;
  tagline: string;
  coba: Widget[];
  penjelasan: Widget[];
  latihan: Widget[];
}

const mainExerciseSchema = z.object({
  title: z.string(),
  intro: z.string(),
  steps: z.array(z.string()).optional(),
  widgets: z.array(planWidgetSchema).min(1),
  extra: z.object({ title: z.string(), text: z.string() }).optional(),
});
export type MainExercise = z.infer<typeof mainExerciseSchema>;

/** What a mentor writes for one participant — stored in PracticePlan.content. */
export const practicePlanContentSchema = z.object({
  /** Name used in the greeting; defaults to the first word of the participant's display name. */
  first: z.string().nullish(),
  strengths: z.array(z.string()).default([]),
  intro: z.string(),
  modules: z.array(z.enum(MODULE_KEYS)),
  main: mainExerciseSchema.nullish(),
});
export type PracticePlanContent = z.infer<typeof practicePlanContentSchema>;
