import { z } from "zod";
import {
  answerSchemas,
  replayBranching,
  scoreQuestion,
  wordBlankTokens,
  type Media,
  type QuestionScore,
  type QuizQuestion,
} from "@/lib/content/questions";

/**
 * What a quiz question looks like on its way to the browser: everything needed
 * to render and answer it, nothing that gives the answer away. Correct flags,
 * answer values, buckets, hidden letters and hotspot positions stay on the
 * server; orderings that *are* the answer (a sequence, which pair belongs to
 * which item) are shuffled with a seed only the server knows, and the browser
 * answers in terms of what it was shown. Scoring happens on the server, after
 * mapping that answer back (see toInternalAnswer).
 *
 * The seed is per attempt and question, so a reload shows the same order.
 */

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** `perm[shownIndex] = originalIndex` — a deterministic Fisher–Yates shuffle, never the identity when n > 1. */
export function seededPermutation(n: number, seed: string): number[] {
  let s = hashSeed(seed);
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  // A shuffle that happens to land on the right answer would make the question trivial.
  if (n > 1 && perm.every((v, i) => v === i)) perm.push(perm.shift()!);
  return perm;
}

const flatPairs = (q: Extract<QuizQuestion, { type: "matching" }>) =>
  q.items.flatMap((it, i) => it.pairs.map((p, j) => ({ key: `${i}_${j}`, text: p.text, media: p.media })));

interface PublicBase {
  id: string;
  prompt: string;
  help?: string;
  media?: Media[];
}
type Item = { text: string; media?: Media[] };

export type PublicQuestion = PublicBase &
  (
    | { type: "singlechoice" | "multiselect"; options: Item[] }
    | { type: "boolean" }
    | { type: "number"; unit?: string }
    | { type: "range"; min: number; max: number; step: number }
    | { type: "matching"; items: { label: string; media?: Media[] }[]; pairs: Item[] }
    | { type: "grouping"; groups: string[]; items: Item[] }
    | { type: "wordblank"; blankMode: "letter" | "word"; tokens: (string | null)[]; hint?: string }
    | { type: "sequencing"; items: Item[] }
    | { type: "oddoneout"; items: Item[] }
    | { type: "hotspot"; image: Media; spotCount: number }
    | {
        type: "branching";
        start: string;
        nodes: { id: string; text: string; ending?: boolean; endingLabel?: string; choices: { text: string; target: string }[] }[];
      }
  );

export function toPublicQuestion(q: QuizQuestion, seed: string): PublicQuestion {
  const base: PublicBase = { id: q.id, prompt: q.prompt, help: q.help, media: q.media };
  switch (q.type) {
    case "singlechoice":
    case "multiselect":
      return { ...base, type: q.type, options: q.options.map((o) => ({ text: o.text, media: o.media })) };
    case "boolean":
      return { ...base, type: "boolean" };
    case "number":
      return { ...base, type: "number", unit: q.unit };
    case "range":
      return { ...base, type: "range", min: q.min, max: q.max, step: q.step };
    case "matching": {
      const pairs = flatPairs(q);
      const perm = seededPermutation(pairs.length, seed);
      return {
        ...base,
        type: "matching",
        items: q.items.map((it) => ({ label: it.label, media: it.media })),
        pairs: perm.map((i) => ({ text: pairs[i].text, media: pairs[i].media })),
      };
    }
    case "grouping":
      return { ...base, type: "grouping", groups: q.groups, items: q.items.map((it) => ({ text: it.text, media: it.media })) };
    case "wordblank": {
      const tokens = wordBlankTokens(q);
      return { ...base, type: "wordblank", blankMode: q.blankMode, hint: q.hint, tokens: tokens.map((t, i) => (q.blanks.includes(i) ? null : t)) };
    }
    case "sequencing": {
      const perm = seededPermutation(q.items.length, seed);
      return { ...base, type: "sequencing", items: perm.map((i) => ({ text: q.items[i].text, media: q.items[i].media })) };
    }
    case "oddoneout":
      return { ...base, type: "oddoneout", items: q.items.map((it) => ({ text: it.text, media: it.media })) };
    case "hotspot":
      return { ...base, type: "hotspot", image: q.image, spotCount: q.spots.length };
    case "branching":
      return {
        ...base,
        type: "branching",
        start: q.start,
        nodes: q.nodes.map((n) => ({ id: n.id, text: n.text, ending: n.ending, endingLabel: n.endingLabel, choices: n.choices.map((c) => ({ text: c.text, target: c.target })) })),
      };
  }
}

const index = z.number().int().nonnegative();

/** What the browser sends, in terms of what it was shown. Same as the stored answer except for the shuffled types. */
export const publicAnswerSchemas = {
  ...answerSchemas,
  /** `pair` is the index of the pair as shown. */
  matching: z.strictObject({ links: z.array(z.strictObject({ item: index, pair: index })) }),
  /** Shown indexes, in the order the participant arranged them. */
  sequencing: z.strictObject({ order: z.array(index) }),
} satisfies Record<QuizQuestion["type"], z.ZodType>;

/** Maps a submitted answer back to the stored (content-space) answer; throws on malformed input. */
export function toInternalAnswer(q: QuizQuestion, seed: string, raw: unknown): unknown {
  if (q.type === "matching") {
    const a = publicAnswerSchemas.matching.parse(raw);
    const pairs = flatPairs(q);
    const perm = seededPermutation(pairs.length, seed);
    return {
      links: a.links
        .filter((l) => l.item < q.items.length && l.pair < pairs.length)
        .map((l) => ({ item: l.item, pair: pairs[perm[l.pair]].key })),
    };
  }
  if (q.type === "sequencing") {
    const a = publicAnswerSchemas.sequencing.parse(raw);
    const perm = seededPermutation(q.items.length, seed);
    if (a.order.length !== q.items.length || new Set(a.order).size !== a.order.length || a.order.some((i) => i >= perm.length)) {
      throw new Error("Urutan tidak lengkap");
    }
    return { order: a.order.map((i) => perm[i]) };
  }
  return publicAnswerSchemas[q.type].parse(raw);
}

/**
 * What to show once an answer is checked: the score, the author's feedback,
 * and the right answer expressed in what the participant was shown.
 */
export interface Reveal {
  score: QuestionScore;
  /** Markdown: the picked option's own feedback, then the question's correct/incorrect feedback. */
  feedback: string[];
  answer:
    | { type: "singlechoice"; correct: number }
    | { type: "multiselect"; correct: number[] }
    | { type: "boolean" | "number" | "range"; value: number | boolean }
    | { type: "matching"; links: { item: number; pair: number }[] }
    | { type: "grouping"; groups: number[] }
    | { type: "wordblank"; tokens: string[] }
    | { type: "sequencing"; order: number[] }
    | { type: "oddoneout"; odd: number }
    | { type: "hotspot"; spots: { x: number; y: number; radius: number }[] }
    | { type: "branching"; correctSteps: boolean[] };
}

export function revealFor(q: QuizQuestion, seed: string, internalAnswer: unknown): Reveal {
  const score = scoreQuestion(q, internalAnswer);
  const fullyRight = score.total > 0 && score.correct === score.total;
  const feedback: string[] = [];
  if (q.type === "singlechoice") {
    const picked = q.options[(internalAnswer as { selected: number }).selected];
    if (picked?.feedback) feedback.push(picked.feedback);
  }
  if (q.type === "multiselect") {
    for (const i of (internalAnswer as { selected: number[] }).selected) if (q.options[i]?.feedback) feedback.push(q.options[i].feedback!);
  }
  const general = fullyRight ? q.feedback?.correct : q.feedback?.incorrect;
  if (general) feedback.push(general);

  const answer = ((): Reveal["answer"] => {
    switch (q.type) {
      case "singlechoice":
        return { type: "singlechoice", correct: q.options.findIndex((o) => o.correct) };
      case "multiselect":
        return { type: "multiselect", correct: q.options.flatMap((o, i) => (o.correct ? [i] : [])) };
      case "boolean":
      case "number":
      case "range":
        return { type: q.type, value: q.answer };
      case "matching": {
        const pairs = flatPairs(q);
        const perm = seededPermutation(pairs.length, seed);
        return { type: "matching", links: perm.map((orig, shown) => ({ item: Number(pairs[orig].key.split("_")[0]), pair: shown })) };
      }
      case "grouping":
        return { type: "grouping", groups: q.items.map((it) => it.group) };
      case "wordblank":
        return { type: "wordblank", tokens: wordBlankTokens(q) };
      case "sequencing": {
        const perm = seededPermutation(q.items.length, seed);
        // For each position in the correct sequence, the shown index of the item that belongs there.
        return { type: "sequencing", order: q.items.map((_, orig) => perm.indexOf(orig)) };
      }
      case "oddoneout":
        return { type: "oddoneout", odd: q.odd };
      case "hotspot":
        return { type: "hotspot", spots: q.spots.map((s) => ({ x: s.x, y: s.y, radius: s.radius })) };
      case "branching":
        return { type: "branching", correctSteps: replayBranching(q, (internalAnswer as { choices: number[] }).choices).made.map((m) => m.correct) };
    }
  })();
  return { score, feedback, answer };
}

/** An internal (stored) answer expressed back in shown indexes — so a reload shows what was picked. */
export function toPublicAnswer(q: QuizQuestion, seed: string, internal: unknown): unknown {
  if (q.type === "matching") {
    const a = answerSchemas.matching.parse(internal);
    const pairs = flatPairs(q);
    const perm = seededPermutation(pairs.length, seed);
    return { links: a.links.map((l) => ({ item: l.item, pair: perm.findIndex((orig) => pairs[orig].key === l.pair) })).filter((l) => l.pair !== -1) };
  }
  if (q.type === "sequencing") {
    const a = answerSchemas.sequencing.parse(internal);
    const perm = seededPermutation(q.items.length, seed);
    return { order: a.order.map((orig) => perm.indexOf(orig)) };
  }
  return internal;
}

export function questionSeed(attemptId: string, questionId: string) {
  return `${attemptId}:${questionId}`;
}

export type PublicAnswerOf<T extends QuizQuestion["type"]> = z.infer<(typeof publicAnswerSchemas)[T]>;
