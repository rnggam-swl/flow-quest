import { z } from "zod";

/**
 * Flow rubrics as data. A rubric scores a participant's flow in the six
 * fixed categories (so Score rows stay comparable across quests and cases),
 * picks a tier, and writes the feedback message — all from conditions over
 * the graph instead of hand-written code per quest.
 *
 * Conditions reference nodes by their key in the case's node library, never
 * by FlowNode id; a flow may contain the same node more than once, and every
 * primitive treats "any node with this key" as a match, exactly like the
 * label-based checks it replaces.
 *
 * The primitives are enough to express both the Quest 2–5 scoring rules and
 * the Modul Latihan fixer rules (see practiceRuleCondition below), which is
 * what lets one engine serve both.
 */

export const EDGE_KINDS = ["DEFAULT", "YES", "NO", "RECOVERY"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const RUBRIC_CATEGORIES = ["goal", "flow", "logic", "constraint", "edgeCase", "simplicity"] as const;
export type RubricCategory = (typeof RUBRIC_CATEGORIES)[number];

export const TIERS = ["needs-work", "almost", "good", "great"] as const;
export type Tier = (typeof TIERS)[number];

export type Condition =
  /** At least one node with this key is on the canvas. */
  | { has: string }
  /**
   * Some node `from` reaches some node `to` along the arrows. Recovery paths
   * count unless `skipRecovery` is set; `avoid` forbids passing through that node.
   */
  | { reach: { from: string; to: string; skipRecovery?: boolean; avoid?: string } }
  /** The Ya/Tidak branch out of a `from` node (then any arrows onward) reaches `reaches`. */
  | { branch: { from: string; side: "YES" | "NO"; reaches: string } }
  /** A direct arrow exists; omitted ends and kind match anything. */
  | { edge: { from?: string; to?: string; kind?: EdgeKind } }
  /** No arrow of any kind leaves a node with this key. */
  | { terminal: string }
  /** A node with this key has both a Ya and a Tidak branch. */
  | { twoSides: string }
  /** Entered by a non-recovery arrow, and never straight out of an outcome node. */
  | { failBranch: string }
  /** Every node on the canvas has at least one arrow. */
  | { connected: true }
  /** Reuses a named check from the rubric's `checks`. */
  | { check: string }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { atLeast: number; of: Condition[] };

const key = z.string().min(1);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ has: key }),
    z.strictObject({
      reach: z.strictObject({ from: key, to: key, skipRecovery: z.boolean().optional(), avoid: key.optional() }),
    }),
    z.strictObject({ branch: z.strictObject({ from: key, side: z.enum(["YES", "NO"]), reaches: key }) }),
    z.strictObject({ edge: z.strictObject({ from: key.optional(), to: key.optional(), kind: z.enum(EDGE_KINDS).optional() }) }),
    z.strictObject({ terminal: key }),
    z.strictObject({ twoSides: key }),
    z.strictObject({ failBranch: key }),
    z.strictObject({ connected: z.literal(true) }),
    z.strictObject({ check: key }),
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
    z.strictObject({ atLeast: z.number().int().positive(), of: z.array(conditionSchema).min(1) }),
  ])
);

const categoryScoreSchema = z.union([
  /** First matching case wins; `otherwise` when none match. */
  z.strictObject({
    max: z.number().nonnegative(),
    cases: z.array(z.strictObject({ when: conditionSchema, points: z.number() })),
    otherwise: z.number().default(0),
  }),
  /** `max` minus one point per node with no arrows, but never below `floor`. */
  z.strictObject({ max: z.number().nonnegative(), orphans: z.strictObject({ floor: z.number() }) }),
]);
export type CategoryScore = z.infer<typeof categoryScoreSchema>;

export const flowRubricSchema = z.strictObject({
  /** Named, reusable conditions — the label is what an editor or a feedback checklist shows. */
  checks: z.record(key, z.strictObject({ label: z.string().optional(), when: conditionSchema })).default({}),
  scores: z.strictObject(
    Object.fromEntries(RUBRIC_CATEGORIES.map((c) => [c, categoryScoreSchema.optional()])) as Record<
      RubricCategory,
      z.ZodOptional<typeof categoryScoreSchema>
    >
  ),
  /** First matching rule sets the tier and message. */
  tiers: z.array(z.strictObject({ when: conditionSchema, tier: z.enum(TIERS), message: z.string() })),
  otherwise: z.strictObject({ tier: z.enum(TIERS), message: z.string() }),
  /** Every matching note is appended to the message. */
  notes: z.array(z.strictObject({ when: conditionSchema, message: z.string() })).default([]),
});
export type FlowRubric = z.infer<typeof flowRubricSchema>;

export interface RubricNode {
  id: string;
  /** Key in the case's node library. */
  key: string;
  /** Library node type, lower-case (screen/system/decision/outcome/error), when known. */
  type?: string;
}

export interface RubricEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface RubricGraph {
  nodes: RubricNode[];
  edges: RubricEdge[];
}

export interface LibraryNode {
  key: string;
  label: string;
  /** FlowNode.nodeType, e.g. "SCREEN" or "DECISION". */
  nodeType: string;
}

/**
 * Builds a rubric graph from a participant's saved flow. Nodes are matched to
 * the case library by label (labels are unique within a library); a label the
 * library doesn't know keeps a key no rubric can reference, so it only ever
 * counts as an orphan or a plain node.
 */
export function graphFromFlow(
  nodes: { id: string; label: string }[],
  connections: { sourceNodeId: string; targetNodeId: string; connectionType?: string }[],
  library: LibraryNode[]
): RubricGraph {
  const byLabel = new Map(library.map((n) => [n.label, n]));
  return {
    nodes: nodes.map((n) => {
      const lib = byLabel.get(n.label);
      return { id: n.id, key: lib?.key ?? `?${n.label}`, type: lib?.nodeType.toLowerCase() };
    }),
    edges: connections.map((c) => ({
      from: c.sourceNodeId,
      to: c.targetNodeId,
      kind: (EDGE_KINDS as readonly string[]).includes(c.connectionType ?? "") ? (c.connectionType as EdgeKind) : "DEFAULT",
    })),
  };
}

export interface RubricResult {
  scores: Record<RubricCategory, number>;
  max: Record<RubricCategory, number>;
  total: number;
  tier: Tier;
  message: string;
  checks: Record<string, boolean>;
}

/** Pre-indexed view of a graph so conditions stay cheap to evaluate many times. */
class GraphIndex {
  readonly keyOf = new Map<string, string>();
  readonly typeOf = new Map<string, string | undefined>();
  readonly idsByKey = new Map<string, string[]>();
  readonly out = new Map<string, RubricEdge[]>();

  constructor(readonly graph: RubricGraph) {
    for (const n of graph.nodes) {
      this.keyOf.set(n.id, n.key);
      this.typeOf.set(n.id, n.type);
      this.idsByKey.set(n.key, [...(this.idsByKey.get(n.key) ?? []), n.id]);
    }
    for (const e of graph.edges) this.out.set(e.from, [...(this.out.get(e.from) ?? []), e]);
  }

  ids(k: string) {
    return this.idsByKey.get(k) ?? [];
  }

  /** BFS from `starts`; true once any node with key `to` is visited (a start counts). */
  reaches(starts: string[], to: string, skipRecovery: boolean, avoid?: string) {
    const targets = new Set(this.ids(to));
    if (starts.length === 0 || targets.size === 0) return false;
    const seen = new Set<string>();
    const queue = starts.filter((id) => avoid === undefined || this.keyOf.get(id) !== avoid);
    while (queue.length) {
      const cur = queue.shift()!;
      if (targets.has(cur)) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of this.out.get(cur) ?? []) {
        if (skipRecovery && e.kind === "RECOVERY") continue;
        if (avoid !== undefined && this.keyOf.get(e.to) === avoid) continue;
        queue.push(e.to);
      }
    }
    return false;
  }
}

function evaluate(c: Condition, g: GraphIndex, checks: Record<string, { when: Condition }>, memo: Map<string, boolean>, path: string[]): boolean {
  if ("has" in c) return g.ids(c.has).length > 0;
  if ("reach" in c) return g.reaches(g.ids(c.reach.from), c.reach.to, Boolean(c.reach.skipRecovery), c.reach.avoid);
  if ("branch" in c) {
    const froms = new Set(g.ids(c.branch.from));
    const starts = g.graph.edges.filter((e) => froms.has(e.from) && e.kind === c.branch.side).map((e) => e.to);
    return g.reaches(starts, c.branch.reaches, false);
  }
  if ("edge" in c) {
    const { from, to, kind } = c.edge;
    return g.graph.edges.some(
      (e) =>
        (from === undefined || g.keyOf.get(e.from) === from) &&
        (to === undefined || g.keyOf.get(e.to) === to) &&
        (kind === undefined || e.kind === kind)
    );
  }
  if ("terminal" in c) return !g.ids(c.terminal).some((id) => (g.out.get(id) ?? []).length > 0);
  if ("twoSides" in c) {
    return g.ids(c.twoSides).some((id) => {
      const outs = g.out.get(id) ?? [];
      return outs.some((e) => e.kind === "YES") && outs.some((e) => e.kind === "NO");
    });
  }
  if ("failBranch" in c) {
    const ids = new Set(g.ids(c.failBranch));
    const incoming = g.graph.edges.filter((e) => ids.has(e.to) && e.kind !== "RECOVERY");
    return incoming.length > 0 && !incoming.some((e) => g.typeOf.get(e.from) === "outcome");
  }
  if ("connected" in c) {
    return g.graph.nodes.every((n) => g.graph.edges.some((e) => e.from === n.id || e.to === n.id));
  }
  if ("check" in c) {
    const cached = memo.get(c.check);
    if (cached !== undefined) return cached;
    const def = checks[c.check];
    if (!def) throw new Error(`Unknown rubric check "${c.check}"`);
    if (path.includes(c.check)) throw new Error(`Rubric check cycle: ${[...path, c.check].join(" → ")}`);
    const value = evaluate(def.when, g, checks, memo, [...path, c.check]);
    memo.set(c.check, value);
    return value;
  }
  if ("all" in c) return c.all.every((x) => evaluate(x, g, checks, memo, path));
  if ("any" in c) return c.any.some((x) => evaluate(x, g, checks, memo, path));
  if ("not" in c) return !evaluate(c.not, g, checks, memo, path);
  return c.of.filter((x) => evaluate(x, g, checks, memo, path)).length >= c.atLeast;
}

/** Evaluates one condition on its own (no named checks), e.g. for a Modul Latihan rule. */
export function evaluateCondition(condition: Condition, graph: RubricGraph): boolean {
  return evaluate(condition, new GraphIndex(graph), {}, new Map(), []);
}

function orphanCount(graph: RubricGraph) {
  return graph.nodes.filter((n) => !graph.edges.some((e) => e.from === n.id || e.to === n.id)).length;
}

export function scoreFlow(rubric: FlowRubric, graph: RubricGraph): RubricResult {
  const g = new GraphIndex(graph);
  const memo = new Map<string, boolean>();
  const is = (c: Condition) => evaluate(c, g, rubric.checks, memo, []);

  const scores = {} as Record<RubricCategory, number>;
  const max = {} as Record<RubricCategory, number>;
  for (const category of RUBRIC_CATEGORIES) {
    const rule = rubric.scores[category];
    max[category] = rule?.max ?? 0;
    if (!rule) scores[category] = 0;
    else if ("orphans" in rule) scores[category] = Math.max(rule.orphans.floor, rule.max - orphanCount(graph));
    else scores[category] = rule.cases.find((c) => is(c.when))?.points ?? rule.otherwise;
  }

  const tierRule = rubric.tiers.find((t) => is(t.when)) ?? rubric.otherwise;
  const notes = rubric.notes.filter((n) => is(n.when)).map((n) => n.message);

  return {
    scores,
    max,
    total: RUBRIC_CATEGORIES.reduce((sum, c) => sum + scores[c], 0),
    tier: tierRule.tier,
    message: [tierRule.message, ...notes].join(" "),
    checks: Object.fromEntries(Object.keys(rubric.checks).map((name) => [name, is({ check: name })])),
  };
}

/** Names of checks a condition tree refers to — used to validate references. */
export function referencedChecks(c: Condition): string[] {
  if ("check" in c) return [c.check];
  if ("all" in c) return c.all.flatMap(referencedChecks);
  if ("any" in c) return c.any.flatMap(referencedChecks);
  if ("not" in c) return referencedChecks(c.not);
  if ("atLeast" in c) return c.of.flatMap(referencedChecks);
  return [];
}

/** Node keys a condition tree refers to — used to validate them against the case's node library. */
export function referencedNodeKeys(c: Condition): string[] {
  if ("has" in c) return [c.has];
  if ("reach" in c) return [c.reach.from, c.reach.to, ...(c.reach.avoid ? [c.reach.avoid] : [])];
  if ("branch" in c) return [c.branch.from, c.branch.reaches];
  if ("edge" in c) return [c.edge.from, c.edge.to].filter((k): k is string => Boolean(k));
  if ("terminal" in c) return [c.terminal];
  if ("twoSides" in c) return [c.twoSides];
  if ("failBranch" in c) return [c.failBranch];
  if ("all" in c) return c.all.flatMap(referencedNodeKeys);
  if ("any" in c) return c.any.flatMap(referencedNodeKeys);
  if ("not" in c) return referencedNodeKeys(c.not);
  if ("atLeast" in c) return c.of.flatMap(referencedNodeKeys);
  return [];
}

/** Every condition in a rubric, for reference checks. */
export function rubricConditions(rubric: FlowRubric): Condition[] {
  const scoreConds = RUBRIC_CATEGORIES.flatMap((cat) => {
    const rule = rubric.scores[cat];
    return rule && "cases" in rule ? rule.cases.map((c) => c.when) : [];
  });
  return [
    ...Object.values(rubric.checks).map((c) => c.when),
    ...scoreConds,
    ...rubric.tiers.map((t) => t.when),
    ...rubric.notes.map((n) => n.when),
  ];
}

/** Rubric problems that pass the schema: unknown checks, check cycles, node keys missing from the library. */
export function findRubricProblems(rubric: FlowRubric, libraryKeys: Set<string>): string[] {
  const problems: string[] = [];
  const conditions = rubricConditions(rubric);
  for (const name of new Set(conditions.flatMap(referencedChecks))) {
    if (!rubric.checks[name]) problems.push(`check "${name}" dipakai tapi tidak didefinisikan`);
  }
  for (const k of new Set(conditions.flatMap(referencedNodeKeys))) {
    if (!libraryKeys.has(k)) problems.push(`node "${k}" tidak ada di kamus node kasus`);
  }
  // Surface check cycles by evaluating every check against an empty graph.
  try {
    scoreFlow(rubric, { nodes: [], edges: [] });
  } catch (e) {
    problems.push((e as Error).message);
  }
  return problems;
}

/**
 * Translates a Modul Latihan fixer rule ("reach:success", "before:a:b",
 * "not:error>home:R", …; see src/lib/practice/flowRules.ts) into a condition,
 * given the fixer's start node. Practice rules never follow recovery arrows
 * when checking reachability.
 */
export function practiceRuleCondition(spec: string, start: string): Condition {
  const [name, a, b] = spec.split(":");
  switch (name) {
    case "connected":
      return { connected: true };
    case "reach":
      return { reach: { from: start, to: a, skipRecovery: true } };
    case "terminal":
      return { terminal: a };
    case "before":
      return {
        all: [
          { reach: { from: start, to: b, skipRecovery: true } },
          { not: { reach: { from: start, to: b, skipRecovery: true, avoid: a } } },
        ],
      };
    case "branch":
      return { failBranch: a };
    case "twoSides":
      return { twoSides: a };
    case "recovery":
      return { edge: { from: a, to: b, kind: "RECOVERY" } };
    case "not": {
      const [pair, k = ""] = spec.slice(4).split(":");
      const [from, to] = pair.split(">");
      const kind: EdgeKind = k === "Y" ? "YES" : k === "N" ? "NO" : k === "R" ? "RECOVERY" : "DEFAULT";
      return { not: { edge: { from, to, kind } } };
    }
    default:
      throw new Error(`Unknown practice rule "${spec}"`);
  }
}
