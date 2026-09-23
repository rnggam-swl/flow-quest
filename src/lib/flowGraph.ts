import {
  autoLayout,
  nearestSide,
  pointsToPath,
  routeConnectionPoints,
  sidePoint,
  type Point,
  type RouteObstacle,
  type Side,
} from "@/lib/flowLayout";
import { QUEST5_NODE_LIBRARY, type ConnectionKind } from "@/lib/flowScoring";

/**
 * Geometry for the read-only replay of a flow a participant built, shared by
 * the admin pages (which render it as JSX) and the downloadable report (which
 * serialises it to an SVG string). Keeping the maths in one place means both
 * surfaces always draw the same diagram.
 */

export type FlowGraphViewMode = "VERTICAL" | "HORIZONTAL";

export interface FlowGraphNode {
  id: string;
  label: string;
  nodeType: string;
  positionX: number;
  positionY: number;
}

export interface FlowGraphConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  connectionType: string;
}

export const NODE_W = 168;
export const NODE_H = 58;
/** Room around the nodes for connector stubs, branch chips, and edges routed around the outside. */
const PAD = 52;
const OBSTACLE_PADDING = 6;
const STUB = 22;

export const EDGE_COLOR: Record<ConnectionKind, string> = {
  DEFAULT: "var(--teal)",
  YES: "var(--success)",
  NO: "var(--danger)",
  RECOVERY: "var(--gold)",
};

const EDGE_LABEL: Record<ConnectionKind, string | null> = {
  DEFAULT: null,
  YES: "Ya",
  NO: "Tidak",
  RECOVERY: "Pemulihan",
};

export const LEGEND_LABEL: Record<ConnectionKind, string> = {
  DEFAULT: "Alur biasa",
  YES: "Cabang Ya",
  NO: "Cabang Tidak",
  RECOVERY: "Jalur pemulihan",
};

const CONNECTION_KINDS: ConnectionKind[] = ["DEFAULT", "YES", "NO", "RECOVERY"];

function asConnectionKind(value: string): ConnectionKind {
  return (CONNECTION_KINDS as string[]).includes(value) ? (value as ConnectionKind) : "DEFAULT";
}

export interface PlacedNode {
  id: string;
  label: string;
  nodeType: string;
  icon: string;
  decision: boolean;
  x: number;
  y: number;
}

export interface GraphChip {
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  ty: number;
  text: string;
}

export interface GraphEdge {
  id: string;
  kind: ConnectionKind;
  points: Point[];
  chip: GraphChip | null;
}

export interface BuiltFlowGraph {
  placed: PlacedNode[];
  edges: GraphEdge[];
  vx0: number;
  vy0: number;
  width: number;
  height: number;
  usedKinds: ConnectionKind[];
}

/**
 * Mirrors `resolveConnectionPorts` in FlowBuilderCanvas: a decision node's two
 * outputs leave from structurally fixed spots (so Ya/Tidak are never
 * ambiguous), and everything else exits the way the live canvas would on a
 * fresh load — the manually-dragged sides and hand-adjusted bends are UI-only
 * state that never reached the database, so re-deriving them here matches what
 * the participant saw whenever they reopened their own flow.
 */
function resolvePorts(kind: ConnectionKind, from: PlacedNode, to: PlacedNode, horizontal: boolean) {
  const fromBox = { x: from.x, y: from.y, w: NODE_W, h: NODE_H };
  const toBox = { x: to.x, y: to.y, w: NODE_W, h: NODE_H };
  const fromCenter = { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 };
  const toCenter = { x: to.x + NODE_W / 2, y: to.y + NODE_H / 2 };

  let fromSide: Side;
  let fromPort: Point;
  if (from.decision) {
    if (horizontal) {
      fromSide = kind === "NO" ? "bottom" : "right";
      fromPort = sidePoint(fromBox, fromSide);
    } else {
      fromSide = "bottom";
      fromPort = { x: from.x + NODE_W * (kind === "NO" ? 0.65 : 0.35), y: from.y + NODE_H };
    }
  } else if (horizontal) {
    fromSide = nearestSide(toCenter.x, toCenter.y, fromBox);
    fromPort = sidePoint(fromBox, fromSide);
  } else {
    fromSide = "bottom";
    fromPort = { x: from.x + NODE_W / 2, y: from.y + NODE_H };
  }

  const toSide = nearestSide(fromCenter.x, fromCenter.y, toBox);
  return { fromPort, fromSide, toPort: sidePoint(toBox, toSide), toSide };
}

/**
 * Places a branch chip in the free space next to its source port: clear of the
 * node it leaves (the chip is pushed fully to the outward side, never
 * straddling the node's edge) and clear of the connector itself, so the chip
 * hides neither the node nor the line it names.
 */
function chipPlacement(port: Point, side: Side, text: string) {
  const w = text.length * 5.6 + 12;
  const h = 15;
  const gap = 8;
  let x: number;
  let y: number;
  if (side === "right") {
    x = port.x + gap;
    y = port.y - h - 4;
  } else if (side === "left") {
    x = port.x - gap - w;
    y = port.y - h - 4;
  } else if (side === "bottom") {
    x = port.x - w - 5;
    y = port.y + gap;
  } else {
    x = port.x - w - 5;
    y = port.y - gap - h;
  }
  return { x, y, w, h, tx: x + w / 2, ty: y + h / 2 + 3.4 };
}

/**
 * Lays out one flow for display. `viewMode` is the orientation to draw in and
 * `nativeViewMode` the one the participant built in — when they differ, the
 * saved coordinates don't describe the requested orientation, so the same
 * `autoLayout` pass the participant's own canvas runs on a toggle is applied
 * first. Returns null for an empty flow.
 */
export function buildFlowGraph(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  viewMode: FlowGraphViewMode,
  nativeViewMode: FlowGraphViewMode
): BuiltFlowGraph | null {
  if (nodes.length === 0) return null;
  const horizontal = viewMode === "HORIZONTAL";

  const relaid =
    viewMode === nativeViewMode
      ? null
      : autoLayout(
          nodes.map((n) => ({ id: n.id })),
          connections,
          horizontal ? "horizontal" : "vertical",
          { w: NODE_W, h: NODE_H }
        );

  const raw = nodes.map((n) => ({ node: n, pos: relaid?.[n.id] ?? { x: n.positionX, y: n.positionY } }));
  const minX = Math.min(...raw.map((r) => r.pos.x));
  const minY = Math.min(...raw.map((r) => r.pos.y));

  const placed: PlacedNode[] = raw.map(({ node, pos }) => {
    const def = QUEST5_NODE_LIBRARY.find((d) => d.label === node.label);
    return {
      id: node.id,
      label: node.label,
      nodeType: node.nodeType,
      icon: def?.icon ?? "📄",
      decision: def?.decision ?? node.nodeType === "DECISION",
      x: pos.x - minX + PAD,
      y: pos.y - minY + PAD,
    };
  });
  const byId = new Map(placed.map((n) => [n.id, n]));

  const canvasW = Math.max(...placed.map((n) => n.x + NODE_W)) + PAD;
  const canvasH = Math.max(...placed.map((n) => n.y + NODE_H)) + PAD;
  const obstacles: RouteObstacle[] = placed.map((n) => ({
    id: n.id,
    x: n.x - OBSTACLE_PADDING,
    y: n.y - OBSTACLE_PADDING,
    w: NODE_W + OBSTACLE_PADDING * 2,
    h: NODE_H + OBSTACLE_PADDING * 2,
  }));

  const seen = new Set<string>();
  const edges = connections.flatMap((c): GraphEdge[] => {
    const from = byId.get(c.sourceNodeId);
    const to = byId.get(c.targetNodeId);
    if (!from || !to || from.id === to.id) return [];
    const kind = asConnectionKind(c.connectionType);
    // One line per distinct wiring: a repeat of the same source/target/branch carries no extra
    // information and would just render as a second stroke on top of the first one.
    const key = `${c.sourceNodeId}:${c.targetNodeId}:${kind}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const { fromPort, fromSide, toPort, toSide } = resolvePorts(kind, from, to, horizontal);
    const points = routeConnectionPoints(fromPort, fromSide, toPort, toSide, obstacles, { w: canvasW, h: canvasH }, STUB);
    const labelText = EDGE_LABEL[kind];
    return [
      {
        id: c.id,
        kind,
        points,
        chip: labelText ? { ...chipPlacement(fromPort, fromSide, labelText), text: labelText } : null,
      },
    ];
  });

  // Connectors may legitimately leave the nodes' own bounding box (a "Tidak"
  // branch looping back around its decision node, for instance), so the
  // viewBox is widened to whatever was actually drawn.
  let vx0 = 0;
  let vy0 = 0;
  let vx1 = canvasW;
  let vy1 = canvasH;
  for (const e of edges) {
    for (const p of e.points) {
      vx0 = Math.min(vx0, p.x - 12);
      vy0 = Math.min(vy0, p.y - 12);
      vx1 = Math.max(vx1, p.x + 12);
      vy1 = Math.max(vy1, p.y + 12);
    }
    if (e.chip) {
      vx0 = Math.min(vx0, e.chip.x - 4);
      vy0 = Math.min(vy0, e.chip.y - 4);
      vx1 = Math.max(vx1, e.chip.x + e.chip.w + 4);
      vy1 = Math.max(vy1, e.chip.y + e.chip.h + 4);
    }
  }

  return {
    placed,
    edges,
    vx0,
    vy0,
    width: vx1 - vx0,
    height: vy1 - vy0,
    usedKinds: CONNECTION_KINDS.filter((k) => edges.some((e) => e.kind === k)),
  };
}

export { pointsToPath };

/**
 * Escapes text for inclusion in the serialised SVG. Node labels are written by
 * participants (the create-node endpoint accepts any string up to 60 chars),
 * and the downloaded report is a real HTML file an admin opens in their own
 * browser, so this is the boundary that keeps a crafted label from becoming
 * markup in that file.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Serialises a built graph to a standalone `<svg>` string for the downloadable report. */
export function flowGraphToSvg(graph: BuiltFlowGraph, idPrefix: string): string {
  const markers = graph.usedKinds
    .map(
      (k) =>
        `<marker id="${escapeHtml(idPrefix)}-arrow-${k}" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" fill="${EDGE_COLOR[k]}" /></marker>`
    )
    .join("");

  const edges = graph.edges
    .map((e) => {
      const line = `<path d="${pointsToPath(e.points)}" stroke="${EDGE_COLOR[e.kind]}" stroke-width="2" fill="none" marker-end="url(#${escapeHtml(idPrefix)}-arrow-${e.kind})" />`;
      if (!e.chip) return line;
      const chip =
        `<rect x="${e.chip.x}" y="${e.chip.y}" width="${e.chip.w}" height="${e.chip.h}" rx="4" fill="var(--ink)" stroke="${EDGE_COLOR[e.kind]}" stroke-width="1" />` +
        `<text x="${e.chip.tx}" y="${e.chip.ty}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${EDGE_COLOR[e.kind]}">${escapeHtml(e.chip.text)}</text>`;
      return line + chip;
    })
    .join("");

  const nodes = graph.placed
    .map((n) => {
      const cx = n.x + NODE_W / 2;
      const cy = n.y + NODE_H / 2;
      if (n.decision) {
        return (
          `<polygon points="${cx},${n.y + 1} ${n.x + NODE_W - 1},${cy} ${cx},${n.y + NODE_H - 1} ${n.x + 1},${cy}" fill="var(--surface)" stroke="var(--gold)" stroke-width="1.5" />` +
          `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--text)">${escapeHtml(n.icon)} ${escapeHtml(n.label)}</text>`
        );
      }
      return (
        `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="var(--surface)" stroke="var(--border-light)" stroke-width="1.5" />` +
        `<text x="${n.x + 13}" y="${n.y + 25}" font-size="13">${escapeHtml(n.icon)}</text>` +
        `<text x="${n.x + 36}" y="${n.y + 25}" font-size="13" font-weight="600" fill="var(--text)">${escapeHtml(n.label)}</text>` +
        `<text x="${n.x + 36}" y="${n.y + 41}" font-size="9" letter-spacing="0.5" fill="var(--muted2)">${escapeHtml(n.nodeType)}</text>`
      );
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${graph.vx0} ${graph.vy0} ${graph.width} ${graph.height}" ` +
    `width="${graph.width}" height="${graph.height}" style="width:100%;max-width:${graph.width}px;height:auto" ` +
    `role="img" aria-label="Diagram flow yang disusun peserta">` +
    `<defs>${markers}</defs>${edges}${nodes}</svg>`
  );
}
