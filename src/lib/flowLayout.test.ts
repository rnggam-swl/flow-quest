import { describe, expect, it } from "vitest";
import { autoLayout } from "./flowLayout";

const SIZE = { w: 168, h: 58 };

function levelsOf(positions: Record<string, { x: number; y: number }>, axis: "x" | "y") {
  const sorted = [...new Set(Object.values(positions).map((p) => p[axis]))].sort((a, b) => a - b);
  return Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, sorted.indexOf(p[axis])]));
}

describe("autoLayout", () => {
  const nodes = [{ id: "reg" }, { id: "decision" }, { id: "success" }, { id: "error" }];
  const happyPath = [
    { sourceNodeId: "reg", targetNodeId: "decision" },
    { sourceNodeId: "decision", targetNodeId: "success" },
    { sourceNodeId: "decision", targetNodeId: "error" },
  ];

  it("layers an acyclic flow by depth from its root", () => {
    const levels = levelsOf(autoLayout(nodes, happyPath, "vertical", SIZE), "y");
    expect(levels).toEqual({ reg: 0, decision: 1, success: 2, error: 2 });
  });

  it("lays the main axis out rightward when horizontal", () => {
    const positions = autoLayout(nodes, happyPath, "horizontal", SIZE);
    expect(levelsOf(positions, "x")).toEqual({ reg: 0, decision: 1, success: 2, error: 2 });
    // Siblings on the same level are separated along the cross axis instead.
    expect(positions.success.y).not.toBe(positions.error.y);
  });

  it("keeps the entry point on top when a recovery edge closes a cycle", () => {
    // Error -> Registration Form is the recovery edge quests 3-5 reward, which
    // leaves every node with an incoming edge.
    const withRecovery = [...happyPath, { sourceNodeId: "error", targetNodeId: "reg" }];
    const levels = levelsOf(autoLayout(nodes, withRecovery, "vertical", SIZE), "y");
    expect(levels).toEqual({ reg: 0, decision: 1, success: 2, error: 2 });
  });

  it("still places every node when the whole graph is one cycle", () => {
    const ring = [
      { sourceNodeId: "a", targetNodeId: "b" },
      { sourceNodeId: "b", targetNodeId: "c" },
      { sourceNodeId: "c", targetNodeId: "a" },
    ];
    const positions = autoLayout([{ id: "a" }, { id: "b" }, { id: "c" }], ring, "vertical", SIZE);
    expect(Object.keys(positions).sort()).toEqual(["a", "b", "c"]);
    expect(levelsOf(positions, "y")).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("places unconnected nodes side by side on the first level", () => {
    const positions = autoLayout([{ id: "a" }, { id: "b" }], [], "vertical", SIZE);
    expect(positions.a.y).toBe(positions.b.y);
    expect(positions.a.x).not.toBe(positions.b.x);
  });
});
