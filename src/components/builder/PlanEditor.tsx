"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_WIDGET_TYPES } from "@/lib/content/caseEdit";
import { flowQuestionOf } from "@/lib/content/questHelpers";
import { DEFAULT_PLAN_INTRO, findPlanProblems, type ResolvedPlan } from "@/lib/practice/plan";
import { practicePlanContentSchema, type MainExercise, type PracticePlanContent } from "@/lib/practice/schema";
import { analyzeFlowForFixer, mainExerciseFromAnalysis, type FlowAnalysis } from "@/lib/practice/fixerFromFlow";
import type { PlanEditorData } from "@/lib/practice/planAdmin";
import { PracticeWorkbook } from "@/components/practice/PracticeWorkbook";
import { BuilderProvider, cx, moveItem, removeAt, replaceAt } from "./fields";
import { WidgetList } from "./WidgetEditors";
import { downloadJson, pickJson } from "./transfer";
import s from "./builder.module.css";

/**
 * A mentor's editor for one participant's Modul Latihan plan — the greeting,
 * what they're already good at, which modules in which order, and a "latihan
 * utama" that can be rebuilt from their own quest flow. It replaces the JSON
 * import (prisma/seed-practice-plans.ts); files can still be exported and
 * imported here. Saving checks the plan against the case the participant's
 * session runs and keeps their progress and written answers.
 */

type Section = "sapaan" | "modul" | "utama";
type Mode = "edit" | "preview";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "sapaan", label: "Sapaan & kekuatan", icon: "👋" },
  { key: "modul", label: "Modul", icon: "☰" },
  { key: "utama", label: "Latihan utama", icon: "★" },
];

function defaultPlan(data: PlanEditorData): PracticePlanContent {
  return { first: null, strengths: [], intro: DEFAULT_PLAN_INTRO, modules: data.content.modules.map((m) => m.key), main: null };
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Problems for the editor: the schema's, then the same checks the server runs. */
function planProblems(plan: PracticePlanContent, data: PlanEditorData): string[] {
  const parsed = practicePlanContentSchema.safeParse(plan);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(" › ") || "rencana"}: ${i.message}`);
  const problems = findPlanProblems(parsed.data, data.content);
  if (parsed.data.main && !parsed.data.main.title.trim()) problems.push("latihan utama belum punya judul");
  return problems;
}

function StringRows({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  return (
    <div>
      {items.map((t, i) => (
        <div key={i} className={s.row}>
          <span className={s.seqNum}>{i + 1}</span>
          <input className={s.rowIn} value={t} placeholder={placeholder} onChange={(e) => onChange(replaceAt(items, i, e.target.value))} />
          <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} aria-label="Hapus" onClick={() => onChange(removeAt(items, i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className={s.linkBtn} onClick={() => onChange([...items, ""])}>
        {addLabel}
      </button>
    </div>
  );
}

function GenerateDialog({
  analysis,
  hasMain,
  onClose,
  onApply,
}: {
  analysis: FlowAnalysis;
  hasMain: boolean;
  onClose: () => void;
  onApply: (main: MainExercise, how: "replace" | "append") => void;
}) {
  const [chosen, setChosen] = useState(() => new Set(analysis.candidates.filter((c) => c.suggested).map((c) => c.rule)));
  const unmet = analysis.candidates.filter((c) => !c.initialPasses).length;
  const toggle = (rule: string) => setChosen((prev) => new Set(prev.has(rule) ? [...prev].filter((r) => r !== rule) : [...prev, rule]));
  const build = () => mainExerciseFromAnalysis(analysis, [...chosen]);
  return (
    <div className={s.overlay} role="dialog" aria-modal="true">
      <div className={cx(s.dialog, s.dialogWide)}>
        <div className={s.dialogTitle}>Latihan utama dari jawaban Quest {analysis.order}</div>
        <div className={s.dialogText}>
          Flow peserta ({analysis.nodes.length} node, {analysis.initial.length} panah) menjadi kondisi awal latihan &quot;perbaiki flow&quot;. Pilih aturan yang harus
          dipenuhi peserta. Aturan yang <b>belum terpenuhi</b> oleh flow-nya sudah dicentang dan menjadi langkah-langkah latihan.
        </div>
        {analysis.rubricMisses.length > 0 && (
          <div className={s.hint} style={{ marginBottom: 12 }}>
            <b>Belum terpenuhi menurut rubrik Quest {analysis.order}:</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {analysis.rubricMisses.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div className={s.genBox}>
          <div className={s.secT}>
            Aturan ({unmet} belum terpenuhi dari {analysis.candidates.length})
          </div>
          {analysis.candidates.map((c) => (
            <label key={c.rule} className={s.genRule}>
              <input type="checkbox" checked={chosen.has(c.rule)} onChange={() => toggle(c.rule)} />
              <span style={{ flex: 1 }}>{c.label}</span>
              <span className={cx(s.badge, c.initialPasses ? s.badgeOk : s.badgeNo)}>{c.initialPasses ? "sudah terpenuhi" : "belum terpenuhi"}</span>
              {c.solutionPasses === false && <span className={cx(s.badge, s.badgeNo)}>kunci tidak memenuhi</span>}
            </label>
          ))}
        </div>
        <div className={s.fieldHint} style={{ margin: "10px 0" }}>
          {analysis.solution
            ? `Contoh jawaban diambil dari kunci jawaban soal ini; ${analysis.extra.length} panah yang belum dibuat peserta ditambahkan sebagai sambungan yang bisa dinyalakan.`
            : "Soal ini belum punya kunci jawaban, jadi contoh jawaban perlu kamu lengkapi di editor latihan (kolom Contoh) setelah ini."}
          {analysis.skipped.length > 0 && ` Dilewati: ${analysis.skipped.join("; ")}.`}
        </div>
        <div className={s.dialogActs}>
          <button type="button" className={cx(s.btn, s.btnGhost)} onClick={onClose}>
            Batal
          </button>
          {hasMain && (
            <button type="button" className={cx(s.btn, s.btnGhost)} disabled={chosen.size === 0} onClick={() => onApply(build(), "append")}>
              Tambahkan ke latihan utama
            </button>
          )}
          <button type="button" className={cx(s.btn, s.btnPrimary)} disabled={chosen.size === 0} onClick={() => onApply(build(), "replace")}>
            {hasMain ? "Ganti latihan utama" : "Buat latihan utama"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlanEditor({ data }: { data: PlanEditorData }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PracticePlanContent>(() => data.plan ?? defaultPlan(data));
  const [hasPlan, setHasPlan] = useState(Boolean(data.plan));
  const [revision, setRevision] = useState(data.revision);
  // Without a stored plan the editor starts from the default one; it counts as unsaved only once changed.
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(data.plan ?? defaultPlan(data)));
  const [section, setSection] = useState<Section>("sapaan");
  const [mode, setMode] = useState<Mode>("edit");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "delete" | "conflict">(null);
  const [gen, setGen] = useState<FlowAnalysis | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: "ok" | "error"; n: number } | null>(null);

  const json = useMemo(() => JSON.stringify(plan), [plan]);
  const dirty = json !== savedJson;
  const problems = useMemo(() => planProblems(plan, data), [plan, data]);
  const firstName = data.displayName.trim().split(/\s+/)[0];

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setToastMsg((t) => ({ text, kind, n: (t?.n ?? 0) + 1 }));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3600);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (problems.length) {
      toast(`Masih ada ${problems.length} hal yang perlu diperbaiki sebelum disimpan.`, "error");
      return;
    }
    setBusy(true);
    const res = await send(`/api/admin/latihan/${data.sessionParticipantId}/plan`, "PUT", { content: plan, baseRevision: revision }).catch(() => null);
    setBusy(false);
    if (!res) return toast("Gagal menyimpan — periksa koneksi internet.", "error");
    if (res.status === 409) return setDialog("conflict");
    if (!res.ok) return toast([res.data?.error, ...(res.data?.problems ?? [])].filter(Boolean).join(": ") || "Gagal menyimpan.", "error");
    setRevision(res.data.revision);
    setSavedJson(json);
    setHasPlan(true);
    toast("Rencana tersimpan. Peserta melihatnya saat membuka Modul Latihan.");
  }

  async function removePlan() {
    setBusy(true);
    const res = await send(`/api/admin/latihan/${data.sessionParticipantId}/plan?rev=${encodeURIComponent(revision)}`, "DELETE").catch(() => null);
    setBusy(false);
    setDialog(null);
    if (!res) return toast("Gagal menghapus — periksa koneksi internet.", "error");
    if (res.status === 409) return setDialog("conflict");
    if (!res.ok) return toast(res.data?.error ?? "Gagal menghapus rencana.", "error");
    setRevision(res.data.revision);
    setHasPlan(false);
    const fresh = defaultPlan(data);
    setPlan(fresh);
    setSavedJson(JSON.stringify(fresh));
    toast("Rencana dihapus. Peserta kembali melihat semua modul.");
    router.refresh();
  }

  function generate(order: number) {
    const source = data.flows.find((f) => f.order === order);
    const quest = data.content.quests.find((q) => q.order === order);
    const question = quest && flowQuestionOf(quest);
    if (!source?.flow || !quest || !question) return;
    const r = analyzeFlowForFixer({ order, questTitle: quest.title, flow: source.flow, question, library: data.content.nodes });
    if (!r.ok) return toast(r.error, "error");
    setGen(r.analysis);
  }

  const setMain = (main: MainExercise | null) => setPlan((p) => ({ ...p, main }));
  const main = plan.main ?? null;
  const mainProblems = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const p of problems) {
      const m = /^latihan utama, widget (\d+): (.*)$/.exec(p);
      if (m) map.set(Number(m[1]) - 1, [...(map.get(Number(m[1]) - 1) ?? []), m[2]]);
    }
    return map;
  }, [problems]);

  const moduleByKey = new Map(data.content.modules.map((m) => [m.key, m]));
  const unpicked = data.content.modules.filter((m) => !plan.modules.includes(m.key));

  const resolved: ResolvedPlan = { heading: `Halo, ${plan.first || firstName}`, subtitle: data.displayName, content: plan, personal: true };

  return (
    <BuilderProvider value={{ caseKey: data.content.key, nodes: data.content.nodes, upload: null, toast }}>
      <div className={s.root}>
        <header className={s.hdr}>
          <Link href={`/admin/latihan/${data.sessionParticipantId}`} className={s.logo}>
            <span className={s.logoMark}>★</span>Rencana Latihan
          </Link>
          <span className={s.hdiv} />
          <span className={s.caseTitle} style={{ maxWidth: 320 }} title={`${data.displayName} · ${data.sessionTitle}`}>
            <b style={{ color: "var(--t1)" }}>{data.displayName}</b> · {data.sessionCode} · {data.content.title}
          </span>
          <div className={s.hdrRight}>
            <span className={cx(s.status, dirty && s.statusDirty)}>{dirty ? "● Belum disimpan" : hasPlan ? "Rencana tersimpan" : "Belum ada rencana personal"}</span>
            {problems.length ? <span className={s.problemChip}>{problems.length} perlu diperbaiki</span> : <span className={s.okChip}>✓ Siap disimpan</span>}
            <div className={s.tabGrp} role="tablist">
              {(
                [
                  ["edit", "Edit"],
                  ["preview", "Preview"],
                ] as const
              ).map(([m, lbl]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} className={cx(s.tabBtn, mode === m && s.tabBtnActive)} onClick={() => setMode(m)}>
                  {lbl}
                </button>
              ))}
            </div>
            <button type="button" className={cx(s.btn, s.btnPrimary)} disabled={busy || (!dirty && hasPlan)} onClick={() => void save()}>
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </header>

        {mode === "preview" ? (
          <div className={s.workspace}>
            <main className={cx(s.canvas, s.canvasFlush)}>
              {problems.length > 0 && <div className={s.hint} style={{ margin: 12 }}>Pratinjau dengan rencana yang belum lengkap; beberapa bagian mungkin belum tampil benar.</div>}
              <PracticeWorkbook
                key={json.length}
                plan={resolved}
                modules={data.content.modules}
                nodes={data.content.nodes}
                closing={data.content.practiceClosing}
                initialCompleted={[]}
                initialAnswers={{}}
                mode="preview"
                embedded
              />
            </main>
          </div>
        ) : (
          <div className={s.workspace}>
            <aside className={s.sidebar}>
              <div className={s.qlistWrap}>
                <Link href="/admin/latihan" className={s.qlistBack}>
                  ← Kembali ke Modul Latihan
                </Link>
                <div className={s.navList}>
                  {SECTIONS.map((sec) => (
                    <button key={sec.key} type="button" className={cx(s.navItem, section === sec.key && s.navItemSel)} onClick={() => setSection(sec.key)}>
                      <span className={s.typeIcon}>{sec.icon}</span>
                      {sec.label}
                    </button>
                  ))}
                </div>
                <div className={s.qlistLbl}>Progres peserta</div>
                <div className={s.fieldHint} style={{ marginTop: -8 }}>
                  {data.completedParts.length} bagian selesai · {data.answerCount} jawaban tertulis. Menyimpan rencana tidak menghapus progres ini.
                </div>
                <div className={s.qlistLbl}>File</div>
                <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => downloadJson("plan", plan, ["rencana", data.displayName], { session: data.sessionCode })}>
                  ⬇ Ekspor rencana (JSON)
                </button>
                <button
                  type="button"
                  className={cx(s.btn, s.btnGhost)}
                  onClick={async () => {
                    const r = await pickJson("plan");
                    if (!r) return;
                    if (!r.ok) return toast(r.error, "error");
                    setPlan(r.data);
                    toast("Rencana diimpor. Periksa lalu simpan.");
                  }}
                >
                  ⬆ Impor rencana (JSON)
                </button>
                {hasPlan && (
                  <button type="button" className={cx(s.btn, s.btnDanger)} onClick={() => setDialog("delete")}>
                    Hapus rencana personal
                  </button>
                )}
              </div>
            </aside>

            <main className={s.canvas}>
              <div className={s.canvasInner}>
                {data.invalidPlan != null && !hasPlan && (
                  <div className={s.hint}>
                    Rencana yang tersimpan tidak lagi sesuai format, jadi editor dimulai dari rencana bawaan.{" "}
                    <button type="button" className={s.linkBtn} onClick={() => downloadJson("plan", data.invalidPlan, ["rencana-lama", data.displayName])}>
                      Unduh rencana lama
                    </button>
                  </div>
                )}

                {section === "sapaan" && (
                  <>
                    <div>
                      <div className={s.secT}>Sapaan</div>
                      <div className={s.secSub}>Bagian pembuka halaman Modul Latihan peserta.</div>
                    </div>
                    <div className={s.card}>
                      <div className={s.field}>
                        <label className={s.fieldLbl}>Nama panggilan</label>
                        <input className={s.input} value={plan.first ?? ""} placeholder={firstName} onChange={(e) => setPlan({ ...plan, first: e.target.value || null })} />
                        <div className={s.fieldHint}>Kosongkan untuk memakai kata pertama nama peserta (&quot;Halo, {firstName}&quot;).</div>
                      </div>
                      <div className={s.field}>
                        <label className={s.fieldLbl}>Pengantar</label>
                        <textarea className={s.textarea} rows={4} value={plan.intro} onChange={(e) => setPlan({ ...plan, intro: e.target.value })} />
                      </div>
                    </div>
                    <div className={s.card}>
                      <div className={s.secT}>Yang sudah kuat dari peserta</div>
                      <div className={s.secSub}>Tampil sebagai daftar di awal halaman. Boleh kosong.</div>
                      <StringRows items={plan.strengths} onChange={(strengths) => setPlan({ ...plan, strengths })} placeholder="mis. Jalur menuju formulir sudah tepat di semua quest." addLabel="＋ Kekuatan" />
                    </div>
                  </>
                )}

                {section === "modul" && (
                  <>
                    <div>
                      <div className={s.secT}>Modul</div>
                      <div className={s.secSub}>Centang modul yang relevan dengan celah peserta, lalu atur urutannya. Peserta mengerjakan dari atas.</div>
                    </div>
                    <div>
                      {plan.modules.map((k, i) => {
                        const m = moduleByKey.get(k);
                        return (
                          <div key={k} className={s.modPick}>
                            <input type="checkbox" checked onChange={() => setPlan({ ...plan, modules: plan.modules.filter((x) => x !== k) })} aria-label={`Keluarkan modul ${k}`} />
                            <span className={s.seqNum}>{i + 1}</span>
                            <div className={s.modPickBody}>
                              <b>{m ? m.title : `Modul ${k} (tidak ada di kasus)`}</b>
                              <span>{m ? `${m.key} · ${m.time} · ${m.tagline}` : "Hapus dari rencana"}</span>
                            </div>
                            <button type="button" className={s.iconBtn} title="Naik" disabled={i === 0} onClick={() => setPlan({ ...plan, modules: moveItem(plan.modules, i, i - 1) })}>
                              ↑
                            </button>
                            <button type="button" className={s.iconBtn} title="Turun" disabled={i === plan.modules.length - 1} onClick={() => setPlan({ ...plan, modules: moveItem(plan.modules, i, i + 1) })}>
                              ↓
                            </button>
                          </div>
                        );
                      })}
                      {unpicked.map((m) => (
                        <div key={m.key} className={cx(s.modPick, s.modPickOff)}>
                          <input type="checkbox" checked={false} onChange={() => setPlan({ ...plan, modules: [...plan.modules, m.key] })} aria-label={`Tambah modul ${m.key}`} />
                          <span className={s.seqNum}>–</span>
                          <div className={s.modPickBody}>
                            <b>{m.title}</b>
                            <span>
                              {m.key} · {m.time} · {m.tagline}
                            </span>
                          </div>
                        </div>
                      ))}
                      {data.content.modules.length === 0 && <div className={s.pempty}>Kasus ini belum punya modul.</div>}
                    </div>
                  </>
                )}

                {section === "utama" && (
                  <>
                    <div>
                      <div className={s.secT}>Latihan utama</div>
                      <div className={s.secSub}>Latihan personal di akhir halaman, biasanya memperbaiki flow peserta sendiri dari quest.</div>
                    </div>
                    <div className={s.card}>
                      <div className={s.secT}>Buat dari jawaban peserta</div>
                      <div className={s.secSub}>Menyalin flow yang dikirim peserta menjadi latihan &quot;perbaiki flow&quot; dan menandai aturan yang belum terpenuhi.</div>
                      <div className={s.trow} style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        {data.flows.map((f) => (
                          <button key={f.order} type="button" className={cx(s.btn, s.btnGhost)} disabled={!f.flow} title={f.flow ? f.title : "Peserta belum membuat flow di quest ini"} onClick={() => generate(f.order)}>
                            ⤳ Quest {f.order}
                            {!f.flow && " (belum ada flow)"}
                          </button>
                        ))}
                        {data.flows.length === 0 && <span className={s.fieldHint}>Kasus ini tidak punya soal flow.</span>}
                      </div>
                    </div>
                    {main ? (
                      <>
                        <div className={s.card}>
                          <div className={s.field}>
                            <label className={s.fieldLbl}>Judul</label>
                            <input className={s.input} value={main.title} onChange={(e) => setMain({ ...main, title: e.target.value })} />
                          </div>
                          <div className={s.field}>
                            <label className={s.fieldLbl}>Pengantar</label>
                            <textarea className={s.textarea} rows={3} value={main.intro} onChange={(e) => setMain({ ...main, intro: e.target.value })} />
                          </div>
                          <div className={s.field}>
                            <label className={s.fieldLbl}>Langkah (opsional)</label>
                            <StringRows
                              items={main.steps ?? []}
                              onChange={(steps) => setMain({ ...main, steps: steps.length ? steps : undefined })}
                              placeholder="mis. Tambahkan cabang Tidak dari Verifikasi NIS."
                              addLabel="＋ Langkah"
                            />
                          </div>
                        </div>
                        <WidgetList
                          plan
                          widgets={main.widgets}
                          types={PLAN_WIDGET_TYPES}
                          problems={mainProblems}
                          emptyText="Latihan utama minimal punya satu widget."
                          onChange={(widgets) => setMain({ ...main, widgets })}
                        />
                        <div className={s.card}>
                          <label className={s.check}>
                            <input type="checkbox" checked={Boolean(main.extra)} onChange={(e) => setMain({ ...main, extra: e.target.checked ? { title: "Tantangan tambahan", text: "" } : undefined })} />
                            <span>Tambah catatan tantangan di akhir</span>
                          </label>
                          {main.extra && (
                            <>
                              <div className={s.field} style={{ marginTop: 10 }}>
                                <label className={s.fieldLbl}>Judul</label>
                                <input className={s.input} value={main.extra.title} onChange={(e) => setMain({ ...main, extra: { ...main.extra!, title: e.target.value } })} />
                              </div>
                              <div className={s.field}>
                                <label className={s.fieldLbl}>Isi</label>
                                <textarea className={s.textarea} rows={3} value={main.extra.text} onChange={(e) => setMain({ ...main, extra: { ...main.extra!, text: e.target.value } })} />
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          className={cx(s.btn, s.btnDanger)}
                          style={{ alignSelf: "flex-start" }}
                          onClick={() => window.confirm("Hapus latihan utama dari rencana ini?") && setMain(null)}
                        >
                          Hapus latihan utama
                        </button>
                      </>
                    ) : (
                      <div className={s.card}>
                        <div className={s.secSub}>Belum ada latihan utama. Buat dari jawaban peserta di atas, atau mulai kosong.</div>
                        <button
                          type="button"
                          className={s.addBtn}
                          onClick={() => setMain({ title: "Latihan utama", intro: "", widgets: [{ type: "write", q: "", placeholder: "Tulis jawabanmu di sini…" }] })}
                        >
                          ＋ Latihan utama kosong
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </main>

            <aside className={s.rpanel}>
              <div className={s.ptabs}>
                <span className={cx(s.ptab, s.ptabActive)}>Cek{problems.length > 0 && <span className={s.ptabCount}>{problems.length}</span>}</span>
              </div>
              <div className={s.pbody}>
                {problems.length === 0 ? (
                  <div className={s.pempty}>✓ Rencana ini lolos semua pemeriksaan.</div>
                ) : (
                  <div className={s.problemList}>
                    {problems.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        className={s.problem}
                        onClick={() => setSection(p.startsWith("latihan utama") || p.startsWith("main") ? "utama" : p.startsWith("modul") || p.startsWith("modules") || p.includes("daftar modul") ? "modul" : "sapaan")}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {gen && (
          <GenerateDialog
            analysis={gen}
            hasMain={Boolean(main)}
            onClose={() => setGen(null)}
            onApply={(next, how) => {
              setMain(how === "append" && main ? { ...main, steps: [...(main.steps ?? []), ...(next.steps ?? [])], widgets: [...main.widgets, ...next.widgets] } : next);
              setGen(null);
              setSection("utama");
              toast(next.widgets[0]?.type === "fixer" && gen.solution ? "Latihan dibuat dari jawaban peserta." : "Latihan dibuat. Lengkapi contoh jawabannya di kolom Contoh.");
            }}
          />
        )}
        {dialog === "delete" && (
          <div className={s.overlay} role="dialog" aria-modal="true">
            <div className={s.dialog}>
              <div className={s.dialogTitle}>Hapus rencana personal?</div>
              <div className={s.dialogText}>Peserta kembali melihat semua modul kasus. Progres dan jawaban tertulisnya tetap tersimpan.</div>
              <div className={s.dialogActs}>
                <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => setDialog(null)} disabled={busy}>
                  Batal
                </button>
                <button type="button" className={cx(s.btn, s.btnDanger)} onClick={() => void removePlan()} disabled={busy}>
                  Hapus rencana
                </button>
              </div>
            </div>
          </div>
        )}
        {dialog === "conflict" && (
          <div className={s.overlay} role="dialog" aria-modal="true">
            <div className={s.dialog}>
              <div className={s.dialogTitle}>Rencana diubah di tempat lain</div>
              <div className={s.dialogText}>Rencana peserta ini sudah disimpan dari tab atau perangkat lain. Muat ulang untuk melihat versi terbarunya; perubahan di sini akan hilang.</div>
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

