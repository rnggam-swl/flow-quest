"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { moduleWidgetSchema, type ModuleWidget } from "@/lib/content/case";
import { WIDGET_TYPE_ICONS, WIDGET_TYPE_LABELS, newWidget, type WidgetType } from "@/lib/content/caseEdit";
import { planWidgetSchema, type PlanWidget } from "@/lib/practice/schema";
import { MARKDOWN_HINT, cx, moveItem, removeAt, replaceAt, useBuilder } from "./fields";
import { EdgeListEditor, FixerEditor, NodePicker, usePracticeNodes } from "./FixerEditor";
import s from "./builder.module.css";

/**
 * Editors for Modul Latihan widgets — the blocks a module's Coba dulu,
 * Penjelasan and Latihan stages (and a participant's latihan utama) are made
 * of. Each widget sits in a card with its own reorder, duplicate, delete and a
 * raw-JSON view for anything the form doesn't cover.
 */

type Of<T extends WidgetType> = Extract<ModuleWidget, { type: T }>;
interface Props<T extends WidgetType> {
  w: Of<T>;
  onChange: (w: Of<T>) => void;
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.fieldLbl}>{label}</label>
      {children}
      {hint ? <div className={s.fieldHint}>{hint}</div> : null}
    </div>
  );
}

function Text({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return rows ? (
    <textarea className={s.textarea} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className={s.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

/** Optional text: an empty box removes the field. */
function OptText({ value, onChange, placeholder, rows }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; rows?: number }) {
  return <Text value={value ?? ""} onChange={(v) => onChange(v === "" ? undefined : v)} placeholder={placeholder} rows={rows} />;
}

function Del({ onClick, disabled, label = "Hapus" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className={cx(s.iconBtn, s.iconBtnDel)} onClick={onClick} disabled={disabled} aria-label={label} title={disabled ? "Jumlah minimum" : label}>
      ✕
    </button>
  );
}

/**
 * A list of strings. `onRename` reports an edited entry's old and new text, so
 * lists that refer to options by their text (decision answers, planner picks)
 * can follow along.
 */
function StringList({
  items,
  onChange,
  min = 1,
  placeholder,
  addLabel = "＋ Tambah",
  onRename,
  onRemove,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  min?: number;
  placeholder?: string;
  addLabel?: string;
  onRename?: (from: string, to: string, next: string[]) => void;
  onRemove?: (value: string, next: string[]) => void;
}) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className={s.row}>
          <input
            className={s.rowIn}
            value={it}
            placeholder={placeholder}
            onChange={(e) => {
              const next = replaceAt(items, i, e.target.value);
              if (onRename) onRename(it, e.target.value, next);
              else onChange(next);
            }}
          />
          <Del
            disabled={items.length <= min}
            onClick={() => {
              const next = removeAt(items, i);
              if (onRemove) onRemove(it, next);
              else onChange(next);
            }}
          />
        </div>
      ))}
      <button type="button" className={s.linkBtn} onClick={() => onChange([...items, ""])}>
        {addLabel}
      </button>
    </div>
  );
}

/** Pick any number of the given options (planner check/go columns). */
function MultiPick({ options, picked, onChange }: { options: string[]; picked: string[]; onChange: (picked: string[]) => void }) {
  return (
    <div className={s.chips}>
      {options.map((o, i) => {
        const on = picked.includes(o);
        return (
          <button key={i} type="button" className={cx(s.chip, on && s.chipOn)} aria-pressed={on} onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}>
            {o || <i>(kosong)</i>}
          </button>
        );
      })}
    </div>
  );
}

// ── Per-type editors ─────────────────────────────────────────────────────

function TextEd({ w, onChange }: Props<"text">) {
  return (
    <Field label="Teks" hint={`${MARKDOWN_HINT} Baris kosong memisahkan paragraf.`}>
      <Text rows={6} value={w.md} onChange={(md) => onChange({ ...w, md })} />
    </Field>
  );
}

function RuleEd({ w, onChange }: Props<"rule">) {
  return (
    <Field label="Aturan" hint="Tampil sebagai kotak yang menonjol.">
      <Text rows={2} value={w.text} onChange={(text) => onChange({ ...w, text })} />
    </Field>
  );
}

function FlowsEd({ w, onChange }: Props<"flows">) {
  const practiceNodes = usePracticeNodes();
  const keys = practiceNodes.map((n) => n.key);
  const setItem = (i: number, it: (typeof w.items)[number]) => onChange({ ...w, items: replaceAt(w.items, i, it) });
  return (
    <>
      {w.items.map((it, i) => {
        const used = [...new Set([it.flow.start, ...(it.flow.nodes ?? []), ...it.flow.edges.flatMap((e) => e.split(":")[0].split(">"))])].filter(Boolean);
        return (
          <div key={i} className={s.subCard}>
            <div className={s.row}>
              <input className={s.rowIn} value={it.title ?? ""} placeholder={`Judul diagram ${i + 1} (opsional)`} onChange={(e) => setItem(i, { ...it, title: e.target.value || undefined })} />
              <Del disabled={w.items.length <= 1} onClick={() => onChange({ ...w, items: removeAt(w.items, i) })} label="Hapus diagram" />
            </div>
            <Field label="Mulai dari">
              <select className={s.rowSel} value={it.flow.start} onChange={(e) => setItem(i, { ...it, flow: { ...it.flow, start: e.target.value } })}>
                {!keys.includes(it.flow.start) && <option value={it.flow.start}>{it.flow.start || "— pilih —"}</option>}
                {practiceNodes.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Panah">
              <EdgeListEditor edges={it.flow.edges} nodes={keys} onChange={(edges) => setItem(i, { ...it, flow: { ...it.flow, edges } })} />
            </Field>
            <Field label="Node lepas (opsional)" hint="Node yang tampil tanpa panah, mis. untuk menunjukkan node yang terlupa.">
              <NodePicker
                library={practiceNodes.filter((n) => !used.includes(n.key) || (it.flow.nodes ?? []).includes(n.key))}
                selected={it.flow.nodes ?? []}
                onToggle={(k, on) => {
                  const nodes = on ? [...(it.flow.nodes ?? []), k] : (it.flow.nodes ?? []).filter((x) => x !== k);
                  setItem(i, { ...it, flow: { ...it.flow, nodes: nodes.length ? nodes : undefined } });
                }}
              />
            </Field>
          </div>
        );
      })}
      <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, items: [...w.items, structuredClone(w.items[w.items.length - 1])] })}>
        ＋ Diagram (tampil berdampingan)
      </button>
    </>
  );
}

function McqEd({ w, onChange }: Props<"mcq">) {
  const setOpt = (i: number, o: (typeof w.options)[number]) => onChange({ ...w, options: replaceAt(w.options, i, o) });
  return (
    <>
      <Field label="Pertanyaan">
        <Text value={w.q} onChange={(q) => onChange({ ...w, q })} placeholder="Tulis pertanyaan…" />
      </Field>
      <Field label="Opsi" hint="Tandai opsi yang benar. Setiap opsi punya feedback yang muncul saat dipilih.">
        {w.options.map((o, i) => (
          <div key={i} className={s.optBlock}>
            <div className={s.row}>
              <button type="button" className={cx(s.mark, s.markSquare, o.ok && s.markOn)} aria-pressed={Boolean(o.ok)} onClick={() => setOpt(i, { ...o, ok: !o.ok || undefined })} title="Jawaban benar">
                ✓
              </button>
              <input className={s.rowIn} value={o.t} placeholder={`Opsi ${i + 1}`} onChange={(e) => setOpt(i, { ...o, t: e.target.value })} />
              <Del disabled={w.options.length <= 2} onClick={() => onChange({ ...w, options: removeAt(w.options, i) })} />
            </div>
            <input className={cx(s.input, s.fbIn)} value={o.fb} placeholder={o.ok ? "Feedback saat benar" : "Feedback saat dipilih (kenapa kurang tepat)"} onChange={(e) => setOpt(i, { ...o, fb: e.target.value })} />
          </div>
        ))}
        <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, options: [...w.options, { t: "", fb: "" }] })}>
          ＋ Opsi
        </button>
      </Field>
    </>
  );
}

function PollEd({ w, onChange }: Props<"poll">) {
  return (
    <>
      <Field label="Pertanyaan">
        <Text value={w.q} onChange={(q) => onChange({ ...w, q })} />
      </Field>
      <Field label="Pilihan" hint="Tidak ada jawaban benar; catatan di bawah muncul setelah memilih.">
        <StringList items={w.options} min={2} onChange={(options) => onChange({ ...w, options })} addLabel="＋ Pilihan" />
      </Field>
      <Field label="Catatan">
        <Text rows={2} value={w.note} onChange={(note) => onChange({ ...w, note })} />
      </Field>
    </>
  );
}

function WriteEd({ w, onChange }: Props<"write">) {
  return (
    <>
      <Field label="Pertanyaan" hint="Jawaban peserta tersimpan dan bisa dibaca mentor.">
        <Text value={w.q} onChange={(q) => onChange({ ...w, q })} />
      </Field>
      <Field label="Contoh isian (placeholder)">
        <OptText value={w.placeholder} onChange={(placeholder) => onChange({ ...w, placeholder })} />
      </Field>
      <Field label="Catatan setelah menyimpan (opsional)">
        <OptText rows={2} value={w.note} onChange={(note) => onChange({ ...w, note })} />
      </Field>
    </>
  );
}

function GoalpickEd({ w, onChange }: Props<"goalpick">) {
  const setSc = (i: number, sc: (typeof w.scenarios)[number]) => onChange({ ...w, scenarios: replaceAt(w.scenarios, i, sc) });
  return (
    <>
      <Field label="Pengantar (opsional)">
        <OptText rows={2} value={w.intro} onChange={(intro) => onChange({ ...w, intro })} />
      </Field>
      {w.scenarios.map((sc, i) => (
        <div key={i} className={s.subCard}>
          <div className={s.row}>
            <span className={s.subCardT}>Skenario {i + 1}</span>
            <Del disabled={w.scenarios.length <= 1} onClick={() => onChange({ ...w, scenarios: removeAt(w.scenarios, i) })} label="Hapus skenario" />
          </div>
          <Field label="Situasi">
            <Text rows={2} value={sc.text} onChange={(text) => setSc(i, { ...sc, text })} />
          </Field>
          <Field label="Pilihan tujuan" hint="Klik lingkaran untuk menandai tujuan yang sebenarnya.">
            {sc.items.map((it, j) => (
              <div key={j} className={s.row}>
                <button type="button" className={cx(s.mark, sc.goal === j && s.markOn)} aria-pressed={sc.goal === j} onClick={() => setSc(i, { ...sc, goal: j })} title="Tujuan yang benar">
                  ✓
                </button>
                <input className={s.rowIn} value={it} onChange={(e) => setSc(i, { ...sc, items: replaceAt(sc.items, j, e.target.value) })} />
                <Del
                  disabled={sc.items.length <= 2}
                  onClick={() => setSc(i, { ...sc, items: removeAt(sc.items, j), goal: sc.goal > j ? sc.goal - 1 : sc.goal === j ? 0 : sc.goal })}
                />
              </div>
            ))}
            <button type="button" className={s.linkBtn} onClick={() => setSc(i, { ...sc, items: [...sc.items, ""] })}>
              ＋ Pilihan
            </button>
          </Field>
          <Field label="Penjelasan">
            <Text rows={2} value={sc.why} onChange={(why) => setSc(i, { ...sc, why })} />
          </Field>
        </div>
      ))}
      <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, scenarios: [...w.scenarios, { text: "", items: ["", ""], goal: 0, why: "" }] })}>
        ＋ Skenario
      </button>
    </>
  );
}

function DecisionsEd({ w, onChange }: Props<"decisions">) {
  type Item = (typeof w.items)[number];
  const setItem = (i: number, it: Item) => onChange({ ...w, items: replaceAt(w.items, i, it) });
  const side = (it: Item, o: string) => (it.ya.includes(o) ? "ya" : it.tidak.includes(o) ? "tidak" : "");
  const assign = (it: Item, o: string, to: string): Item => ({
    ...it,
    ya: to === "ya" ? [...it.ya.filter((x) => x !== o), o] : it.ya.filter((x) => x !== o),
    tidak: to === "tidak" ? [...it.tidak.filter((x) => x !== o), o] : it.tidak.filter((x) => x !== o),
  });
  return (
    <>
      <Field label="Pengantar (opsional)">
        <OptText rows={2} value={w.intro} onChange={(intro) => onChange({ ...w, intro })} />
      </Field>
      {w.items.map((it, i) => (
        <div key={i} className={s.subCard}>
          <div className={s.row}>
            <span className={s.subCardT}>Keputusan {i + 1}</span>
            <Del disabled={w.items.length <= 1} onClick={() => onChange({ ...w, items: removeAt(w.items, i) })} label="Hapus keputusan" />
          </div>
          <Field label="Pertanyaan keputusan">
            <Text value={it.q} onChange={(q) => setItem(i, { ...it, q })} placeholder="mis. NIS terdaftar?" />
          </Field>
          <Field label="Kemungkinan lanjutan" hint="Pilih ke cabang mana setiap lanjutan seharusnya pergi.">
            {it.options.map((o, j) => (
              <div key={j} className={s.row}>
                <input
                  className={s.rowIn}
                  value={o}
                  onChange={(e) => {
                    const v = e.target.value;
                    const ren = (xs: string[]) => xs.map((x) => (x === o ? v : x));
                    setItem(i, { ...it, options: replaceAt(it.options, j, v), ya: ren(it.ya), tidak: ren(it.tidak) });
                  }}
                />
                <select className={s.rowSel} value={side(it, o)} onChange={(e) => setItem(i, assign(it, o, e.target.value))}>
                  <option value="">bukan jawaban</option>
                  <option value="ya">cabang Ya</option>
                  <option value="tidak">cabang Tidak</option>
                </select>
                <Del
                  disabled={it.options.length <= 2}
                  onClick={() => setItem(i, { ...it, options: removeAt(it.options, j), ya: it.ya.filter((x) => x !== o), tidak: it.tidak.filter((x) => x !== o) })}
                />
              </div>
            ))}
            <button type="button" className={s.linkBtn} onClick={() => setItem(i, { ...it, options: [...it.options, ""] })}>
              ＋ Lanjutan
            </button>
          </Field>
          <Field label="Penjelasan">
            <Text rows={2} value={it.note} onChange={(note) => setItem(i, { ...it, note })} />
          </Field>
        </div>
      ))}
      <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, items: [...w.items, { q: "", options: ["", ""], ya: [], tidak: [], note: "" }] })}>
        ＋ Keputusan
      </button>
    </>
  );
}

function SpotEd({ w, onChange }: Props<"spot">) {
  return (
    <>
      <Field label="Pertanyaan">
        <Text value={w.q} onChange={(q) => onChange({ ...w, q })} placeholder="mis. Mana yang keliru dari flow ini?" />
      </Field>
      <Field label="Pernyataan" hint="Tandai pernyataan yang keliru; peserta harus menemukan semuanya.">
        {w.statements.map((st, i) => (
          <div key={i} className={s.row}>
            <button
              type="button"
              className={cx(s.mark, s.markSquare, st.bad && s.markBad)}
              aria-pressed={st.bad}
              onClick={() => onChange({ ...w, statements: replaceAt(w.statements, i, { ...st, bad: !st.bad }) })}
              title={st.bad ? "Keliru" : "Benar"}
            >
              {st.bad ? "✗" : "✓"}
            </button>
            <input className={s.rowIn} value={st.t} onChange={(e) => onChange({ ...w, statements: replaceAt(w.statements, i, { ...st, t: e.target.value }) })} />
            <Del disabled={w.statements.length <= 1} onClick={() => onChange({ ...w, statements: removeAt(w.statements, i) })} />
          </div>
        ))}
        <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, statements: [...w.statements, { t: "", bad: false }] })}>
          ＋ Pernyataan
        </button>
      </Field>
      <Field label="Penjelasan setelah semua ditemukan">
        <Text rows={2} value={w.note} onChange={(note) => onChange({ ...w, note })} />
      </Field>
    </>
  );
}

function SelfcheckEd({ w, onChange }: Props<"selfcheck">) {
  return (
    <>
      <Field label="Pengantar (opsional)">
        <OptText rows={2} value={w.intro} onChange={(intro) => onChange({ ...w, intro })} />
      </Field>
      <Field label="Daftar cek" hint="Peserta mencentang sendiri setiap butir.">
        <StringList items={w.items} onChange={(items) => onChange({ ...w, items })} addLabel="＋ Butir" />
      </Field>
    </>
  );
}

function PlannerEd({ w, onChange }: Props<"planner">) {
  const renameIn = (key: "check" | "go", from: string, to: string) => w.rows.map((r) => ({ ...r, [key]: r[key].map((x) => (x === from ? to : x)) }));
  const dropIn = (key: "check" | "go", value: string) => w.rows.map((r) => ({ ...r, [key]: r[key].filter((x) => x !== value) }));
  const setRow = (i: number, r: (typeof w.rows)[number]) => onChange({ ...w, rows: replaceAt(w.rows, i, r) });
  return (
    <>
      <Field label="Pengantar (opsional)">
        <OptText rows={2} value={w.intro} onChange={(intro) => onChange({ ...w, intro })} />
      </Field>
      <div className={cx(s.row, s.rowTop)}>
        <div style={{ flex: 1 }}>
          <Field label="Pilihan “apa yang dicek”">
            <StringList
              items={w.checkOptions}
              onChange={(checkOptions) => onChange({ ...w, checkOptions })}
              onRename={(from, to, checkOptions) => onChange({ ...w, checkOptions, rows: renameIn("check", from, to) })}
              onRemove={(v, checkOptions) => onChange({ ...w, checkOptions, rows: dropIn("check", v) })}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Pilihan “ke mana lanjutnya”">
            <StringList
              items={w.goOptions}
              onChange={(goOptions) => onChange({ ...w, goOptions })}
              onRename={(from, to, goOptions) => onChange({ ...w, goOptions, rows: renameIn("go", from, to) })}
              onRemove={(v, goOptions) => onChange({ ...w, goOptions, rows: dropIn("go", v) })}
            />
          </Field>
        </div>
      </div>
      {w.rows.map((r, i) => (
        <div key={i} className={s.subCard}>
          <div className={s.row}>
            <span className={s.subCardT}>Baris {i + 1}</span>
            <Del disabled={w.rows.length <= 1} onClick={() => onChange({ ...w, rows: removeAt(w.rows, i) })} label="Hapus baris" />
          </div>
          <Field label="Masalah">
            <Text value={r.problem} onChange={(problem) => setRow(i, { ...r, problem })} />
          </Field>
          <Field label="Jawaban: yang dicek">
            <MultiPick options={w.checkOptions} picked={r.check} onChange={(check) => setRow(i, { ...r, check })} />
          </Field>
          <Field label="Jawaban: lanjut ke">
            <MultiPick options={w.goOptions} picked={r.go} onChange={(go) => setRow(i, { ...r, go })} />
          </Field>
          <Field label="Penjelasan">
            <Text rows={2} value={r.why} onChange={(why) => setRow(i, { ...r, why })} />
          </Field>
        </div>
      ))}
      <button type="button" className={s.linkBtn} onClick={() => onChange({ ...w, rows: [...w.rows, { problem: "", check: [], go: [], why: "" }] })}>
        ＋ Baris
      </button>
    </>
  );
}

function WidgetForm({ widget, onChange }: { widget: ModuleWidget; onChange: (w: ModuleWidget) => void }) {
  switch (widget.type) {
    case "text":
      return <TextEd w={widget} onChange={onChange} />;
    case "rule":
      return <RuleEd w={widget} onChange={onChange} />;
    case "flows":
      return <FlowsEd w={widget} onChange={onChange} />;
    case "mcq":
      return <McqEd w={widget} onChange={onChange} />;
    case "poll":
      return <PollEd w={widget} onChange={onChange} />;
    case "write":
      return <WriteEd w={widget} onChange={onChange} />;
    case "goalpick":
      return <GoalpickEd w={widget} onChange={onChange} />;
    case "decisions":
      return <DecisionsEd w={widget} onChange={onChange} />;
    case "spot":
      return <SpotEd w={widget} onChange={onChange} />;
    case "selfcheck":
      return <SelfcheckEd w={widget} onChange={onChange} />;
    case "planner":
      return <PlannerEd w={widget} onChange={onChange} />;
    case "fixer":
      return <FixerEditor widget={widget} onChange={onChange} />;
  }
}

/** Raw JSON for one widget, applied once it parses as the same kind of widget. */
function JsonEd({ widget, onChange, plan }: { widget: ModuleWidget; onChange: (w: ModuleWidget) => void; plan: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(widget, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <textarea
        className={cx(s.textarea, s.mono)}
        rows={Math.min(24, text.split("\n").length + 1)}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          let raw: unknown;
          try {
            raw = JSON.parse(e.target.value);
          } catch {
            setError("JSON belum valid.");
            return;
          }
          const parsed = (plan ? planWidgetSchema : moduleWidgetSchema).safeParse(raw);
          if (!parsed.success) {
            setError(parsed.error.issues.map((i) => `${i.path.join(".") || "widget"}: ${i.message}`).join("; "));
            return;
          }
          setError(null);
          onChange(parsed.data as ModuleWidget);
        }}
      />
      <div className={error ? s.warn : s.fieldHint}>{error ?? "Perubahan langsung dipakai selama JSON-nya valid."}</div>
    </div>
  );
}

/** "Add widget" menu for the given types. */
export function AddWidgetMenu({ types, onAdd, label = "＋ Tambah widget" }: { types: WidgetType[]; onAdd: (t: WidgetType) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className={s.addWrap} ref={ref}>
      <button type="button" className={s.addBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className={cx(s.typeMenu, s.typeMenuInline)} role="menu">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              className={s.typeItem}
              onClick={() => {
                onAdd(t);
                setOpen(false);
              }}
            >
              <span className={s.typeIcon}>{WIDGET_TYPE_ICONS[t]}</span>
              {WIDGET_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * An ordered list of widget cards. `plan` restricts it to what a
 * participant's latihan utama may hold (no markdown text).
 */
export function WidgetList<W extends ModuleWidget | PlanWidget>({
  widgets,
  onChange,
  types,
  plan = false,
  problems,
  emptyText = "Belum ada widget.",
}: {
  widgets: W[];
  onChange: (widgets: W[]) => void;
  types: WidgetType[];
  plan?: boolean;
  /** Problem messages per widget index. */
  problems?: Map<number, string[]>;
  emptyText?: string;
}) {
  const { nodes } = useBuilder();
  const [json, setJson] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (set: Set<number>, i: number) => new Set(set.has(i) ? [...set].filter((x) => x !== i) : [...set, i]);
  // Index-based view state follows a moved or removed card.
  const shift = (set: Set<number>, fn: (i: number) => number | null) => new Set([...set].map(fn).filter((i): i is number => i !== null));

  return (
    <div className={s.widgetList}>
      {widgets.length === 0 && <div className={s.pempty}>{emptyText}</div>}
      {widgets.map((w, i) => {
        const issues = problems?.get(i) ?? [];
        const isCollapsed = collapsed.has(i);
        const move = (to: number) => {
          onChange(moveItem(widgets, i, to));
          const swap = (x: number) => (x === i ? to : x === to ? i : x);
          setJson((s0) => shift(s0, swap));
          setCollapsed((s0) => shift(s0, swap));
        };
        return (
          <div key={i} className={cx(s.wcard, issues.length > 0 && s.wcardWarn)}>
            <div className={s.wcardHdr}>
              <button type="button" className={s.wcardToggle} onClick={() => setCollapsed((c) => toggle(c, i))} aria-expanded={!isCollapsed}>
                <span className={s.wcardIcon}>{WIDGET_TYPE_ICONS[w.type]}</span>
                <span className={s.wcardType}>
                  {i + 1}. {WIDGET_TYPE_LABELS[w.type]}
                </span>
                <span className={s.wcardSummary}>{summary(w)}</span>
              </button>
              <div className={s.wcardActs}>
                <button type="button" className={cx(s.iconBtn, json.has(i) && s.iconBtnOn)} title="Edit sebagai JSON" onClick={() => setJson((j) => toggle(j, i))}>
                  {"{}"}
                </button>
                <button type="button" className={s.iconBtn} title="Naik" disabled={i === 0} onClick={() => move(i - 1)}>
                  ↑
                </button>
                <button type="button" className={s.iconBtn} title="Turun" disabled={i === widgets.length - 1} onClick={() => move(i + 1)}>
                  ↓
                </button>
                <button type="button" className={s.iconBtn} title="Duplikat" onClick={() => onChange([...widgets.slice(0, i + 1), structuredClone(w), ...widgets.slice(i + 1)])}>
                  ⧉
                </button>
                <Del
                  label="Hapus widget"
                  onClick={() => {
                    if (!window.confirm(`Hapus widget ${i + 1} (${WIDGET_TYPE_LABELS[w.type]})?`)) return;
                    onChange(removeAt(widgets, i));
                    const drop = (x: number) => (x === i ? null : x > i ? x - 1 : x);
                    setJson((s0) => shift(s0, drop));
                    setCollapsed((s0) => shift(s0, drop));
                  }}
                />
              </div>
            </div>
            {issues.length > 0 && (
              <ul className={s.wcardIssues}>
                {issues.map((m, j) => (
                  <li key={j}>{m}</li>
                ))}
              </ul>
            )}
            {!isCollapsed && (
              <div className={s.wcardBody}>
                {json.has(i) ? (
                  <JsonEd widget={w as ModuleWidget} plan={plan} onChange={(next) => onChange(replaceAt(widgets, i, next as W))} />
                ) : (
                  <WidgetForm widget={w as ModuleWidget} onChange={(next) => onChange(replaceAt(widgets, i, next as W))} />
                )}
              </div>
            )}
          </div>
        );
      })}
      <AddWidgetMenu types={types} onAdd={(t) => onChange([...widgets, newWidget(t, nodes) as W])} />
    </div>
  );
}

function summary(w: ModuleWidget | PlanWidget): string {
  switch (w.type) {
    case "text":
      return w.md.split("\n")[0];
    case "rule":
      return w.text;
    case "mcq":
    case "poll":
    case "write":
    case "spot":
      return w.q || "(pertanyaan belum diisi)";
    case "fixer":
      return w.title ?? `${w.nodes.length} node, ${w.rules.length} aturan`;
    case "flows":
      return w.items.map((it) => it.title).filter(Boolean).join(" · ") || `${w.items.length} diagram`;
    case "goalpick":
      return `${w.scenarios.length} skenario`;
    case "decisions":
      return `${w.items.length} keputusan`;
    case "selfcheck":
      return `${w.items.length} butir`;
    case "planner":
      return `${w.rows.length} baris`;
  }
}
