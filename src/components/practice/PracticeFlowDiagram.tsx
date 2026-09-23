import { useId, useMemo } from "react";
import { buildPracticeDiagram, type DiagramEdgeKind } from "@/lib/practice/flowDiagram";
import type { PracticeNodeType } from "@/lib/practice/content";
import s from "./practice.module.css";

const MARKER_COLOR: Record<DiagramEdgeKind, string> = { D: "#45D9C3", Y: "#45D9C3", N: "#F2705C", R: "#F0AC3F" };
const EDGE_CLASS: Record<DiagramEdgeKind, string | undefined> = { D: undefined, Y: s.edgeY, N: s.edgeN, R: s.edgeR };
const NODE_CLASS: Record<PracticeNodeType, string> = {
  screen: s.tScreen,
  system: s.tSystem,
  outcome: s.tOutcome,
  error: s.tError,
  decision: s.tDecision,
};

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Read-only vertical flow drawing used by every Modul Latihan widget that shows a flow. */
export function PracticeFlowDiagram({ nodes, edges, start }: { nodes?: string[]; edges: string[]; start: string }) {
  // Marker ids must be unique per diagram and valid inside url(#…).
  const id = "pf" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const diagram = useMemo(() => buildPracticeDiagram(nodes, edges, start), [nodes, edges, start]);

  return (
    <svg viewBox={`0 0 ${diagram.width} ${diagram.height}`} role="img" aria-label={diagram.ariaLabel} style={{ maxWidth: diagram.width }}>
      <defs>
        {(Object.keys(MARKER_COLOR) as DiagramEdgeKind[]).map((k) => (
          <marker key={k} id={`${id}-${k}`} markerWidth={10} markerHeight={10} refX={8} refY={4} orient="auto">
            <path d="M0,0 L9,4 L0,8 Z" fill={MARKER_COLOR[k]} />
          </marker>
        ))}
      </defs>
      {diagram.floatCaption && (
        <text x={diagram.floatCaption.x} y={diagram.floatCaption.y} className={s.floatCaption}>
          Tidak tersambung ke alur utama
        </text>
      )}
      <g>
        {diagram.edges.map((e) => (
          <path
            key={e.key}
            d={e.d}
            className={cx(s.edge, EDGE_CLASS[e.kind])}
            strokeLinejoin={e.orthogonal ? "round" : undefined}
            markerEnd={`url(#${id}-${e.kind})`}
          />
        ))}
      </g>
      {diagram.nodes.map((n) => {
        const cls = cx(s.nodeRect, NODE_CLASS[n.type], n.floating && s.floating);
        if (n.type === "decision") {
          return (
            <g key={n.id}>
              <polygon points={`${n.cx},${n.top} ${n.right},${n.cy} ${n.cx},${n.bottom} ${n.left},${n.cy}`} className={cls} />
              <text x={n.cx} y={n.cy + 4} textAnchor="middle" className={s.nodeLabel}>
                {n.label}
              </text>
            </g>
          );
        }
        return (
          <g key={n.id}>
            <rect x={n.left} y={n.top} width={n.w} height={n.h} rx={9} className={cls} />
            <text x={n.cx} y={n.cy - 1} textAnchor="middle" className={s.nodeLabel}>
              {n.label}
            </text>
            <text x={n.cx} y={n.cy + 14} textAnchor="middle" className={s.nodeType}>
              {n.typeName}
            </text>
          </g>
        );
      })}
      <g>
        {diagram.edges.map(
          (e) =>
            e.label && (
              <text key={e.key} x={e.label.x} y={e.label.y} className={s.edgeLabel} fill={MARKER_COLOR[e.kind]}>
                {e.label.text}
              </text>
            )
        )}
      </g>
    </svg>
  );
}
