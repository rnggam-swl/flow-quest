"use client";

import { useState, type ReactNode } from "react";
import { checkRules, edgeText, parseEdge } from "@/lib/practice/flowRules";
import type { FixerWidget, PlanWidget, Widget } from "@/lib/practice/schema";
import { PracticeFlowDiagram } from "./PracticeFlowDiagram";
import s from "./practice.module.css";

/**
 * The Modul Latihan widgets. Each one reports its status to the section it
 * sits in: "attempted" unlocks the Penjelasan stage when it's in Coba dulu,
 * "complete" counts toward finishing the module when it's in Latihan.
 * Reports happen from event handlers, never from effects.
 */

export interface WidgetStatus {
  attempted: boolean;
  complete: boolean;
}

const NOT_STARTED: WidgetStatus = { attempted: false, complete: false };
const DONE: WidgetStatus = { attempted: true, complete: true };

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function fixerPasses(w: FixerWidget, on: string[]) {
  return checkRules(w.rules, w.nodes, on, w.start).every((r) => r.pass);
}

/** Status a widget starts in — read-only widgets count as done, and a previously saved answer counts as written. */
export function initialWidgetStatus(widget: Widget, savedAnswer?: string): WidgetStatus {
  switch (widget.type) {
    case "text":
    case "rule":
    case "flows":
      return DONE;
    case "write":
      return savedAnswer ? DONE : NOT_STARTED;
    case "fixer":
      return { attempted: false, complete: fixerPasses(widget, widget.initial) };
    default:
      return NOT_STARTED;
  }
}

export interface WriteBinding {
  saved?: string;
  /** Persists the answer; resolves false when it couldn't be saved. */
  save: (text: string) => Promise<boolean>;
}

export function PracticeWidget({
  widget,
  onStatus,
  write,
}: {
  widget: Widget;
  onStatus: (status: WidgetStatus) => void;
  write?: WriteBinding;
}) {
  switch (widget.type) {
    case "text":
      // Trusted, code-authored prose from content.ts — the plan schema never lets stored data reach this branch.
      return <div className={s.proseBlock} dangerouslySetInnerHTML={{ __html: widget.html }} />;
    case "rule":
      return <div className={s.ruleBox}>{widget.text}</div>;
    case "flows":
      return <FlowsWidget widget={widget} />;
    case "mcq":
      return <McqWidget widget={widget} onStatus={onStatus} />;
    case "poll":
      return <PollWidget widget={widget} onStatus={onStatus} />;
    case "write":
      return <WriteWidget widget={widget} onStatus={onStatus} binding={write} />;
    case "goalpick":
      return <GoalpickWidget widget={widget} onStatus={onStatus} />;
    case "decisions":
      return <DecisionsWidget widget={widget} onStatus={onStatus} />;
    case "spot":
      return <SpotWidget widget={widget} onStatus={onStatus} />;
    case "selfcheck":
      return <SelfcheckWidget widget={widget} onStatus={onStatus} />;
    case "planner":
      return <PlannerWidget widget={widget} onStatus={onStatus} />;
    case "fixer":
      return <FixerWidgetView widget={widget} onStatus={onStatus} />;
  }
}

type Of<T extends PlanWidget["type"]> = Extract<PlanWidget, { type: T }>;
interface Props<T extends PlanWidget["type"]> {
  widget: Of<T>;
  onStatus: (status: WidgetStatus) => void;
}

/** Keeps the live region mounted so screen readers announce the feedback when it appears. */
function Feedback({ tone, children }: { tone: "ok" | "no" | "info" | "error"; children: ReactNode }) {
  return <div aria-live="polite">{children ? <div className={cx(s.fb, s[tone])}>{children}</div> : null}</div>;
}

function CanvasBox({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={s.canvas}>
      {title ? <div className={s.canvasTitle}>{title}</div> : null}
      {children}
    </div>
  );
}

function FlowsWidget({ widget }: { widget: Of<"flows"> }) {
  return (
    <div className={s.flowsWrap}>
      <div className={widget.items.length > 1 ? s.flowPair : undefined}>
        {widget.items.map((it, i) => (
          <CanvasBox key={i} title={it.title}>
            <PracticeFlowDiagram nodes={it.flow.nodes} edges={it.flow.edges} start={it.flow.start} />
          </CanvasBox>
        ))}
      </div>
    </div>
  );
}

function McqWidget({ widget, onStatus }: Props<"mcq">) {
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked === null ? null : widget.options[picked];
  const correct = Boolean(chosen?.ok);

  return (
    <div className={s.widget}>
      <div className={s.q}>{widget.q}</div>
      <div className={s.opts}>
        {widget.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className={cx(s.opt, picked === i && (o.ok ? s.ok : s.no))}
            disabled={correct}
            onClick={() => {
              setPicked(i);
              onStatus({ attempted: true, complete: Boolean(o.ok) });
            }}
          >
            {o.t}
          </button>
        ))}
      </div>
      <Feedback tone={correct ? "ok" : "no"}>{chosen && chosen.fb + (chosen.ok ? "" : " Coba pilih jawaban lain.")}</Feedback>
    </div>
  );
}

function PollWidget({ widget, onStatus }: Props<"poll">) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className={s.widget}>
      <div className={s.q}>{widget.q}</div>
      <div className={s.opts}>
        {widget.options.map((t, i) => (
          <button
            key={i}
            type="button"
            className={cx(s.opt, picked === i && s.picked)}
            onClick={() => {
              setPicked(i);
              onStatus(DONE);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <Feedback tone="info">{picked !== null && widget.note}</Feedback>
    </div>
  );
}

function WriteWidget({ widget, onStatus, binding }: Props<"write"> & { binding?: WriteBinding }) {
  const [text, setText] = useState(binding?.saved ?? "");
  const [savedText, setSavedText] = useState<string | null>(binding?.saved ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const upToDate = savedText !== null && savedText === text;

  async function save() {
    setSaving(true);
    setError(false);
    const ok = binding ? await binding.save(text) : true;
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    setSavedText(text);
    onStatus(DONE);
  }

  return (
    <div className={s.widget}>
      <div className={s.q}>{widget.q}</div>
      <textarea
        value={text}
        placeholder={widget.placeholder || "Tulis di sini..."}
        aria-label={widget.q}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={s.wActions}>
        <button type="button" className={cx(s.btn, s.btnInk)} disabled={text.trim().length < 3 || saving || upToDate} onClick={save}>
          {saving ? "Menyimpan…" : upToDate ? "Tersimpan" : "Simpan jawaban"}
        </button>
      </div>
      {error ? (
        <Feedback tone="error">Jawaban belum tersimpan. Periksa koneksi internet kamu, lalu coba lagi.</Feedback>
      ) : (
        <Feedback tone="info">{savedText !== null && widget.note}</Feedback>
      )}
    </div>
  );
}

function GoalpickWidget({ widget, onStatus }: Props<"goalpick">) {
  const [picks, setPicks] = useState<(number | null)[]>(() => widget.scenarios.map(() => null));

  function pick(si: number, i: number) {
    const next = picks.map((p, j) => (j === si ? i : p));
    setPicks(next);
    onStatus({ attempted: true, complete: widget.scenarios.every((sc, j) => next[j] === sc.goal) });
  }

  return (
    <div className={s.widget}>
      {widget.intro ? <p>{widget.intro}</p> : null}
      {widget.scenarios.map((sc, si) => {
        const picked = picks[si];
        const solved = picked === sc.goal;
        return (
          <div key={si} className={s.scenario}>
            <div className={s.scenarioText}>{`${si + 1}. ${sc.text}`}</div>
            <div className={s.chips}>
              {sc.items.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  className={cx(s.chip, picked === i && (i === sc.goal ? s.ok : s.no))}
                  disabled={solved}
                  onClick={() => pick(si, i)}
                >
                  {t}
                </button>
              ))}
            </div>
            <Feedback tone={solved ? "ok" : "no"}>
              {picked !== null &&
                (solved ? "Tepat. " + sc.why : "Itu masih langkah. Kalau hal ini sudah selesai, apakah pengguna sudah puas?")}
            </Feedback>
          </div>
        );
      })}
    </div>
  );
}

function OptionSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih...</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function DecisionsWidget({ widget, onStatus }: Props<"decisions">) {
  const [answers, setAnswers] = useState(() => widget.items.map(() => ({ ya: "", tidak: "" })));
  const [results, setResults] = useState<boolean[] | null>(null);

  function check() {
    const next = widget.items.map((it, i) => it.ya.includes(answers[i].ya) && it.tidak.includes(answers[i].tidak));
    setResults(next);
    onStatus({ attempted: true, complete: next.every(Boolean) });
  }
  const setAt = (i: number, side: "ya" | "tidak", v: string) =>
    setAnswers((prev) => prev.map((a, j) => (j === i ? { ...a, [side]: v } : a)));

  return (
    <div className={s.widget}>
      {widget.intro ? <p>{widget.intro}</p> : null}
      {widget.items.map((it, i) => (
        <div key={i} className={s.decRow}>
          <div className={s.decQ}>{it.q}</div>
          <div className={s.grid2}>
            <div>
              <label>Kalau Ya</label>
              <OptionSelect label={`${it.q} cabang Ya`} options={it.options} value={answers[i].ya} onChange={(v) => setAt(i, "ya", v)} />
            </div>
            <div>
              <label>Kalau Tidak</label>
              <OptionSelect label={`${it.q} cabang Tidak`} options={it.options} value={answers[i].tidak} onChange={(v) => setAt(i, "tidak", v)} />
            </div>
          </div>
          <Feedback tone={results?.[i] ? "ok" : "no"}>
            {results &&
              (results[i]
                ? "Tepat. " + it.note
                : "Belum tepat. Bacakan pertanyaannya, lalu bayangkan layar apa yang dilihat pengguna untuk setiap jawaban.")}
          </Feedback>
        </div>
      ))}
      <div className={s.wActions}>
        <button type="button" className={cx(s.btn, s.btnInk)} onClick={check}>
          Cek jawaban
        </button>
      </div>
    </div>
  );
}

function SpotWidget({ widget, onStatus }: Props<"spot">) {
  const [marked, setMarked] = useState(() => widget.statements.map(() => false));
  const [result, setResult] = useState<boolean | null>(null);

  function check() {
    const ok = widget.statements.every((st, i) => marked[i] === st.bad);
    setResult(ok);
    onStatus({ attempted: true, complete: ok });
  }

  return (
    <div className={s.widget}>
      <div className={s.q}>{widget.q}</div>
      <div className={s.selfcheck}>
        {widget.statements.map((st, i) => (
          <label key={i}>
            <input
              type="checkbox"
              checked={marked[i]}
              onChange={(e) => setMarked((prev) => prev.map((m, j) => (j === i ? e.target.checked : m)))}
            />
            <span>{st.t}</span>
          </label>
        ))}
      </div>
      <div className={s.wActions}>
        <button type="button" className={cx(s.btn, s.btnInk)} onClick={check}>
          Cek jawaban
        </button>
      </div>
      <Feedback tone={result ? "ok" : "no"}>
        {result !== null &&
          (result
            ? "Tepat. " + widget.note
            : "Belum tepat. Ikuti panahnya satu per satu dari Home. Ada langkah yang terlewat? Ada kemungkinan hasil yang belum digambar?")}
      </Feedback>
    </div>
  );
}

function SelfcheckWidget({ widget, onStatus }: Props<"selfcheck">) {
  const [checked, setChecked] = useState(() => widget.items.map(() => false));

  function toggle(i: number, value: boolean) {
    const next = checked.map((c, j) => (j === i ? value : c));
    setChecked(next);
    onStatus({ attempted: next.some(Boolean), complete: next.every(Boolean) });
  }

  return (
    <div className={s.widget}>
      {widget.intro ? <p>{widget.intro}</p> : null}
      <div className={s.selfcheck}>
        {widget.items.map((t, i) => (
          <label key={i}>
            <input type="checkbox" checked={checked[i]} onChange={(e) => toggle(i, e.target.checked)} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PlannerWidget({ widget, onStatus }: Props<"planner">) {
  const [answers, setAnswers] = useState(() => widget.rows.map(() => ({ check: "", go: "" })));
  const [results, setResults] = useState<{ check: boolean; go: boolean }[] | null>(null);

  function check() {
    const next = widget.rows.map((r, i) => ({ check: r.check.includes(answers[i].check), go: r.go.includes(answers[i].go) }));
    setResults(next);
    onStatus({ attempted: true, complete: next.every((x) => x.check && x.go) });
  }
  const setAt = (i: number, field: "check" | "go", v: string) =>
    setAnswers((prev) => prev.map((a, j) => (j === i ? { ...a, [field]: v } : a)));

  return (
    <div className={s.widget}>
      {widget.intro ? <p>{widget.intro}</p> : null}
      <div className={s.tableScroll}>
        <table className={s.planner}>
          <thead>
            <tr>
              <th>Titik gagal</th>
              <th>Dicek di</th>
              <th>Arahkan ke</th>
            </tr>
          </thead>
          <tbody>
            {widget.rows.map((r, i) => {
              const res = results?.[i];
              return (
                <tr key={i}>
                  <td>
                    {r.problem}
                    <div className={s.mark}>{res?.check && res.go ? r.why : ""}</div>
                  </td>
                  <td>
                    <OptionSelect label={`${r.problem}: dicek di`} options={widget.checkOptions} value={answers[i].check} onChange={(v) => setAt(i, "check", v)} />
                    <div className={cx(s.mark, res && (res.check ? s.ok : s.no))}>{res && (res.check ? "Tepat" : "Bisa dicek lebih tepat")}</div>
                  </td>
                  <td>
                    <OptionSelect label={`${r.problem}: arahkan ke`} options={widget.goOptions} value={answers[i].go} onChange={(v) => setAt(i, "go", v)} />
                    <div className={cx(s.mark, res && (res.go ? s.ok : s.no))}>{res && (res.go ? "Tepat" : "Coba pikirkan lagi")}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={s.wActions}>
        <button type="button" className={cx(s.btn, s.btnInk)} onClick={check}>
          Cek jawaban
        </button>
      </div>
    </div>
  );
}

const KIND_BADGE = { Y: { cls: s.badgeY, text: "Ya" }, N: { cls: s.badgeN, text: "Tidak" }, R: { cls: s.badgeR, text: "pemulihan" } };

/** The core exercise: switch connections on and off until every rule holds. */
function FixerWidgetView({ widget, onStatus }: Props<"fixer">) {
  const all = [...new Set([...widget.initial, ...(widget.extra ?? [])])];
  const [on, setOn] = useState<string[]>(widget.initial);
  const [touched, setTouched] = useState(false);
  const [showedSolution, setShowedSolution] = useState(false);

  const active = all.filter((k) => on.includes(k));
  const results = checkRules(widget.rules, widget.nodes, active, widget.start);
  const pass = results.every((r) => r.pass);

  function apply(next: string[], wasTouched: boolean) {
    setOn(next);
    onStatus({ attempted: wasTouched, complete: fixerPasses(widget, next) });
  }
  function toggle(key: string) {
    setTouched(true);
    apply(on.includes(key) ? on.filter((k) => k !== key) : [...on, key], true);
  }

  return (
    <div>
      {widget.intro ? <p className={s.fixerIntro}>{widget.intro}</p> : null}
      <div className={s.fixer}>
        <CanvasBox title={widget.title || "Flow"}>
          <PracticeFlowDiagram nodes={widget.nodes} edges={active} start={widget.start} />
        </CanvasBox>
        <div className={s.fixerSide}>
          <div className={s.panel}>
            <h4>Sambungan</h4>
            <div className={s.toggles}>
              {all.map((key) => {
                const e = parseEdge(key);
                const badge = e.k ? KIND_BADGE[e.k] : null;
                return (
                  <button key={key} type="button" className={s.tog} aria-pressed={on.includes(key)} onClick={() => toggle(key)}>
                    <span className={s.sw} aria-hidden="true" />
                    <span>{edgeText(e)}</span>
                    {badge ? <span className={cx(s.badge, badge.cls)}>{badge.text}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={s.panel}>
            <h4>Aturan</h4>
            <ul className={s.rules} aria-live="polite">
              {results.map((r, i) => (
                <li key={i} className={r.pass ? s.pass : s.fail}>
                  <span className={s.ic} aria-hidden="true">
                    {r.pass ? "✓" : "×"}
                  </span>
                  <span>{(r.pass ? "" : "Belum: ") + r.label}</span>
                </li>
              ))}
            </ul>
            {pass ? <div className={s.win}>Semua aturan terpenuhi. Flow kamu sudah rapi.</div> : null}
          </div>
          <div className={s.wActions} style={{ marginTop: 0 }}>
            <button
              type="button"
              className={cx(s.btn, s.btnGhost)}
              onClick={() => {
                setShowedSolution(false);
                apply(widget.initial, touched);
              }}
            >
              Kembalikan flow awal
            </button>
            <button
              type="button"
              className={cx(s.btn, s.btnGhost)}
              disabled={!touched}
              onClick={() => {
                setShowedSolution(true);
                apply(widget.solution, touched);
              }}
            >
              Lihat contoh jawaban
            </button>
          </div>
        </div>
      </div>
      {showedSolution ? (
        <div className={cx(s.fb, s.info)}>
          Ini salah satu contoh susunan. Kalau susunanmu berbeda tapi semua aturan terpenuhi, itu juga benar.
        </div>
      ) : null}
      {pass && widget.afterNote ? <div className={cx(s.fb, s.info)}>{widget.afterNote}</div> : null}
    </div>
  );
}
