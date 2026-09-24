import type { CaseNode } from "@/lib/content/case";
import { graphFromDrawing, type FlowDrawing } from "@/lib/content/questions";
import { RUBRIC_CATEGORIES, evaluateCondition, type CategoryScore, type Condition, type EdgeKind, type FlowRubric, type RubricCategory } from "@/lib/content/rubric";

/**
 * Proposes a rubric from the author's answer key, so writing one starts from
 * "what does my model flow do" instead of from the rule language:
 *
 * - goal: the flow starts where the key starts and reaches its outcome;
 * - flow: each step of the key's main path is reachable from the one before;
 * - logic: every decision's Ya and Tidak branches lead where the key's do;
 * - constraint: the outcome can't be reached by skipping a decision on the main path;
 * - edgeCase: every error is a real branch and every recovery arrow is there;
 * - simplicity: points off per node left unconnected.
 *
 * Categories the key gives nothing to check (no decisions, no errors) are
 * left out and their weight goes to the others, so the maximum stays 100.
 * The key itself always earns full marks and the top tier.
 */

const WEIGHTS: Record<RubricCategory, number> = { goal: 20, flow: 25, logic: 20, constraint: 15, edgeCase: 10, simplicity: 10 };

export interface SuggestResult {
  rubric: FlowRubric;
  /** What the suggestion was based on, in the author's words — shown next to the button. */
  summary: string[];
}

type Edge = { from: string; to: string; kind: EdgeKind };

/** A readable, stable check name: letters, digits and _ only. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function suggestRubric(drawing: FlowDrawing, library: CaseNode[]): SuggestResult | { error: string } {
  const lib = new Map(library.map((n) => [n.key, n]));
  const keyOf = new Map(drawing.nodes.map((n) => [n.id, n.key]));
  const label = (k: string) => lib.get(k)?.label ?? k;
  const typeOf = (k: string) => lib.get(k)?.nodeType;

  // Work in library keys: the rubric refers to keys, not to node instances.
  const order = [...new Set(drawing.nodes.map((n) => n.key))];
  const edges: Edge[] = [];
  for (const e of drawing.edges) {
    const from = keyOf.get(e.from);
    const to = keyOf.get(e.to);
    if (from && to && from !== to && !edges.some((x) => x.from === from && x.to === to && x.kind === e.kind)) edges.push({ from, to, kind: e.kind });
  }
  if (order.length < 2 || edges.length === 0) return { error: "Gambar kunci jawaban dulu: minimal dua node yang tersambung." };

  const forward = edges.filter((e) => e.kind !== "RECOVERY");
  const hasIncoming = new Set(forward.map((e) => e.to));
  const start = order.find((k) => !hasIncoming.has(k) && forward.some((e) => e.from === k)) ?? order[0];

  // The main path: the shortest forward route from the start to an outcome, taking Ya over Tidak.
  function shortest(from: string, isGoal: (k: string) => boolean, allowNo: boolean): string[] | null {
    const prev = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur !== from && isGoal(cur)) {
        const path = [cur];
        for (let p = prev.get(cur); p; p = prev.get(p)) path.unshift(p);
        return path;
      }
      const out = forward.filter((e) => e.from === cur && (allowNo || e.kind !== "NO")).sort((a, b) => (a.kind === "YES" ? -1 : 0) - (b.kind === "YES" ? -1 : 0));
      for (const e of out) {
        if (prev.has(e.to)) continue;
        prev.set(e.to, cur);
        queue.push(e.to);
      }
    }
    return null;
  }
  const isOutcome = (k: string) => typeOf(k) === "OUTCOME";
  const isEnd = (k: string) => typeOf(k) !== "ERROR" && !forward.some((e) => e.from === k);
  const path = shortest(start, isOutcome, false) ?? shortest(start, isOutcome, true) ?? shortest(start, isEnd, false) ?? shortest(start, isEnd, true);
  if (!path) return { error: `Tidak ada jalur maju dari ${label(start)} ke node hasil (OUTCOME). Sambungkan jalur utamanya dulu.` };
  const goal = path[path.length - 1];

  // Only propose what the key itself satisfies, so the key keeps full marks.
  const keyGraph = graphFromDrawing(drawing, typeOf);
  const holds = (c: Condition) => evaluateCondition(c, keyGraph);

  const checks: FlowRubric["checks"] = {};
  const add = (name: string, labelText: string, when: Condition) => {
    checks[name] = { label: labelText, when };
    return { check: name } as Condition;
  };

  const goalChecks = [add(`ada_${slug(start)}`, `Ada ${label(start)}`, { has: start }), add(`ada_${slug(goal)}`, `Ada ${label(goal)}`, { has: goal })];

  // Steps of the main path, decisions left to the logic checks.
  const milestones = path.filter((k) => typeOf(k) !== "DECISION");
  const stepChecks = milestones
    .slice(1)
    .map((k, i) => add(`jalur_${slug(milestones[i])}_${slug(k)}`, `${label(milestones[i])} sampai ke ${label(k)}`, { reach: { from: milestones[i], to: k, skipRecovery: true } }));

  const decisions = order.filter((k) => typeOf(k) === "DECISION");
  const logicChecks = decisions.flatMap((d) =>
    (["YES", "NO"] as const).flatMap((side) => {
      const target = edges.find((e) => e.from === d && e.kind === side)?.to;
      if (!target) return [];
      const word = side === "YES" ? "Ya" : "Tidak";
      return [add(`${side === "YES" ? "ya" : "tidak"}_${slug(d)}`, `Cabang ${word} dari ${label(d)} sampai ke ${label(target)}`, { branch: { from: d, side, reaches: target } })];
    })
  );

  const gates = path.filter((k) => typeOf(k) === "DECISION");
  const constraintChecks = gates.flatMap((d) => {
    const when: Condition = {
      all: [{ reach: { from: start, to: goal, skipRecovery: true } }, { not: { reach: { from: start, to: goal, skipRecovery: true, avoid: d } } }],
    };
    return holds(when) ? [add(`wajib_${slug(d)}`, `${label(goal)} hanya tercapai lewat ${label(d)}`, when)] : [];
  });

  const errors = order.filter((k) => typeOf(k) === "ERROR");
  const edgeChecks = [
    ...errors.filter((k) => holds({ failBranch: k })).map((k) => add(`gagal_${slug(k)}`, `Ada cabang ke ${label(k)}`, { failBranch: k })),
    ...edges
      .filter((e) => e.kind === "RECOVERY")
      .map((e) => add(`kembali_${slug(e.from)}_${slug(e.to)}`, `${label(e.from)} kembali ke ${label(e.to)}`, { edge: { from: e.from, to: e.to, kind: "RECOVERY" } })),
  ];
  const terminal = add(`akhir_${slug(goal)}`, `${label(goal)} tidak punya panah keluar`, { terminal: goal });

  // Weights: drop what can't be checked, share its weight out, keep the total at 100.
  const present: Record<RubricCategory, boolean> = {
    goal: true,
    flow: stepChecks.length > 0,
    logic: logicChecks.length > 0,
    constraint: constraintChecks.length > 0,
    edgeCase: edgeChecks.length > 0,
    simplicity: true,
  };
  const cats = RUBRIC_CATEGORIES.filter((c) => present[c]);
  const raw = cats.reduce((sum, c) => sum + WEIGHTS[c], 0);
  const max = Object.fromEntries(cats.map((c) => [c, Math.round((WEIGHTS[c] * 100) / raw)])) as Record<RubricCategory, number>;
  const drift = 100 - cats.reduce((sum, c) => sum + max[c], 0);
  if (present.flow) max.flow += drift;
  else max.goal += drift;

  const graded = (list: Condition[], m: number): CategoryScore => {
    const cases: { when: Condition; points: number }[] = [{ when: { all: list }, points: m }];
    if (list.length > 2) cases.push({ when: { atLeast: Math.ceil((list.length * 2) / 3), of: list }, points: Math.round(m * 0.6) });
    if (list.length > 1) cases.push({ when: { atLeast: 1, of: list }, points: Math.round(m * (list.length > 2 ? 0.3 : 0.5)) });
    return { max: m, cases, otherwise: 0 };
  };
  const scores: FlowRubric["scores"] = {};
  scores.goal = { max: max.goal, cases: [{ when: { all: goalChecks }, points: max.goal }, { when: { any: goalChecks }, points: Math.round(max.goal / 2) }], otherwise: 0 };
  if (present.flow) scores.flow = graded(stepChecks, max.flow);
  if (present.logic) scores.logic = graded(logicChecks, max.logic);
  if (present.constraint) scores.constraint = graded(constraintChecks, max.constraint);
  if (present.edgeCase) scores.edgeCase = graded(edgeChecks, max.edgeCase);
  scores.simplicity = { max: max.simplicity, orphans: { floor: Math.round(max.simplicity * 0.4) } };

  const tiers: FlowRubric["tiers"] = [
    {
      when: { not: { all: [...goalChecks, ...stepChecks] } },
      tier: "needs-work",
      message: `Jalur utamanya belum lengkap. Pastikan ada jalan dari ${label(start)} sampai ${label(goal)}: ${milestones.map(label).join(" → ")}.`,
    },
  ];
  if (logicChecks.length || constraintChecks.length) {
    tiers.push({
      when: { not: { all: [...logicChecks, ...constraintChecks] } },
      tier: "almost",
      message: `Hampir! Periksa lagi ${decisions.map(label).join(", ")}: setiap keputusan perlu cabang Ya dan Tidak ke tempat yang tepat, dan tidak boleh dilewati begitu saja.`,
    });
  }
  if (edgeChecks.length) {
    tiers.push({
      when: { not: { all: edgeChecks } },
      tier: "good",
      message: "Jalur utamanya sudah benar. Sekarang pastikan setiap kegagalan punya cabang sendiri dan jalan kembali.",
    });
  }

  const summary = [
    `Jalur utama: ${path.map(label).join(" → ")}`,
    decisions.length ? `Keputusan: ${decisions.map(label).join(", ")}` : "Tanpa node keputusan",
    errors.length ? `Kegagalan: ${errors.map(label).join(", ")} (${edges.filter((e) => e.kind === "RECOVERY").length} jalan kembali)` : "Tanpa node gagal",
  ];

  return {
    summary,
    rubric: {
      checks,
      scores,
      tiers,
      otherwise: { tier: "great", message: "Flow ini matang: jalur utama, keputusan, dan jalan kembali saat gagal sudah lengkap." },
      notes: [
        { when: { not: terminal }, message: `Ingat, ${label(goal)} adalah titik akhir, jadi tidak boleh ada panah yang keluar darinya.` },
        { when: { not: { connected: true } }, message: "Masih ada node yang belum tersambung." },
      ],
    },
  };
}
