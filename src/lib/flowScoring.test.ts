import { describe, it, expect } from "vitest";
import { computeRationaleScore, orderNodesForDisplay, type ScoringConnection, type ScoringNode } from "./flowScoring";

let idCounter = 0;
function node(label: string): ScoringNode & { createdAt: Date } {
  idCounter += 1;
  return { id: `n${idCounter}`, label, createdAt: new Date(idCounter * 1000) };
}
function edge(from: ScoringNode, to: ScoringNode, connectionType: ScoringConnection["connectionType"] = "DEFAULT"): ScoringConnection {
  return { sourceNodeId: from.id, targetNodeId: to.id, connectionType };
}

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
