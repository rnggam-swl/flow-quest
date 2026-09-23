import { describe, expect, it } from "vitest";
import { buildFlowGraph, flowGraphToSvg, type FlowGraphConnection, type FlowGraphNode } from "./flowGraph";

const nodes: FlowGraphNode[] = [
  { id: "a", label: "Registration Form", nodeType: "SCREEN", positionX: 40, positionY: 100 },
  { id: "b", label: "Verifikasi NIS", nodeType: "DECISION", positionX: 318, positionY: 100 },
  { id: "c", label: "Success", nodeType: "OUTCOME", positionX: 640, positionY: 40 },
  { id: "d", label: "Error", nodeType: "ERROR", positionX: 640, positionY: 260 },
];

const connections: FlowGraphConnection[] = [
  { id: "1", sourceNodeId: "a", targetNodeId: "b", connectionType: "DEFAULT" },
  { id: "2", sourceNodeId: "b", targetNodeId: "c", connectionType: "YES" },
  { id: "3", sourceNodeId: "b", targetNodeId: "d", connectionType: "NO" },
  { id: "4", sourceNodeId: "d", targetNodeId: "a", connectionType: "RECOVERY" },
];

describe("buildFlowGraph", () => {
  it("returns null for an empty flow", () => {
    expect(buildFlowGraph([], [], "HORIZONTAL", "HORIZONTAL")).toBeNull();
  });

  it("draws one line per distinct wiring and labels the branches it used", () => {
    const graph = buildFlowGraph(nodes, connections, "HORIZONTAL", "HORIZONTAL")!;
    expect(graph.edges).toHaveLength(4);
    expect(graph.usedKinds).toEqual(["DEFAULT", "YES", "NO", "RECOVERY"]);
    expect(graph.edges.filter((e) => e.chip).map((e) => e.chip!.text)).toEqual(["Ya", "Tidak", "Pemulihan"]);
  });

  it("drops a repeat of the same source, target and branch instead of stacking two strokes", () => {
    const duplicated = [...connections, { ...connections[3], id: "5" }];
    expect(buildFlowGraph(nodes, duplicated, "HORIZONTAL", "HORIZONTAL")!.edges).toHaveLength(4);
  });

  it("re-lays the flow out when asked for the orientation the participant did not build in", () => {
    const native = buildFlowGraph(nodes, connections, "HORIZONTAL", "HORIZONTAL")!;
    const flipped = buildFlowGraph(nodes, connections, "VERTICAL", "HORIZONTAL")!;
    // The saved coordinates are a wide, short canvas; the re-laid-out one runs downward instead.
    expect(native.width).toBeGreaterThan(native.height);
    expect(flipped.height).toBeGreaterThan(flipped.width);
  });

  it("ignores connections pointing at a node that is not in the flow", () => {
    const dangling = [...connections, { id: "6", sourceNodeId: "a", targetNodeId: "ghost", connectionType: "DEFAULT" }];
    expect(buildFlowGraph(nodes, dangling, "HORIZONTAL", "HORIZONTAL")!.edges).toHaveLength(4);
  });
});

describe("flowGraphToSvg", () => {
  it("escapes node labels, which participants control", () => {
    // The create-node endpoint accepts any string, and the export is an HTML
    // file an admin opens locally, so a label must never become markup there.
    const hostile: FlowGraphNode[] = [
      { id: "x", label: '</text><script>alert("xss")</script>', nodeType: "SCREEN", positionX: 0, positionY: 0 },
    ];
    const svg = flowGraphToSvg(buildFlowGraph(hostile, [], "HORIZONTAL", "HORIZONTAL")!, "t");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;/text&gt;&lt;script&gt;");
  });

  it("serialises every node and connector of the flow", () => {
    const svg = flowGraphToSvg(buildFlowGraph(nodes, connections, "HORIZONTAL", "HORIZONTAL")!, "q3");
    expect(svg.match(/<path /g)).toHaveLength(4);
    expect(svg).toContain("Verifikasi NIS");
    expect(svg).toContain('marker id="q3-arrow-YES"');
  });
});
