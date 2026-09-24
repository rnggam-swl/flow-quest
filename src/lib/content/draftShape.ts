import type { z } from "zod";
import { caseContentSchema, moduleContentSchema, questContentSchema } from "@/lib/content/case";
import { RUBRIC_CATEGORIES } from "@/lib/content/rubric";

/**
 * What unfinished content has to look like before it may be stored as a
 * draft or loaded into the builder. A draft may have empty text, too few
 * options, a fixer arrow not wired up yet — the problem list's job — but it
 * must have every field the editors read, of the right type. Content that
 * skipped the schema (a hand-written file, a direct API call) doesn't get the
 * schema's defaults either, so those are filled in here first.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const each = (v: unknown, fn: (o: Obj) => void) => Array.isArray(v) && v.forEach((x) => isObj(x) && fn(x));

function fillQuestion(q: Obj) {
  if (q.type === "number") q.tolerance ??= 0;
  if (q.type === "range") {
    q.step ??= 1;
    q.tolerance ??= 0;
  }
  if (q.type === "branching") each(q.nodes, (n) => (n.choices ??= []));
  if (q.type === "flow") {
    if (isObj(q.reflection)) q.reflection.required ??= false;
    const r = q.rubric;
    if (isObj(r)) {
      r.checks ??= {};
      r.notes ??= [];
      if (isObj(r.scores)) for (const c of RUBRIC_CATEGORIES) if (isObj(r.scores[c]) && "cases" in r.scores[c]) (r.scores[c] as Obj).otherwise ??= 0;
    }
  }
}

function fillQuest(q: Obj) {
  q.checkMode ??= "end";
  each(q.questions, fillQuestion);
}

function fillCase(c: Obj) {
  c.modules ??= [];
  each(c.quests, fillQuest);
}

const SCHEMAS = { case: caseContentSchema, quest: questContentSchema, module: moduleContentSchema } as const;
const FILL: Record<keyof typeof SCHEMAS, (o: Obj) => void> = { case: fillCase, quest: fillQuest, module: () => {} };

/** Issues that mean the editors can't safely read the content, as opposed to it being unfinished. */
const STRUCTURAL = new Set(["invalid_type", "invalid_union", "invalid_key", "invalid_element", "invalid_value"]);

export type DraftShapeResult<T> = { ok: true; data: T } | { ok: false; error: z.core.$ZodIssue[] };

export function acceptDraftShape<K extends keyof typeof SCHEMAS>(kind: K, raw: unknown): DraftShapeResult<z.infer<(typeof SCHEMAS)[K]>> {
  if (!isObj(raw)) return { ok: false, error: [{ code: "invalid_type", expected: "object", input: raw, path: [], message: "Isi harus berupa objek" } as z.core.$ZodIssue] };
  const filled = structuredClone(raw);
  FILL[kind](filled);
  const parsed = SCHEMAS[kind].safeParse(filled);
  if (parsed.success) return { ok: true, data: parsed.data as z.infer<(typeof SCHEMAS)[K]> };
  const structural = parsed.error.issues.filter((i) => STRUCTURAL.has(i.code));
  if (structural.length) return { ok: false, error: structural };
  return { ok: true, data: filled as z.infer<(typeof SCHEMAS)[K]> };
}

/** One readable line per issue, e.g. "quests.0.title: Invalid input". */
export function describeShapeIssues(issues: z.core.$ZodIssue[], max = 5): string {
  const lines = issues.slice(0, max).map((i) => `${i.path.join(".") || "(akar)"}: ${i.message}`);
  if (issues.length > max) lines.push(`…dan ${issues.length - max} lagi`);
  return lines.join("\n");
}
