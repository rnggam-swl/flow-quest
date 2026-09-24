"use client";

import { useState } from "react";
import type { QuestContent } from "@/lib/content/case";
import type { DraftProblem } from "@/lib/content/draftProblems";
import { QUESTION_TYPE_GROUPS, QUESTION_TYPE_ICONS } from "@/lib/content/builderDefaults";
import { QUESTION_ID, QUESTION_TYPE_LABELS, type Question, type QuestionType } from "@/lib/content/questions";
import { MARKDOWN_HINT, MarkdownArea, NumberField, Toggle, cx } from "./fields";
import s from "./builder.module.css";

export type PanelTab = "soal" | "quest" | "masalah";

function QuestionTab({
  question: q,
  takenIds,
  canBeFlow,
  onChange,
  onChangeType,
}: {
  question: Question;
  takenIds: string[];
  canBeFlow: boolean;
  onChange: (q: Question) => void;
  onChangeType: (t: QuestionType) => void;
}) {
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const idValue = idDraft ?? q.id;
  const idError = idDraft === null ? null : !QUESTION_ID.test(idDraft) ? "Hanya huruf, angka, - dan _, diawali huruf/angka" : takenIds.includes(idDraft) ? "Id ini sudah dipakai soal lain di quest ini" : null;

  return (
    <>
      <div className={s.psec}>
        <div className={s.psecT}>Tipe soal</div>
        <select
          className={s.psel}
          value={q.type}
          onChange={(e) => {
            const t = e.target.value as QuestionType;
            if (window.confirm(`Ubah tipe soal menjadi ${QUESTION_TYPE_LABELS[t]}? Pertanyaan dan media tetap, tetapi isian jawabannya dimulai dari awal.`)) onChangeType(t);
          }}
        >
          {QUESTION_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
            <option key={t} value={t} disabled={t === "flow" && !canBeFlow && q.type !== "flow"}>
              {QUESTION_TYPE_ICONS[t]} {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className={s.psec}>
        <div className={s.psecT}>Identitas</div>
        <div className={s.pg}>
          <label className={s.plbl}>Id soal</label>
          <input
            className={cx(s.pin, s.mono)}
            value={idValue}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={() => {
              if (idDraft !== null && !idError && idDraft !== q.id) onChange({ ...q, id: idDraft });
              setIdDraft(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <div className={idError ? s.warn : s.fieldHint}>{idError ?? "Dipakai untuk menyimpan jawaban peserta. Ubah hanya sebelum quest dimainkan."}</div>
        </div>
      </div>
      {q.type === "flow" ? (
        <div className={s.psec}>
          <div className={s.psecT}>Refleksi setelah kirim flow</div>
          <div className={s.pg}>
            <Toggle
              label="Minta alasan"
              on={Boolean(q.reflection)}
              onChange={(on) => onChange({ ...q, reflection: on ? { prompt: "Kenapa kamu menyusun flow seperti ini?", required: false } : undefined })}
            />
          </div>
          {q.reflection && (
            <>
              <div className={s.pg}>
                <label className={s.plbl}>Pertanyaan refleksi</label>
                <input className={s.pin} value={q.reflection.prompt} onChange={(e) => onChange({ ...q, reflection: { ...q.reflection!, prompt: e.target.value } })} />
              </div>
              <div className={s.pg}>
                <label className={s.plbl}>Contoh jawaban (placeholder)</label>
                <input className={s.pin} value={q.reflection.placeholder ?? ""} onChange={(e) => onChange({ ...q, reflection: { ...q.reflection!, placeholder: e.target.value || undefined } })} />
              </div>
              <div className={s.pg}>
                <Toggle label="Wajib diisi" on={q.reflection.required} onChange={(required) => onChange({ ...q, reflection: { ...q.reflection!, required } })} />
              </div>
              <div className={s.fieldHint}>Alasan dinilai 0–10 dari panjangnya (kategori Rationale).</div>
            </>
          )}
        </div>
      ) : (
        <div className={s.psec}>
          <div className={s.psecT}>Feedback</div>
          <div className={s.pg}>
            <label className={s.plbl}>Jika benar semua</label>
            <MarkdownArea className={s.pta} value={q.feedback?.correct} placeholder="mis. **Tepat!** …" onChange={(correct) => onChange({ ...q, feedback: tidyFeedback({ ...q.feedback, correct }) })} />
          </div>
          <div className={s.pg}>
            <label className={s.plbl}>Jika belum tepat</label>
            <MarkdownArea className={s.pta} value={q.feedback?.incorrect} placeholder="Petunjuk untuk mencoba lagi" onChange={(incorrect) => onChange({ ...q, feedback: tidyFeedback({ ...q.feedback, incorrect }) })} />
          </div>
          <div className={s.fieldHint}>{MARKDOWN_HINT}</div>
        </div>
      )}
    </>
  );
}

function tidyFeedback(f: { correct?: string; incorrect?: string }) {
  return f.correct || f.incorrect ? f : undefined;
}

function QuestTab({ quest, onChange, onDiscard, canDiscard }: { quest: QuestContent; onChange: (q: QuestContent) => void; onDiscard: () => void; canDiscard: boolean }) {
  return (
    <>
      <div className={s.psec}>
        <div className={s.psecT}>Quest {quest.order}</div>
        <div className={s.pg}>
          <label className={s.plbl}>Judul</label>
          <input className={s.pin} value={quest.title} onChange={(e) => onChange({ ...quest, title: e.target.value })} />
        </div>
        <div className={s.pg}>
          <label className={s.plbl}>Tujuan quest</label>
          <textarea className={s.pta} value={quest.objective} onChange={(e) => onChange({ ...quest, objective: e.target.value })} />
        </div>
        <div className={s.pg}>
          <label className={s.plbl}>Skenario pembuka (opsional)</label>
          <MarkdownArea className={s.pta} value={quest.intro} placeholder="Tampil di atas soal pertama" onChange={(intro) => onChange({ ...quest, intro })} />
          <div className={s.fieldHint}>{MARKDOWN_HINT}</div>
        </div>
      </div>
      <div className={s.psec}>
        <div className={s.psecT}>Nilai & waktu</div>
        <div className={s.pg}>
          <label className={s.plbl}>XP saat selesai</label>
          <NumberField className={s.pin} value={quest.xp} min={0} step={1} onChange={(v) => onChange({ ...quest, xp: Math.max(0, Math.round(v ?? 0)) })} />
        </div>
        <div className={s.pg}>
          <label className={s.plbl}>Timer (menit)</label>
          <NumberField
            className={s.pin}
            value={quest.timeLimitMinutes}
            allowEmpty
            min={1}
            step={1}
            placeholder="Tanpa timer"
            onChange={(v) => onChange({ ...quest, timeLimitMinutes: v === null ? null : Math.max(1, Math.round(v)) })}
          />
          <div className={s.fieldHint}>Kosongkan untuk tanpa timer. Admin masih bisa mengubahnya per session.</div>
        </div>
      </div>
      <div className={s.psec}>
        <div className={s.psecT}>Mode cek</div>
        <div className={s.smodeOpts}>
          {(
            [
              ["end", "Cek di akhir", "Jawaban bisa diubah sampai dikirim; hasil dan pembahasan tampil di halaman hasil."],
              ["instant", "Cek langsung", "Setiap soal dicek (dan dikunci) sebelum lanjut, lengkap dengan feedback-nya."],
            ] as const
          ).map(([value, lbl, sub]) => (
            <label key={value} className={cx(s.smodeOpt, quest.checkMode === value && s.smodeOptSel)}>
              <input type="radio" name="checkMode" checked={quest.checkMode === value} onChange={() => onChange({ ...quest, checkMode: value })} />
              <div>
                <div className={s.smodeLbl}>{lbl}</div>
                <div className={s.smodeSub}>{sub}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      {canDiscard && (
        <div className={s.psec} style={{ borderBottom: "none" }}>
          <div className={s.psecT}>Draf</div>
          <button type="button" className={cx(s.btn, s.btnDanger)} style={{ width: "100%", justifyContent: "center" }} onClick={onDiscard}>
            Buang draf, kembali ke versi terbit
          </button>
        </div>
      )}
    </>
  );
}

function ProblemsTab({ problems, onJump }: { problems: DraftProblem[]; onJump: (p: DraftProblem) => void }) {
  if (!problems.length) return <div className={s.pempty}>✓ Tidak ada masalah. Kasus ini siap dipublish.</div>;
  return (
    <div className={s.problemList}>
      {problems.map((p, i) => {
        const where = p.quest ? `Quest ${p.quest}${p.question ? ` · ${p.question}` : ""}` : "Kasus";
        const text = p.message.replace(/^quest \d+(, soal "[^"]+"| , soal \d+|, soal \d+)?: /, "");
        return (
          <button key={i} type="button" className={s.problem} onClick={() => onJump(p)}>
            <span className={s.problemWhere}>{where}</span>
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function RightPanel({
  tab,
  onTab,
  problems,
  question,
  quest,
  canBeFlow,
  onQuestionChange,
  onChangeType,
  onQuestChange,
  onJump,
  onDiscard,
  canDiscard,
}: {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  problems: DraftProblem[];
  question: Question | null;
  quest: QuestContent;
  canBeFlow: boolean;
  onQuestionChange: (q: Question) => void;
  onChangeType: (t: QuestionType) => void;
  onQuestChange: (q: QuestContent) => void;
  onJump: (p: DraftProblem) => void;
  onDiscard: () => void;
  canDiscard: boolean;
}) {
  return (
    <aside className={s.rpanel}>
      <div className={s.ptabs} role="tablist">
        {(
          [
            ["soal", "Soal"],
            ["quest", "Quest"],
            ["masalah", "Cek"],
          ] as const
        ).map(([t, lbl]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={cx(s.ptab, tab === t && s.ptabActive)} onClick={() => onTab(t)}>
            {lbl}
            {t === "masalah" && problems.length > 0 && <span className={s.ptabCount}>{problems.length}</span>}
          </button>
        ))}
      </div>
      <div className={s.pbody}>
        {tab === "soal" &&
          (question ? (
            <QuestionTab
              key={`${quest.order}:${question.id}`}
              question={question}
              takenIds={quest.questions.map((x) => x.id).filter((id) => id !== question.id)}
              canBeFlow={canBeFlow}
              onChange={onQuestionChange}
              onChangeType={onChangeType}
            />
          ) : (
            <div className={s.pempty}>Pilih atau tambah soal dulu.</div>
          ))}
        {tab === "quest" && <QuestTab quest={quest} onChange={onQuestChange} onDiscard={onDiscard} canDiscard={canDiscard} />}
        {tab === "masalah" && <ProblemsTab problems={problems} onJump={onJump} />}
      </div>
    </aside>
  );
}
