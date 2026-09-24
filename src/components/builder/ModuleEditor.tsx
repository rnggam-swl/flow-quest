"use client";

import Link from "next/link";
import { useState } from "react";
import type { CaseContent, ModuleContent, PracticeClosing } from "@/lib/content/case";
import { WIDGET_TYPE_LABELS, duplicateModule, insertModule, libraryNodesFor, moduleNodeKeys, newModule, type WidgetType } from "@/lib/content/caseEdit";
import type { DraftProblem } from "@/lib/content/draftProblems";
import { QUESTION_ID } from "@/lib/content/questions";
import { allModulesView } from "@/lib/practice/plan";
import { PracticeWorkbook } from "@/components/practice/PracticeWorkbook";
import { MARKDOWN_HINT, MarkdownArea, cx, moveItem, removeAt, replaceAt, useBuilder } from "./fields";
import { WidgetList } from "./WidgetEditors";
import { downloadJson, offerShippedNodes, pickJson } from "./transfer";
import s from "./builder.module.css";

/**
 * The builder's "Modul" view: the case's Modul Latihan modules — each a
 * Coba dulu → Penjelasan → Latihan sequence of widgets — and the closing
 * checklist that ends the page. Preview renders the participant's own
 * workbook, fully interactive, with nothing saved.
 */

export const CLOSING = "__penutup";

const STAGES = [
  { key: "coba", label: "1 · Coba dulu", sub: "Pertanyaan pembuka sebelum penjelasan. Penjelasan terbuka setelah peserta mencoba." },
  { key: "penjelasan", label: "2 · Penjelasan", sub: "Teks, aturan, dan diagram yang menjelaskan konsepnya." },
  { key: "latihan", label: "3 · Latihan", sub: "Latihan yang harus selesai semua supaya modul tercatat selesai." },
] as const;

const ALL_TYPES = Object.keys(WIDGET_TYPE_LABELS) as WidgetType[];

/** Problems of one module, per stage and widget index, from messages like "modul B, latihan 3: …". */
function widgetProblems(problems: DraftProblem[], key: string) {
  const byStage = { coba: new Map<number, string[]>(), penjelasan: new Map<number, string[]>(), latihan: new Map<number, string[]>() };
  const general: string[] = [];
  for (const p of problems) {
    if (p.module !== key) continue;
    const m = /^modul [^,]+, (coba|penjelasan|latihan) (\d+): (.*)$/.exec(p.message);
    if (m) {
      const map = byStage[m[1] as keyof typeof byStage];
      const i = Number(m[2]) - 1;
      map.set(i, [...(map.get(i) ?? []), m[3]]);
    } else general.push(p.message);
  }
  return { byStage, general };
}

export function ModuleSidebar({
  content,
  selected,
  onSelect,
  onChange,
  problems,
}: {
  content: CaseContent;
  selected: string;
  onSelect: (key: string) => void;
  onChange: (c: CaseContent) => void;
  problems: DraftProblem[];
}) {
  const { toast } = useBuilder();
  const modules = content.modules;
  return (
    <aside className={s.sidebar}>
      <div className={s.qlistWrap}>
        <Link href="/admin/konten" className={s.qlistBack}>
          ← Kembali ke daftar konten
        </Link>
        <button
          type="button"
          className={s.qlistAddBtn}
          onClick={() => {
            const m = newModule(content);
            onChange({ ...content, modules: [...modules, m] });
            onSelect(m.key);
          }}
        >
          ＋ Modul baru
        </button>
        <div className={s.qlistLbl}>Modul latihan ({modules.length})</div>
        <div className={s.qlist}>
          {modules.map((m, i) => {
            const warn = problems.some((p) => p.module === m.key);
            return (
              <div key={m.key + i} className={cx(s.qlistItem, selected === m.key && s.qlistItemSel)} onClick={() => onSelect(m.key)}>
                <div className={s.qlistContent}>
                  <div className={cx(s.qlistNum, warn && s.qlistNumWarn)} style={warn ? undefined : { background: m.color, color: "#fff" }}>
                    {m.key.length <= 2 ? m.key : i + 1}
                  </div>
                  <div className={s.qlistBody}>
                    <div className={s.qlistText}>{m.title}</div>
                    <div className={s.qlistType}>
                      {m.time} · {m.coba.length + m.penjelasan.length + m.latihan.length} widget
                    </div>
                  </div>
                  <div className={s.qlistActs}>
                    <button type="button" className={s.qlistAct} title="Naik" disabled={i === 0} onClick={(e) => (e.stopPropagation(), onChange({ ...content, modules: moveItem(modules, i, i - 1) }))}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className={s.qlistAct}
                      title="Duplikat"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = duplicateModule(content, m.key);
                        onChange(next);
                        onSelect(next.modules[i + 1].key);
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
                        if (!window.confirm(`Hapus modul ${m.key} "${m.title}"? Rencana peserta yang memakai modul ini tidak lagi menampilkannya.`)) return;
                        onChange({ ...content, modules: removeAt(modules, i) });
                        if (selected === m.key) onSelect(modules[i === 0 ? 1 : i - 1]?.key ?? CLOSING);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {modules.length === 0 && <div className={s.pempty}>Belum ada modul. Kasus tanpa modul tidak membuka Modul Latihan.</div>}
        </div>
        <button
          type="button"
          className={cx(s.btn, s.btnGhost)}
          onClick={async () => {
            const r = await pickJson("module");
            if (!r) return;
            if (!r.ok) return toast(r.error, "error");
            const exists = modules.some((m) => m.key === r.data.key);
            const replace = exists && window.confirm(`Modul ${r.data.key} sudah ada. OK untuk menggantinya, Batal untuk menambahkannya sebagai modul baru.`);
            const next = offerShippedNodes(insertModule(content, r.data, replace), r.nodes, toast);
            onChange(next);
            onSelect(replace ? r.data.key : next.modules[next.modules.length - 1].key);
            toast(`Modul "${r.data.title}" diimpor.`);
          }}
        >
          ⬆ Impor modul dari JSON
        </button>
        <div className={s.qlistLbl}>Halaman</div>
        <div className={cx(s.navItem, selected === CLOSING && s.navItemSel)} role="button" tabIndex={0} onClick={() => onSelect(CLOSING)} onKeyDown={(e) => e.key === "Enter" && onSelect(CLOSING)}>
          <span className={s.typeIcon}>✓</span>
          Penutup halaman
          {problems.some((p) => p.section === "closing") && <span className={s.ptabCount}>!</span>}
        </div>
      </div>
    </aside>
  );
}

function ModuleKeyInput({ module: m, taken, onRename }: { module: ModuleContent; taken: string[]; onRename: (k: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const error = draft === null || draft === m.key ? null : !QUESTION_ID.test(draft) ? "Huruf, angka, - dan _" : taken.includes(draft) ? "Sudah dipakai modul lain" : null;
  return (
    <div className={s.field}>
      <label className={s.fieldLbl}>Kunci</label>
      <input
        className={cx(s.input, s.mono)}
        value={draft ?? m.key}
        onChange={(e) => setDraft(e.target.value.trim())}
        onBlur={() => {
          if (draft !== null && !error && draft !== m.key && window.confirm("Rencana peserta dan progres mereka menyimpan modul per kunci. Tetap ganti kunci?")) onRename(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <div className={error ? s.warn : s.fieldHint}>{error ?? "Dipakai rencana peserta."}</div>
    </div>
  );
}

function ModuleForm({ module: m, content, onChange, onRename, problems }: { module: ModuleContent; content: CaseContent; onChange: (m: ModuleContent) => void; onRename: (k: string) => void; problems: DraftProblem[] }) {
  const { byStage, general } = widgetProblems(problems, m.key);
  return (
    <div className={s.canvasInner}>
      <div>
        <input className={s.titleIn} value={m.title} placeholder="Judul modul" onChange={(e) => onChange({ ...m, title: e.target.value })} />
        <input className={cx(s.helpIn, s.helpInLine)} value={m.tagline} placeholder="Tagline: satu kalimat tentang modul ini" onChange={(e) => onChange({ ...m, tagline: e.target.value })} />
      </div>
      <div className={s.card}>
        <div className={cx(s.row, s.rowTop)}>
          <ModuleKeyInput module={m} taken={content.modules.filter((x) => x !== m).map((x) => x.key)} onRename={onRename} />
          <div className={s.field}>
            <label className={s.fieldLbl}>Durasi</label>
            <input className={s.input} value={m.time} placeholder="10 menit" onChange={(e) => onChange({ ...m, time: e.target.value })} />
          </div>
          <div className={s.field}>
            <label className={s.fieldLbl}>Warna</label>
            <input type="color" className={s.colorIn} value={/^#[0-9a-f]{6}$/i.test(m.color) ? m.color : "#0f9d8a"} onChange={(e) => onChange({ ...m, color: e.target.value })} />
          </div>
          <div className={s.field} style={{ marginLeft: "auto" }}>
            <label className={s.fieldLbl}>&nbsp;</label>
            <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => downloadJson("module", m, [content.key, "modul", m.key], { caseKey: content.key, module: m.key }, libraryNodesFor(content, moduleNodeKeys(m)))}>
              ⬇ Ekspor modul
            </button>
          </div>
        </div>
        {general.length > 0 && (
          <ul className={s.wcardIssues}>
            {general.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
      </div>
      {STAGES.map((st) => (
        <div key={st.key} className={s.stage}>
          <div className={s.stageT}>{st.label}</div>
          <div className={s.secSub}>{st.sub}</div>
          <WidgetList
            widgets={m[st.key]}
            types={st.key === "penjelasan" ? ALL_TYPES.filter((t) => t !== "write") : ALL_TYPES}
            problems={byStage[st.key]}
            emptyText={st.key === "latihan" ? "Latihan minimal punya satu widget." : "Belum ada widget (boleh kosong)."}
            onChange={(widgets) => onChange({ ...m, [st.key]: widgets })}
          />
        </div>
      ))}
    </div>
  );
}

function ClosingForm({ closing, onChange }: { closing: PracticeClosing | undefined; onChange: (c: PracticeClosing | undefined) => void }) {
  return (
    <div className={s.canvasInner}>
      <div>
        <div className={s.secT}>Penutup halaman Modul Latihan</div>
        <div className={s.secSub}>Checklist yang dibawa peserta untuk flow berikutnya, tampil setelah bagian terakhir.</div>
      </div>
      <div className={s.card}>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={Boolean(closing)}
            onChange={(e) => onChange(e.target.checked ? { title: "Checklist untuk flow berikutnya", checklist: ["Tujuan pengguna jelas di awal flow."] } : undefined)}
          />
          <span>Tampilkan penutup</span>
        </label>
      </div>
      {closing && (
        <div className={s.card}>
          <div className={s.field}>
            <label className={s.fieldLbl}>Judul</label>
            <input className={s.input} value={closing.title} onChange={(e) => onChange({ ...closing, title: e.target.value })} />
          </div>
          <div className={s.field}>
            <label className={s.fieldLbl}>Pembuka (opsional)</label>
            <MarkdownArea className={s.textarea} value={closing.intro} onChange={(intro) => onChange({ ...closing, intro })} />
          </div>
          <div className={s.field}>
            <label className={s.fieldLbl}>Checklist</label>
            {closing.checklist.map((item, i) => (
              <div key={i} className={s.row}>
                <span className={s.seqNum}>{i + 1}</span>
                <input className={s.rowIn} value={item} onChange={(e) => onChange({ ...closing, checklist: replaceAt(closing.checklist, i, e.target.value) })} />
                <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} disabled={closing.checklist.length <= 1} onClick={() => onChange({ ...closing, checklist: removeAt(closing.checklist, i) })} aria-label="Hapus">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className={s.linkBtn} onClick={() => onChange({ ...closing, checklist: [...closing.checklist, ""] })}>
              ＋ Butir
            </button>
          </div>
          <div className={s.field}>
            <label className={s.fieldLbl}>Penutup (opsional)</label>
            <MarkdownArea className={s.textarea} value={closing.outro} onChange={(outro) => onChange({ ...closing, outro })} />
            <div className={s.fieldHint}>{MARKDOWN_HINT}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModuleEditor({
  content,
  selected,
  mode,
  onChange,
  onSelect,
  problems,
}: {
  content: CaseContent;
  selected: string;
  mode: "build" | "preview";
  onChange: (c: CaseContent) => void;
  onSelect: (key: string) => void;
  problems: DraftProblem[];
}) {
  const mod = content.modules.find((m) => m.key === selected);

  if (selected === CLOSING) {
    if (mode === "preview") {
      return (
        <PracticeWorkbook
          plan={allModulesView([])}
          modules={[]}
          nodes={content.nodes}
          closing={content.practiceClosing}
          initialCompleted={[]}
          initialAnswers={{}}
          mode="preview"
          embedded
        />
      );
    }
    return <ClosingForm closing={content.practiceClosing} onChange={(practiceClosing) => onChange({ ...content, practiceClosing })} />;
  }
  if (!mod) return <div className={s.empty}>Pilih modul di kiri, atau buat modul baru.</div>;

  if (mode === "preview") {
    return (
      <PracticeWorkbook
        key={JSON.stringify(mod).length}
        plan={allModulesView([mod])}
        modules={[mod]}
        nodes={content.nodes}
        initialCompleted={[]}
        initialAnswers={{}}
        mode="preview"
        embedded
      />
    );
  }
  const i = content.modules.indexOf(mod);
  return (
    <ModuleForm
      key={mod.key}
      module={mod}
      content={content}
      problems={problems}
      onChange={(m) => onChange({ ...content, modules: replaceAt(content.modules, i, m) })}
      onRename={(key) => {
        onChange({ ...content, modules: replaceAt(content.modules, i, { ...mod, key }) });
        onSelect(key);
      }}
    />
  );
}
