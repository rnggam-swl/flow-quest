import {
  nearestSide,
  offsetPoint,
  pointsToPath,
  routeConnectionPoints,
  sidePoint,
  type Point,
  type RouteObstacle,
  type Side,
} from "@/lib/flowLayout";
import { QUEST5_NODE_LIBRARY, type ConnectionKind } from "@/lib/flowScoring";

/**
 * Read-only replay of the graph a participant actually built on the Flow
 * Builder canvas, for the admin report pages. Nodes are drawn at their stored
 * positionX/positionY and connectors are routed with the same geometry helpers
 * the live canvas uses, so a branching flow (especially the "Verifikasi NIS"
 * decision node, whose two outcomes are invisible once the flow is flattened
 * into a single left-to-right chain) reads the same way here as it did for the
 * participant.
 *
 * Deliberately a plain Server Component built from SVG primitives — there is
 * nothing to interact with here, so the admin pages stay zero-JS, and every
 * connector is drawn once as a single one-way arrow (no doubled strokes, no
 * arrowhead on the source end) even when the same pair of nodes was wired
 * more than once with the same branch type.
 */

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

export type FlowGraphViewMode = "VERTICAL" | "HORIZONTAL";

const NODE_W = 168;
const NODE_H = 58;
/** Room around the nodes for connector stubs, branch chips, and edges routed around the outside. */
const PAD = 52;
const OBSTACLE_PADDING = 6;
const STUB = 22;

const EDGE_COLOR: Record<ConnectionKind, string> = {
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

const LEGEND_LABEL: Record<ConnectionKind, string> = {
  DEFAULT: "Alur biasa",
  YES: "Cabang Ya",
  NO: "Cabang Tidak",
  RECOVERY: "Jalur pemulihan",
};

const CONNECTION_KINDS: ConnectionKind[] = ["DEFAULT", "YES", "NO", "RECOVERY"];

function asConnectionKind(value: string): ConnectionKind {
  return (CONNECTION_KINDS as string[]).includes(value) ? (value as ConnectionKind) : "DEFAULT";
}

interface PlacedNode {
  id: string;
  label: string;
  nodeType: string;
  icon: string;
  decision: boolean;
  x: number;
  y: number;
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

export function FlowGraphView({
  nodes,
  connections,
  viewMode = "HORIZONTAL",
  idPrefix,
  maxHeight = 600,
}: {
  nodes: FlowGraphNode[];
  connections: FlowGraphConnection[];
  viewMode?: FlowGraphViewMode;
  /** Prefixes the SVG marker ids, so several graphs on one page don't share arrowhead definitions. */
  idPrefix: string;
  maxHeight?: number;
}) {
  if (nodes.length === 0) {
    return <p className="text-[13px] text-muted2">Belum ada node.</p>;
  }

  const horizontal = viewMode === "HORIZONTAL";
  const minX = Math.min(...nodes.map((n) => n.positionX));
  const minY = Math.min(...nodes.map((n) => n.positionY));

  const placed: PlacedNode[] = nodes.map((n) => {
    const def = QUEST5_NODE_LIBRARY.find((d) => d.label === n.label);
    return {
      id: n.id,
      label: n.label,
      nodeType: n.nodeType,
      icon: def?.icon ?? "📄",
      decision: def?.decision ?? n.nodeType === "DECISION",
      x: n.positionX - minX + PAD,
      y: n.positionY - minY + PAD,
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
  const edges = connections.flatMap((c) => {
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
  const width = vx1 - vx0;
  const height = vy1 - vy0;

  const usedKinds = CONNECTION_KINDS.filter((k) => edges.some((e) => e.kind === k));

  return (
    <div>
      <div className="overflow-auto rounded-[10px] border border-border-light bg-surface2" style={{ maxHeight }}>
        <svg
          viewBox={`${vx0} ${vy0} ${width} ${height}`}
          width={width}
          height={height}
          style={{ width: "100%", maxWidth: width, height: "auto" }}
          role="img"
          aria-label="Diagram flow yang disusun peserta"
        >
          <defs>
            {usedKinds.map((k) => (
              <marker
                key={k}
                id={`${idPrefix}-arrow-${k}`}
                markerWidth="9"
                markerHeight="9"
                refX="7"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 8 3.5, 0 7" fill={EDGE_COLOR[k]} />
              </marker>
            ))}
          </defs>

          {edges.map((e) => (
            <g key={e.id}>
              <path
                d={pointsToPath(e.points)}
                stroke={EDGE_COLOR[e.kind]}
                strokeWidth={2}
                fill="none"
                markerEnd={`url(#${idPrefix}-arrow-${e.kind})`}
              />
              {e.chip && (
                <>
                  <rect
                    x={e.chip.x}
                    y={e.chip.y}
                    width={e.chip.w}
                    height={e.chip.h}
                    rx={4}
                    fill="var(--ink)"
                    stroke={EDGE_COLOR[e.kind]}
                    strokeWidth={1}
                  />
                  <text
                    x={e.chip.tx}
                    y={e.chip.ty}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={600}
                    fill={EDGE_COLOR[e.kind]}
                  >
                    {e.chip.text}
                  </text>
                </>
              )}
            </g>
          ))}

          {placed.map((n) => {
            const cx = n.x + NODE_W / 2;
            const cy = n.y + NODE_H / 2;
            if (n.decision) {
              return (
                <g key={n.id}>
                  <polygon
                    points={`${cx},${n.y + 1} ${n.x + NODE_W - 1},${cy} ${cx},${n.y + NODE_H - 1} ${n.x + 1},${cy}`}
                    fill="var(--surface)"
                    stroke="var(--gold)"
                    strokeWidth={1.5}
                  />
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--text)">
                    {n.icon} {n.label}
                  </text>
                </g>
              );
            }
            return (
              <g key={n.id}>
                <rect
                  x={n.x}
                  y={n.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill="var(--surface)"
                  stroke="var(--border-light)"
                  strokeWidth={1.5}
                />
                <text x={n.x + 13} y={n.y + 25} fontSize={13}>
                  {n.icon}
                </text>
                <text x={n.x + 36} y={n.y + 25} fontSize={13} fontWeight={600} fill="var(--text)">
                  {n.label}
                </text>
                <text x={n.x + 36} y={n.y + 41} fontSize={9} letterSpacing={0.5} fill="var(--muted2)">
                  {n.nodeType}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {usedKinds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted2">
          {usedKinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: EDGE_COLOR[k] }} />
              {LEGEND_LABEL[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
