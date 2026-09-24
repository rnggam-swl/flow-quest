import { z } from "zod";
import { EDGE_KINDS, findRubricProblems, flowRubricSchema, scoreFlow, type RubricGraph } from "@/lib/content/rubric";
import { looksLikeHtml } from "@/lib/content/markdown";

/**
 * The thirteen question types a quest can hold: the twelve quiz interactions
 * from the Formulir builder prototype (with answer keys added where the
 * prototype had none), plus "flow", the canvas exercise scored by a rubric.
 *
 * Each type has three parts: its content schema (what an author writes, answer
 * key included), its answer schema (what a participant submits), and a pure
 * scoring function returning { correct, total } — the same shape the
 * prototype's review list uses, so partial credit is always visible.
 *
 * Text that may carry formatting (feedback, hints) is markdown; see markdown.ts.
 */

export const QUESTION_ID = /^[a-z0-9][a-z0-9_-]*$/i;

export const mediaSchema = z.strictObject({
  kind: z.enum(["image", "audio"]),
  /** Storage URL or path. */
  url: z.string().min(1),
  alt: z.string().optional(),
});
export type Media = z.infer<typeof mediaSchema>;

const base = {
  id: z.string().regex(QUESTION_ID, "id soal hanya huruf, angka, - dan _"),
  prompt: z.string().min(1),
  /** Shown under the prompt. */
  help: z.string().optional(),
  media: z.array(mediaSchema).optional(),
};

const choiceOption = z.strictObject({
  text: z.string().min(1),
  media: z.array(mediaSchema).optional(),
  correct: z.boolean().optional(),
  /** Markdown shown when this option is picked. */
  feedback: z.string().optional(),
});

/** Markdown shown after answering, depending on whether the answer was fully right. */
const resultFeedback = z.strictObject({ correct: z.string().optional(), incorrect: z.string().optional() }).optional();

const item = z.strictObject({ text: z.string().min(1), media: z.array(mediaSchema).optional() });

export const singleChoiceSchema = z.strictObject({
  type: z.literal("singlechoice"),
  ...base,
  options: z.array(choiceOption).min(2),
  feedback: resultFeedback,
});

export const multiSelectSchema = z.strictObject({
  type: z.literal("multiselect"),
  ...base,
  options: z.array(choiceOption).min(2),
  feedback: resultFeedback,
});

export const booleanSchema = z.strictObject({
  type: z.literal("boolean"),
  ...base,
  answer: z.boolean(),
  feedback: resultFeedback,
});

export const numberSchema = z.strictObject({
  type: z.literal("number"),
  ...base,
  answer: z.number(),
  /** Accepted distance from the answer. */
  tolerance: z.number().nonnegative().default(0),
  unit: z.string().optional(),
  feedback: resultFeedback,
});

export const rangeSchema = z.strictObject({
  type: z.literal("range"),
  ...base,
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  answer: z.number(),
  tolerance: z.number().nonnegative().default(0),
  feedback: resultFeedback,
});

export const matchingSchema = z.strictObject({
  type: z.literal("matching"),
  ...base,
  /** Each item on the left owns one or more pairs on the right. */
  items: z
    .array(z.strictObject({ label: z.string().min(1), media: z.array(mediaSchema).optional(), pairs: z.array(item).min(1) }))
    .min(2),
  feedback: resultFeedback,
});

export const groupingSchema = z.strictObject({
  type: z.literal("grouping"),
  ...base,
  groups: z.array(z.string().min(1)).min(2),
  /** `group` is the index of the correct bucket. */
  items: z.array(z.strictObject({ text: z.string().min(1), media: z.array(mediaSchema).optional(), group: z.number().int().nonnegative() })).min(1),
  feedback: resultFeedback,
});

export const wordBlankSchema = z.strictObject({
  type: z.literal("wordblank"),
  ...base,
  answerText: z.string().min(1),
  blankMode: z.enum(["letter", "word"]),
  /** Indexes into the letters (or words) of `answerText` that are hidden. */
  blanks: z.array(z.number().int().nonnegative()).min(1),
  hint: z.string().optional(),
  feedback: resultFeedback,
});

export const sequencingSchema = z.strictObject({
  type: z.literal("sequencing"),
  ...base,
  /** Listed in the correct order; shown shuffled. */
  items: z.array(item).min(2),
  feedback: resultFeedback,
});

export const oddOneOutSchema = z.strictObject({
  type: z.literal("oddoneout"),
  ...base,
  items: z.array(item).min(3),
  odd: z.number().int().nonnegative(),
  feedback: resultFeedback,
});

export const hotspotSchema = z.strictObject({
  type: z.literal("hotspot"),
  ...base,
  image: mediaSchema,
  /** Positions and radius in percent of the image. */
  spots: z
    .array(z.strictObject({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), radius: z.number().positive().max(50), label: z.string().optional() }))
    .min(1),
  feedback: resultFeedback,
});

export const branchingSchema = z.strictObject({
  type: z.literal("branching"),
  ...base,
  start: z.string().min(1),
  nodes: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        text: z.string().min(1),
        /** Editor canvas position. */
        x: z.number().optional(),
        y: z.number().optional(),
        ending: z.boolean().optional(),
        endingLabel: z.string().optional(),
        choices: z.array(z.strictObject({ text: z.string().min(1), target: z.string().min(1), correct: z.boolean().optional() })).default([]),
      })
    )
    .min(1),
  feedback: resultFeedback,
});

/** A flow drawn in the builder (the answer key): node instances with library keys and positions, and the arrows between them. */
export const flowDrawingSchema = z.strictObject({
  nodes: z.array(z.strictObject({ id: z.string().min(1), key: z.string().min(1), x: z.number(), y: z.number() })),
  edges: z.array(z.strictObject({ from: z.string().min(1), to: z.string().min(1), kind: z.enum(EDGE_KINDS) })),
});
export type FlowDrawing = z.infer<typeof flowDrawingSchema>;

/** A drawing as a rubric graph; `typeOf` gives a library key's node type (e.g. "DECISION"). */
export function graphFromDrawing(drawing: FlowDrawing, typeOf: (key: string) => string | undefined): RubricGraph {
  return {
    nodes: drawing.nodes.map((n) => ({ id: n.id, key: n.key, type: typeOf(n.key)?.toLowerCase() })),
    edges: drawing.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  };
}

export const flowQuestionSchema = z.strictObject({
  type: z.literal("flow"),
  ...base,
  /** Node keys from the case library the canvas offers, in sidebar order. */
  palette: z.array(z.string().min(1)).min(1),
  rubric: flowRubricSchema,
  /** The author's model answer, drawn in the builder. Never sent to participants; the rubric is what scores. */
  answerKey: flowDrawingSchema.optional(),
  /**
   * A written "why" after submitting, scored 0–10 by length (see computeRationaleScore).
   * `required` keeps the participant on the result page until they've written it.
   */
  reflection: z
    .strictObject({ prompt: z.string().min(1), placeholder: z.string().optional(), required: z.boolean().default(false) })
    .optional(),
});

export const questionSchema = z.discriminatedUnion("type", [
  singleChoiceSchema,
  multiSelectSchema,
  booleanSchema,
  numberSchema,
  rangeSchema,
  matchingSchema,
  groupingSchema,
  wordBlankSchema,
  sequencingSchema,
  oddOneOutSchema,
  hotspotSchema,
  branchingSchema,
  flowQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question["type"];
export type QuizQuestion = Exclude<Question, { type: "flow" }>;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  singlechoice: "Pilihan Tunggal",
  multiselect: "Pilihan Ganda",
  boolean: "Ya / Tidak",
  number: "Angka",
  range: "Slider",
  matching: "Matching",
  grouping: "Grouping",
  wordblank: "Isian Kosong",
  sequencing: "Urutan",
  oddoneout: "Odd One Out",
  hotspot: "Hotspot",
  branching: "Branching Story",
  flow: "Susun Flow",
};

// ── Answers ─────────────────────────────────────────────────────────────

const index = z.number().int().nonnegative();

export const answerSchemas = {
  singlechoice: z.strictObject({ selected: index }),
  multiselect: z.strictObject({ selected: z.array(index) }),
  boolean: z.strictObject({ value: z.boolean() }),
  number: z.strictObject({ value: z.number() }),
  range: z.strictObject({ value: z.number() }),
  /** `pair` is "<item index>_<pair index>", as the builder prototype keys them. */
  matching: z.strictObject({ links: z.array(z.strictObject({ item: index, pair: z.string().regex(/^\d+_\d+$/) })) }),
  grouping: z.strictObject({ placement: z.array(index.nullable()) }),
  wordblank: z.strictObject({ values: z.record(z.string().regex(/^\d+$/), z.string()) }),
  /** The original item indexes, in the order the participant arranged them. */
  sequencing: z.strictObject({ order: z.array(index) }),
  oddoneout: z.strictObject({ selected: index }),
  hotspot: z.strictObject({ marks: z.array(z.strictObject({ x: z.number(), y: z.number() })) }),
  /** Index of the choice picked at each step, starting from `start`. */
  branching: z.strictObject({ choices: z.array(index) }),
} satisfies Record<QuizQuestion["type"], z.ZodType>;

export type AnswerOf<T extends QuizQuestion["type"]> = z.infer<(typeof answerSchemas)[T]>;

export interface QuestionScore {
  correct: number;
  total: number;
}

// ── Scoring ─────────────────────────────────────────────────────────────

export function wordBlankTokens(q: z.infer<typeof wordBlankSchema>): string[] {
  return q.blankMode === "word" ? q.answerText.split(/\s+/).filter(Boolean) : q.answerText.split("");
}

/** Which story node the participant ends on, and the choices they made, replaying from `start`. */
export function replayBranching(q: z.infer<typeof branchingSchema>, choices: number[]) {
  const byId = new Map(q.nodes.map((n) => [n.id, n]));
  let node = byId.get(q.start);
  const made: { nodeId: string; correct: boolean }[] = [];
  for (const c of choices) {
    const choice = node?.choices[c];
    if (!node || node.ending || !choice) break;
    made.push({ nodeId: node.id, correct: Boolean(choice.correct) });
    node = byId.get(choice.target);
  }
  return { node, made };
}

/**
 * Scores one quiz answer. Rules per type:
 * - multiselect: right picks minus wrong picks (never below 0), out of the number of right options.
 * - matching: a pair counts when it's linked to its own item and nothing else.
 * - hotspot: each mark can find at most one spot; unmarked spots don't count, and only as many marks
 *   as there are spots are read (the player never allows more), so blanketing the image scores nothing extra.
 * - branching: right choices out of the choices made on the way to an ending; a story left before
 *   reaching one counts the choice still owed as wrong.
 */
export function scoreQuestion(q: QuizQuestion, rawAnswer: unknown): QuestionScore {
  switch (q.type) {
    case "singlechoice": {
      const a = answerSchemas.singlechoice.parse(rawAnswer);
      return { correct: q.options[a.selected]?.correct ? 1 : 0, total: 1 };
    }
    case "multiselect": {
      const a = answerSchemas.multiselect.parse(rawAnswer);
      const picked = new Set(a.selected);
      const right = q.options.filter((o, i) => o.correct && picked.has(i)).length;
      const wrong = q.options.filter((o, i) => !o.correct && picked.has(i)).length;
      return { correct: Math.max(0, right - wrong), total: q.options.filter((o) => o.correct).length };
    }
    case "boolean": {
      const a = answerSchemas.boolean.parse(rawAnswer);
      return { correct: a.value === q.answer ? 1 : 0, total: 1 };
    }
    case "number":
    case "range": {
      const a = answerSchemas[q.type].parse(rawAnswer);
      return { correct: Math.abs(a.value - q.answer) <= q.tolerance ? 1 : 0, total: 1 };
    }
    case "matching": {
      const a = answerSchemas.matching.parse(rawAnswer);
      const linkedTo = new Map<string, Set<number>>();
      for (const l of a.links) linkedTo.set(l.pair, new Set([...(linkedTo.get(l.pair) ?? []), l.item]));
      let correct = 0;
      let total = 0;
      q.items.forEach((it, i) =>
        it.pairs.forEach((_, j) => {
          total++;
          const owners = linkedTo.get(`${i}_${j}`);
          if (owners?.size === 1 && owners.has(i)) correct++;
        })
      );
      return { correct, total };
    }
    case "grouping": {
      const a = answerSchemas.grouping.parse(rawAnswer);
      return { correct: q.items.filter((it, i) => a.placement[i] === it.group).length, total: q.items.length };
    }
    case "wordblank": {
      const a = answerSchemas.wordblank.parse(rawAnswer);
      const tokens = wordBlankTokens(q);
      const correct = q.blanks.filter((i) => (a.values[String(i)] ?? "").trim().toLowerCase() === (tokens[i] ?? "").toLowerCase()).length;
      return { correct, total: q.blanks.length };
    }
    case "sequencing": {
      const a = answerSchemas.sequencing.parse(rawAnswer);
      return { correct: q.items.filter((_, pos) => a.order[pos] === pos).length, total: q.items.length };
    }
    case "oddoneout": {
      const a = answerSchemas.oddoneout.parse(rawAnswer);
      return { correct: a.selected === q.odd ? 1 : 0, total: 1 };
    }
    case "hotspot": {
      const a = answerSchemas.hotspot.parse(rawAnswer);
      const found = new Set<number>();
      for (const m of a.marks.slice(0, q.spots.length)) {
        const hit = q.spots.findIndex((s, i) => !found.has(i) && Math.hypot(m.x - s.x, m.y - s.y) <= s.radius);
        if (hit !== -1) found.add(hit);
      }
      return { correct: found.size, total: q.spots.length };
    }
    case "branching": {
      const a = answerSchemas.branching.parse(rawAnswer);
      const { node, made } = replayBranching(q, a.choices);
      const unfinished = !node?.ending;
      return { correct: made.filter((m) => m.correct).length, total: made.length + (unfinished ? 1 : 0) };
    }
  }
}

// ── Authoring checks ────────────────────────────────────────────────────

/** Markdown fields of a question, for the "still contains HTML" check. */
function markdownFields(q: Question): string[] {
  const fields = [q.help ?? ""];
  if ("feedback" in q && q.feedback) fields.push(q.feedback.correct ?? "", q.feedback.incorrect ?? "");
  if (q.type === "singlechoice" || q.type === "multiselect") fields.push(...q.options.map((o) => o.feedback ?? ""));
  if (q.type === "wordblank") fields.push(q.hint ?? "");
  return fields;
}

/**
 * Everything that can be wrong with a question yet still pass the schema — a
 * port of the builder prototype's validateQuizForPublish, plus answer-key
 * checks for the types the prototype couldn't grade.
 */
export function findQuestionProblems(q: Question, where: string, libraryKeys: Set<string>, nodeTypes?: Map<string, string>): string[] {
  const p: string[] = [];
  const add = (msg: string) => p.push(`${where}: ${msg}`);

  if (markdownFields(q).some(looksLikeHtml)) add("teks memakai tag HTML; gunakan markdown (**tebal**, *miring*, - daftar)");

  switch (q.type) {
    case "singlechoice":
      if (q.options.filter((o) => o.correct).length !== 1) add("pilihan tunggal harus punya tepat satu opsi benar");
      break;
    case "multiselect":
      if (!q.options.some((o) => o.correct)) add("belum ada opsi yang ditandai benar");
      break;
    case "range":
      if (q.min >= q.max) add("nilai min harus lebih kecil dari max");
      if (q.answer < q.min || q.answer > q.max) add("jawaban berada di luar rentang slider");
      break;
    case "grouping":
      q.items.forEach((it, i) => {
        if (it.group >= q.groups.length) add(`item ${i + 1} menunjuk bucket yang tidak ada`);
      });
      break;
    case "wordblank": {
      const tokens = wordBlankTokens(q);
      if (q.blanks.some((i) => i >= tokens.length)) add("ada tile blank di luar panjang jawaban");
      if (q.blankMode === "letter" && q.blanks.some((i) => tokens[i] === " ")) add("spasi tidak bisa dijadikan blank");
      if (new Set(q.blanks).size !== q.blanks.length) add("ada tile blank yang terduplikasi");
      break;
    }
    case "oddoneout":
      if (q.odd >= q.items.length) add("item yang beda sendiri tidak ada di daftar");
      break;
    case "branching": {
      const ids = new Set(q.nodes.map((n) => n.id));
      if (ids.size !== q.nodes.length) add("ada id node cerita yang terduplikasi");
      if (!ids.has(q.start)) add("node awal tidak ada");
      if (!q.nodes.some((n) => n.ending)) add("belum ada node ending, cerita tidak akan pernah selesai");
      for (const n of q.nodes) {
        if (n.ending) continue;
        if (n.choices.length === 0) add(`node "${n.id}" jalan buntu (bukan ending tapi tidak punya pilihan)`);
        n.choices.forEach((c, i) => {
          if (!ids.has(c.target)) add(`pilihan ${i + 1} di node "${n.id}" menunjuk node yang tidak ada`);
        });
      }
      if (ids.has(q.start)) {
        const seen = new Set<string>();
        const queue = [q.start];
        while (queue.length) {
          const cur = queue.shift()!;
          if (seen.has(cur)) continue;
          seen.add(cur);
          q.nodes.find((n) => n.id === cur)?.choices.forEach((c) => queue.push(c.target));
        }
        const unreachable = q.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
        if (unreachable.length) add(`node tidak terjangkau dari node awal: ${unreachable.join(", ")}`);
      }
      break;
    }
    case "flow": {
      const unknown = q.palette.filter((k) => !libraryKeys.has(k));
      if (unknown.length) add(`palet memakai node yang tidak ada di kamus kasus: ${unknown.join(", ")}`);
      if (new Set(q.palette).size !== q.palette.length) add("palet punya node yang terduplikasi");
      if (!Object.values(q.rubric.scores).some((s) => s && s.max > 0)) add("rubrik belum punya poin; gambar kunci jawaban lalu klik Usulkan rubrik");
      const rubricProblems = findRubricProblems(q.rubric, libraryKeys);
      p.push(...rubricProblems.map((m) => `${where}: rubrik: ${m}`));
      if (q.answerKey) {
        const unknownKey = [...new Set(q.answerKey.nodes.map((n) => n.key))].filter((k) => !libraryKeys.has(k));
        if (unknownKey.length) add(`kunci jawaban memakai node yang tidak ada di kamus kasus: ${unknownKey.join(", ")}`);
        const ids = new Set(q.answerKey.nodes.map((n) => n.id));
        if (q.answerKey.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))) add("kunci jawaban punya panah ke node yang tidak ada");
        if (!unknownKey.length && !rubricProblems.length && q.answerKey.nodes.length) {
          // The model answer has to earn full marks, or the rubric asks for something the key doesn't do.
          const r = scoreFlow(q.rubric, graphFromDrawing(q.answerKey, (k) => nodeTypes?.get(k)));
          const max = Object.values(r.max).reduce((a, b) => a + b, 0);
          if (max > 0 && (r.total < max || r.tier !== "great")) add(`kunci jawaban hanya mendapat ${r.total}/${max} (tier ${r.tier}); sesuaikan rubrik atau kuncinya`);
        }
      }
      break;
    }
  }
  return p;
}
