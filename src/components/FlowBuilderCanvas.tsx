"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { getValidatorForOrder, type ConnectionKind, type NodeLibItem } from "@/lib/flowScoring";

interface FlowNodeVM {
  id: string;
  kind: string;
  label: string;
  icon: string;
  nodeType: string;
  decision: boolean;
  x: number;
  y: number;
}
interface FlowConnectionVM {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  connectionType: ConnectionKind;
}

const NODE_W = 168;
const NODE_H = 58;

const EDGE_COLOR: Record<ConnectionKind, string> = {
  DEFAULT: "var(--teal)",
  YES: "var(--success)",
  NO: "var(--danger)",
  RECOVERY: "var(--gold)",
};

function bezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.max(40, Math.abs(y2 - y1) / 2);
  return `M ${x1},${y1} C ${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
}

/** A node's single (or, for Decision nodes, dual) outgoing edge type is implied by its own type. */
function impliedConnectionType(node: Pick<FlowNodeVM, "decision" | "nodeType">, handle?: "yes" | "no"): ConnectionKind {
  if (node.decision) return handle === "no" ? "NO" : "YES";
  if (node.nodeType === "ERROR") return "RECOVERY";
  return "DEFAULT";
}

export function FlowBuilderCanvas({
  submissionId,
  questOrder,
  questLabel,
  scenarioLine,
  nodeLibrary,
  resultHref,
  baseMax,
  initialNodes,
  initialConnections,
  initialRemainingSeconds,
}: {
  submissionId: string;
  questOrder: number;
  questLabel: string;
  scenarioLine: string;
  nodeLibrary: NodeLibItem[];
  resultHref: string;
  baseMax: number;
  initialNodes: { id: string; label: string; nodeType: string; positionX: number; positionY: number }[];
  initialConnections: { id: string; sourceNodeId: string; targetNodeId: string; connectionType: string }[];
  initialRemainingSeconds: number;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const validate = getValidatorForOrder(questOrder);

  const [nodes, setNodes] = useState<FlowNodeVM[]>(
    initialNodes.map((n) => {
      const def = nodeLibrary.find((d) => d.label === n.label);
      return {
        id: n.id,
        kind: def?.kind ?? "unknown",
        label: n.label,
        icon: def?.icon ?? "📄",
        nodeType: n.nodeType,
        decision: Boolean(def?.decision),
        x: n.positionX,
        y: n.positionY,
      };
    })
  );
  const [connections, setConnections] = useState<FlowConnectionVM[]>(
    initialConnections.map((c) => ({
      id: c.id,
      sourceNodeId: c.sourceNodeId,
      targetNodeId: c.targetNodeId,
      connectionType: (c.connectionType as ConnectionKind) ?? "DEFAULT",
    }))
  );
  const [secondsLeft, setSecondsLeft] = useState(initialRemainingSeconds);
  const [locked, setLocked] = useState(initialRemainingSeconds <= 0);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [connectDrag, setConnectDrag] = useState<{ fromId: string; connType: ConnectionKind; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<{ def: NodeLibItem; x: number; y: number } | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const submittingRef = useRef(false);

  function flashError(message: string) {
    setErrorMsg(message);
    setTimeout(() => setErrorMsg((m) => (m === message ? null : m)), 4000);
  }

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;

  async function submitFlow(timeExpired: boolean) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLocked(true);
    try {
      const res = await fetch("/api/quest2/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, timeExpired }),
      });
      if (!res.ok) {
        submittingRef.current = false;
        if (timeExpired) {
          flashError("Gagal mengirim flow otomatis — muat ulang halaman ini untuk mencoba lagi.");
        } else {
          flashError('Gagal mengirim flow — coba klik "Kirim Flow" lagi.');
          setLocked(false);
        }
        return;
      }
      router.push(resultHref);
      router.refresh();
    } catch {
      submittingRef.current = false;
      if (timeExpired) {
        flashError("Gagal mengirim flow otomatis — muat ulang halaman ini untuk mencoba lagi.");
      } else {
        flashError("Gagal mengirim flow — periksa koneksi internet kamu lalu coba lagi.");
        setLocked(false);
      }
    }
  }

  useEffect(() => {
    if (locked) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          void submitFlow(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (paletteDrag) {
        setPaletteDrag((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
        return;
      }
      if (connectDrag) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
        const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
        setConnectDrag((c) => (c ? { ...c, x2: mx, y2: my } : c));
        return;
      }
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const nx = Math.max(0, dragState.origX + dx);
      const ny = Math.max(0, dragState.origY + dy);
      setNodes((ns) => ns.map((n) => (n.id === dragState.id ? { ...n, x: nx, y: ny } : n)));
    }

    function handleUp(e: PointerEvent) {
      if (paletteDrag) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el?.closest("[data-role=canvas]") && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const x = Math.max(0, e.clientX - rect.left - NODE_W / 2 + canvasRef.current.scrollLeft);
          const y = Math.max(0, e.clientY - rect.top - NODE_H / 2 + canvasRef.current.scrollTop);
          void createNodeAt(paletteDrag.def, x, y);
        }
        setPaletteDrag(null);
        return;
      }
      if (connectDrag) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetEl = el?.closest<HTMLElement>("[data-node-id]");
        const targetId = targetEl?.dataset.nodeId;
        if (targetId && targetId !== connectDrag.fromId) {
          void createConnection(connectDrag.fromId, targetId, connectDrag.connType);
        }
        setConnectDrag(null);
        return;
      }
      if (dragState) {
        const node = nodesRef.current.find((n) => n.id === dragState.id);
        if (node) void persistMove(node.id, node.x, node.y);
        setDragState(null);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, connectDrag, paletteDrag]);

  async function persistMove(nodeId: string, x: number, y: number) {
    try {
      const res = await fetch(`/api/quest2/node/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionX: x, positionY: y }),
      });
      if (!res.ok) flashError("Gagal menyimpan posisi node — waktu mungkin sudah habis.");
    } catch {
      flashError("Gagal menyimpan posisi node — periksa koneksi internet kamu.");
    }
  }

  async function createConnection(sourceNodeId: string, targetNodeId: string, connectionType: ConnectionKind) {
    if (connectionsRef.current.some((c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId && c.connectionType === connectionType))
      return;
    try {
      const res = await fetch("/api/quest2/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, sourceNodeId, targetNodeId, connectionType }),
      });
      if (!res.ok) {
        flashError("Gagal menyambungkan node — coba lagi.");
        return;
      }
      const { connection } = await res.json();
      setConnections((cs) => [...cs, { id: connection.id, sourceNodeId, targetNodeId, connectionType }]);
    } catch {
      flashError("Gagal menyambungkan node — periksa koneksi internet kamu.");
    }
  }

  async function createNodeAt(def: NodeLibItem, x: number, y: number) {
    if (locked) return;
    try {
      const res = await fetch("/api/quest2/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, label: def.label, nodeType: def.nodeType, positionX: x, positionY: y }),
      });
      if (!res.ok) {
        flashError("Gagal menambah node — waktu mungkin sudah habis.");
        return;
      }
      const { node } = await res.json();
      setNodes((ns) => [
        ...ns,
        { id: node.id, kind: def.kind, label: def.label, icon: def.icon, nodeType: def.nodeType, decision: Boolean(def.decision), x, y },
      ]);
    } catch {
      flashError("Gagal menambah node — periksa koneksi internet kamu.");
    }
  }

  async function resetFlow() {
    if (locked || resetting) return;
    if (nodes.length === 0) return;
    setResetting(true);
    try {
      const res = await fetch("/api/quest2/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (!res.ok) {
        flashError("Gagal mereset flow — coba lagi.");
        return;
      }
      setNodes([]);
      setConnections([]);
    } catch {
      flashError("Gagal mereset flow — periksa koneksi internet kamu.");
    } finally {
      setResetting(false);
    }
  }

  async function deleteNode(id: string) {
    if (locked) return;
    try {
      const res = await fetch(`/api/quest2/node/${id}`, { method: "DELETE" });
      if (!res.ok) {
        flashError("Gagal menghapus node — waktu mungkin sudah habis.");
        return;
      }
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setConnections((cs) => cs.filter((c) => c.sourceNodeId !== id && c.targetNodeId !== id));
    } catch {
      flashError("Gagal menghapus node — periksa koneksi internet kamu.");
    }
  }

  function runCheck() {
    const result = validate(
      nodes.map((n) => ({ id: n.id, label: n.label })),
      connections
    );
    setCheckMsg(`${result.message}\n\nEstimasi sementara: ${result.totalScore}/${baseMax} (belum termasuk alasan)`);
  }

  function startConnectDrag(node: FlowNodeVM, e: React.PointerEvent, handle?: "yes" | "no") {
    if (locked) return;
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    const x1 = node.decision ? node.x + NODE_W * (handle === "no" ? 0.65 : 0.35) : node.x + NODE_W / 2;
    const y1 = node.y + NODE_H;
    const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
    const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
    setConnectDrag({ fromId: node.id, connType: impliedConnectionType(node, handle), x1, y1, x2: mx, y2: my });
  }

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeLow = secondsLeft <= 30;

  return (
    <div className="flex h-[calc(100vh-61px)] flex-col">
      {locked && (
        <div className="border-b border-danger bg-[rgba(242,112,92,0.15)] px-4 py-2.5 text-center text-[13.5px] font-semibold text-[#FFD9D2]">
          ⏱️ Waktu habis — flow kamu otomatis dikunci dan dikirim untuk dinilai.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-5 py-3">
        <div className="text-[13px] text-muted">
          <b className="text-text">{questLabel}</b> — {scenarioLine}
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2 rounded-[20px] border border-border-light bg-surface2 px-3.5 py-1.5">
            <span className="text-[11px] uppercase tracking-[0.5px] text-muted2">Sisa Waktu</span>
            <span className={`font-mono text-[16px] font-bold tabular-nums ${timeLow ? "text-danger" : "text-gold"}`}>
              {minutes}:{String(secs).padStart(2, "0")}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="!px-3.5 !py-2 !text-[13px]"
              onClick={resetFlow}
              disabled={locked || resetting || nodes.length === 0}
            >
              {resetting ? "Mereset…" : "Reset Flow"}
            </Button>
            <Button variant="ghost" className="!px-3.5 !py-2 !text-[13px]" onClick={runCheck} disabled={locked}>
              Cek Flow
            </Button>
            <Button className="!px-3.5 !py-2 !text-[13px]" onClick={() => submitFlow(false)} disabled={locked}>
              Kirim Flow →
            </Button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="border-b border-danger bg-[rgba(242,112,92,0.12)] px-5 py-2.5 text-[13px] text-[#FFD9D2]">
          ⚠️ {errorMsg}
        </div>
      )}

      {checkMsg && (
        <div className="whitespace-pre-line border-b border-border bg-surface2 px-5 py-3 text-[13px] text-muted">
          {checkMsg}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[210px] flex-shrink-0 overflow-y-auto border-r border-border bg-surface p-3.5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1px] text-muted2">
            Node Library
          </div>
          {nodeLibrary.map((def) => (
            <div
              key={def.kind}
              onPointerDown={(e) => {
                if (locked) return;
                setPaletteDrag({ def, x: e.clientX, y: e.clientY });
              }}
              className="mb-2 flex cursor-grab touch-none select-none items-center gap-2 rounded-[9px] border border-border-light bg-surface2 p-2.5 hover:border-teal active:cursor-grabbing"
            >
              <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md">
                {def.icon}
              </div>
              <div className="flex-1">
                <span className="block text-[13px] font-semibold">{def.label}</span>
                <span className="text-[10px] uppercase tracking-[0.5px] text-muted2">
                  {def.decision ? "DECISION · Ya/Tidak" : def.nodeType}
                </span>
              </div>
            </div>
          ))}
          <div className="mt-5 mb-3 text-[11px] font-semibold uppercase tracking-[1px] text-muted2">
            Cara Main
          </div>
          <p className="text-[12px] leading-[1.6] text-muted2">
            1. Seret node dari sini ke kanvas
            <br />
            2. Tarik garis dari titik di bawah node ke node tujuan
            <br />
            3. Node Decision punya 2 titik keluaran: Ya (hijau) &amp; Tidak (merah)
          </p>
        </div>

        <div className="relative flex-1 overflow-auto">
          <div
            ref={canvasRef}
            data-role="canvas"
            className="dotgrid-canvas relative mx-auto"
            style={{ width: 920, height: 1700 }}
          >
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute top-5 left-5 max-w-[280px] rounded-lg border border-border bg-[rgba(30,27,46,0.85)] px-3 py-2 text-[12.5px] leading-[1.5] text-muted2">
                💡 Seret node dari kiri ke sini (atau sentuh &amp; tahan di layar sentuh). Tarik garis
                dari titik di bawah node ke arah node tujuan untuk menyambungkan.
              </div>
            )}

            <svg className="pointer-events-none absolute top-0 left-0 h-full w-full">
              <defs>
                {(Object.keys(EDGE_COLOR) as ConnectionKind[]).map((k) => (
                  <marker key={k} id={`arrowhead-${k}`} markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
                    <polygon points="0 0, 8 3.5, 0 7" fill={EDGE_COLOR[k]} />
                  </marker>
                ))}
                <marker id="arrowhead-temp" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
                  <polygon points="0 0, 8 3.5, 0 7" fill="#F0AC3F" />
                </marker>
              </defs>
              {connections.map((c) => {
                const from = nodes.find((n) => n.id === c.sourceNodeId);
                const to = nodes.find((n) => n.id === c.targetNodeId);
                if (!from || !to) return null;
                const x1 = from.decision
                  ? from.x + NODE_W * (c.connectionType === "NO" ? 0.65 : 0.35)
                  : from.x + NODE_W / 2;
                const y1 = from.y + NODE_H;
                const x2 = to.x + NODE_W / 2,
                  y2 = to.y;
                return (
                  <path
                    key={c.id}
                    d={bezierPath(x1, y1, x2, y2)}
                    stroke={EDGE_COLOR[c.connectionType]}
                    strokeWidth={2}
                    fill="none"
                    markerEnd={`url(#arrowhead-${c.connectionType})`}
                  />
                );
              })}
              {connectDrag && (
                <path
                  d={bezierPath(connectDrag.x1, connectDrag.y1, connectDrag.x2, connectDrag.y2)}
                  stroke="var(--gold)"
                  strokeWidth={2}
                  strokeDasharray="5,4"
                  fill="none"
                  markerEnd="url(#arrowhead-temp)"
                />
              )}
            </svg>

            {nodes.map((node) => (
              <div
                key={node.id}
                data-node-id={node.id}
                className="absolute w-[168px] touch-none select-none rounded-[10px] border-[1.5px] border-border-light bg-surface p-[9px_11px] shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
                style={{ left: node.x, top: node.y }}
                onPointerDown={(e) => {
                  if (locked) return;
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-role=delete]") || target.closest("[data-role^=handle-]")) return;
                  setDragState({ id: node.id, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y });
                }}
              >
                <div className="absolute top-[-7px] left-1/2 h-[11px] w-[11px] -translate-x-1/2 rounded-full border-2 border-border-light bg-surface3" />
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[12px]">
                    {node.icon}
                  </div>
                  <div className="flex-1 text-[13px] font-semibold">{node.label}</div>
                  <button
                    data-role="delete"
                    className="flex-shrink-0 rounded px-1 text-[15px] leading-none text-muted2 hover:bg-surface3 hover:text-danger"
                    onClick={() => deleteNode(node.id)}
                  >
                    ×
                  </button>
                </div>
                <span className="mt-[3px] block text-[9.5px] uppercase tracking-[0.5px] text-muted2">
                  {node.nodeType}
                </span>

                {node.decision ? (
                  <>
                    <div
                      data-role="handle-yes"
                      title="Tarik untuk jalur 'Ya'"
                      className="absolute bottom-[-9px] z-[6] h-[17px] w-[17px] -translate-x-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink bg-success transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125"
                      style={{ left: "35%" }}
                      onPointerDown={(e) => startConnectDrag(node, e, "yes")}
                    />
                    <span className="absolute bottom-[-24px] text-[9px] font-semibold text-success" style={{ left: "27%" }}>
                      Ya
                    </span>
                    <div
                      data-role="handle-no"
                      title="Tarik untuk jalur 'Tidak'"
                      className="absolute bottom-[-9px] z-[6] h-[17px] w-[17px] -translate-x-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink bg-danger transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125"
                      style={{ left: "65%" }}
                      onPointerDown={(e) => startConnectDrag(node, e, "no")}
                    />
                    <span className="absolute bottom-[-24px] text-[9px] font-semibold text-danger" style={{ left: "60%" }}>
                      Tidak
                    </span>
                  </>
                ) : (
                  <div
                    data-role="handle-out"
                    title={
                      node.nodeType === "ERROR"
                        ? "Tarik untuk jalur pemulihan (recovery)"
                        : "Tarik untuk menyambungkan ke node lain"
                    }
                    className={`absolute bottom-[-9px] left-1/2 z-[6] h-[17px] w-[17px] -translate-x-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125 ${
                      node.nodeType === "ERROR" ? "bg-gold" : "bg-teal"
                    }`}
                    onPointerDown={(e) => startConnectDrag(node, e)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {paletteDrag && (
        <div
          className="pointer-events-none fixed z-50 flex w-[168px] items-center gap-2 rounded-[9px] border-[1.5px] border-teal bg-surface p-[9px_11px] opacity-90 shadow-[0_8px_20px_rgba(0,0,0,0.4)]"
          style={{ left: paletteDrag.x - 20, top: paletteDrag.y - 20 }}
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[12px]">
            {paletteDrag.def.icon}
          </div>
          <span className="text-[13px] font-semibold">{paletteDrag.def.label}</span>
        </div>
      )}
    </div>
  );
}
