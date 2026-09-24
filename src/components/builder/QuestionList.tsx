"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QUESTION_TYPE_GROUPS, QUESTION_TYPE_ICONS } from "@/lib/content/builderDefaults";
import { QUESTION_TYPE_LABELS, type Question, type QuestionType } from "@/lib/content/questions";
import { cx } from "./fields";
import s from "./builder.module.css";

/** The left sidebar: add a question by type, then pick, reorder (drag), duplicate or delete. */
export function QuestionList({
  questions,
  selected,
  withProblems,
  canAddFlow,
  onSelect,
  onAdd,
  onMove,
  onDuplicate,
  onDelete,
}: {
  questions: Question[];
  selected: number;
  /** Question ids that have a problem. */
  withProblems: Set<string>;
  canAddFlow: boolean;
  onSelect: (i: number) => void;
  onAdd: (type: QuestionType) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <aside className={s.sidebar}>
      <div className={s.qlistWrap}>
        <Link href="/admin/konten" className={s.qlistBack}>
          ← Kembali ke daftar konten
        </Link>
        <div className={s.addWrap} ref={wrapRef}>
          <button type="button" className={s.qlistAddBtn} onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            ＋ Tambah Soal
          </button>
          {menu && (
            <div className={s.typeMenu} role="menu">
              {QUESTION_TYPE_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className={s.typeMenuLbl}>{g.label}</div>
                  {g.types.map((t) => {
                    const disabled = t === "flow" && !canAddFlow;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="menuitem"
                        className={s.typeItem}
                        disabled={disabled}
                        title={disabled ? "Satu quest maksimal punya satu soal flow" : undefined}
                        onClick={() => {
                          onAdd(t);
                          setMenu(false);
                        }}
                      >
                        <span className={s.typeIcon}>{QUESTION_TYPE_ICONS[t]}</span>
                        {QUESTION_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={s.qlistLbl}>Daftar soal ({questions.length})</div>
        <div className={s.qlist}>
          {questions.map((q, i) => (
            <div
              key={`${i}-${q.id}`}
              className={cx(s.qlistItem, i === selected && s.qlistItemSel, dragIdx === i && s.qlistItemDragging, overIdx === i && dragIdx !== i && s.qlistItemOver)}
              draggable
              onDragStart={(e) => {
                setDragIdx(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragOver={(e) => {
                if (dragIdx === null) return;
                e.preventDefault();
                setOverIdx(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== i) onMove(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onClick={() => onSelect(i)}
            >
              <span className={s.qlistDrag}>⠿</span>
              <div className={s.qlistContent}>
                <div className={cx(s.qlistNum, withProblems.has(q.id) && s.qlistNumWarn)} title={withProblems.has(q.id) ? "Ada yang perlu dilengkapi" : undefined}>
                  {i + 1}
                </div>
                <div className={s.qlistBody}>
                  <div className={cx(s.qlistText, !q.prompt && s.qlistTextEmpty)}>{q.prompt || "Pertanyaan belum diisi"}</div>
                  <div className={s.qlistType}>
                    <span>{QUESTION_TYPE_ICONS[q.type]}</span>
                    {QUESTION_TYPE_LABELS[q.type]}
                  </div>
                </div>
                <div className={s.qlistActs}>
                  <button
                    type="button"
                    className={s.qlistAct}
                    title={q.type === "flow" ? "Soal flow tidak bisa diduplikat (maksimal satu per quest)" : "Duplikat"}
                    disabled={q.type === "flow"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(i);
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className={cx(s.qlistAct, s.qlistActDel)}
                    title="Hapus"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(i);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
          {questions.length === 0 && <div className={s.pempty}>Belum ada soal. Klik ＋ Tambah Soal.</div>}
        </div>
      </div>
    </aside>
  );
}
