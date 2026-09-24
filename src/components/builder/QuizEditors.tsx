"use client";

import { useState, type ReactNode } from "react";
import { wordBlankTokens, type Question, type QuestionType } from "@/lib/content/questions";
import { ImagePicker, MarkdownArea, MediaEditor, NumberField, Segmented, cx, moveItem, removeAt, replaceAt } from "./fields";
import s from "./builder.module.css";

/**
 * The canvas editors for the answer-bearing part of each quiz type — the
 * prototype's per-type editors, plus the answer keys it had no place for
 * (which option is right, the number, the slider value). Each is controlled:
 * it gets the question and reports a new one.
 */

type Q<T extends QuestionType> = Extract<Question, { type: T }>;
export interface EditorProps<T extends QuestionType> {
  question: Q<T>;
  onChange: (q: Q<T>) => void;
}

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.sec}>
      <div className={s.secT}>{title}</div>
      {sub ? <div className={s.secSub}>{sub}</div> : null}
      {children}
    </div>
  );
}

function RemoveBtn({ onClick, disabled, label = "Hapus" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} onClick={onClick} disabled={disabled} title={disabled ? "Jumlah minimum" : label} aria-label={label}>
      ✕
    </button>
  );
}

// ── Single / multiple choice ─────────────────────────────────────────────

export function ChoiceEditor({ question: q, onChange }: EditorProps<"singlechoice" | "multiselect">) {
  const multi = q.type === "multiselect";
  const [openFb, setOpenFb] = useState<Set<number>>(() => new Set(q.options.flatMap((o, i) => (o.feedback ? [i] : []))));
  const setOptions = (options: typeof q.options) => onChange({ ...q, options } as typeof q);
  const toggleCorrect = (i: number) =>
    setOptions(q.options.map((o, j) => (multi ? (j === i ? { ...o, correct: !o.correct || undefined } : o) : { ...o, correct: j === i || undefined })));

  return (
    <Section title="Opsi" sub={multi ? "Tandai semua opsi yang benar. Nilainya: benar dipilih dikurangi salah dipilih." : "Tandai satu opsi yang benar."}>
      {q.options.map((o, i) => (
        <div key={i}>
          <div className={s.row}>
            <button
              type="button"
              className={cx(s.mark, multi && s.markSquare, o.correct && s.markOn)}
              onClick={() => toggleCorrect(i)}
              title={o.correct ? "Jawaban benar" : "Tandai sebagai jawaban benar"}
              aria-pressed={Boolean(o.correct)}
            >
              ✓
            </button>
            <input className={s.rowIn} value={o.text} placeholder={`Opsi ${i + 1}`} onChange={(e) => setOptions(replaceAt(q.options, i, { ...o, text: e.target.value }))} />
            <MediaEditor compact media={o.media} onChange={(media) => setOptions(replaceAt(q.options, i, { ...o, media }))} />
            <button
              type="button"
              className={cx(s.iconBtn, (openFb.has(i) || o.feedback) && s.iconBtnOn)}
              title="Feedback saat opsi ini dipilih"
              onClick={() => setOpenFb((prev) => new Set(prev.has(i) ? [...prev].filter((x) => x !== i) : [...prev, i]))}
            >
              💬
            </button>
            <RemoveBtn disabled={q.options.length <= 2} onClick={() => setOptions(removeAt(q.options, i))} />
          </div>
          {openFb.has(i) && (
            <div className={s.subPanel}>
              <MarkdownArea
                rows={2}
                value={o.feedback}
                placeholder="Feedback yang muncul saat opsi ini dipilih (opsional, markdown)"
                onChange={(feedback) => setOptions(replaceAt(q.options, i, { ...o, feedback }))}
              />
            </div>
          )}
        </div>
      ))}
      <button type="button" className={s.addBtn} onClick={() => setOptions([...q.options, { text: `Opsi ${q.options.length + 1}` }])}>
        ＋ Tambah opsi
      </button>
    </Section>
  );
}

// ── Yes / no, number, range ──────────────────────────────────────────────

export function BooleanEditor({ question: q, onChange }: EditorProps<"boolean">) {
  return (
    <Section title="Jawaban benar" sub="Peserta memilih Ya atau Tidak.">
      <Segmented
        value={q.answer ? "ya" : "tidak"}
        options={[
          { value: "ya", label: "Ya" },
          { value: "tidak", label: "Tidak" },
        ]}
        onChange={(v) => onChange({ ...q, answer: v === "ya" })}
      />
    </Section>
  );
}

export function NumberEditor({ question: q, onChange }: EditorProps<"number">) {
  return (
    <Section title="Jawaban benar">
      <div className={cx(s.row, s.rowTop)}>
        <div className={s.field}>
          <label className={s.fieldLbl}>Angka</label>
          <NumberField className={cx(s.input, s.numIn)} value={q.answer} onChange={(v) => onChange({ ...q, answer: v ?? 0 })} />
        </div>
        <div className={s.field}>
          <label className={s.fieldLbl}>Toleransi (±)</label>
          <NumberField className={cx(s.input, s.numIn)} min={0} value={q.tolerance} onChange={(v) => onChange({ ...q, tolerance: Math.max(0, v ?? 0) })} />
        </div>
        <div className={s.field}>
          <label className={s.fieldLbl}>Satuan (opsional)</label>
          <input className={s.input} value={q.unit ?? ""} placeholder="mis. cabang" onChange={(e) => onChange({ ...q, unit: e.target.value || undefined })} />
        </div>
      </div>
    </Section>
  );
}

export function RangeEditor({ question: q, onChange }: EditorProps<"range">) {
  const num = (key: "min" | "max" | "step" | "tolerance") => (
    <div className={s.field}>
      <label className={s.fieldLbl}>{{ min: "Min", max: "Max", step: "Step", tolerance: "Toleransi (±)" }[key]}</label>
      <NumberField className={cx(s.input, s.numIn)} value={q[key]} onChange={(v) => onChange({ ...q, [key]: v ?? 0 })} />
    </div>
  );
  return (
    <>
      <Section title="Slider">
        <div className={cx(s.row, s.rowTop)}>
          {num("min")}
          {num("max")}
          {num("step")}
        </div>
      </Section>
      <Section title="Jawaban benar">
        <div className={cx(s.row, s.rowTop)}>
          <div className={s.field} style={{ flex: 1 }}>
            <label className={s.fieldLbl}>Nilai: {q.answer}</label>
            <input
              type="range"
              className={s.radius}
              style={{ width: "100%" }}
              min={q.min}
              max={q.max}
              step={q.step > 0 ? q.step : 1}
              value={q.answer}
              onChange={(e) => onChange({ ...q, answer: e.target.valueAsNumber })}
            />
          </div>
          {num("tolerance")}
        </div>
      </Section>
    </>
  );
}

// ── Matching ─────────────────────────────────────────────────────────────

export function MatchingEditor({ question: q, onChange }: EditorProps<"matching">) {
  const setItems = (items: typeof q.items) => onChange({ ...q, items });
  return (
    <Section title="Pasangan" sub="Setiap item di kiri punya satu pasangan atau lebih di kanan. Peserta melihat kolom kanan diacak.">
      <div className={s.match}>
        <div className={s.matchHdr}>
          <span>Item</span>
          <span />
          <span>Pasangan</span>
        </div>
        {q.items.map((it, i) => (
          <div key={i} className={s.matchRow}>
            <div className={s.matchCol}>
              <div className={s.matchBox}>
                <input className={s.bareIn} value={it.label} placeholder={`Item ${i + 1}`} onChange={(e) => setItems(replaceAt(q.items, i, { ...it, label: e.target.value }))} />
                <MediaEditor compact media={it.media} onChange={(media) => setItems(replaceAt(q.items, i, { ...it, media }))} />
                <RemoveBtn disabled={q.items.length <= 2} onClick={() => setItems(removeAt(q.items, i))} label="Hapus item" />
              </div>
            </div>
            <div className={s.matchArrow}>⇌</div>
            <div className={s.matchCol}>
              {it.pairs.map((p, j) => (
                <div key={j} className={s.matchBox}>
                  <input
                    className={s.bareIn}
                    value={p.text}
                    placeholder={`Pasangan ${j + 1}`}
                    onChange={(e) => setItems(replaceAt(q.items, i, { ...it, pairs: replaceAt(it.pairs, j, { ...p, text: e.target.value }) }))}
                  />
                  <MediaEditor compact media={p.media} onChange={(media) => setItems(replaceAt(q.items, i, { ...it, pairs: replaceAt(it.pairs, j, { ...p, media }) }))} />
                  <RemoveBtn disabled={it.pairs.length <= 1} onClick={() => setItems(replaceAt(q.items, i, { ...it, pairs: removeAt(it.pairs, j) }))} label="Hapus pasangan" />
                </div>
              ))}
              <button type="button" className={s.linkBtn} onClick={() => setItems(replaceAt(q.items, i, { ...it, pairs: [...it.pairs, { text: `Pasangan ${it.pairs.length + 1}` }] }))}>
                ＋ Pasangan
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={s.addBtn}
        style={{ marginTop: 12 }}
        onClick={() => setItems([...q.items, { label: `Item ${q.items.length + 1}`, pairs: [{ text: `Pasangan ${q.items.length + 1}` }] }])}
      >
        ＋ Tambah item
      </button>
    </Section>
  );
}

// ── Grouping ─────────────────────────────────────────────────────────────

export function GroupingEditor({ question: q, onChange }: EditorProps<"grouping">) {
  function removeGroup(gi: number) {
    // Items in the removed bucket move to the first one; later buckets shift down.
    const items = q.items.map((it) => ({ ...it, group: it.group === gi ? 0 : it.group > gi ? it.group - 1 : it.group }));
    onChange({ ...q, groups: removeAt(q.groups, gi), items });
  }
  return (
    <>
      <Section title="Kelompok" sub="Tempat peserta menaruh item.">
        {q.groups.map((g, gi) => (
          <div key={gi} className={s.row}>
            <input className={s.rowIn} value={g} placeholder={`Kelompok ${gi + 1}`} onChange={(e) => onChange({ ...q, groups: replaceAt(q.groups, gi, e.target.value) })} />
            <RemoveBtn disabled={q.groups.length <= 2} onClick={() => removeGroup(gi)} label="Hapus kelompok" />
          </div>
        ))}
        <button type="button" className={s.addBtn} onClick={() => onChange({ ...q, groups: [...q.groups, `Kelompok ${String.fromCharCode(65 + q.groups.length)}`] })}>
          ＋ Tambah kelompok
        </button>
      </Section>
      <Section title="Item" sub="Pilih kelompok yang benar untuk setiap item.">
        {q.items.map((it, i) => (
          <div key={i} className={s.row}>
            <input className={s.rowIn} value={it.text} placeholder={`Item ${i + 1}`} onChange={(e) => onChange({ ...q, items: replaceAt(q.items, i, { ...it, text: e.target.value }) })} />
            <select className={s.rowSel} value={it.group} onChange={(e) => onChange({ ...q, items: replaceAt(q.items, i, { ...it, group: Number(e.target.value) }) })}>
              {q.groups.map((g, gi) => (
                <option key={gi} value={gi}>
                  {g || `Kelompok ${gi + 1}`}
                </option>
              ))}
            </select>
            <MediaEditor compact media={it.media} onChange={(media) => onChange({ ...q, items: replaceAt(q.items, i, { ...it, media }) })} />
            <RemoveBtn disabled={q.items.length <= 1} onClick={() => onChange({ ...q, items: removeAt(q.items, i) })} label="Hapus item" />
          </div>
        ))}
        <button type="button" className={s.addBtn} onClick={() => onChange({ ...q, items: [...q.items, { text: `Item ${q.items.length + 1}`, group: 0 }] })}>
          ＋ Tambah item
        </button>
      </Section>
    </>
  );
}

// ── Word blank ───────────────────────────────────────────────────────────

export function WordBlankEditor({ question: q, onChange }: EditorProps<"wordblank">) {
  const tokens = wordBlankTokens(q);
  const word = q.blankMode === "word";
  const valid = (blanks: number[], t: string[], w: boolean) => blanks.filter((i) => i < t.length && (w || t[i] !== " "));

  function setAnswer(answerText: string) {
    const next = { ...q, answerText };
    onChange({ ...next, blanks: valid(q.blanks, wordBlankTokens(next), word) });
  }
  function setMode(blankMode: "letter" | "word") {
    const next = { ...q, blankMode };
    const t = wordBlankTokens(next);
    const first = t.findIndex((x) => x !== " ");
    onChange({ ...next, blanks: first === -1 ? [] : [first] });
  }
  const toggle = (i: number) =>
    onChange({ ...q, blanks: q.blanks.includes(i) ? q.blanks.filter((b) => b !== i) : [...q.blanks, i].sort((a, b) => a - b) });

  return (
    <>
      <Section title="Jawaban">
        <div className={s.field}>
          <input className={s.input} value={q.answerText} placeholder="mis. Recovery" onChange={(e) => setAnswer(e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.fieldLbl}>Kosongkan per</label>
          <Segmented
            value={q.blankMode}
            options={[
              { value: "letter", label: "Huruf" },
              { value: "word", label: "Kata" },
            ]}
            onChange={setMode}
          />
        </div>
        <div className={s.field}>
          <label className={s.fieldLbl}>Petunjuk (opsional)</label>
          <input className={s.input} value={q.hint ?? ""} placeholder="Petunjuk untuk peserta" onChange={(e) => onChange({ ...q, hint: e.target.value || undefined })} />
        </div>
      </Section>
      <Section title="Kotak yang dikosongkan" sub="Klik tile untuk menyembunyikan atau menampilkannya ke peserta.">
        <div className={s.tiles}>
          {tokens.map((t, i) =>
            !word && t === " " ? (
              <span key={i} className={s.tileGap} />
            ) : (
              <button key={i} type="button" className={cx(s.tile, word && s.tileWord, q.blanks.includes(i) && s.tileBlank)} onClick={() => toggle(i)} aria-pressed={q.blanks.includes(i)}>
                {t}
              </button>
            )
          )}
        </div>
      </Section>
    </>
  );
}

// ── Sequencing ───────────────────────────────────────────────────────────

export function SequencingEditor({ question: q, onChange }: EditorProps<"sequencing">) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const setItems = (items: typeof q.items) => onChange({ ...q, items });
  return (
    <Section title="Urutan yang benar" sub="Susun dari atas ke bawah sesuai urutan yang benar. Peserta melihatnya diacak.">
      {q.items.map((it, i) => (
        <div
          key={i}
          className={s.row}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => dragIdx !== null && e.preventDefault()}
          onDrop={() => {
            if (dragIdx !== null) setItems(moveItem(q.items, dragIdx, i));
            setDragIdx(null);
          }}
        >
          <span className={s.seqNum}>{i + 1}</span>
          <span className={s.handle} title="Seret untuk memindahkan">
            ⠿
          </span>
          <input className={s.rowIn} value={it.text} placeholder={`Langkah ${i + 1}`} onChange={(e) => setItems(replaceAt(q.items, i, { ...it, text: e.target.value }))} />
          <MediaEditor compact media={it.media} onChange={(media) => setItems(replaceAt(q.items, i, { ...it, media }))} />
          <button type="button" className={s.iconBtn} disabled={i === 0} onClick={() => setItems(moveItem(q.items, i, i - 1))} aria-label="Naik">
            ▲
          </button>
          <button type="button" className={s.iconBtn} disabled={i === q.items.length - 1} onClick={() => setItems(moveItem(q.items, i, i + 1))} aria-label="Turun">
            ▼
          </button>
          <RemoveBtn disabled={q.items.length <= 2} onClick={() => setItems(removeAt(q.items, i))} />
        </div>
      ))}
      <button type="button" className={s.addBtn} onClick={() => setItems([...q.items, { text: `Langkah ${q.items.length + 1}` }])}>
        ＋ Tambah langkah
      </button>
    </Section>
  );
}

// ── Odd one out ──────────────────────────────────────────────────────────

export function OddOneOutEditor({ question: q, onChange }: EditorProps<"oddoneout">) {
  function remove(i: number) {
    const odd = q.odd === i ? 0 : q.odd > i ? q.odd - 1 : q.odd;
    onChange({ ...q, items: removeAt(q.items, i), odd });
  }
  return (
    <Section title="Item" sub="Tandai satu item yang beda sendiri.">
      {q.items.map((it, i) => (
        <div key={i} className={s.row}>
          <button type="button" className={cx(s.mark, q.odd === i && s.markOn)} onClick={() => onChange({ ...q, odd: i })} aria-pressed={q.odd === i} title="Yang beda sendiri">
            {q.odd === i ? "●" : "○"}
          </button>
          <input className={s.rowIn} value={it.text} placeholder={`Item ${i + 1}`} onChange={(e) => onChange({ ...q, items: replaceAt(q.items, i, { ...it, text: e.target.value }) })} />
          <MediaEditor compact media={it.media} onChange={(media) => onChange({ ...q, items: replaceAt(q.items, i, { ...it, media }) })} />
          <RemoveBtn disabled={q.items.length <= 3} onClick={() => remove(i)} />
        </div>
      ))}
      <button type="button" className={s.addBtn} onClick={() => onChange({ ...q, items: [...q.items, { text: `Item ${q.items.length + 1}` }] })}>
        ＋ Tambah item
      </button>
    </Section>
  );
}

// ── Hotspot ──────────────────────────────────────────────────────────────

export function HotspotEditor({ question: q, onChange }: EditorProps<"hotspot">) {
  const setSpots = (spots: typeof q.spots) => onChange({ ...q, spots });
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    <>
      <Section title="Gambar" sub={q.image.url ? "Klik gambar untuk menambah titik jawaban. Klik titik untuk menghapusnya." : "Pilih gambar dulu, lalu klik di atasnya untuk menandai titik jawaban."}>
        <ImagePicker media={q.image} onChange={(image) => onChange({ ...q, image, spots: image.url === q.image.url ? q.spots : [] })} />
        {q.image.url ? (
          <div
            className={s.hotspotWrap}
            style={{ marginTop: 12 }}
            role="presentation"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setSpots([...q.spots, { x: round(((e.clientX - r.left) / r.width) * 100), y: round(((e.clientY - r.top) / r.height) * 100), radius: 8 }]);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authored media can live on any host */}
            <img className={s.hotspotImg} src={q.image.url} alt={q.image.alt ?? ""} />
            {q.spots.map((sp, i) => (
              <button
                key={i}
                type="button"
                className={s.hotspotPin}
                style={{ left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.radius * 2}%`, height: `${sp.radius * 2}%` }}
                title="Klik untuk menghapus titik ini"
                onClick={(e) => {
                  e.stopPropagation();
                  setSpots(removeAt(q.spots, i));
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </Section>
      {q.spots.length > 0 && (
        <Section title={`Titik (${q.spots.length})`} sub="Radius dihitung dalam persen lebar dan tinggi gambar, jadi area di gambar yang tidak persegi berbentuk oval.">
          {q.spots.map((sp, i) => (
            <div key={i} className={s.row}>
              <span className={s.seqNum}>{i + 1}</span>
              <input className={s.rowIn} value={sp.label ?? ""} placeholder="Label (opsional, untuk admin)" onChange={(e) => setSpots(replaceAt(q.spots, i, { ...sp, label: e.target.value || undefined }))} />
              <input
                type="range"
                className={s.radius}
                min={2}
                max={30}
                value={sp.radius}
                title={`Radius ${sp.radius}%`}
                onChange={(e) => setSpots(replaceAt(q.spots, i, { ...sp, radius: e.target.valueAsNumber }))}
              />
              <RemoveBtn onClick={() => setSpots(removeAt(q.spots, i))} />
            </div>
          ))}
        </Section>
      )}
    </>
  );
}
