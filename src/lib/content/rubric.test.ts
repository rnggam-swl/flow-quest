import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { checkRules } from "@/lib/practice/flowRules";
import { nodeDictionary } from "@/lib/practice/nodes";
import type { FixerWidget } from "@/lib/practice/schema";
import { caseContentSchema } from "./case";
import { flowQuestionOf } from "./questHelpers";
import {
  EDGE_KINDS,
  evaluateCondition,
  findRubricProblems,
  flowRubricSchema,
  graphFromFlow,
  practiceRuleCondition,
  scoreFlow,
  type EdgeKind,
  type LibraryNode,
  type RubricGraph,
} from "./rubric";

const root = path.resolve(import.meta.dirname, "../../..");
const klub = caseContentSchema.parse(JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8")));
const golden = JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__/legacy-scoring.json"), "utf8"));

/** Small deterministic PRNG — must stay byte-for-byte the one the golden fixture was generated with. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Node = { id: string; label: string };
type Conn = { sourceNodeId: string; targetNodeId: string; connectionType: EdgeKind };

/**
 * A random flow from a quest's palette — sometimes from scratch, sometimes a
 * mutated near-ideal answer so every tier gets exercised. Labels repeat, a
 * stray off-palette label shows up now and then, and every connection kind is
 * fair game. The golden fixture was generated from exactly this function.
 */
function randomFlow(palette: string[], allLabels: string[], seed: number) {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const labels = [...palette];
  if (r() < 0.15) labels.push(pick(allLabels));
  const nodes: Node[] = [];
  const connections: Conn[] = [];
  const add = (label: string) => {
    const n = { id: `n${nodes.length}`, label };
    nodes.push(n);
    return n;
  };
  const link = (a: Node, b: Node, connectionType: EdgeKind) => connections.push({ sourceNodeId: a.id, targetNodeId: b.id, connectionType });
  if (r() < 0.5) {
    const byLabel = new Map(palette.map((l) => [l, add(l)]));
    const chain = palette.filter((l) => !["Error", "Verifikasi NIS", "Success"].includes(l));
    for (let i = 0; i + 1 < chain.length; i++) link(byLabel.get(chain[i])!, byLabel.get(chain[i + 1])!, "DEFAULT");
    const last = byLabel.get(chain[chain.length - 1]);
    const decision = byLabel.get("Verifikasi NIS");
    const success = byLabel.get("Success");
    const error = byLabel.get("Error");
    if (last && decision) {
      link(last, decision, "DEFAULT");
      if (success) link(decision, success, "YES");
      if (error) link(decision, error, "NO");
    } else if (last && success) {
      link(last, success, "DEFAULT");
      if (error) link(last, error, "DEFAULT");
    }
    const form = byLabel.get("Registration Form");
    if (error && form) link(error, form, "RECOVERY");
    for (let i = connections.length - 1; i >= 0; i--) if (r() < 0.25) connections.splice(i, 1);
    for (const c of connections) if (r() < 0.1) c.connectionType = pick(EDGE_KINDS);
  } else {
    const count = Math.floor(r() * 10);
    for (let i = 0; i < count; i++) add(pick(labels));
  }
  const extra = nodes.length ? Math.floor(r() * 8) : 0;
  for (let i = 0; i < extra; i++) link(pick(nodes), pick(nodes), pick(EDGE_KINDS));
  if (r() < 0.2 && nodes.length) add(pick(labels));
  return { nodes, connections };
}

describe("Klub Fotografi case file rubrics", () => {
  const keys = new Set(klub.nodes.map((n) => n.key));
  const flows = klub.quests.flatMap((q) => {
    const f = flowQuestionOf(q);
    return f ? [{ order: q.order, f }] : [];
  });

  it("are well-formed and only reference known checks and library nodes", () => {
    expect(flows.map((x) => x.order)).toEqual([2, 3, 4, 5]);
    for (const { order, f } of flows) {
      expect(findRubricProblems(f.rubric, keys), `quest ${order}`).toEqual([]);
      expect(f.palette.every((k) => keys.has(k)), `quest ${order} palette`).toBe(true);
    }
  });

  it("still match the frozen rubrics the legacy scoring was verified against", () => {
    for (const { order, f } of flows) expect(f.rubric, `quest ${order}`).toEqual(flowRubricSchema.parse(golden.quests[order].rubric));
  });
});

describe("rubric engine against the frozen legacy scoring", () => {
  const library: LibraryNode[] = golden.library;
  const allLabels = library.map((n) => n.label);
  for (const order of [2, 3, 4, 5]) {
    it(`quest ${order}: 1000 flows score, tier and message exactly as the hand-written validators did`, () => {
      const q = golden.quests[order];
      const rubric = flowRubricSchema.parse(q.rubric);
      const palette = q.palette.map((k: string) => library.find((n) => n.key === k)!.label);
      const tiers = new Set<string>();
      q.expected.forEach((row: [number, number, number, number, number, number, string, number], i: number) => {
        const flow = randomFlow(palette, allLabels, (i + 1) * 7919 + order);
        const r = scoreFlow(rubric, graphFromFlow(flow.nodes, flow.connections, library));
        const s = r.scores;
        expect([s.goal, s.flow, s.logic, s.constraint, s.edgeCase, s.simplicity, r.tier, r.message], `seed ${i + 1}`).toEqual([
          ...row.slice(0, 7),
          q.messages[row[7]],
        ]);
        tiers.add(r.tier);
      });
      expect([...tiers].sort()).toEqual(["almost", "good", "great", "needs-work"]);
    });
  }
});

describe("practice fixer rules as conditions", () => {
  const dict = nodeDictionary(klub.nodes);
  const fixers: { where: string; widget: FixerWidget }[] = [];
  for (const m of klub.modules) {
    for (const stage of ["coba", "latihan"] as const) {
      m[stage].forEach((w, i) => {
        if (w.type === "fixer") fixers.push({ where: `${m.key}.${stage}.${i}`, widget: w });
      });
    }
  }
  const example = JSON.parse(readFileSync(path.join(root, "prisma/practice-plans/example.json"), "utf8"));
  for (const plan of example.plans) {
    plan.main?.widgets.forEach((w: FixerWidget, i: number) => {
      if (w.type === "fixer") fixers.push({ where: `example.main.${i}`, widget: w });
    });
  }

  const practiceGraph = (w: FixerWidget, on: string[]): RubricGraph => {
    const edges = on.map((s) => {
      const [pair, k = ""] = s.split(":");
      const [from, to] = pair.split(">");
      return { from, to, kind: (k === "Y" ? "YES" : k === "N" ? "NO" : k === "R" ? "RECOVERY" : "DEFAULT") as EdgeKind };
    });
    const ids = [...new Set([...w.nodes, ...edges.flatMap((e) => [e.from, e.to])])];
    return { nodes: ids.map((id) => ({ id, key: id, type: dict.type(id) })), edges };
  };

  it("agree with flowRules.checkRules on every fixer, across many switch combinations", () => {
    expect(fixers.length).toBeGreaterThan(3);
    for (const { where, widget } of fixers) {
      const available = [...new Set([...widget.initial, ...(widget.extra ?? []), ...widget.solution])];
      const r = rng(available.length * 31 + widget.rules.length);
      const combos = [widget.initial, widget.solution, available, []];
      for (let i = 0; i < 300; i++) combos.push(available.filter(() => r() < 0.5));
      for (const on of combos) {
        const legacy = checkRules(widget.rules, widget.nodes, on, widget.start, dict).map((x) => x.pass);
        const graph = practiceGraph(widget, on);
        const mine = widget.rules.map((spec) => evaluateCondition(practiceRuleCondition(spec, widget.start), graph));
        expect(mine, `${where} with [${on.join(", ")}]`).toEqual(legacy);
      }
    }
  });
});

describe("rubric validation", () => {
  it("reports unknown checks, unknown nodes, and check cycles", () => {
    const rubric = flowRubricSchema.parse({
      checks: { a: { when: { check: "b" } }, b: { when: { check: "a" } } },
      scores: { goal: { max: 10, cases: [{ when: { all: [{ has: "ghost" }, { check: "missing" }] }, points: 10 }] } },
      tiers: [],
      otherwise: { tier: "good", message: "ok" },
    });
    const problems = findRubricProblems(rubric, new Set(["home"])).join("\n");
    expect(problems).toMatch(/check "missing"/);
    expect(problems).toMatch(/node "ghost"/);
    expect(problems).toMatch(/cycle/);
  });

  it("rejects malformed conditions", () => {
    expect(flowRubricSchema.safeParse({ scores: {}, tiers: [{ when: { has: "a", reach: {} }, tier: "good", message: "" }], otherwise: { tier: "good", message: "" } }).success).toBe(false);
    expect(flowRubricSchema.safeParse({ scores: { vibes: { max: 1, cases: [] } }, tiers: [], otherwise: { tier: "good", message: "" } }).success).toBe(false);
  });
});
