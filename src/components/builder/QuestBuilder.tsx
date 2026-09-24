"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseContent, QuestContent } from "@/lib/content/case";
import { addQuest, libraryNodesFor, questNodeKeys } from "@/lib/content/caseEdit";
import { findDraftProblems, type CaseSection, type DraftProblem } from "@/lib/content/draftProblems";
import { changeQuestionType, duplicateQuestion, newQuestion } from "@/lib/content/builderDefaults";
import type { Question, QuestionType } from "@/lib/content/questions";
import { AutoTextarea, BuilderProvider, MediaEditor, cx, moveItem, removeAt, type UploadResult } from "./fields";
import { BooleanEditor, ChoiceEditor, GroupingEditor, HotspotEditor, MatchingEditor, NumberEditor, OddOneOutEditor, RangeEditor, SequencingEditor, WordBlankEditor } from "./QuizEditors";
import { BranchingEditor } from "./BranchingEditor";
import { FlowQuestionEditor } from "./FlowQuestionEditor";
import { QuestionList } from "./QuestionList";
import { ProblemsPanel, RightPanel, type PanelTab } from "./RightPanel";
import { QuestPlay, QuestionPreview } from "./PlayPane";
import { CaseEditor, CaseSidebar } from "./CaseEditor";
import { CLOSING, ModuleEditor, ModuleSidebar } from "./ModuleEditor";
import { downloadJson } from "./transfer";
import s from "./builder.module.css";

/**
 * The content builder, over the whole case held in memory, in three views:
 * Kasus (story, node library, the quest list), Quest (one quest's questions,
 * laid out like the Formulir prototype — question list, editor, settings
 * panel) and Modul (Modul Latihan modules and their widgets). Saving writes
 * the case's draft; publishing turns the saved draft into the case's next
 * version (see drafts.ts).
 */

export interface BuilderInitial {
  caseKey: string;
  title: string;
  content: CaseContent;
  revision: string;
  fromDraft: boolean;
  publishedVersion: number | null;
  idleSessions: number;
  lockedSessions: number;
}

export type BuilderView = "kasus" | "quest" | "modul";
type Mode = "build" | "preview" | "play";
type Dialog = null | "publish" | "discard" | "conflict";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function QuestionEditor({ question, onChange }: { question: Question; onChange: (q: Question) => void }) {
  const set = <T extends Question>(q: T) => onChange(q);
  const body = (() => {
    switch (question.type) {
      case "singlechoice":
      case "multiselect":
        return <ChoiceEditor question={question} onChange={set} />;
      case "boolean":
        return <BooleanEditor question={question} onChange={set} />;
      case "number":
        return <NumberEditor question={question} onChange={set} />;
      case "range":
        return <RangeEditor question={question} onChange={set} />;
      case "matching":
        return <MatchingEditor question={question} onChange={set} />;
      case "grouping":
        return <GroupingEditor question={question} onChange={set} />;
      case "wordblank":
        return <WordBlankEditor question={question} onChange={set} />;
      case "sequencing":
        return <SequencingEditor question={question} onChange={set} />;
      case "oddoneout":
        return <OddOneOutEditor question={question} onChange={set} />;
      case "hotspot":
        return <HotspotEditor question={question} onChange={set} />;
      case "branching":
        return <BranchingEditor question={question} onChange={set} />;
      case "flow":
        return <FlowQuestionEditor question={question} onChange={set} />;
    }
  })();
  const isFlow = question.type === "flow";
  return (
    <div className={s.canvasInner}>
      <div>
        <AutoTextarea
          className={s.titleIn}
          value={question.prompt}
          placeholder={isFlow ? "Tulis instruksi/skenario yang tampil di atas kanvas…" : "Tulis pertanyaan…"}
          onChange={(e) => onChange({ ...question, prompt: e.target.value.replace(/\n/g, " ") })}
        />
        <AutoTextarea className={s.helpIn} value={question.help ?? ""} placeholder="Teks bantuan (opsional)" onChange={(e) => onChange({ ...question, help: e.target.value || undefined })} />
      </div>
      {!isFlow && <MediaEditor media={question.media} onChange={(media) => onChange({ ...question, media })} />}
      {body}
    </div>
  );
}

export function QuestBuilder({
  initial,
  initialQuest,
  initialView = "quest",
  initialModule,
  uploadEnabled,
}: {
  initial: BuilderInitial;
  initialQuest: number;
  initialView?: BuilderView;
  initialModule?: string;
  uploadEnabled: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState<CaseContent>(initial.content);
  const [revision, setRevision] = useState(initial.revision);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial.content));
  const [hasDraft, setHasDraft] = useState(initial.fromDraft);
  const [questOrder, setQuestOrder] = useState(() => (initial.content.quests.some((q) => q.order === initialQuest) ? initialQuest : (initial.content.quests[0]?.order ?? 1)));
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<BuilderView>(initialView);
  const [caseSection, setCaseSection] = useState<CaseSection>("info");
  const [moduleKey, setModuleKey] = useState(() => (initial.content.modules.some((m) => m.key === initialModule) ? initialModule! : (initial.content.modules[0]?.key ?? CLOSING)));
  const [mode, setMode] = useState<Mode>("build");
  const [tab, setTab] = useState<PanelTab>("soal");
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard">(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [moveIdle, setMoveIdle] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: "ok" | "error"; n: number } | null>(null);
  const [playRun, setPlayRun] = useState(0);

  const json = useMemo(() => JSON.stringify(content), [content]);
  const dirty = json !== savedJson;
  const problems = useMemo(() => findDraftProblems(content).problems, [content]);

  const qi = content.quests.findIndex((q) => q.order === questOrder);
  const quest = content.quests[qi];
  const questions = quest?.questions ?? [];
  const current = questions[Math.min(selected, questions.length - 1)] ?? null;
  const flowIndex = questions.findIndex((q) => q.type === "flow");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setToastMsg((t) => ({ text, kind, n: (t?.n ?? 0) + 1 }));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const upload = useMemo(() => {
    if (!uploadEnabled) return null;
    return async (file: File): Promise<UploadResult> => {
      const { uploadMedia } = await import("./upload");
      return uploadMedia(initial.caseKey, file);
    };
  }, [uploadEnabled, initial.caseKey]);

  // Keep the view, quest and module in the URL so a reload (or a publish) comes back to them.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.set("quest", String(questOrder));
    if (view === "modul" && moduleKey !== CLOSING) url.searchParams.set("modul", moduleKey);
    else url.searchParams.delete("modul");
    window.history.replaceState(window.history.state, "", url);
  }, [view, questOrder, moduleKey]);

  function openView(v: BuilderView) {
    setView(v);
    setMode("build");
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateQuest = (fn: (q: QuestContent) => QuestContent) =>
    setContent((c) => ({ ...c, quests: c.quests.map((q) => (q.order === questOrder ? fn(q) : q)) }));
  const setQuestions = (fn: (qs: Question[]) => Question[]) => updateQuest((q) => ({ ...q, questions: fn(q.questions) }));
  const updateCurrent = (next: Question) => setQuestions((qs) => qs.map((q, i) => (i === selected ? next : q)));

  async function save(): Promise<boolean> {
    if (!dirty && hasDraft) return true;
    setBusy("save");
    const res = await send(`/api/admin/content/${initial.caseKey}/draft`, "PUT", { content, baseRevision: revision }).catch(() => null);
    setBusy(null);
    if (!res) {
      toast("Gagal menyimpan — periksa koneksi internet.", "error");
      return false;
    }
    if (res.status === 409) {
      setDialog("conflict");
      return false;
    }
    if (!res.ok) {
      toast(res.data?.error ?? "Gagal menyimpan draf.", "error");
      return false;
    }
    setRevision(res.data.revision);
    setSavedJson(json);
    setHasDraft(true);
    toast("Draf tersimpan.");
    return true;
  }

  // Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openPublish() {
    if (problems.length) {
      setTab("masalah");
      setMode("build");
      toast(`Masih ada ${problems.length} hal yang perlu dilengkapi sebelum publish.`, "error");
      return;
    }
    if (!(await save())) return;
    setDialog("publish");
  }

  async function publish() {
    setBusy("publish");
    const res = await send(`/api/admin/content/${initial.caseKey}/publish`, "POST", { baseRevision: revision, note: note.trim() || undefined, moveIdleSessions: moveIdle }).catch(() => null);
    setBusy(null);
    if (!res) {
      toast("Gagal publish — periksa koneksi internet.", "error");
      return;
    }
    if (res.status === 409) {
      setDialog("conflict");
      return;
    }
    if (!res.ok) {
      setDialog(null);
      toast(res.data?.error ?? "Gagal publish.", "error");
      if (res.status === 422) setTab("masalah");
      return;
    }
    setDialog(null);
    const moved = res.data.movedSessions ? ` ${res.data.movedSessions} session dipindah ke versi ini.` : "";
    toast(res.data.status === "unchanged" ? `Tidak ada perubahan sejak versi ${res.data.version}; draf dihapus.` : `Versi ${res.data.version} terbit.${moved}`);
    router.refresh();
  }

  async function discard() {
    setBusy("discard");
    const res = await send(`/api/admin/content/${initial.caseKey}/draft`, "DELETE").catch(() => null);
    setBusy(null);
    setDialog(null);
    if (!res?.ok) {
      toast(res?.data?.error ?? "Gagal membuang draf.", "error");
      return;
    }
    if (res.data?.deletedCase) {
      setSavedJson(json);
      router.push("/admin/konten");
      return;
    }
    router.refresh();
  }

  function jump(p: DraftProblem) {
    setMode("build");
    if (p.module !== undefined || p.section === "closing") {
      setView("modul");
      if (p.module && content.modules.some((m) => m.key === p.module)) setModuleKey(p.module);
      else if (p.section === "closing") setModuleKey(CLOSING);
      return;
    }
    if (!p.quest) {
      setView("kasus");
      setCaseSection(p.section ?? "info");
      return;
    }
    if (p.quest && content.quests.some((q) => q.order === p.quest)) {
      setView("quest");
      setQuestOrder(p.quest);
      const qs = content.quests.find((q) => q.order === p.quest)!.questions;
      const i = p.question ? qs.findIndex((q) => q.id === p.question) : -1;
      if (i >= 0) {
        setSelected(i);
        setTab("soal");
      } else setTab("quest");
    }
  }

  const withProblems = new Set(problems.filter((p) => p.quest === questOrder && p.question).map((p) => p.question!));

  const neverPublished = initial.publishedVersion === null;
  const hasTabs = view === "quest" || view === "modul";

  return (
    <BuilderProvider value={{ caseKey: initial.caseKey, nodes: content.nodes, upload, toast }}>
      <div className={s.root}>
        <header className={s.hdr}>
          <a href="/admin/konten" className={s.logo}>
            <span className={s.logoMark}>Q</span>Builder
          </a>
          <span className={s.hdiv} />
          <span className={s.caseTitle} title={content.title}>
            {content.title || "(tanpa judul)"}
          </span>
          <div className={s.viewNav} role="tablist" aria-label="Bagian builder">
            {(
              [
                ["kasus", "Kasus"],
                ["quest", "Quest"],
                ["modul", "Modul"],
              ] as const
            ).map(([v, lbl]) => {
              const n = problems.filter((p) => (v === "quest" ? p.quest : v === "modul" ? p.module !== undefined || p.section === "closing" : !p.quest && p.module === undefined && p.section !== "closing")).length;
              return (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={cx(s.viewBtn, view === v && s.viewBtnActive)} onClick={() => openView(v)}>
                  {lbl}
                  {n > 0 && <span className={s.viewCount}>{n}</span>}
                </button>
              );
            })}
          </div>
          {view === "quest" && (
            <select
              className={s.questSel}
              value={questOrder}
              onChange={(e) => {
                if (e.target.value === "new") {
                  setContent((c) => addQuest(c));
                  setQuestOrder(content.quests.length + 1);
                } else setQuestOrder(Number(e.target.value));
                setSelected(0);
              }}
              aria-label="Quest"
            >
              {[...content.quests]
                .sort((a, b) => a.order - b.order)
                .map((q) => (
                  <option key={q.order} value={q.order}>
                    Quest {q.order} · {q.title}
                  </option>
                ))}
              <option value="new">＋ Quest baru</option>
            </select>
          )}
          <div className={s.hdrRight}>
            <span className={cx(s.status, dirty && s.statusDirty)}>
              {dirty ? "● Belum disimpan" : hasDraft ? "Draf tersimpan" : initial.publishedVersion ? `Versi ${initial.publishedVersion} (terbit)` : ""}
            </span>
            {problems.length ? (
              <button type="button" className={s.problemChip} onClick={() => (setMode("build"), setTab("masalah"))}>
                {problems.length} perlu dilengkapi
              </button>
            ) : (
              <span className={s.okChip}>✓ Siap publish</span>
            )}
            {hasTabs && (
            <div className={s.tabGrp} role="tablist">
              {(
                [
                  ["build", "Build"],
                  ["preview", "Preview"],
                  ["play", "Play"],
                ] as const
              ).filter(([m]) => view === "quest" || m !== "play").map(([m, lbl]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={cx(s.tabBtn, mode === m && s.tabBtnActive)}
                  onClick={() => {
                    setMode(m);
                    if (m === "play") setPlayRun((r) => r + 1);
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            )}
            <button type="button" className={cx(s.btn, s.btnGhost)} disabled={busy !== null || (!dirty && hasDraft)} onClick={() => void save()} title="Ctrl+S">
              {busy === "save" ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" className={cx(s.btn, s.btnPrimary)} disabled={busy !== null} onClick={() => void openPublish()}>
              Publish
            </button>
          </div>
        </header>

        {view === "kasus" && (
          <div className={s.workspace}>
            <CaseSidebar section={caseSection} onSection={setCaseSection} problems={problems} />
            <main className={s.canvas}>
              <CaseEditor
                content={content}
                section={caseSection}
                onChange={setContent}
                onOpenQuest={(order) => {
                  setQuestOrder(order);
                  setSelected(0);
                  openView("quest");
                }}
                canDiscard={hasDraft}
                neverPublished={neverPublished}
                onDiscard={() => setDialog("discard")}
              />
            </main>
            <ProblemsPanel problems={problems} onJump={jump} />
          </div>
        )}

        {view === "modul" && (
          <div className={s.workspace}>
            {mode === "build" && <ModuleSidebar content={content} selected={moduleKey} onSelect={setModuleKey} onChange={setContent} problems={problems} />}
            <main key={`${mode}:${moduleKey}`} className={cx(s.canvas, mode !== "build" && s.canvasFlush)}>
              <ModuleEditor content={content} selected={moduleKey} mode={mode === "build" ? "build" : "preview"} onChange={setContent} onSelect={setModuleKey} problems={problems} />
            </main>
            {mode === "build" && <ProblemsPanel problems={problems} onJump={jump} />}
          </div>
        )}

        {view === "quest" && !quest && <div className={s.empty}>Quest ini tidak ada. Pilih quest lain di atas.</div>}
        {view === "quest" && quest && (
        <div className={s.workspace}>
          {mode === "build" && (
            <QuestionList
              questions={questions}
              selected={selected}
              withProblems={withProblems}
              canAddFlow={flowIndex === -1}
              onSelect={setSelected}
              onAdd={(t: QuestionType) => {
                setQuestions((qs) => [...qs, newQuestion(t, qs.map((q) => q.id), content.nodes)]);
                setSelected(questions.length);
                setTab("soal");
              }}
              onMove={(from, to) => {
                setQuestions((qs) => moveItem(qs, from, to));
                setSelected(to);
              }}
              onDuplicate={(i) => {
                setQuestions((qs) => [...qs.slice(0, i + 1), duplicateQuestion(qs[i], qs.map((q) => q.id)), ...qs.slice(i + 1)]);
                setSelected(i + 1);
              }}
              onDelete={(i) => {
                if (!window.confirm(`Hapus soal ${i + 1}${questions[i].prompt ? ` "${questions[i].prompt.slice(0, 60)}"` : ""}?`)) return;
                setQuestions((qs) => removeAt(qs, i));
                setSelected((sel) => Math.max(0, sel >= i ? sel - 1 : sel));
              }}
            />
          )}

          <main className={s.canvas}>
            {mode === "build" &&
              (current ? (
                <QuestionEditor key={`${questOrder}:${selected}:${current.type}`} question={current} onChange={updateCurrent} />
              ) : (
                <div className={s.empty}>
                  <div className={s.emptyIco}>✦</div>
                  Belum ada soal di quest ini — klik ＋ Tambah Soal di kiri.
                </div>
              ))}
            {mode === "preview" && (
              <div className={s.canvasInner}>
                {current ? <QuestionPreview key={`${questOrder}:${current.id}`} question={current} checkMode={quest.checkMode} nodes={content.nodes} /> : <div className={s.empty}>Belum ada soal.</div>}
                <div className={s.previewNote}>Tampilan peserta untuk soal {selected + 1}. Pilih soal lain di mode Build.</div>
              </div>
            )}
            {mode === "play" && (
              <div className={s.canvasInner} style={{ maxWidth: 1100 }}>
                {questions.length ? <QuestPlay key={playRun} quest={quest} nodes={content.nodes} /> : <div className={s.empty}>Belum ada soal.</div>}
                <div className={s.trow}>
                  <span className={s.previewNote}>Main dari soal pertama, seperti peserta. Tidak ada yang disimpan.</span>
                  <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => setPlayRun((r) => r + 1)}>
                    ↺ Main lagi
                  </button>
                </div>
              </div>
            )}
          </main>

          {mode === "build" && (
            <RightPanel
              tab={tab}
              onTab={setTab}
              problems={problems}
              question={current}
              quest={quest}
              canBeFlow={flowIndex === -1 || flowIndex === selected}
              onQuestionChange={updateCurrent}
              onChangeType={(t) => current && updateCurrent(changeQuestionType(current, t, content.nodes))}
              onQuestChange={(q) => updateQuest(() => q)}
              onJump={jump}
              onDiscard={() => setDialog("discard")}
              canDiscard={hasDraft}
              neverPublished={neverPublished}
              onManageQuests={() => {
                setCaseSection("quests");
                openView("kasus");
              }}
              onExportQuest={() =>
                downloadJson("quest", quest, [content.key, "quest", quest.order], { caseKey: content.key, quest: quest.order }, libraryNodesFor(content, questNodeKeys(quest)))
              }
            />
          )}
        </div>
        )}

        {dialog === "publish" && (
          <div className={s.overlay} role="dialog" aria-modal="true">
            <div className={s.dialog}>
              <div className={s.dialogTitle}>Publish versi {(initial.publishedVersion ?? 0) + 1}?</div>
              <div className={s.dialogText}>
                Session baru akan memakai versi ini. Session yang sudah ada tetap memakai versinya sendiri, jadi jawaban peserta tetap dinilai dengan soal yang
                mereka kerjakan.
              </div>
              <div className={s.pg}>
                <label className={s.plbl}>Catatan perubahan (opsional)</label>
                <input className={s.pin} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Tambah soal matching di Quest 3" maxLength={500} />
              </div>
              {initial.lockedSessions > 0 && (
                <div className={s.hint}>
                  🔒 {initial.lockedSessions} session terkunci di versinya (sedang aktif atau sudah ada progres peserta) dan tidak ikut pindah.
                </div>
              )}
              {initial.idleSessions > 0 && (
                <label className={s.check}>
                  <input type="checkbox" checked={moveIdle} onChange={(e) => setMoveIdle(e.target.checked)} />
                  <span>
                    Pindahkan juga {initial.idleSessions} session yang belum dimulai (tidak aktif, belum ada progres) ke versi ini. Daftar quest-nya ikut
                    diperbarui.
                  </span>
                </label>
              )}
              <div className={s.dialogActs}>
                <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => setDialog(null)} disabled={busy !== null}>
                  Batal
                </button>
                <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={() => void publish()} disabled={busy !== null}>
                  {busy === "publish" ? "Mempublish…" : "Publish"}
                </button>
              </div>
            </div>
          </div>
        )}
        {dialog === "discard" && (
          <div className={s.overlay} role="dialog" aria-modal="true">
            <div className={s.dialog}>
              <div className={s.dialogTitle}>{neverPublished ? "Hapus kasus ini?" : "Buang draf?"}</div>
              <div className={s.dialogText}>
                {neverPublished
                  ? "Kasus ini belum pernah terbit, jadi drafnya adalah satu-satunya isinya. Kasus akan dihapus dari daftar konten."
                  : `Semua perubahan yang belum dipublish akan hilang, dan builder kembali ke versi ${initial.publishedVersion} yang sudah terbit.`}
              </div>
              <div className={s.dialogActs}>
                <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => setDialog(null)} disabled={busy !== null}>
                  Batal
                </button>
                <button type="button" className={cx(s.btn, s.btnDanger)} onClick={() => void discard()} disabled={busy !== null}>
                  {busy === "discard" ? "Membuang…" : neverPublished ? "Hapus kasus" : "Buang draf"}
                </button>
              </div>
            </div>
          </div>
        )}
        {dialog === "conflict" && (
          <div className={s.overlay} role="dialog" aria-modal="true">
            <div className={s.dialog}>
              <div className={s.dialogTitle}>Draf diubah di tempat lain</div>
              <div className={s.dialogText}>
                Draf kasus ini sudah disimpan dari tab atau perangkat lain setelah halaman ini dibuka. Muat ulang untuk melihat versi terbarunya — perubahan di
                halaman ini yang belum tersimpan akan hilang.
              </div>
              <div className={s.dialogActs}>
                <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => setDialog(null)}>
                  Tetap di sini
                </button>
                <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={() => window.location.reload()}>
                  Muat ulang
                </button>
              </div>
            </div>
          </div>
        )}
        {toastMsg && (
          <div key={toastMsg.n} className={cx(s.toast, toastMsg.kind === "error" && s.toastErr)} role="status">
            <span className={s.toastDot} />
            {toastMsg.text}
          </div>
        )}
      </div>
    </BuilderProvider>
  );
}
