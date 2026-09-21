"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { getValidatorForOrder, type ConnectionKind, type NodeLibItem } from "@/lib/flowScoring";
import {
  autoLayout,
  computeAlignmentSnap,
  nearestSide,
  offsetPoint,
  previewPath,
  routeConnection,
  sidePoint,
  OPPOSITE_SIDE,
  type AlignGuide,
  type RouteObstacle,
  type Side,
} from "@/lib/flowLayout";

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
  /** Sides the user actually dragged from/to (horizontal mode only) — kept so the render doesn't silently re-pick a different side than what was manually chosen. Undefined for connections loaded fresh from the DB, which fall back to an auto-picked nearest side. */
  sideFrom?: Side;
  sideTo?: Side;
}

const NODE_W = 168;
const NODE_H = 58;
const OBSTACLE_PADDING = 6;

type FlowViewMode = "VERTICAL" | "HORIZONTAL";
const SIDES: Side[] = ["top", "right", "bottom", "left"];

const EDGE_COLOR: Record<ConnectionKind, string> = {
  DEFAULT: "var(--teal)",
  YES: "var(--success)",
  NO: "var(--danger)",
  RECOVERY: "var(--gold)",
};

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
  initialViewMode,
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
  initialViewMode: FlowViewMode;
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
  const [dragState, setDragState] = useState<{
    startX: number;
    startY: number;
    primaryId: string;
    origins: Record<string, { x: number; y: number }>;
  } | null>(null);
  const [connectDrag, setConnectDrag] = useState<{
    fromId: string;
    connType: ConnectionKind;
    fromSide: Side;
    toSide: Side;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [detachDrag, setDetachDrag] = useState<{
    connectionId: string;
    sourceNodeId: string;
    originalTargetNodeId: string;
    connType: ConnectionKind;
    fromSide: Side;
    toSide: Side;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<{ def: NodeLibItem; x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [viewMode, setViewMode] = useState<FlowViewMode>(initialViewMode);
  const [savingView, setSavingView] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
  const isHorizontal = viewMode === "HORIZONTAL";
  const isBusy = Boolean(dragState || connectDrag || detachDrag || paletteDrag || marquee);
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

  /** Finds the node (other than `excludeId`) under the cursor and its nearest side, for connector hover-snapping. */
  function findSnapTarget(e: PointerEvent, excludeId: string) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetEl = el?.closest<HTMLElement>("[data-node-id]");
    const targetId = targetEl?.dataset.nodeId;
    if (!targetId || targetId === excludeId) return null;
    const targetNode = nodesRef.current.find((n) => n.id === targetId);
    if (!targetNode) return null;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
    const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
    const box = { x: targetNode.x, y: targetNode.y, w: NODE_W, h: NODE_H };
    const side = nearestSide(mx, my, box);
    return { targetId, side, point: sidePoint(box, side) };
  }

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (marquee) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left + canvasRef.current!.scrollLeft;
        const y = e.clientY - rect.top + canvasRef.current!.scrollTop;
        setMarquee((m) => (m ? { ...m, x2: x, y2: y } : m));
        return;
      }
      if (paletteDrag) {
        setPaletteDrag((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
        return;
      }
      if (connectDrag) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
        const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
        if (isHorizontal) {
          const snap = findSnapTarget(e, connectDrag.fromId);
          if (snap) {
            setSnapTargetId(snap.targetId);
            setConnectDrag((c) => (c ? { ...c, toSide: snap.side, x2: snap.point.x, y2: snap.point.y } : c));
            return;
          }
          setSnapTargetId(null);
          setConnectDrag((c) => (c ? { ...c, toSide: OPPOSITE_SIDE[c.fromSide], x2: mx, y2: my } : c));
          return;
        }
        setConnectDrag((c) => (c ? { ...c, x2: mx, y2: my } : c));
        return;
      }
      if (detachDrag) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
        const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
        if (isHorizontal) {
          const snap = findSnapTarget(e, detachDrag.sourceNodeId);
          if (snap) {
            setSnapTargetId(snap.targetId);
            setDetachDrag((d) => (d ? { ...d, toSide: snap.side, x2: snap.point.x, y2: snap.point.y } : d));
            return;
          }
          setSnapTargetId(null);
          setDetachDrag((d) => (d ? { ...d, toSide: OPPOSITE_SIDE[d.fromSide], x2: mx, y2: my } : d));
          return;
        }
        setDetachDrag((d) => (d ? { ...d, x2: mx, y2: my } : d));
        return;
      }
      if (!dragState) return;
      let dx = e.clientX - dragState.startX;
      let dy = e.clientY - dragState.startY;

      const primaryOrigin = dragState.origins[dragState.primaryId];
      let activeGuides: AlignGuide[] = [];
      if (primaryOrigin) {
        const movingBox = { x: primaryOrigin.x + dx, y: primaryOrigin.y + dy, w: NODE_W, h: NODE_H };
        const others = nodesRef.current
          .filter((n) => !(n.id in dragState.origins))
          .map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H }));
        const snap = computeAlignmentSnap(movingBox, others);
        dx += snap.dx;
        dy += snap.dy;
        activeGuides = snap.guides;
      }
      setGuides(activeGuides);
      setNodes((ns) =>
        ns.map((n) => {
          const origin = dragState.origins[n.id];
          if (!origin) return n;
          return { ...n, x: Math.max(0, origin.x + dx), y: Math.max(0, origin.y + dy) };
        })
      );
    }

    function handleUp(e: PointerEvent) {
      if (marquee) {
        const rx1 = Math.min(marquee.x1, marquee.x2);
        const rx2 = Math.max(marquee.x1, marquee.x2);
        const ry1 = Math.min(marquee.y1, marquee.y2);
        const ry2 = Math.max(marquee.y1, marquee.y2);
        const hits = nodesRef.current
          .filter((n) => n.x < rx2 && n.x + NODE_W > rx1 && n.y < ry2 && n.y + NODE_H > ry1)
          .map((n) => n.id);
        setSelectedIds((prev) => {
          const next = e.shiftKey ? new Set(prev) : new Set<string>();
          hits.forEach((id) => next.add(id));
          return next;
        });
        setMarquee(null);
        return;
      }
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
          void createConnection(
            connectDrag.fromId,
            targetId,
            connectDrag.connType,
            isHorizontal ? { sideFrom: connectDrag.fromSide, sideTo: connectDrag.toSide } : undefined
          );
        }
        setConnectDrag(null);
        setSnapTargetId(null);
        return;
      }
      if (detachDrag) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetEl = el?.closest<HTMLElement>("[data-node-id]");
        const targetId = targetEl?.dataset.nodeId;
        if (targetId && targetId !== detachDrag.sourceNodeId && targetId !== detachDrag.originalTargetNodeId) {
          void rewireConnection(detachDrag.connectionId, targetId);
        } else if (!targetId || targetId === detachDrag.sourceNodeId) {
          void deleteConnection(detachDrag.connectionId);
        }
        setDetachDrag(null);
        setSnapTargetId(null);
        return;
      }
      if (dragState) {
        const ids = Object.keys(dragState.origins);
        const toPersist = nodesRef.current.filter((n) => ids.includes(n.id));
        void Promise.all(toPersist.map((n) => persistMove(n.id, n.x, n.y)));
        setDragState(null);
        setGuides([]);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, connectDrag, detachDrag, paletteDrag, marquee, isHorizontal]);

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

  /**
   * Adds the connection to local state immediately (client-generated id) so
   * drawing a line feels instant, then confirms with the server in the
   * background — rolling the optimistic entry back out if the request
   * ultimately fails. Reconciles onto the server's id afterwards (normally
   * the same one we sent, but the server may return a pre-existing
   * duplicate's id instead).
   */
  async function createConnection(
    sourceNodeId: string,
    targetNodeId: string,
    connectionType: ConnectionKind,
    sides?: { sideFrom: Side; sideTo: Side }
  ) {
    if (connectionsRef.current.some((c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId && c.connectionType === connectionType))
      return;
    const tempId = crypto.randomUUID();
    setConnections((cs) => [
      ...cs,
      { id: tempId, sourceNodeId, targetNodeId, connectionType, sideFrom: sides?.sideFrom, sideTo: sides?.sideTo },
    ]);
    try {
      const res = await fetch("/api/quest2/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tempId, submissionId, sourceNodeId, targetNodeId, connectionType }),
      });
      if (!res.ok) {
        setConnections((cs) => cs.filter((c) => c.id !== tempId));
        flashError("Gagal menyambungkan node — coba lagi.");
        return;
      }
      const { connection } = await res.json();
      if (connection.id !== tempId) {
        setConnections((cs) => cs.map((c) => (c.id === tempId ? { ...c, id: connection.id } : c)));
      }
    } catch {
      setConnections((cs) => cs.filter((c) => c.id !== tempId));
      flashError("Gagal menyambungkan node — periksa koneksi internet kamu.");
    }
  }

  async function rewireConnection(connectionId: string, targetNodeId: string) {
    const previous = connectionsRef.current.find((c) => c.id === connectionId);
    if (!previous) return;
    setConnections((cs) => cs.map((c) => (c.id === connectionId ? { ...c, targetNodeId, sideFrom: undefined, sideTo: undefined } : c)));
    try {
      const res = await fetch(`/api/quest2/connection/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetNodeId }),
      });
      if (!res.ok) {
        setConnections((cs) => cs.map((c) => (c.id === connectionId ? previous : c)));
        flashError("Gagal memindahkan sambungan — coba lagi.");
        return;
      }
      const data = await res.json();
      if (data.deleted) {
        setConnections((cs) => cs.filter((c) => c.id !== connectionId));
      }
    } catch {
      setConnections((cs) => cs.map((c) => (c.id === connectionId ? previous : c)));
      flashError("Gagal memindahkan sambungan — periksa koneksi internet kamu.");
    }
  }

  async function deleteConnection(connectionId: string) {
    const previous = connectionsRef.current.find((c) => c.id === connectionId);
    if (!previous) return;
    setConnections((cs) => cs.filter((c) => c.id !== connectionId));
    try {
      const res = await fetch(`/api/quest2/connection/${connectionId}`, { method: "DELETE" });
      if (!res.ok) {
        setConnections((cs) => [...cs, previous]);
        flashError("Gagal memutus sambungan — coba lagi.");
      }
    } catch {
      setConnections((cs) => [...cs, previous]);
      flashError("Gagal memutus sambungan — periksa koneksi internet kamu.");
    }
  }

  /**
   * Adds the node to local state immediately (client-generated id) instead of
   * waiting for the round-trip, so dropping a node from the palette feels
   * instant — the palette-drop's own drag interaction already has to feel
   * responsive, and waiting on the network here was the main source of the
   * "heavy" lag. Rolled back if the request ultimately fails.
   */
  async function createNodeAt(def: NodeLibItem, x: number, y: number) {
    if (locked) return;
    const id = crypto.randomUUID();
    setNodes((ns) => [
      ...ns,
      { id, kind: def.kind, label: def.label, icon: def.icon, nodeType: def.nodeType, decision: Boolean(def.decision), x, y },
    ]);
    try {
      const res = await fetch("/api/quest2/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, submissionId, label: def.label, nodeType: def.nodeType, positionX: x, positionY: y }),
      });
      if (!res.ok) {
        setNodes((ns) => ns.filter((n) => n.id !== id));
        flashError("Gagal menambah node — waktu mungkin sudah habis.");
      }
    } catch {
      setNodes((ns) => ns.filter((n) => n.id !== id));
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
      setSelectedIds(new Set());
    } catch {
      flashError("Gagal mereset flow — periksa koneksi internet kamu.");
    } finally {
      setResetting(false);
    }
  }

  async function deleteNode(id: string) {
    if (locked) return;
    const removedNode = nodesRef.current.find((n) => n.id === id);
    if (!removedNode) return;
    const removedConnections = connectionsRef.current.filter((c) => c.sourceNodeId === id || c.targetNodeId === id);

    setNodes((ns) => ns.filter((n) => n.id !== id));
    setConnections((cs) => cs.filter((c) => c.sourceNodeId !== id && c.targetNodeId !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    function rollback() {
      setNodes((ns) => [...ns, removedNode!]);
      setConnections((cs) => [...cs, ...removedConnections]);
    }

    try {
      const res = await fetch(`/api/quest2/node/${id}`, { method: "DELETE" });
      if (!res.ok) {
        rollback();
        flashError("Gagal menghapus node — waktu mungkin sudah habis.");
      }
    } catch {
      rollback();
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

  /** Resolves the exact exit/entry port + side for a connection: decision nodes are structurally fixed, manually-dragged horizontal connections keep the side the user chose, everything else falls back to the nearest-side heuristic. */
  function resolveConnectionPorts(c: FlowConnectionVM, from: FlowNodeVM, to: FlowNodeVM) {
    const fromBox = { x: from.x, y: from.y, w: NODE_W, h: NODE_H };
    const toBox = { x: to.x, y: to.y, w: NODE_W, h: NODE_H };
    const fromCenter = { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 };
    const toCenter = { x: to.x + NODE_W / 2, y: to.y + NODE_H / 2 };

    let fromSide: Side;
    let fromPort: { x: number; y: number };
    if (from.decision) {
      fromSide = isHorizontal ? "right" : "bottom";
      fromPort = isHorizontal
        ? { x: from.x + NODE_W, y: from.y + NODE_H * (c.connectionType === "NO" ? 0.75 : 0.25) }
        : { x: from.x + NODE_W * (c.connectionType === "NO" ? 0.65 : 0.35), y: from.y + NODE_H };
    } else if (isHorizontal && c.sideFrom) {
      fromSide = c.sideFrom;
      fromPort = sidePoint(fromBox, fromSide);
    } else if (isHorizontal) {
      fromSide = nearestSide(toCenter.x, toCenter.y, fromBox);
      fromPort = sidePoint(fromBox, fromSide);
    } else {
      fromSide = "bottom";
      fromPort = { x: from.x + NODE_W / 2, y: from.y + NODE_H };
    }

    const toSide: Side = isHorizontal && c.sideTo ? c.sideTo : nearestSide(fromCenter.x, fromCenter.y, toBox);
    const toPort = sidePoint(toBox, toSide);

    return { fromPort, fromSide, toPort, toSide };
  }

  function startConnectDrag(node: FlowNodeVM, e: React.PointerEvent, opts?: { handle?: "yes" | "no"; side?: Side }) {
    if (locked) return;
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();

    let x1: number, y1: number, fromSide: Side;
    if (isHorizontal) {
      if (node.decision) {
        fromSide = "right";
        x1 = node.x + NODE_W;
        y1 = node.y + NODE_H * (opts?.handle === "no" ? 0.75 : 0.25);
      } else {
        fromSide = opts?.side ?? "right";
        const p = sidePoint({ x: node.x, y: node.y, w: NODE_W, h: NODE_H }, fromSide);
        x1 = p.x;
        y1 = p.y;
      }
    } else {
      fromSide = "bottom";
      x1 = node.decision ? node.x + NODE_W * (opts?.handle === "no" ? 0.65 : 0.35) : node.x + NODE_W / 2;
      y1 = node.y + NODE_H;
    }

    const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
    const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
    setConnectDrag({
      fromId: node.id,
      connType: impliedConnectionType(node, opts?.handle),
      fromSide,
      toSide: OPPOSITE_SIDE[fromSide],
      x1,
      y1,
      x2: mx,
      y2: my,
    });
  }

  /** Grabs a connection's arrowhead end so it can be dragged onto a different node (rewire) or dropped in empty space / back on its own source (delete) — the standard diagram-builder disconnect gesture. */
  function startDetachDrag(c: FlowConnectionVM, from: FlowNodeVM, to: FlowNodeVM, e: React.PointerEvent) {
    if (locked) return;
    e.stopPropagation();
    const { fromPort, fromSide } = resolveConnectionPorts(c, from, to);
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left + canvasRef.current!.scrollLeft;
    const my = e.clientY - rect.top + canvasRef.current!.scrollTop;
    setDetachDrag({
      connectionId: c.id,
      sourceNodeId: c.sourceNodeId,
      originalTargetNodeId: c.targetNodeId,
      connType: c.connectionType,
      fromSide,
      toSide: OPPOSITE_SIDE[fromSide],
      x1: fromPort.x,
      y1: fromPort.y,
      x2: mx,
      y2: my,
    });
  }

  async function setView(next: FlowViewMode) {
    if (next === viewMode || savingView || locked) return;
    setSavingView(true);
    setViewMode(next);
    setSelectedIds(new Set());
    const positions = autoLayout(
      nodesRef.current.map((n) => ({ id: n.id })),
      connectionsRef.current,
      next === "HORIZONTAL" ? "horizontal" : "vertical",
      { w: NODE_W, h: NODE_H }
    );
    setNodes((ns) => ns.map((n) => (positions[n.id] ? { ...n, ...positions[n.id] } : n)));
    try {
      await fetch("/api/participant/view-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewMode: next }),
      });
    } catch {
      // Best-effort — preference just won't persist to the next session.
    }
    await Promise.all(Object.entries(positions).map(([id, pos]) => persistMove(id, pos.x, pos.y)));
    setSavingView(false);
  }

  const canvasSize = isHorizontal ? { w: 1900, h: 900 } : { w: 920, h: 1700 };

  /**
   * Obstacle-avoiding routes for every connection, recomputed only while the
   * canvas is idle (nothing being dragged) — the A* search is cheap for one
   * edge but adds up across many, so during active interaction we render
   * with the fast `previewPath` fallback instead and only pay for the
   * "nice" avoiding path once things settle.
   */
  const routedPaths = useMemo(() => {
    if (isBusy) return null;
    const obstacles: RouteObstacle[] = nodes.map((n) => ({
      id: n.id,
      x: n.x - OBSTACLE_PADDING,
      y: n.y - OBSTACLE_PADDING,
      w: NODE_W + OBSTACLE_PADDING * 2,
      h: NODE_H + OBSTACLE_PADDING * 2,
    }));
    const map = new Map<string, string>();
    for (const c of connections) {
      const from = nodes.find((n) => n.id === c.sourceNodeId);
      const to = nodes.find((n) => n.id === c.targetNodeId);
      if (!from || !to) continue;
      const { fromPort, fromSide, toPort, toSide } = resolveConnectionPorts(c, from, to);
      map.set(c.id, routeConnection(fromPort, fromSide, toPort, toSide, obstacles, [from.id, to.id], canvasSize));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBusy, nodes, connections, isHorizontal]);

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
          <div className="flex items-center gap-1 rounded-[20px] border border-border-light bg-surface2 p-1" title="Preferensi tampilan flow">
            <button
              type="button"
              className={`rounded-[16px] px-3 py-1 text-[12px] font-semibold transition-colors ${
                !isHorizontal ? "bg-teal text-ink" : "text-muted2 hover:text-text"
              }`}
              onClick={() => setView("VERTICAL")}
              disabled={savingView || locked}
            >
              ↓ Vertical
            </button>
            <button
              type="button"
              className={`rounded-[16px] px-3 py-1 text-[12px] font-semibold transition-colors ${
                isHorizontal ? "bg-teal text-ink" : "text-muted2 hover:text-text"
              }`}
              onClick={() => setView("HORIZONTAL")}
              disabled={savingView || locked}
            >
              → Horizontal
            </button>
          </div>
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
            {isHorizontal ? (
              <>2. Hover node lalu tarik garis dari titik di sisi atas/bawah/kiri/kanan ke node tujuan</>
            ) : (
              <>2. Tarik garis dari titik di bawah node ke node tujuan</>
            )}
            <br />
            3. Node Decision punya 2 titik keluaran: Ya (hijau) &amp; Tidak (merah)
            <br />
            4. Seret area kosong untuk pilih beberapa node sekaligus (tahan Shift untuk menambah), lalu geser bersamaan
            <br />
            5. Tarik titik di ujung panah (dekat node tujuan) untuk memindah atau memutus sambungan
            <br />
            6. Saat menggeser node, garis putus-putus emas muncul kalau posisinya sejajar dengan node lain
          </p>
        </div>

        <div className="relative flex-1 overflow-auto">
          <div
            ref={canvasRef}
            data-role="canvas"
            className="dotgrid-canvas relative mx-auto"
            style={{ width: canvasSize.w, height: canvasSize.h }}
            onPointerDown={(e) => {
              if (locked) return;
              if (e.target !== e.currentTarget) return;
              const rect = canvasRef.current!.getBoundingClientRect();
              const x = e.clientX - rect.left + canvasRef.current!.scrollLeft;
              const y = e.clientY - rect.top + canvasRef.current!.scrollTop;
              if (!e.shiftKey) setSelectedIds(new Set());
              setMarquee({ x1: x, y1: y, x2: x, y2: y });
            }}
          >
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute top-5 left-5 max-w-[280px] rounded-lg border border-border bg-[rgba(30,27,46,0.85)] px-3 py-2 text-[12.5px] leading-[1.5] text-muted2">
                {isHorizontal ? (
                  <>💡 Seret node dari kiri ke sini. Hover sebuah node untuk memunculkan titik di keempat sisinya, lalu tarik ke node tujuan — garis akan menempel ke sisi terdekat.</>
                ) : (
                  <>
                    💡 Seret node dari kiri ke sini (atau sentuh &amp; tahan di layar sentuh). Tarik garis
                    dari titik di bawah node ke arah node tujuan untuk menyambungkan.
                  </>
                )}
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
                if (detachDrag?.connectionId === c.id) return null; // shown as the live drag preview below instead
                const from = nodes.find((n) => n.id === c.sourceNodeId);
                const to = nodes.find((n) => n.id === c.targetNodeId);
                if (!from || !to) return null;
                const { fromPort, fromSide, toPort, toSide } = resolveConnectionPorts(c, from, to);
                const d = routedPaths?.get(c.id) ?? previewPath(fromPort, fromSide, toPort, toSide);
                // Pulled a bit outward from the node's own edge so this handle's hit area
                // never overlaps the node's body (which would otherwise steal the pointerdown
                // and start moving the node instead of grabbing the connector).
                const handlePos = offsetPoint(toPort, toSide, 11);
                return (
                  <g key={c.id}>
                    <path
                      d={d}
                      stroke={EDGE_COLOR[c.connectionType]}
                      strokeWidth={2}
                      fill="none"
                      markerEnd={`url(#arrowhead-${c.connectionType})`}
                    />
                    <circle
                      cx={handlePos.x}
                      cy={handlePos.y}
                      r={13}
                      fill="transparent"
                      className="pointer-events-auto cursor-grab"
                      onPointerDown={(e) => startDetachDrag(c, from, to, e)}
                    >
                      <title>Tarik untuk memindah/memutus sambungan ini</title>
                    </circle>
                    <circle
                      cx={handlePos.x}
                      cy={handlePos.y}
                      r={5}
                      fill={EDGE_COLOR[c.connectionType]}
                      stroke="var(--ink)"
                      strokeWidth={1.5}
                      className="pointer-events-none"
                    />
                  </g>
                );
              })}
              {connectDrag && (
                <path
                  d={previewPath({ x: connectDrag.x1, y: connectDrag.y1 }, connectDrag.fromSide, { x: connectDrag.x2, y: connectDrag.y2 }, connectDrag.toSide)}
                  stroke="var(--gold)"
                  strokeWidth={2}
                  strokeDasharray="5,4"
                  fill="none"
                  markerEnd="url(#arrowhead-temp)"
                />
              )}
              {detachDrag && (
                <path
                  d={previewPath({ x: detachDrag.x1, y: detachDrag.y1 }, detachDrag.fromSide, { x: detachDrag.x2, y: detachDrag.y2 }, detachDrag.toSide)}
                  stroke={EDGE_COLOR[detachDrag.connType]}
                  strokeWidth={2}
                  strokeDasharray="5,4"
                  fill="none"
                  markerEnd={`url(#arrowhead-${detachDrag.connType})`}
                />
              )}
              {guides.map((g, i) =>
                g.type === "vertical" ? (
                  <line key={i} x1={g.pos} y1={g.from} x2={g.pos} y2={g.to} stroke="var(--gold)" strokeWidth={1} strokeDasharray="4,4" />
                ) : (
                  <line key={i} x1={g.from} y1={g.pos} x2={g.to} y2={g.pos} stroke="var(--gold)" strokeWidth={1} strokeDasharray="4,4" />
                )
              )}
            </svg>

            {marquee && (
              <div
                className="pointer-events-none absolute z-[5] border border-dashed border-teal bg-teal/10"
                style={{
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1),
                }}
              />
            )}

            {nodes.map((node) => (
              <div
                key={node.id}
                data-node-id={node.id}
                className={`group absolute w-[168px] touch-none select-none rounded-[10px] border-[1.5px] bg-surface p-[9px_11px] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-colors ${
                  snapTargetId === node.id
                    ? "border-gold"
                    : isHorizontal && hoveredNodeId === node.id
                    ? "border-teal"
                    : "border-border-light"
                } ${selectedIds.has(node.id) ? "outline outline-2 outline-offset-2 outline-teal" : ""}`}
                style={{ left: node.x, top: node.y }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (locked) return;
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-role=delete]") || target.closest("[data-role^=handle-]")) return;
                  if (e.shiftKey) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    });
                    return;
                  }
                  const group = selectedIds.has(node.id) && selectedIds.size > 1 ? selectedIds : new Set([node.id]);
                  if (group.size === 1) setSelectedIds(group);
                  const origins: Record<string, { x: number; y: number }> = {};
                  nodesRef.current.forEach((n) => {
                    if (group.has(n.id)) origins[n.id] = { x: n.x, y: n.y };
                  });
                  setDragState({ startX: e.clientX, startY: e.clientY, primaryId: node.id, origins });
                }}
                onPointerEnter={() => setHoveredNodeId(node.id)}
                onPointerLeave={() => setHoveredNodeId((h) => (h === node.id ? null : h))}
              >
                {!isHorizontal && (
                  <div className="pointer-events-none absolute top-[-7px] left-1/2 h-[11px] w-[11px] -translate-x-1/2 rounded-full border-2 border-border-light bg-surface3" />
                )}
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
                  isHorizontal ? (
                    <>
                      <div
                        data-role="handle-yes"
                        title="Tarik untuk jalur 'Ya'"
                        className="absolute right-[-9px] z-[6] h-[17px] w-[17px] -translate-y-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink bg-success transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125"
                        style={{ top: "25%" }}
                        onPointerDown={(e) => startConnectDrag(node, e, { handle: "yes" })}
                      />
                      <span className="absolute right-[-26px] top-[10%] text-[9px] font-semibold text-success">Ya</span>
                      <div
                        data-role="handle-no"
                        title="Tarik untuk jalur 'Tidak'"
                        className="absolute right-[-9px] z-[6] h-[17px] w-[17px] -translate-y-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink bg-danger transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125"
                        style={{ top: "75%" }}
                        onPointerDown={(e) => startConnectDrag(node, e, { handle: "no" })}
                      />
                      <span className="absolute right-[-38px] top-[62%] text-[9px] font-semibold text-danger">Tidak</span>
                    </>
                  ) : (
                    <>
                      <div
                        data-role="handle-yes"
                        title="Tarik untuk jalur 'Ya'"
                        className="absolute bottom-[-9px] z-[6] h-[17px] w-[17px] -translate-x-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink bg-success transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125"
                        style={{ left: "35%" }}
                        onPointerDown={(e) => startConnectDrag(node, e, { handle: "yes" })}
                      />
                      <span className="absolute bottom-[-24px] text-[9px] font-semibold text-success" style={{ left: "27%" }}>
                        Ya
                      </span>
                      <div
                        data-role="handle-no"
                        title="Tarik untuk jalur 'Tidak'"
                        className="absolute bottom-[-9px] z-[6] h-[17px] w-[17px] -translate-x-1/2 touch-none cursor-crosshair rounded-full border-[3px] border-ink bg-danger transition-transform after:absolute after:-inset-3 after:content-[''] hover:scale-125"
                        style={{ left: "65%" }}
                        onPointerDown={(e) => startConnectDrag(node, e, { handle: "no" })}
                      />
                      <span className="absolute bottom-[-24px] text-[9px] font-semibold text-danger" style={{ left: "60%" }}>
                        Tidak
                      </span>
                    </>
                  )
                ) : isHorizontal ? (
                  SIDES.map((side) => (
                    <div
                      key={side}
                      data-role={`handle-${side}`}
                      title={
                        node.nodeType === "ERROR"
                          ? "Tarik untuk jalur pemulihan (recovery)"
                          : "Tarik untuk menyambungkan ke node lain"
                      }
                      className={`absolute z-[6] h-[15px] w-[15px] touch-none cursor-crosshair rounded-full border-[3px] border-ink opacity-0 transition-all after:absolute after:-inset-3 after:content-[''] group-hover:opacity-100 hover:scale-125 ${
                        node.nodeType === "ERROR" ? "bg-gold" : "bg-teal"
                      } ${
                        side === "top"
                          ? "top-[-8px] left-1/2 -translate-x-1/2"
                          : side === "bottom"
                          ? "bottom-[-8px] left-1/2 -translate-x-1/2"
                          : side === "left"
                          ? "left-[-8px] top-1/2 -translate-y-1/2"
                          : "right-[-8px] top-1/2 -translate-y-1/2"
                      }`}
                      onPointerDown={(e) => startConnectDrag(node, e, { side })}
                    />
                  ))
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
