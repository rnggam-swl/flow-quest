import type { CaseNode, QuestContent } from "@/lib/content/case";
import { describeAnswer } from "@/lib/content/describe";
import { answerSchemas, QUESTION_TYPE_LABELS, type QuizQuestion } from "@/lib/content/questions";
import { TIERS, graphFromFlow, scoreFlow, type Tier } from "@/lib/content/rubric";

/**
 * Per-question analytics (Fase 5) for one session: how each quiz question was
 * answered (right, partly right, which options were picked, the wrong answers
 * that came up most) and, for a flow question, how the canvases fared against
 * each rubric check. Pure aggregation over rows already loaded, so it's the
 * same numbers whether they come from the live DB or a test.
 */

export interface ResponseRow {
  questionKey: string;
  answer: unknown;
  correct: number;
  total: number;
}

export interface OptionCount {
  label: string;
  count: number;
  /** Part of the answer key. */
  correct: boolean;
}

export interface QuizQuestionStats {
  id: string;
  prompt: string;
  typeLabel: string;
  answered: number;
  /** Mean share of the question's points earned, 0..1 (null when nobody answered). */
  avgScore: number | null;
  /** Share of answers that were fully right, 0..1. */
  fullyRight: number | null;
  /** Picks per option, for questions with a fixed set of options. */
  options: OptionCount[] | null;
  /** The not-fully-right answers given most often, as the review list writes them. */
  commonWrong: { text: string; count: number }[];
}

export interface FlowQuestionStats {
  id: string;
  prompt: string;
  submitted: number;
  avgTotal: number | null;
  maxTotal: number;
  tiers: { tier: Tier; count: number }[];
  /** Labelled rubric checks, hardest first: share of canvases that met each. */
  checks: { name: string; label: string; passRate: number }[];
}

export interface QuestStats {
  order: number;
  title: string;
  started: number;
  completed: number;
  timedOut: number;
  /** Median minutes from start to finish over completed attempts. */
  medianMinutes: number | null;
  quiz: QuizQuestionStats[];
  flow: FlowQuestionStats | null;
}

const share = (n: number, of: number) => (of ? n / of : null);

function optionCounts(q: QuizQuestion, answers: unknown[]): OptionCount[] | null {
  const tally = (labels: string[], correct: (i: number) => boolean, picks: (a: unknown) => number[]) => {
    const counts = labels.map(() => 0);
    for (const a of answers) {
      try {
        for (const i of picks(a)) if (i >= 0 && i < counts.length) counts[i]++;
      } catch {
        // An answer that doesn't parse (older data) just isn't counted.
      }
    }
    return labels.map((label, i) => ({ label, count: counts[i], correct: correct(i) }));
  };
  switch (q.type) {
    case "singlechoice":
      return tally(q.options.map((o) => o.text), (i) => Boolean(q.options[i].correct), (a) => [answerSchemas.singlechoice.parse(a).selected]);
    case "multiselect":
      return tally(q.options.map((o) => o.text), (i) => Boolean(q.options[i].correct), (a) => answerSchemas.multiselect.parse(a).selected);
    case "boolean":
      return tally(["Ya", "Tidak"], (i) => (i === 0) === q.answer, (a) => [answerSchemas.boolean.parse(a).value ? 0 : 1]);
    case "oddoneout":
      return tally(q.items.map((it) => it.text), (i) => i === q.odd, (a) => [answerSchemas.oddoneout.parse(a).selected]);
    default:
      return null;
  }
}

export function quizQuestionStats(q: QuizQuestion, rows: ResponseRow[]): QuizQuestionStats {
  const mine = rows.filter((r) => r.questionKey === q.id);
  const full = mine.filter((r) => r.total > 0 && r.correct >= r.total);
  const wrong = new Map<string, number>();
  for (const r of mine) {
    if (r.total > 0 && r.correct >= r.total) continue;
    const text = describeAnswer(q, r.answer);
    wrong.set(text, (wrong.get(text) ?? 0) + 1);
  }
  return {
    id: q.id,
    prompt: q.prompt,
    typeLabel: QUESTION_TYPE_LABELS[q.type],
    answered: mine.length,
    avgScore: mine.length ? mine.reduce((n, r) => n + (r.total ? Math.min(r.correct, r.total) / r.total : 0), 0) / mine.length : null,
    fullyRight: share(full.length, mine.length),
    options: optionCounts(q, mine.map((r) => r.answer)),
    commonWrong: [...wrong]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
      .slice(0, 3),
  };
}

export interface CanvasRow {
  nodes: { id: string; label: string }[];
  connections: { sourceNodeId: string; targetNodeId: string; connectionType: string }[];
  total: number | null;
}

/** Re-scores every submitted canvas with the pinned rubric, so tiers and checks are the ones the participant got. */
export function flowQuestionStats(q: Extract<QuestContent["questions"][number], { type: "flow" }>, canvases: CanvasRow[], library: CaseNode[]): FlowQuestionStats {
  const results = canvases.map((c) => scoreFlow(q.rubric, graphFromFlow(c.nodes, c.connections, library)));
  const labelled = Object.entries(q.rubric.checks).filter(([, c]) => c.label);
  const maxTotal = results[0]
    ? Object.values(results[0].max).reduce((a, b) => a + b, 0)
    : Object.values(scoreFlow(q.rubric, { nodes: [], edges: [] }).max).reduce((a, b) => a + b, 0);
  return {
    id: q.id,
    prompt: q.prompt,
    submitted: canvases.length,
    avgTotal: canvases.length ? canvases.reduce((n, c, i) => n + (c.total ?? results[i].total), 0) / canvases.length : null,
    maxTotal,
    tiers: [...TIERS].reverse().map((tier) => ({ tier, count: results.filter((r) => r.tier === tier).length })),
    checks: labelled
      .map(([name, c]) => ({ name, label: c.label!, passRate: results.length ? results.filter((r) => r.checks[name]).length / results.length : 0 }))
      .sort((a, b) => a.passRate - b.passRate || a.label.localeCompare(b.label)),
  };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
