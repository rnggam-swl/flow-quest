"use client";

import { useMemo } from "react";
import {
  buildFlowGraph,
  pointsToPath,
  EDGE_COLOR,
  LEGEND_LABEL,
  NODE_W,
  NODE_H,
  type FlowGraphConnection,
  type FlowGraphNode,
  type FlowGraphViewMode,
} from "@/lib/flowGraph";
import { setAdminFlowViewMode, useAdminFlowViewMode } from "@/components/flowViewPreference";

/**
 * Read-only replay of the graph a participant actually built on the Flow
 * Builder canvas, for the admin report pages. Nodes are drawn at their stored
 * positionX/positionY and connectors are routed with the same geometry helpers
 * the live canvas uses, so a branching flow (especially the "Verifikasi NIS"
 * decision node, whose two outcomes are invisible once the flow is flattened
 * into a single left-to-right chain) reads the same way here as it did for the
 * participant.
 *
 * Every connector is drawn once as a single one-way arrow (no doubled
 * strokes, no arrowhead on the source end) even when the same pair of nodes
 * was wired more than once with the same branch type.
 *
 * Each diagram carries its own orientation toggle and remembers its own
 * choice, so a grader can leave, say, the Quest 3 decision flow vertical
 * while reading the rest horizontally.
 */

export type { FlowGraphNode, FlowGraphConnection, FlowGraphViewMode };

/** Pill toggle matching the participant canvas's own, scoped to one diagram. */
function FlowViewModeToggle({
  storageKey,
  nativeViewMode,
  mode,
}: {
  storageKey: string;
  nativeViewMode: FlowGraphViewMode;
  mode: FlowGraphViewMode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div
        className="flex items-center gap-1 rounded-[20px] border border-border-light bg-surface2 p-1"
        title="Preferensi tampilan diagram ini"
      >
        {(["VERTICAL", "HORIZONTAL"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`rounded-[16px] px-3 py-1 text-[12px] font-semibold transition-colors ${
              mode === m ? "bg-teal text-ink" : "text-muted2 hover:text-text"
            }`}
            onClick={() => setAdminFlowViewMode(storageKey, m)}
          >
            {m === "VERTICAL" ? "↓ Vertical" : "→ Horizontal"}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-muted2">
        {mode === nativeViewMode ? "posisi asli peserta" : "tata letak disusun ulang otomatis"}
      </span>
    </div>
  );
}

export function FlowGraphView({
  nodes,
  connections,
  nativeViewMode = "HORIZONTAL",
  idPrefix,
  maxHeight = 600,
}: {
  nodes: FlowGraphNode[];
  connections: FlowGraphConnection[];
  /** Orientation the participant built in — this diagram's default, and the only one their saved coordinates belong to. */
  nativeViewMode?: FlowGraphViewMode;
  /** Prefixes the SVG marker ids so several diagrams on one page don't share arrowhead definitions, and keys this diagram's remembered orientation. */
  idPrefix: string;
  maxHeight?: number;
}) {
  const viewMode = useAdminFlowViewMode(idPrefix, nativeViewMode);
  const graph = useMemo(
    () => buildFlowGraph(nodes, connections, viewMode, nativeViewMode),
    [nodes, connections, viewMode, nativeViewMode]
  );

  const toggle = (
    <div className="mb-2.5 flex justify-end">
      <FlowViewModeToggle storageKey={idPrefix} nativeViewMode={nativeViewMode} mode={viewMode} />
    </div>
  );

  if (!graph) {
    return (
      <div>
        {toggle}
        <p className="text-[13px] text-muted2">Belum ada node.</p>
      </div>
    );
  }

  return (
    <div>
      {toggle}
      <div className="overflow-auto rounded-[10px] border border-border-light bg-surface2" style={{ maxHeight }}>
        <svg
          viewBox={`${graph.vx0} ${graph.vy0} ${graph.width} ${graph.height}`}
          width={graph.width}
          height={graph.height}
          style={{ width: "100%", maxWidth: graph.width, height: "auto" }}
          role="img"
          aria-label="Diagram flow yang disusun peserta"
        >
          <defs>
            {graph.usedKinds.map((k) => (
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

          {graph.edges.map((e) => (
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

          {graph.placed.map((n) => {
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

      {graph.usedKinds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted2">
          {graph.usedKinds.map((k) => (
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
