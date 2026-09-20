/** Geometry + routing helpers for the Flow Builder canvas's rigid-line rendering. */

export type Side = "top" | "right" | "bottom" | "left";

export const OPPOSITE_SIDE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const DIR: Record<Side, [number, number]> = {
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function sidePoint(box: Box, side: Side): Point {
  switch (side) {
    case "top":
      return { x: box.x + box.w / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case "left":
      return { x: box.x, y: box.y + box.h / 2 };
    case "right":
      return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}

/**
 * Picks whichever of a box's four sides a ray from its center toward (px, py)
 * would exit through first. Distances are normalized by the box's half-width
 * and half-height first, so a wide-but-short node (like our 168x58 cards)
 * doesn't get biased toward left/right just because it's wider than it is
 * tall — without that normalization, a point straight above the node can
 * still end up "closer" (in raw pixels) to the left/right edge midpoints.
 */
export function nearestSide(px: number, py: number, box: Box): Side {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const nx = (px - cx) / (box.w / 2 || 1);
  const ny = (py - cy) / (box.h / 2 || 1);
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? "right" : "left";
  return ny > 0 ? "bottom" : "top";
}

export function pointsToPath(points: Point[]): string {
  return "M " + points.map((p) => `${p.x},${p.y}`).join(" L ");
}

function simplifyCollinear(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Straight-line orthogonal join between two already-offset points, with at most one or two 90-degree bends. */
function elbowJoin(a: Point, dirA: [number, number], b: Point, dirB: [number, number]): Point[] {
  const horizA = dirA[0] !== 0;
  const horizB = dirB[0] !== 0;
  const points: Point[] = [a];

  if (Math.abs(a.x - b.x) >= 1 && Math.abs(a.y - b.y) >= 1) {
    if (horizA && horizB) {
      const midX = (a.x + b.x) / 2;
      points.push({ x: midX, y: a.y }, { x: midX, y: b.y });
    } else if (!horizA && !horizB) {
      const midY = (a.y + b.y) / 2;
      points.push({ x: a.x, y: midY }, { x: b.x, y: midY });
    } else if (horizA) {
      points.push({ x: b.x, y: a.y });
    } else {
      points.push({ x: a.x, y: b.y });
    }
  }

  points.push(b);
  return points;
}

/**
 * Cheap (non-avoiding) elbow connector between two node ports — used for the
 * live drag preview and as the fallback rendering for existing connections
 * while the user is actively dragging something else on the canvas, so the
 * expensive obstacle-avoiding search only runs once things settle.
 */
export function previewPath(fromPort: Point, fromSide: Side, toPort: Point, toSide: Side, stub = 22): string {
  const [dfx, dfy] = DIR[fromSide];
  const [dtx, dty] = DIR[toSide];
  const stubA: Point = { x: fromPort.x + dfx * stub, y: fromPort.y + dfy * stub };
  const stubB: Point = { x: toPort.x + dtx * stub, y: toPort.y + dty * stub };
  const mid = elbowJoin(stubA, DIR[fromSide], stubB, DIR[toSide]);
  return pointsToPath(simplifyCollinear([fromPort, ...mid, toPort]));
}

class MinHeap {
  private a: [number, number][] = [];

  push(priority: number, value: number) {
    this.a.push([priority, value]);
    let i = this.a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.a[parent][0] <= this.a[i][0]) break;
      [this.a[parent], this.a[i]] = [this.a[i], this.a[parent]];
      i = parent;
    }
  }

  pop(): [number, number] | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < this.a.length && this.a[l][0] < this.a[smallest][0]) smallest = l;
        if (r < this.a.length && this.a[r][0] < this.a[smallest][0]) smallest = r;
        if (smallest === i) break;
        [this.a[smallest], this.a[i]] = [this.a[i], this.a[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  get size() {
    return this.a.length;
  }
}

const CELL = 14;
const TURN_PENALTY = 4;
const MAX_CELLS = 40000;

function snap(v: number) {
  return Math.round(v / CELL);
}

/**
 * Grid-based A* search (4-directional moves, penalized turns) from `start`
 * to `end`, treating `obstacles` as impassable. Returns a simplified
 * axis-aligned polyline, or null if the grid is too large or no path exists
 * (caller should fall back to a direct elbow in that case).
 */
function astarRoute(start: Point, end: Point, obstacles: Box[], bounds: { minX: number; minY: number; maxX: number; maxY: number }): Point[] | null {
  const gx0 = snap(bounds.minX);
  const gy0 = snap(bounds.minY);
  const gx1 = snap(bounds.maxX);
  const gy1 = snap(bounds.maxY);
  const w = gx1 - gx0 + 1;
  const h = gy1 - gy0 + 1;
  if (w <= 0 || h <= 0 || w * h > MAX_CELLS) return null;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const idx = (cx: number, cy: number) => (cy - gy0) * w + (cx - gx0);

  const blocked = new Uint8Array(w * h);
  for (const b of obstacles) {
    const bx0 = clamp(snap(b.x), gx0, gx1);
    const by0 = clamp(snap(b.y), gy0, gy1);
    const bx1 = clamp(snap(b.x + b.w), gx0, gx1);
    const by1 = clamp(snap(b.y + b.h), gy0, gy1);
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0; cx <= bx1; cx++) blocked[idx(cx, cy)] = 1;
    }
  }

  const sx = clamp(snap(start.x), gx0, gx1);
  const sy = clamp(snap(start.y), gy0, gy1);
  const ex = clamp(snap(end.x), gx0, gx1);
  const ey = clamp(snap(end.y), gy0, gy1);
  const startKey = idx(sx, sy);
  const goalKey = idx(ex, ey);
  blocked[startKey] = 0;
  blocked[goalKey] = 0;

  const DIRS: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const gScore = new Float64Array(w * h).fill(Infinity);
  const cameFrom = new Int32Array(w * h).fill(-1);
  const cameDir = new Int8Array(w * h).fill(-1);
  gScore[startKey] = 0;

  const heuristic = (cx: number, cy: number) => Math.abs(cx - ex) + Math.abs(cy - ey);

  const heap = new MinHeap();
  heap.push(heuristic(sx, sy), startKey);
  let found = false;

  while (heap.size) {
    const [, cur] = heap.pop()!;
    if (cur === goalKey) {
      found = true;
      break;
    }
    const cx = gx0 + (cur % w);
    const cy = gy0 + Math.floor(cur / w);
    const curDir = cameDir[cur];
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < gx0 || nx > gx1 || ny < gy0 || ny > gy1) continue;
      const ni = idx(nx, ny);
      if (blocked[ni]) continue;
      const turnCost = curDir !== -1 && curDir !== d ? TURN_PENALTY : 0;
      const tentative = gScore[cur] + 1 + turnCost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        cameFrom[ni] = cur;
        cameDir[ni] = d;
        heap.push(tentative + heuristic(nx, ny), ni);
      }
    }
  }

  if (!found) return null;

  const cellPath: number[] = [goalKey];
  let c = goalKey;
  while (c !== startKey) {
    const prev = cameFrom[c];
    if (prev === -1) break;
    c = prev;
    cellPath.push(c);
  }
  cellPath.reverse();

  const pts = cellPath.map((ci) => ({ x: (gx0 + (ci % w)) * CELL, y: (gy0 + Math.floor(ci / w)) * CELL }));
  return simplifyCollinear(pts);
}

export interface RouteObstacle extends Box {
  id: string;
}

/**
 * Builds the full connector polyline between two node ports: a short
 * straight stub perpendicular to each node's edge, then an obstacle-avoiding
 * orthogonal path between the stubs (grid A*), falling back to a direct
 * elbow if the search space is too large or genuinely has no route.
 */
export function routeConnection(
  fromPort: Point,
  fromSide: Side,
  toPort: Point,
  toSide: Side,
  obstacles: RouteObstacle[],
  excludeIds: [string, string],
  canvasSize: { w: number; h: number },
  stub = 22
): string {
  const [dfx, dfy] = DIR[fromSide];
  const [dtx, dty] = DIR[toSide];
  const stubA: Point = { x: fromPort.x + dfx * stub, y: fromPort.y + dfy * stub };
  const stubB: Point = { x: toPort.x + dtx * stub, y: toPort.y + dty * stub };

  const relevant = obstacles.filter((o) => o.id !== excludeIds[0] && o.id !== excludeIds[1]);
  const bounds = {
    minX: Math.min(0, stubA.x, stubB.x) - 60,
    minY: Math.min(0, stubA.y, stubB.y) - 60,
    maxX: Math.max(canvasSize.w, stubA.x, stubB.x) + 60,
    maxY: Math.max(canvasSize.h, stubA.y, stubB.y) + 60,
  };

  const routed = astarRoute(stubA, stubB, relevant, bounds);
  const mid = routed ?? elbowJoin(stubA, DIR[fromSide], stubB, DIR[toSide]);
  mid[0] = stubA;
  mid[mid.length - 1] = stubB;

  return pointsToPath(simplifyCollinear([fromPort, ...mid, toPort]));
}

interface LayoutNode {
  id: string;
}
interface LayoutEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

/**
 * Assigns fresh x/y positions after a view-mode switch: nodes are layered by
 * longest-path depth from the flow's roots (nodes with no incoming edge),
 * then laid out level-by-level along the main axis (down for vertical,
 * rightward for horizontal), keeping each level's original relative order.
 * Nodes stuck in a cycle (never reach in-degree 0) fall back to level 0.
 */
export function autoLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  orientation: "vertical" | "horizontal",
  nodeSize: { w: number; h: number }
): Record<string, { x: number; y: number }> {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!idSet.has(e.sourceNodeId) || !idSet.has(e.targetNodeId)) continue;
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    indeg.set(e.targetNodeId, (indeg.get(e.targetNodeId) ?? 0) + 1);
  }

  const level = new Map(ids.map((id) => [id, 0]));
  const remaining = new Map(indeg);
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const visited = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const target of adj.get(id) ?? []) {
      level.set(target, Math.max(level.get(target)!, level.get(id)! + 1));
      remaining.set(target, remaining.get(target)! - 1);
      if (remaining.get(target) === 0 && !visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const lv = level.get(id)!;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(id);
  }

  const mainGap = orientation === "horizontal" ? nodeSize.w + 110 : nodeSize.h + 130;
  const crossGap = orientation === "horizontal" ? nodeSize.h + 70 : nodeSize.w + 50;
  const margin = 40;

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [lv, levelIds] of byLevel) {
    levelIds.forEach((id, i) => {
      const main = margin + lv * mainGap;
      const cross = margin + i * crossGap;
      positions[id] = orientation === "horizontal" ? { x: main, y: cross } : { x: cross, y: main };
    });
  }
  return positions;
}
