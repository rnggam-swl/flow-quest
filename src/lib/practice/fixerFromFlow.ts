import type { CaseNode } from "@/lib/content/case";
import type { Question } from "@/lib/content/questions";
import { graphFromFlow, scoreFlow, type EdgeKind } from "@/lib/content/rubric";
import { PRACTICE_NODE_KEY } from "@/lib/content/caseEdit";
import { checkRules } from "@/lib/practice/flowRules";
import { nodeDictionary } from "@/lib/practice/nodes";
import type { FixerWidget, MainExercise } from "@/lib/practice/schema";

/**
 * "Buat latihan utama dari jawaban Quest X": turns a participant's submitted
 * flow into a Modul Latihan fixer. Their arrows become the fixer's starting
 * state; rules are proposed from what the flow's nodes call for (an outcome
 * is reached and ends the flow, a decision has both branches, an error is a
 * real branch…), each marked with whether the participant's flow already
 * meets it — the unmet ones are what the exercise is about, so they're
 * pre-selected. When the question has an answer key, its arrows become the
 * fixer's model solution (and any the participant lacks are offered as
 * switched-off connections); without one, the mentor finishes the solution
 * in the fixer editor, which checks it against the rules as they go.
 */

type FlowQuestion = Extract<Question, { type: "flow" }>;

export interface ParticipantFlow {
  nodes: { id: string; label: string }[];
  connections: { sourceNodeId: string; targetNodeId: string; connectionType: string }[];
}

export interface RuleCandidate {
  rule: string;
  label: string;
  /** Does the participant's flow already satisfy it? */
  initialPasses: boolean;
  /** Does the answer key satisfy it (null without a key)? */
  solutionPasses: boolean | null;
  /** Pre-selected: unmet by the participant (and met by the key, when there is one). */
  suggested: boolean;
}

export interface FlowAnalysis {
  order: number;
  questTitle: string;
  nodes: string[];
  start: string;
  initial: string[];
  extra: string[];
  /** The answer key's arrows, or null when the question has no key. */
  solution: string[] | null;
  candidates: RuleCandidate[];
  /** Labels of the quest rubric's checks this flow didn't meet — the mentor's cue for the steps. */
  rubricMisses: string[];
  /** Canvas nodes that couldn't be carried over, e.g. labels the library doesn't know. */
  skipped: string[];
}

const KIND_SUFFIX: Record<EdgeKind, string> = { DEFAULT: "", YES: ":Y", NO: ":N", RECOVERY: ":R" };
const asKind = (t: string): EdgeKind => (t === "YES" || t === "NO" || t === "RECOVERY" ? t : "DEFAULT");

function edgeString(from: string, to: string, kind: EdgeKind) {
  return `${from}>${to}${KIND_SUFFIX[kind]}`;
}

/** Picks where the fixer starts: a START node that leads somewhere, else a node nothing leads into. */
function pickStart(nodes: string[], edges: string[], library: Map<string, CaseNode>): string {
  const forward = edges.filter((e) => !e.endsWith(":R")).map((e) => e.split(":")[0].split(">"));
  const hasOut = new Set(forward.map(([f]) => f));
  const hasIn = new Set(forward.map(([, t]) => t));
  return (
    nodes.find((k) => library.get(k)?.nodeType === "START" && hasOut.has(k)) ??
    nodes.find((k) => !hasIn.has(k) && hasOut.has(k)) ??
    nodes.find((k) => library.get(k)?.nodeType === "START") ??
    nodes[0]
  );
}

export function analyzeFlowForFixer(params: {
  order: number;
  questTitle: string;
  flow: ParticipantFlow;
  question: FlowQuestion;
  library: CaseNode[];
}): { ok: true; analysis: FlowAnalysis } | { ok: false; error: string } {
  const { order, questTitle, flow, question, library } = params;
  const lib = new Map(library.map((n) => [n.key, n]));
  const byLabel = new Map(library.map((n) => [n.label, n]));
  const skipped: string[] = [];

  // Canvas node id → library key, for nodes a fixer can show.
  const keyOfId = new Map<string, string>();
  const nodes: string[] = [];
  for (const n of flow.nodes) {
    const libNode = byLabel.get(n.label);
    if (!libNode) {
      skipped.push(`${n.label} (tidak ada di kamus node)`);
      continue;
    }
    if (!PRACTICE_NODE_KEY.test(libNode.key)) {
      skipped.push(`${n.label} (kunci "${libNode.key}" tidak bisa dipakai di latihan; hanya huruf kecil dan angka)`);
      continue;
    }
    keyOfId.set(n.id, libNode.key);
    if (!nodes.includes(libNode.key)) nodes.push(libNode.key);
  }
  if (nodes.length < 2) return { ok: false, error: `Flow Quest ${order} peserta ini belum punya cukup node untuk dijadikan latihan.` };

  const initial: string[] = [];
  for (const c of flow.connections) {
    const from = keyOfId.get(c.sourceNodeId);
    const to = keyOfId.get(c.targetNodeId);
    if (!from || !to || from === to) continue;
    const e = edgeString(from, to, asKind(c.connectionType));
    if (!initial.includes(e)) initial.push(e);
  }

  // The answer key, when the author drew one, is the model solution.
  let solution: string[] | null = null;
  if (question.answerKey && question.answerKey.edges.length) {
    const keyOf = new Map(question.answerKey.nodes.map((n) => [n.id, n.key]));
    solution = [];
    for (const e of question.answerKey.edges) {
      const from = keyOf.get(e.from);
      const to = keyOf.get(e.to);
      if (!from || !to || from === to || !PRACTICE_NODE_KEY.test(from) || !PRACTICE_NODE_KEY.test(to)) continue;
      for (const k of [from, to]) if (!nodes.includes(k)) nodes.push(k);
      const s = edgeString(from, to, e.kind);
      if (!solution.includes(s)) solution.push(s);
    }
  }
  const extra = (solution ?? []).filter((e) => !initial.includes(e));
  const start = pickStart(nodes, solution ?? initial, lib);

  const dict = nodeDictionary(library);
  const typeOf = (k: string) => lib.get(k)?.nodeType;
  const outcomes = nodes.filter((k) => typeOf(k) === "OUTCOME");
  const decisions = nodes.filter((k) => typeOf(k) === "DECISION");
  const errors = nodes.filter((k) => typeOf(k) === "ERROR");

  const rules: string[] = ["connected"];
  for (const o of outcomes) rules.push(`reach:${o}`, `terminal:${o}`);
  for (const d of decisions) rules.push(`twoSides:${d}`);
  for (const d of decisions) for (const o of outcomes) rules.push(`before:${d}:${o}`);
  for (const e of errors) rules.push(`branch:${e}`);
  for (const e of [...(solution ?? []), ...initial].filter((x) => x.endsWith(":R"))) {
    const [f, t] = e.slice(0, -2).split(">");
    rules.push(`recovery:${f}:${t}`);
  }
  // An arrow out of an outcome means the flow carries on after it has already ended.
  for (const e of initial) if (typeOf(e.split(">")[0]) === "OUTCOME") rules.push(`not:${e}`);
  const unique = [...new Set(rules)];

  const onInitial = checkRules(unique, nodes, initial, start, dict);
  const onSolution = solution ? checkRules(unique, nodes, solution, start, dict) : null;
  const candidates: RuleCandidate[] = unique.map((rule, i) => {
    const solutionPasses = onSolution ? onSolution[i].pass : null;
    return {
      rule,
      label: onInitial[i].label,
      initialPasses: onInitial[i].pass,
      solutionPasses,
      suggested: !onInitial[i].pass && solutionPasses !== false,
    };
  });

  const scored = scoreFlow(question.rubric, graphFromFlow(flow.nodes, flow.connections, library));
  const rubricMisses = Object.entries(scored.checks)
    .filter(([name, pass]) => !pass && question.rubric.checks[name]?.label)
    .map(([name]) => question.rubric.checks[name].label!);

  return { ok: true, analysis: { order, questTitle, nodes, start, initial, extra, solution, candidates, rubricMisses, skipped } };
}

/** The "latihan utama" for the chosen rules: one fixer over the participant's flow, with the unmet rules as steps. */
export function mainExerciseFromAnalysis(a: FlowAnalysis, rules: string[]): MainExercise {
  const chosen = a.candidates.filter((c) => rules.includes(c.rule));
  const fixer: FixerWidget = {
    type: "fixer",
    title: `Flow Quest ${a.order} kamu`,
    nodes: a.nodes,
    start: a.start,
    initial: a.initial,
    ...(a.extra.length ? { extra: a.extra } : {}),
    rules: chosen.map((c) => c.rule),
    // Without an answer key the mentor completes this in the fixer editor; until then it's flagged.
    solution: a.solution ?? a.initial,
  };
  const steps = chosen.filter((c) => !c.initialPasses).map((c) => `${c.label}.`);
  return {
    title: `Perbaiki Flow Quest ${a.order} Kamu`,
    intro: `Flow ini diambil dari jawaban kamu di Quest ${a.order} (${a.questTitle}). Nyalakan dan matikan sambungan sampai semua aturan terpenuhi.`,
    ...(steps.length ? { steps } : {}),
    widgets: [fixer],
  };
}
