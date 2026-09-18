import { describe, it, expect } from "vitest";
import {
  runFlowValidation,
  runQuest3Validation,
  runQuest4Validation,
  deriveTierFromScores,
  deriveGenericTier,
  computeRationaleScore,
  orderNodesForDisplay,
  type ScoringNode,
  type ScoringConnection,
  type ConnectionKind,
} from "./flowScoring";

let idCounter = 0;
function node(label: string): ScoringNode & { createdAt: Date } {
  idCounter += 1;
  return { id: `n${idCounter}`, label, createdAt: new Date(idCounter * 1000) };
}
function edge(from: ScoringNode, to: ScoringNode, connectionType: ConnectionKind = "DEFAULT"): ScoringConnection {
  return { sourceNodeId: from.id, targetNodeId: to.id, connectionType };
}

describe("runFlowValidation (Quest 2 / Quest 5 rubric)", () => {
  it("scores an empty flow as needs-work, with the rubric's non-zero baselines (logic/edge/simplicity)", () => {
    const result = runFlowValidation([], []);
    expect(result.tier).toBe("needs-work");
    expect(result.goalScore).toBe(0);
    expect(result.flowScore).toBe(0);
    expect(result.constraintScore).toBe(0);
    // logic/edgeCase/simplicity all have non-zero "nothing attempted" baselines by design.
    expect(result.totalScore).toBe(25);
  });

  it("rewards the full happy path + club list bridge + error branch as great", () => {
    const home = node("Home");
    const list = node("Club List");
    const detail = node("Club Detail");
    const form = node("Registration Form");
    const success = node("Success");
    const error = node("Error");
    const nodes = [home, list, detail, form, success, error];
    const connections = [
      edge(home, list),
      edge(list, detail),
      edge(detail, form),
      edge(form, success),
      edge(form, error),
    ];

    const result = runFlowValidation(nodes, connections);
    expect(result.tier).toBe("great");
    expect(result.goalScore).toBe(20);
    expect(result.flowScore).toBe(25);
    expect(result.logicScore).toBe(20);
    expect(result.edgeCaseScore).toBe(15);
    expect(result.constraintScore).toBe(0); // no Decision node in this quest
  });

  it("marks 'almost' when the core chain is complete but Club List isn't bridged", () => {
    const home = node("Home");
    const detail = node("Club Detail");
    const form = node("Registration Form");
    const success = node("Success");
    const nodes = [home, detail, form, success];
    const connections = [edge(home, detail), edge(detail, form), edge(form, success)];

    const result = runFlowValidation(nodes, connections);
    expect(result.tier).toBe("almost");
    expect(result.flowScore).toBe(25);
    expect(result.logicScore).toBe(12); // no Club List node at all
  });

  it("marks 'good' when the chain + list bridge are done but no error branch", () => {
    const home = node("Home");
    const list = node("Club List");
    const detail = node("Club Detail");
    const form = node("Registration Form");
    const success = node("Success");
    const nodes = [home, list, detail, form, success];
    const connections = [edge(home, list), edge(list, detail), edge(detail, form), edge(form, success)];

    const result = runFlowValidation(nodes, connections);
    expect(result.tier).toBe("good");
  });

  it("penalizes orphan nodes in simplicityScore, floored at 4", () => {
    const home = node("Home");
    const form = node("Registration Form");
    const success = node("Success");
    const orphan1 = node("Confirmation");
    const orphan2 = node("Error");
    const nodes = [home, form, success, orphan1, orphan2];
    // All 5 nodes are unconnected orphans here; we only care about the
    // simplicityScore formula (10 - orphanCount, floored at 4), not the tier.
    const result = runFlowValidation(nodes, []);
    expect(result.simplicityScore).toBe(5); // 10 - 5 orphans
  });

  it("never drops simplicityScore below the floor of 4 even with many orphans", () => {
    const nodes = Array.from({ length: 10 }, () => node("Home"));
    const result = runFlowValidation(nodes, []);
    expect(result.simplicityScore).toBe(4);
  });

  it("awards the Decision bonus (constraintScore) only when a Verifikasi NIS node is present", () => {
    const home = node("Home");
    const list = node("Club List");
    const detail = node("Club Detail");
    const form = node("Registration Form");
    const success = node("Success");
    const error = node("Error");
    const decision = node("Verifikasi NIS");
    const nodes = [home, list, detail, form, success, error, decision];
    const connections = [
      edge(home, list),
      edge(list, detail),
      edge(detail, form),
      edge(form, success),
      edge(form, error),
      edge(form, decision),
      edge(decision, success, "YES"),
      edge(decision, error, "NO"),
    ];

    const result = runFlowValidation(nodes, connections);
    expect(result.constraintScore).toBe(20);
  });

  it("gives partial Decision-bonus credit when only one branch is correct", () => {
    const decision = node("Verifikasi NIS");
    const success = node("Success");
    const nodes = [decision, success];
    const connections = [edge(decision, success, "YES")]; // NO branch missing entirely
    const result = runFlowValidation(nodes, connections);
    expect(result.constraintScore).toBe(10);
  });
});

describe("deriveTierFromScores matches runFlowValidation's own tier exactly (Quest 2 & 5)", () => {
  const scenarios: { name: string; nodes: ScoringNode[]; connections: ScoringConnection[] }[] = [
    { name: "empty", nodes: [], connections: [] },
    {
      name: "full great path",
      ...(() => {
        const home = node("Home");
        const list = node("Club List");
        const detail = node("Club Detail");
        const form = node("Registration Form");
        const success = node("Success");
        const error = node("Error");
        return {
          nodes: [home, list, detail, form, success, error],
          connections: [edge(home, list), edge(list, detail), edge(detail, form), edge(form, success), edge(form, error)],
        };
      })(),
    },
    {
      name: "good tier (no error branch)",
      ...(() => {
        const home = node("Home");
        const list = node("Club List");
        const detail = node("Club Detail");
        const form = node("Registration Form");
        const success = node("Success");
        return {
          nodes: [home, list, detail, form, success],
          connections: [edge(home, list), edge(list, detail), edge(detail, form), edge(form, success)],
        };
      })(),
    },
    {
      name: "almost tier (no list bridge)",
      ...(() => {
        const home = node("Home");
        const detail = node("Club Detail");
        const form = node("Registration Form");
        const success = node("Success");
        return {
          nodes: [home, detail, form, success],
          connections: [edge(home, detail), edge(detail, form), edge(form, success)],
        };
      })(),
    },
  ];

  it.each(scenarios)("$name", ({ nodes, connections }) => {
    const original = runFlowValidation(nodes, connections);
    const rederived = deriveTierFromScores(original);
    expect(rederived.tier).toBe(original.tier);
    expect(rederived.message).toBe(original.message.replace(/ Verifikasi NIS.*$/, ""));
  });
});

describe("runQuest3Validation (Decision node branching)", () => {
  it("is needs-work with no decision node at all", () => {
    const result = runQuest3Validation([], []);
    expect(result.tier).toBe("needs-work");
    expect(result.goalScore).toBe(0);
    expect(result.flowScore).toBe(0);
    expect(result.logicScore).toBe(0);
    expect(result.constraintScore).toBe(0);
    expect(result.edgeCaseScore).toBe(0);
  });

  it("is great when both branches are wired correctly plus a recovery loop", () => {
    const form = node("Registration Form");
    const decision = node("Verifikasi NIS");
    const success = node("Success");
    const error = node("Error");
    const nodes = [form, decision, success, error];
    const connections = [
      edge(form, decision),
      edge(decision, success, "YES"),
      edge(decision, error, "NO"),
      edge(error, form, "RECOVERY"),
    ];
    const result = runQuest3Validation(nodes, connections);
    expect(result.tier).toBe("great");
    // goal 20 + flow 20 + logic 20 + constraint 20 + edgeCase 5 + simplicity 5 (no orphans)
    expect(result.totalScore).toBe(90);
  });

  it("is almost when only the YES branch is correct", () => {
    const form = node("Registration Form");
    const decision = node("Verifikasi NIS");
    const success = node("Success");
    const nodes = [form, decision, success];
    const connections = [edge(form, decision), edge(decision, success, "YES")];
    const result = runQuest3Validation(nodes, connections);
    expect(result.tier).toBe("almost");
    expect(result.logicScore).toBe(20);
    expect(result.constraintScore).toBe(0);
  });

  it("treats a YES edge pointed at Error as not satisfying the YES->Success requirement", () => {
    const form = node("Registration Form");
    const decision = node("Verifikasi NIS");
    const error = node("Error");
    const nodes = [form, decision, error];
    const connections = [edge(form, decision), edge(decision, error, "YES")];
    const result = runQuest3Validation(nodes, connections);
    expect(result.logicScore).toBe(0);
  });
});

describe("runQuest4Validation (happy path + disruption + recovery)", () => {
  it("is needs-work when the happy path is incomplete", () => {
    const result = runQuest4Validation([], []);
    expect(result.tier).toBe("needs-work");
  });

  it("is great with full happy path, disruption, and recovery", () => {
    const form = node("Registration Form");
    const confirm = node("Confirmation");
    const success = node("Success");
    const error = node("Error");
    const nodes = [form, confirm, success, error];
    const connections = [
      edge(form, confirm),
      edge(confirm, success),
      edge(confirm, error),
      edge(error, form, "RECOVERY"),
    ];
    const result = runQuest4Validation(nodes, connections);
    expect(result.tier).toBe("great");
    expect(result.constraintScore).toBe(20);
  });

  it("penalizes skipping Confirmation with a direct Registration Form -> Success edge", () => {
    const form = node("Registration Form");
    const confirm = node("Confirmation");
    const success = node("Success");
    const nodes = [form, confirm, success];
    const connections = [edge(form, confirm), edge(confirm, success), edge(form, success)];
    const result = runQuest4Validation(nodes, connections);
    expect(result.edgeCaseScore).toBe(0);
  });

  it("does not award recovery credit for a RECOVERY edge that doesn't go from Error to Registration Form", () => {
    const form = node("Registration Form");
    const confirm = node("Confirmation");
    const success = node("Success");
    const error = node("Error");
    const nodes = [form, confirm, success, error];
    const connections = [
      edge(form, confirm),
      edge(confirm, success),
      edge(confirm, error),
      edge(error, confirm, "RECOVERY"), // wrong target
    ];
    const result = runQuest4Validation(nodes, connections);
    expect(result.constraintScore).toBe(0);
  });
});

describe("deriveGenericTier matches runQuest3Validation/runQuest4Validation exactly", () => {
  it("Quest 3: matches for every tier along the progression", () => {
    const form = node("Registration Form");
    const decision = node("Verifikasi NIS");
    const success = node("Success");
    const error = node("Error");

    const progressions: [ScoringNode[], ScoringConnection[]][] = [
      [[], []],
      [[form, decision], [edge(form, decision)]],
      [[form, decision, success], [edge(form, decision), edge(decision, success, "YES")]],
      [
        [form, decision, success, error],
        [edge(form, decision), edge(decision, success, "YES"), edge(decision, error, "NO")],
      ],
      [
        [form, decision, success, error],
        [
          edge(form, decision),
          edge(decision, success, "YES"),
          edge(decision, error, "NO"),
          edge(error, form, "RECOVERY"),
        ],
      ],
    ];

    for (const [nodes, connections] of progressions) {
      const original = runQuest3Validation(nodes, connections);
      const rederived = deriveGenericTier(original, 3);
      expect(rederived.tier).toBe(original.tier);
    }
  });

  it("Quest 4: matches for every tier along the progression", () => {
    const form = node("Registration Form");
    const confirm = node("Confirmation");
    const success = node("Success");
    const error = node("Error");

    const progressions: [ScoringNode[], ScoringConnection[]][] = [
      [[], []],
      [[form, confirm, success], [edge(form, confirm), edge(confirm, success)]],
      [
        [form, confirm, success, error],
        [edge(form, confirm), edge(confirm, success), edge(confirm, error)],
      ],
      [
        [form, confirm, success, error],
        [edge(form, confirm), edge(confirm, success), edge(confirm, error), edge(error, form, "RECOVERY")],
      ],
    ];

    for (const [nodes, connections] of progressions) {
      const original = runQuest4Validation(nodes, connections);
      const rederived = deriveGenericTier(original, 4);
      expect(rederived.tier).toBe(original.tier);
    }
  });
});

describe("computeRationaleScore", () => {
  it.each([
    ["", 0],
    ["   ", 0],
    ["short", 5],
    ["a".repeat(19), 5],
    ["a".repeat(20), 8],
    ["a".repeat(59), 8],
    ["a".repeat(60), 10],
    ["a".repeat(200), 10],
  ])("computeRationaleScore(%j) === %d", (text, expected) => {
    expect(computeRationaleScore(text)).toBe(expected);
  });
});

describe("orderNodesForDisplay", () => {
  it("orders a simple chain from root to leaf", () => {
    const a = node("A");
    const b = node("B");
    const c = node("C");
    const ordered = orderNodesForDisplay([c, a, b], [edge(a, b), edge(b, c)]);
    expect(ordered.map((n) => n.label)).toEqual(["A", "B", "C"]);
  });

  it("falls back to creation order for nodes involved in a cycle", () => {
    const a = node("A");
    const b = node("B");
    const ordered = orderNodesForDisplay([b, a], [edge(a, b), edge(b, a)]);
    // Every node has in-degree > 0 (cycle), so both land in the creation-order fallback.
    expect(ordered.map((n) => n.label)).toEqual(["A", "B"]);
  });

  it("places a true orphan node after the connected chain, in creation order", () => {
    const a = node("A");
    const b = node("B");
    const orphan = node("Orphan");
    const ordered = orderNodesForDisplay([orphan, a, b], [edge(a, b)]);
    expect(ordered.map((n) => n.label)).toEqual(["A", "B", "Orphan"]);
  });
});
