"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx, removeAt, replaceAt } from "./fields";
import type { EditorProps } from "./QuizEditors";
import s from "./builder.module.css";

/**
 * The branching story's visual editor, after the prototype's: story nodes are
 * cards on a canvas, dragged by their header; a choice is wired by clicking
 * its ● and then the node it leads to. ✓ marks the choices that score, 🚩 the
 * starting node. Node positions are saved (x/y) so the layout survives.
 */

type Story = EditorProps<"branching">["question"];
type StoryNode = Story["nodes"][number];
interface Line {
  d: string;
  correct: boolean;
}

const NODE_W = 260;

function nextNodeId(nodes: StoryNode[]) {
  const ids = new Set(nodes.map((n) => n.id));
  for (let i = 1; ; i++) if (!ids.has(`node-${i}`)) return `node-${i}`;
}

export function BranchingEditor({ question: q, onChange }: EditorProps<"branching">) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [connecting, setConnecting] = useState<{ node: number; choice: number } | null>(null);
  const [drag, setDrag] = useState<{ index: number; startX: number; startY: number; x0: number; y0: number; x: number; y: number } | null>(null);
  const [idDrafts, setIdDrafts] = useState<Record<number, string>>({});

  const pos = (n: StoryNode, i: number) => (drag?.index === i ? { x: drag.x, y: drag.y } : { x: n.x ?? 24 + (i % 3) * 300, y: n.y ?? 24 + Math.floor(i / 3) * 260 });
  const setNodes = (nodes: StoryNode[], start = q.start) => onChange({ ...q, nodes, start });
  const setNode = (i: number, node: StoryNode) => setNodes(replaceAt(q.nodes, i, node));

  const layoutKey = JSON.stringify([q.nodes.map((n, i) => [pos(n, i), n.ending, n.text.length, n.choices.map((c) => [c.target, c.correct])]), drag?.x, drag?.y]);
  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const byId = new Map(q.nodes.map((n, i) => [n.id, i]));
    const next: Line[] = [];
    q.nodes.forEach((n, i) => {
      if (n.ending) return;
      n.choices.forEach((c, ci) => {
        const t = byId.get(c.target);
        const from = canvas.querySelector(`[data-conn="${i}_${ci}"]`)?.getBoundingClientRect();
        const to = t === undefined ? undefined : canvas.querySelector(`[data-node="${t}"]`)?.getBoundingClientRect();
        if (!from || !to) return;
        const x1 = from.left + from.width / 2 - cr.left;
        const y1 = from.top + from.height / 2 - cr.top;
        const backwards = to.left + 10 < from.left;
        const x2 = (backwards ? to.right : to.left) - cr.left;
        const y2 = to.top + Math.min(24, to.height / 2) - cr.top;
        const mid = (x1 + x2) / 2;
        next.push({ d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, correct: Boolean(c.correct) });
      });
    });
    setLines(next);
    // layoutKey captures everything the lines depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!connecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConnecting(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connecting]);

  const dragRef = useRef(drag);
  useEffect(() => {
    dragRef.current = drag;
  });
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) =>
      setDrag((d) => (d ? { ...d, x: Math.max(0, d.x0 + e.clientX - d.startX), y: Math.max(0, d.y0 + e.clientY - d.startY) } : d));
    const up = () => {
      const d = dragRef.current;
      if (d && (d.x !== d.x0 || d.y !== d.y0)) setNode(d.index, { ...q.nodes[d.index], x: Math.round(d.x), y: Math.round(d.y) });
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.index]);

  function renameNode(i: number, raw: string) {
    setIdDrafts((d) => {
      const next = { ...d };
      delete next[i];
      return next;
    });
    const id = raw.trim();
    const old = q.nodes[i].id;
    if (!id || id === old || q.nodes.some((n, j) => j !== i && n.id === id)) return;
    const nodes = q.nodes.map((n, j) => ({
      ...n,
      id: j === i ? id : n.id,
      choices: n.choices.map((c) => (c.target === old ? { ...c, target: id } : c)),
    }));
    setNodes(nodes, q.start === old ? id : q.start);
  }

  function removeNode(i: number) {
    const id = q.nodes[i].id;
    const nodes = removeAt(q.nodes, i).map((n) => ({ ...n, choices: n.choices.map((c) => (c.target === id ? { ...c, target: "" } : c)) }));
    setNodes(nodes, q.start === id ? (nodes[0]?.id ?? "") : q.start);
    setConnecting(null);
  }

  function addNode() {
    const maxY = Math.max(0, ...q.nodes.map((n, i) => pos(n, i).y));
    setNodes([...q.nodes, { id: nextNodeId(q.nodes), text: "Bagian cerita berikutnya.", x: 24, y: maxY + 240, choices: [] }]);
  }

  function clickNode(i: number) {
    if (!connecting) return;
    const from = q.nodes[connecting.node];
    setNode(connecting.node, { ...from, choices: replaceAt(from.choices, connecting.choice, { ...from.choices[connecting.choice], target: q.nodes[i].id }) });
    setConnecting(null);
  }

  const width = Math.max(700, ...q.nodes.map((n, i) => pos(n, i).x + NODE_W + 60));
  const height = Math.max(420, ...q.nodes.map((n, i) => pos(n, i).y + 320));

  return (
    <div className={s.sec}>
      <div className={s.secT}>Cerita</div>
      <div className={s.storyToolbar}>
        <button type="button" className={s.addBtn} onClick={addNode}>
          ＋ Tambah node
        </button>
        <span className={s.secSub} style={{ margin: 0 }}>
          {connecting
            ? "🎯 Klik node tujuan untuk menyambungkan (Esc untuk batal)."
            : "Klik ● di sebuah pilihan, lalu klik node tujuannya. ✓ = pilihan yang benar, 🚩 = node awal."}
        </span>
      </div>
      <div className={s.storyScroll}>
        <div ref={canvasRef} className={cx(s.storyCanvas, connecting && s.storyCanvasConnecting)} style={{ width, height }}>
          <svg className={s.storySvg} aria-hidden="true">
            <defs>
              <marker id="story-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
              <marker id="story-arrow-ok" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#16a34a" />
              </marker>
            </defs>
            {lines.map((l, i) => (
              <path key={i} d={l.d} fill="none" stroke={l.correct ? "#16a34a" : "#94a3b8"} strokeWidth={2} markerEnd={`url(#${l.correct ? "story-arrow-ok" : "story-arrow"})`} />
            ))}
          </svg>
          {q.nodes.map((n, i) => {
            const p = pos(n, i);
            const isStart = q.start === n.id;
            return (
              <div
                key={i}
                data-node={i}
                className={cx(s.storyNode, isStart && s.storyNodeStart)}
                style={{ left: p.x, top: p.y }}
                onClick={() => clickNode(i)}
              >
                <div
                  className={s.storyNodeHdr}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("input,button")) return;
                    setDrag({ index: i, startX: e.clientX, startY: e.clientY, x0: p.x, y0: p.y, x: p.x, y: p.y });
                  }}
                >
                  <input
                    className={s.storyNodeId}
                    value={idDrafts[i] ?? n.id}
                    aria-label="Id node"
                    onChange={(e) => setIdDrafts((d) => ({ ...d, [i]: e.target.value }))}
                    onBlur={(e) => renameNode(i, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {isStart && <span title="Node awal">🚩</span>}
                  <span className={s.storyNodeActs}>
                    {!isStart && (
                      <button type="button" title="Jadikan node awal" onClick={(e) => (e.stopPropagation(), onChange({ ...q, start: n.id }))}>
                        🚩
                      </button>
                    )}
                    <button type="button" title="Hapus node" disabled={q.nodes.length <= 1} onClick={(e) => (e.stopPropagation(), removeNode(i))}>
                      ✕
                    </button>
                  </span>
                </div>
                <textarea className={s.storyText} value={n.text} onClick={(e) => e.stopPropagation()} onChange={(e) => setNode(i, { ...n, text: e.target.value })} />
                <label className={s.storyEnding} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={Boolean(n.ending)} onChange={(e) => setNode(i, { ...n, ending: e.target.checked || undefined })} /> Node ending
                </label>
                {n.ending ? (
                  <input
                    className={s.storyEndingLbl}
                    value={n.endingLabel ?? ""}
                    placeholder="Label ending (mis. Ending Baik)"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNode(i, { ...n, endingLabel: e.target.value || undefined })}
                  />
                ) : (
                  <div className={s.storyChoices}>
                    {n.choices.map((c, ci) => {
                      const active = connecting?.node === i && connecting.choice === ci;
                      return (
                        <div key={ci} className={s.storyChoiceRow}>
                          <button
                            type="button"
                            data-conn={`${i}_${ci}`}
                            className={cx(s.storyConnector, c.target && s.storyConnectorWired, active && s.storyConnectorActive)}
                            title={c.target ? `Menuju: ${c.target}` : "Belum tersambung — klik untuk menyambungkan"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConnecting(active ? null : { node: i, choice: ci });
                            }}
                          />
                          <input
                            className={s.storyChoiceIn}
                            value={c.text}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setNode(i, { ...n, choices: replaceAt(n.choices, ci, { ...c, text: e.target.value }) })}
                          />
                          <button
                            type="button"
                            className={cx(s.storyCorrect, c.correct && s.storyCorrectOn)}
                            title="Pilihan yang benar"
                            aria-pressed={Boolean(c.correct)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setNode(i, { ...n, choices: replaceAt(n.choices, ci, { ...c, correct: !c.correct || undefined }) });
                            }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className={s.storyRm}
                            title="Hapus pilihan"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNode(i, { ...n, choices: removeAt(n.choices, ci) });
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className={s.storyAddChoice}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNode(i, { ...n, choices: [...n.choices, { text: `Pilihan ${n.choices.length + 1}`, target: "" }] });
                      }}
                    >
                      ＋ Tambah pilihan
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
