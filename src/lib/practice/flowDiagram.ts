import { nodeLabel, nodeType, type PracticeNodeType } from "@/lib/practice/content";
import { edgeText, parseEdge, type PracticeEdge } from "@/lib/practice/flowRules";

/**
 * Geometry for the Modul Latihan flow diagrams: a top-to-bottom auto layout
 * (levels by BFS from the start node) where anything not reachable from the
 * start is pulled into a separate "Tidak tersambung ke alur utama" column,
 * so a floating node is impossible to miss. Recovery edges loop around the
 * outside of the main column. Pure maths — PracticeFlowDiagram renders it.
 */

const NW = 156;
const NH = 46;
const DW = 170;
const DH = 62;
const CG = 184;
const RG = 96;
const PAD = 34;

export type DiagramEdgeKind = "D" | "Y" | "N" | "R";

export interface DiagramNode {
  id: string;
  label: string;
  type: PracticeNodeType;
  /** Uppercase caption under the label (none for decisions, which are diamonds). */
  typeName: string;
  floating: boolean;
  cx: number;
  cy: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  w: number;
  h: number;
}

export interface DiagramEdge {
  key: string;
  kind: DiagramEdgeKind;
  d: string;
  /** Recovery paths that have to enter from above are drawn as rounded right-angle polylines. */
  orthogonal: boolean;
  label: { x: number; y: number; text: string } | null;
}

export interface PracticeDiagram {
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  floatCaption: { x: number; y: number } | null;
  ariaLabel: string;
}

const TYPE_NAME: Record<PracticeNodeType, string> = {
  screen: "LAYAR",
  system: "SISTEM",
  outcome: "HASIL",
  error: "GAGAL",
  decision: "KEPUTUSAN",
};

interface Box {
  cx: number;
  top: number;
  w: number;
  h: number;
  cy: number;
  bottom: number;
  left: number;
  right: number;
}

function layout(nodes: string[], edges: PracticeEdge[], start: string) {
  const flowEdges = edges.filter((e) => e.k !== "R");
  const level = new Map<string, number>();
  const floating = new Set<string>();
  const order: string[] = [];
  let floatBase = 0;

  const bfs = (root: string, isFloat: boolean) => {
    level.set(root, isFloat ? floatBase : 0);
    order.push(root);
    if (isFloat) floating.add(root);
    const queue = [root];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of flowEdges) {
        if (e.f !== cur || level.has(e.t)) continue;
        if (isFloat && !nodes.includes(e.t)) continue;
        level.set(e.t, level.get(cur)! + 1);
        order.push(e.t);
        if (isFloat) floating.add(e.t);
        queue.push(e.t);
      }
    }
  };

  if (nodes.includes(start)) bfs(start, false);
  const rest = nodes.filter((n) => !level.has(n));
  // Roots of the floating fragments first (nodes nothing else in `rest` points into), so each fragment is laid out from its top.
  const hasParentInRest = (n: string) => flowEdges.some((e) => e.t === n && rest.includes(e.f));
  rest.sort((x, y) => Number(hasParentInRest(x)) - Number(hasParentInRest(y)));
  for (const n of rest) {
    if (level.has(n)) continue;
    bfs(n, true);
    floatBase = Math.max(...[...floating].map((x) => level.get(x)!)) + 1;
  }

  const rows = (include: (n: string) => boolean) => {
    const r: string[][] = [];
    for (const n of order) {
      if (!include(n)) continue;
      const lv = level.get(n)!;
      (r[lv] = r[lv] || []).push(n);
    }
    return r.map((x) => x || []);
  };
  const mainRows = rows((n) => !floating.has(n));
  const floatRows = rows((n) => floating.has(n));
  const hasRecovery = edges.some((e) => e.k === "R");
  const gutter = hasRecovery ? 64 : 0;
  const mainCols = Math.max(1, ...mainRows.map((r) => r.length));
  const mainW = mainCols * CG;
  const floatCols = Math.max(0, ...floatRows.map((r) => r.length));
  const floatX0 = gutter + PAD + mainW + (hasRecovery ? 80 : 36);

  const pos = new Map<string, Box>();
  const place = (n: string, cx: number, top: number) => {
    const decision = nodeType(n) === "decision";
    const w = decision ? DW : NW;
    const h = decision ? DH : NH;
    pos.set(n, { cx, top, w, h, cy: top + h / 2, bottom: top + h, left: cx - w / 2, right: cx + w / 2 });
  };
  mainRows.forEach((row, lv) =>
    row.forEach((n, i) => place(n, gutter + PAD + (mainW - row.length * CG) / 2 + CG / 2 + i * CG, PAD + lv * RG))
  );
  floatRows.forEach((row, lv) => row.forEach((n, i) => place(n, floatX0 + CG / 2 + i * CG, PAD + lv * RG)));

  const levels = Math.max(mainRows.length, floatRows.length, 1);
  const width = floatCols ? floatX0 + floatCols * CG + PAD : gutter + PAD * 2 + mainW + (hasRecovery ? 80 : 0);
  const height = PAD + (levels - 1) * RG + DH + PAD;
  const mainNodes = nodes.filter((n) => !floating.has(n));
  const center = gutter + PAD + mainW / 2;
  const minLeft = Math.min(...mainNodes.map((n) => pos.get(n)!.left));
  const maxRight = Math.max(...mainNodes.map((n) => pos.get(n)!.right));
  return { pos, width, height, floating, floatX0, center, minLeft, maxRight };
}

interface Pt {
  x: number;
  y: number;
}

function bezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function buildPracticeDiagram(nodesIn: string[] | undefined, edgeKeys: string[], start: string): PracticeDiagram {
  const edges = edgeKeys.map(parseEdge);
  const nodes = [...new Set([...(nodesIn || []), ...edges.flatMap((e) => [e.f, e.t])])];
  const { pos, width, height, floating, floatX0, center, minLeft, maxRight } = layout(nodes, edges, start);
  // Only mark nodes as floating when there's also a main flow to be disconnected from.
  const showFloating = floating.size > 0 && floating.size < nodes.length;

  const topEntries = new Map<string, number>();
  const outEdges: DiagramEdge[] = [];
  for (const e of edges) {
    const a = pos.get(e.f)!;
    const b = pos.get(e.t)!;
    let p0: Pt, p1: Pt, p2: Pt, p3: Pt;
    if (e.k === "R") {
      const leftSide = a.cx < center - 1 && (b.cx < center - 1 || a.cx <= b.cx);
      const gx = leftSide ? Math.min(minLeft, a.left, b.left) - 48 : Math.max(maxRight, a.right, b.right) + 48;
      const sameRow = nodes.filter((n) => n !== e.t && !floating.has(n) && pos.get(n)!.top === b.top);
      const blocked = sameRow.some((n) => (leftSide ? pos.get(n)!.cx < b.cx : pos.get(n)!.cx > b.cx));
      if (blocked) {
        // Another node sits between the gutter and the target on its row, so drop in from above instead.
        const k = (topEntries.get(e.t) ?? 0) + 1;
        topEntries.set(e.t, k);
        const yT = b.top - 10 - (k - 1) * 8;
        const x1 = leftSide ? a.left : a.right;
        const tx = b.cx + (leftSide ? -1 : 1) * (30 + (k - 1) * 16);
        outEdges.push({
          key: e.key,
          kind: "R",
          d: `M${x1},${a.cy} H${gx} V${yT} H${tx} V${b.top - 2}`,
          orthogonal: true,
          label: null,
        });
        continue;
      }
      if (leftSide) {
        p0 = { x: a.left, y: a.cy };
        p1 = { x: gx, y: a.cy };
        p2 = { x: gx, y: b.cy };
        p3 = { x: b.left - 2, y: b.cy };
      } else {
        p0 = { x: a.right, y: a.cy };
        p1 = { x: gx, y: a.cy };
        p2 = { x: gx, y: b.cy };
        p3 = { x: b.right + 2, y: b.cy };
      }
    } else if (b.top > a.top) {
      const dy = (b.top - a.bottom) / 2;
      p0 = { x: a.cx, y: a.bottom };
      p1 = { x: a.cx, y: a.bottom + dy };
      p2 = { x: b.cx, y: b.top - dy };
      p3 = { x: b.cx, y: b.top - 2 };
    } else if (b.top === a.top) {
      const right = b.cx > a.cx;
      p0 = { x: right ? a.right : a.left, y: a.cy };
      p3 = { x: right ? b.left - 2 : b.right + 2, y: b.cy };
      p1 = { x: (p0.x + p3.x) / 2, y: a.cy - 26 };
      p2 = { x: (p0.x + p3.x) / 2, y: b.cy - 26 };
    } else {
      const cx = Math.min(a.left, b.left) - 56;
      p0 = { x: a.left, y: a.cy };
      p1 = { x: cx, y: a.cy };
      p2 = { x: cx, y: b.cy };
      p3 = { x: b.left - 2, y: b.cy };
    }
    const kind: DiagramEdgeKind = e.k || "D";
    let label: DiagramEdge["label"] = null;
    if (e.k === "Y" || e.k === "N") {
      const pt = bezierPoint(p0, p1, p2, p3, 0.32);
      label = { x: pt.x + 7, y: pt.y + 4, text: e.k === "Y" ? "Ya" : "Tidak" };
    }
    outEdges.push({
      key: e.key,
      kind,
      d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
      orthogonal: false,
      label,
    });
  }

  const outNodes: DiagramNode[] = nodes.map((n) => {
    const p = pos.get(n)!;
    const type = nodeType(n) ?? "screen";
    return {
      id: n,
      label: nodeLabel(n),
      type,
      typeName: TYPE_NAME[type],
      floating: showFloating && floating.has(n),
      ...p,
    };
  });

  return {
    width,
    height,
    nodes: outNodes,
    edges: outEdges,
    floatCaption: showFloating ? { x: floatX0 + 8, y: PAD - 14 } : null,
    ariaLabel: "Diagram flow: " + edges.map(edgeText).join(", "),
  };
}
