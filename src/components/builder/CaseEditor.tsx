"use client";

import Link from "next/link";
import { useState } from "react";
import { NODE_TYPES, type CaseContent, type CaseNode } from "@/lib/content/case";
import { addQuest, duplicateQuest, insertQuest, libraryNodesFor, moveQuest, nextNodeKey, nodeKeyUsage, questNodeKeys, removeQuest, renameNodeKey } from "@/lib/content/caseEdit";
import type { CaseSection, DraftProblem } from "@/lib/content/draftProblems";
import { QUESTION_TYPE_ICONS } from "@/lib/content/builderDefaults";
import { QUESTION_TYPE_LABELS } from "@/lib/content/questions";
import { MARKDOWN_HINT, MarkdownArea, cx, removeAt, replaceAt, useBuilder } from "./fields";
import { downloadJson, offerShippedNodes, pickJson } from "./transfer";
import s from "./builder.module.css";

/**
 * The builder's "Kasus" view: the story participants read, the node library
 * every flow in the case is built from, and the case's quests as a list to
 * add, reorder, copy, remove, export and import. Questions themselves are
 * edited in the Quest view.
 */

export const CASE_SECTIONS: { key: Exclude<CaseSection, "closing">; label: string; icon: string }[] = [
  { key: "info", label: "Cerita & brief", icon: "📖" },
  { key: "nodes", label: "Kamus node", icon: "◇" },
  { key: "quests", label: "Daftar quest", icon: "☰" },
];

const NODE_TYPE_LABELS: Record<CaseNode["nodeType"], string> = {
  START: "Awal",
  ACTION: "Aksi",
  SCREEN: "Layar",
  SYSTEM: "Sistem",
  DECISION: "Keputusan",
  OUTCOME: "Hasil akhir",
  ERROR: "Error",
};

const NODE_KEY = /^[a-z0-9][a-z0-9_]*$/;

function InfoSection({ content, onChange, canDiscard, neverPublished, onDiscard }: { content: CaseContent; onChange: (c: CaseContent) => void; canDiscard: boolean; neverPublished: boolean; onDiscard: () => void }) {
  const { toast } = useBuilder();
  const set = <K extends keyof CaseContent>(k: K, v: CaseContent[K]) => onChange({ ...content, [k]: v });
  return (
    <>
      <div>
        <input className={s.titleIn} value={content.title} placeholder="Judul kasus" onChange={(e) => set("title", e.target.value)} />
        <div className={s.fieldHint}>
          Kunci kasus: <span className={s.mono}>{content.key}</span> (tidak bisa diubah)
        </div>
      </div>
      <div className={s.card}>
        <div className={s.field}>
          <label className={s.fieldLbl}>Cerita kasus</label>
          <textarea className={s.textarea} rows={4} value={content.description} onChange={(e) => set("description", e.target.value)} placeholder="Situasi yang dihadapi pengguna, dibaca peserta sebelum mulai." />
        </div>
        <div className={cx(s.row, s.rowTop)}>
          <div className={s.field} style={{ flex: 1 }}>
            <label className={s.fieldLbl}>Persona (opsional)</label>
            <input className={s.input} value={content.persona ?? ""} placeholder="mis. Rani, siswa kelas 10" onChange={(e) => set("persona", e.target.value || undefined)} />
          </div>
          <div className={s.field} style={{ flex: 1 }}>
            <label className={s.fieldLbl}>Tujuan pengguna (opsional)</label>
            <input className={s.input} value={content.userGoal ?? ""} placeholder="mis. Bergabung ke klub foto" onChange={(e) => set("userGoal", e.target.value || undefined)} />
          </div>
        </div>
        <div className={s.field}>
          <label className={s.fieldLbl}>Brief di halaman daftar quest (opsional)</label>
          <MarkdownArea className={s.textarea} rows={4} value={content.brief} onChange={(brief) => set("brief", brief)} placeholder="Tampil di bawah judul di /brief." />
          <div className={s.fieldHint}>{MARKDOWN_HINT}</div>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.secT}>File JSON</div>
        <div className={s.secSub}>Ekspor isi builder saat ini (termasuk yang belum disimpan), atau ganti seluruh isinya dari file kasus. Kunci kasus tetap {content.key}.</div>
        <div className={s.trow} style={{ justifyContent: "flex-start", gap: 8 }}>
          <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => downloadJson("case", content, [content.key, "builder"], { caseKey: content.key })}>
            ⬇ Ekspor kasus
          </button>
          <button
            type="button"
            className={cx(s.btn, s.btnGhost)}
            onClick={async () => {
              const r = await pickJson("case");
              if (!r) return;
              if (!r.ok) return toast(r.error, "error");
              const note = r.data.key !== content.key ? ` Kunci di file (${r.data.key}) diganti menjadi ${content.key}.` : "";
              if (!window.confirm(`Ganti seluruh isi kasus ini dengan "${r.data.title}"?${note} Perubahan baru tersimpan setelah kamu klik Simpan.`)) return;
              onChange({ ...r.data, key: content.key });
              toast("Kasus diimpor. Periksa lalu simpan.");
            }}
          >
            ⬆ Impor kasus
          </button>
        </div>
      </div>

      {canDiscard && (
        <div className={s.card}>
          <div className={s.secT}>{neverPublished ? "Hapus kasus" : "Draf"}</div>
          <div className={s.secSub}>
            {neverPublished ? "Kasus ini belum pernah terbit, jadi menghapus drafnya menghapus kasusnya juga." : "Buang semua perubahan yang belum dipublish dan kembali ke versi terbit."}
          </div>
          <button type="button" className={cx(s.btn, s.btnDanger)} onClick={onDiscard}>
            {neverPublished ? "Hapus kasus ini" : "Buang draf"}
          </button>
        </div>
      )}
    </>
  );
}

function NodeKeyInput({ node, taken, onRename }: { node: CaseNode; taken: string[]; onRename: (to: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? node.key;
  const error = draft === null || draft === node.key ? null : !NODE_KEY.test(draft) ? "huruf kecil, angka, _" : taken.includes(draft) ? "sudah dipakai" : null;
  return (
    <div className={s.nodeKeyCell}>
      <input
        className={cx(s.rowIn, s.mono, error && s.inputBad)}
        value={value}
        onChange={(e) => setDraft(e.target.value.trim())}
        onBlur={() => {
          if (draft !== null && !error && draft !== node.key) onRename(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label="Kunci node"
      />
      {error && <span className={s.warn}>{error}</span>}
    </div>
  );
}

function NodesSection({ content, onChange }: { content: CaseContent; onChange: (c: CaseContent) => void }) {
  const setNode = (i: number, n: CaseNode) => onChange({ ...content, nodes: replaceAt(content.nodes, i, n) });
  return (
    <>
      <div>
        <div className={s.secT}>Kamus node</div>
        <div className={s.secSub}>
          Semua node yang bisa dipakai flow di kasus ini: palet soal flow, rubrik, dan latihan di Modul Latihan. Label harus unik karena flow peserta disimpan per
          label. Mengganti kunci ikut mengganti semua tempat yang memakainya.
        </div>
      </div>
      <div className={s.card} style={{ padding: 8 }}>
        <div className={cx(s.nodeRow, s.nodeHead)}>
          <span>Ikon</span>
          <span>Label</span>
          <span>Jenis</span>
          <span>Kunci</span>
          <span>Dipakai</span>
          <span />
        </div>
        {content.nodes.map((n, i) => {
          const uses = nodeKeyUsage(content, n.key);
          return (
            <div key={i} className={s.nodeRow}>
              <input className={cx(s.rowIn, s.iconIn)} value={n.icon} onChange={(e) => setNode(i, { ...n, icon: e.target.value })} aria-label="Ikon" />
              <input className={s.rowIn} value={n.label} onChange={(e) => setNode(i, { ...n, label: e.target.value })} aria-label="Label" />
              <select className={s.rowSel} value={n.nodeType} onChange={(e) => setNode(i, { ...n, nodeType: e.target.value as CaseNode["nodeType"] })} aria-label="Jenis node">
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {NODE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <NodeKeyInput node={n} taken={content.nodes.filter((_, j) => j !== i).map((x) => x.key)} onRename={(to) => onChange(renameNodeKey(content, n.key, to))} />
              <span className={s.useCount} title={uses.join("\n") || "Belum dipakai kasus ini (rencana peserta mungkin masih memakainya)"}>
                {uses.length ? `${uses.length}×` : "—"}
              </span>
              <button
                type="button"
                className={cx(s.iconBtn, s.iconBtnDel)}
                disabled={uses.length > 0}
                title={uses.length ? `Masih dipakai: ${uses.join(", ")}` : "Hapus node"}
                onClick={() => onChange({ ...content, nodes: removeAt(content.nodes, i) })}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={s.linkBtn}
          style={{ margin: 8 }}
          onClick={() => onChange({ ...content, nodes: [...content.nodes, { key: nextNodeKey(content.nodes), label: `Node ${content.nodes.length + 1}`, nodeType: "SCREEN", icon: "□" }] })}
        >
          ＋ Tambah node
        </button>
      </div>
      <div className={s.hint}>
        Node baru belum muncul di soal flow sampai kamu menambahkannya ke palet soal itu. Session yang sudah berjalan tetap memakai kamus versinya sendiri.
      </div>
    </>
  );
}

function QuestsSection({ content, onChange, onOpenQuest }: { content: CaseContent; onChange: (c: CaseContent) => void; onOpenQuest: (order: number) => void }) {
  const { toast } = useBuilder();
  const quests = [...content.quests].sort((a, b) => a.order - b.order);

  async function importQuest(replaceOrder?: number) {
    const r = await pickJson("quest");
    if (!r) return;
    if (!r.ok) return toast(r.error, "error");
    if (replaceOrder !== undefined && !window.confirm(`Ganti Quest ${replaceOrder} dengan "${r.data.title}" dari file?`)) return;
    onChange(offerShippedNodes(insertQuest(content, r.data, replaceOrder), r.nodes, toast));
    toast(replaceOrder ? `Quest ${replaceOrder} diganti dari file.` : `"${r.data.title}" ditambahkan sebagai Quest ${content.quests.length + 1}.`);
  }

  return (
    <>
      <div>
        <div className={s.secT}>Daftar quest</div>
        <div className={s.secSub}>Urutan di sini adalah urutan peserta mengerjakan quest. Soal di setiap quest diedit di tampilan Quest.</div>
      </div>
      <div className={s.card} style={{ padding: 8 }}>
        {quests.map((q) => (
          <div key={q.order} className={s.questRow}>
            <div className={s.qlistNum}>{q.order}</div>
            <button type="button" className={s.questRowBody} onClick={() => onOpenQuest(q.order)} title="Buka soal quest ini">
              <b>{q.title || "(tanpa judul)"}</b>
              <span>
                {q.questions.length} soal · {q.xp} XP · {q.timeLimitMinutes ? `${q.timeLimitMinutes} menit` : "tanpa timer"} · {q.checkMode === "instant" ? "cek langsung" : "cek di akhir"}
              </span>
              <span className={s.questTypes} title={q.questions.map((x) => QUESTION_TYPE_LABELS[x.type]).join(", ")}>
                {q.questions.map((x) => QUESTION_TYPE_ICONS[x.type]).join(" ")}
              </span>
            </button>
            <div className={s.qlistActs} style={{ opacity: 1 }}>
              <button type="button" className={s.iconBtn} title="Naik" disabled={q.order === 1} onClick={() => onChange(moveQuest(content, q.order, q.order - 1))}>
                ↑
              </button>
              <button type="button" className={s.iconBtn} title="Turun" disabled={q.order === quests.length} onClick={() => onChange(moveQuest(content, q.order, q.order + 1))}>
                ↓
              </button>
              <button type="button" className={s.iconBtn} title="Duplikat quest" onClick={() => onChange(duplicateQuest(content, q.order))}>
                ⧉
              </button>
              <button type="button" className={s.iconBtn} title="Ekspor quest (JSON)" onClick={() => downloadJson("quest", q, [content.key, "quest", q.order], { caseKey: content.key, quest: q.order }, libraryNodesFor(content, questNodeKeys(q)))}>
                ⬇
              </button>
              <button type="button" className={s.iconBtn} title="Ganti dari file JSON" onClick={() => void importQuest(q.order)}>
                ⬆
              </button>
              <button
                type="button"
                className={cx(s.iconBtn, s.iconBtnDel)}
                title={quests.length <= 1 ? "Kasus harus punya minimal satu quest" : "Hapus quest"}
                disabled={quests.length <= 1}
                onClick={() => {
                  if (window.confirm(`Hapus Quest ${q.order} "${q.title}" beserta ${q.questions.length} soalnya? Quest setelahnya naik satu nomor.`)) onChange(removeQuest(content, q.order));
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className={s.trow} style={{ justifyContent: "flex-start", gap: 8 }}>
        <button type="button" className={s.addBtn} onClick={() => onChange(addQuest(content))}>
          ＋ Quest baru
        </button>
        <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => void importQuest()}>
          ⬆ Impor quest dari JSON
        </button>
      </div>
      <div className={s.hint}>
        Mengubah urutan, menambah, atau menghapus quest hanya berlaku untuk session yang memakai versi baru. Peserta di session lama tetap melihat quest versinya.
      </div>
    </>
  );
}

export function CaseSidebar({ section, onSection, problems }: { section: CaseSection; onSection: (s: CaseSection) => void; problems: DraftProblem[] }) {
  return (
    <aside className={s.sidebar}>
      <div className={s.qlistWrap}>
        <Link href="/admin/konten" className={s.qlistBack}>
          ← Kembali ke daftar konten
        </Link>
        <div className={s.qlistLbl}>Kasus</div>
        <div className={s.navList}>
          {CASE_SECTIONS.map((sec) => {
            const n = problems.filter((p) => !p.quest && !p.module && (p.section ?? "info") === sec.key).length;
            return (
              <button key={sec.key} type="button" className={cx(s.navItem, section === sec.key && s.navItemSel)} onClick={() => onSection(sec.key)}>
                <span className={s.typeIcon}>{sec.icon}</span>
                {sec.label}
                {n > 0 && <span className={s.ptabCount}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export function CaseEditor({
  content,
  section,
  onChange,
  onOpenQuest,
  canDiscard,
  neverPublished,
  onDiscard,
}: {
  content: CaseContent;
  section: CaseSection;
  onChange: (c: CaseContent) => void;
  onOpenQuest: (order: number) => void;
  canDiscard: boolean;
  neverPublished: boolean;
  onDiscard: () => void;
}) {
  return (
    <div className={s.canvasInner}>
      {section === "nodes" ? (
        <NodesSection content={content} onChange={onChange} />
      ) : section === "quests" ? (
        <QuestsSection content={content} onChange={onChange} onOpenQuest={onOpenQuest} />
      ) : (
        <InfoSection content={content} onChange={onChange} canDiscard={canDiscard} neverPublished={neverPublished} onDiscard={onDiscard} />
      )}
    </div>
  );
}
