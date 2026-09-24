"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Media } from "@/lib/content/questions";
import type { PublicAnswerOf, PublicQuestion, Reveal } from "@/lib/content/publicQuestion";

/**
 * Participant-side inputs for the twelve quiz question types, ported from the
 * Formulir builder prototype's preview and restyled for the app's dark theme.
 * Every input is controlled: it renders `value` (the answer in terms of what
 * was shown — see publicQuestion.ts) and reports changes, and once `reveal`
 * arrives it locks and marks what was right.
 */

type Q<T extends PublicQuestion["type"]> = Extract<PublicQuestion, { type: T }>;
type RevealOf<T extends Reveal["answer"]["type"]> = Extract<Reveal["answer"], { type: T }>;
/** The reveal for boolean/number/range, whose discriminant is itself a union. */
type ValueReveal = { value: number | boolean };

export interface InputProps<T extends PublicQuestion["type"]> {
  question: Q<T>;
  value: PublicAnswerOf<T> | null;
  onChange: (value: PublicAnswerOf<T>) => void;
  /** Set once the answer is checked; inputs lock and show what was right. */
  reveal: Reveal | null;
  disabled?: boolean;
}

export const PALETTE = ["#45d9c3", "#f0ac3f", "#b8aeff", "#f2705c", "#7bc97e", "#5fb3f0", "#f78fb3", "#e6c85c"];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const optionBase = "rounded-[10px] border-[1.5px] bg-surface px-4 py-3.5 text-left text-[14.5px] text-text transition-colors";
const optionIdle = "border-border-light enabled:hover:border-teal";
const optionPicked = "border-teal bg-[rgba(69,217,195,0.08)]";
const optionRight = "border-success bg-[rgba(123,201,126,0.1)]";
const optionWrong = "border-danger bg-[rgba(242,112,92,0.08)]";

export function MediaList({ media, className }: { media?: Media[]; className?: string }) {
  if (!media?.length) return null;
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {media.map((m, i) =>
        m.kind === "image" ? (
          // Authored media can live on any storage host, so next/image's allow-list doesn't fit here.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={m.url} alt={m.alt ?? ""} className="max-h-[220px] max-w-full rounded-lg border border-border-light" />
        ) : (
          <audio key={i} controls src={m.url} className="w-full max-w-[320px]" />
        )
      )}
    </div>
  );
}

function ItemContent({ text, media }: { text: string; media?: Media[] }) {
  return (
    <>
      <span>{text}</span>
      <MediaList media={media} className="mt-2" />
    </>
  );
}

// ── Choices ───────────────────────────────────────────────────────────────

export function ChoiceInput({
  question,
  value,
  onChange,
  reveal,
  disabled,
}: {
  question: Q<"singlechoice" | "multiselect">;
  value: unknown;
  onChange: (value: unknown) => void;
  reveal: Reveal | null;
  disabled?: boolean;
}) {
  const multi = question.type === "multiselect";
  const selected = multi ? ((value as PublicAnswerOf<"multiselect"> | null)?.selected ?? []) : value ? [(value as PublicAnswerOf<"singlechoice">).selected] : [];
  const correct = reveal
    ? reveal.answer.type === "singlechoice"
      ? [reveal.answer.correct]
      : (reveal.answer as RevealOf<"multiselect">).correct
    : [];

  function toggle(i: number) {
    if (multi) {
      const next = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort((a, b) => a - b);
      onChange({ selected: next } satisfies PublicAnswerOf<"multiselect">);
    } else {
      onChange({ selected: i } satisfies PublicAnswerOf<"singlechoice">);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {multi && !reveal && <div className="text-[12px] text-muted2">Boleh pilih lebih dari satu.</div>}
      {question.options.map((o, i) => {
        const isPicked = selected.includes(i);
        const state = reveal ? (correct.includes(i) ? optionRight : isPicked ? optionWrong : optionIdle) : isPicked ? optionPicked : optionIdle;
        return (
          <button key={i} type="button" disabled={Boolean(reveal) || disabled} onClick={() => toggle(i)} className={cx(optionBase, state, "flex flex-col items-start")}>
            <ItemContent text={o.text} media={o.media} />
          </button>
        );
      })}
    </div>
  );
}

export function BooleanInput({ value, onChange, reveal, disabled }: InputProps<"boolean">) {
  const picked = value?.value;
  const right = reveal ? (reveal.answer as ValueReveal).value : undefined;
  return (
    <div className="flex gap-3">
      {[true, false].map((v) => {
        const state = reveal ? (right === v ? optionRight : picked === v ? optionWrong : optionIdle) : picked === v ? optionPicked : optionIdle;
        return (
          <button key={String(v)} type="button" disabled={Boolean(reveal) || disabled} onClick={() => onChange({ value: v })} className={cx(optionBase, state, "flex-1 text-center font-semibold")}>
            {v ? "Ya" : "Tidak"}
          </button>
        );
      })}
    </div>
  );
}

export function NumberInput({ question, value, onChange, reveal, disabled }: InputProps<"number">) {
  const [text, setText] = useState(value?.value !== undefined && value !== null ? String(value.value) : "");
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          disabled={Boolean(reveal) || disabled}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange({ value: n });
          }}
          className="w-[180px] rounded-[9px] border border-border-light bg-surface2 px-[13px] py-[11px] text-[15px] text-text outline-none focus:border-teal"
        />
        {question.unit && <span className="text-[14px] text-muted">{question.unit}</span>}
      </div>
      {reveal && (
        <div className="mt-2 text-[13px] text-muted">
          Jawaban benar: <b className="text-text">{String((reveal.answer as ValueReveal).value)}</b> {question.unit}
        </div>
      )}
    </div>
  );
}

export function RangeInput({ question, value, onChange, reveal, disabled }: InputProps<"range">) {
  const v = value?.value ?? question.min;
  return (
    <div>
      <div className="mb-2 text-center font-display text-[28px] font-semibold text-teal">{v}</div>
      <input
        type="range"
        min={question.min}
        max={question.max}
        step={question.step}
        value={v}
        disabled={Boolean(reveal) || disabled}
        onChange={(e) => onChange({ value: e.target.valueAsNumber })}
        className="w-full accent-[var(--teal)]"
      />
      <div className="mt-1 flex justify-between text-[11.5px] text-muted2">
        <span>{question.min}</span>
        <span>{question.max}</span>
      </div>
      {reveal && (
        <div className="mt-2 text-[13px] text-muted">
          Jawaban benar: <b className="text-text">{String((reveal.answer as ValueReveal).value)}</b>
        </div>
      )}
    </div>
  );
}

// ── Matching: click an item, then its pair(s); lines show every link ─────────

export function MatchingInput({ question, value, onChange, reveal, disabled }: InputProps<"matching">) {
  const links = value?.links ?? [];
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const correct = reveal ? (reveal.answer as RevealOf<"matching">).links : [];
  const isRight = (item: number, pair: number) => correct.some((c) => c.item === item && c.pair === pair);
  const locked = Boolean(reveal) || disabled;

  // The links to draw, as a string so the measuring callback only changes when the lines do
  // (`links`/`correct` are fresh arrays every render).
  const shownKey = JSON.stringify(reveal ? correct : links);

  const measure = useCallback(() => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!wrap) return;
    const shown: { item: number; pair: number }[] = JSON.parse(shownKey);
    setLines(
      shown.flatMap((l) => {
        const a = leftRefs.current[l.item]?.getBoundingClientRect();
        const b = rightRefs.current[l.pair]?.getBoundingClientRect();
        if (!a || !b) return [];
        return [
          {
            x1: a.right - wrap.left,
            y1: a.top + a.height / 2 - wrap.top,
            x2: b.left - wrap.left,
            y2: b.top + b.height / 2 - wrap.top,
            color: PALETTE[l.item % PALETTE.length],
          },
        ];
      })
    );
  }, [shownKey]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  function clickPair(pair: number) {
    if (active === null) return;
    const exists = links.some((l) => l.item === active && l.pair === pair);
    // A pair belongs to one item, so linking it moves it away from any other item.
    const next = exists ? links.filter((l) => !(l.item === active && l.pair === pair)) : [...links.filter((l) => l.pair !== pair), { item: active, pair }];
    onChange({ links: next });
  }

  return (
    <div>
      {!locked && <div className="mb-3 text-[12px] text-muted2">Klik item di kiri, lalu klik pasangannya di kanan. Satu item boleh punya lebih dari satu pasangan.</div>}
      <div ref={wrapRef} className="relative grid grid-cols-[1fr_48px_1fr] items-start">
        <div className="flex flex-col gap-2">
          {question.items.map((it, i) => {
            const color = PALETTE[i % PALETTE.length];
            return (
              <button
                key={i}
                ref={(el) => {
                  leftRefs.current[i] = el;
                }}
                type="button"
                disabled={locked}
                onClick={() => setActive(active === i ? null : i)}
                className={cx(optionBase, "flex items-center justify-between gap-2 py-3", active === i ? "border-teal bg-[rgba(69,217,195,0.08)]" : "border-border-light")}
              >
                <span className="flex flex-col items-start">
                  <ItemContent text={it.label} media={it.media} />
                </span>
                <span className="h-3 w-3 flex-shrink-0 rounded-full border-2" style={{ borderColor: color, background: links.some((l) => l.item === i) ? color : "transparent" }} />
              </button>
            );
          })}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {lines.map((l, i) => {
            const mid = (l.x1 + l.x2) / 2;
            return <path key={i} d={`M${l.x1},${l.y1} C${mid},${l.y1} ${mid},${l.y2} ${l.x2},${l.y2}`} fill="none" stroke={l.color} strokeWidth={2} />;
          })}
        </svg>
        <div />
        <div className="flex flex-col gap-2">
          {question.pairs.map((p, j) => {
            const owner = links.find((l) => l.pair === j)?.item;
            const state = reveal ? (owner !== undefined && isRight(owner, j) ? optionRight : optionWrong) : owner !== undefined ? "border-border-light" : optionIdle;
            return (
              <button
                key={j}
                ref={(el) => {
                  rightRefs.current[j] = el;
                }}
                type="button"
                disabled={locked || active === null}
                onClick={() => clickPair(j)}
                className={cx(optionBase, "flex items-center gap-2 py-3", state)}
              >
                <span className="h-3 w-3 flex-shrink-0 rounded-full border-2" style={{ borderColor: owner !== undefined ? PALETTE[owner % PALETTE.length] : "var(--border-light)", background: owner !== undefined ? PALETTE[owner % PALETTE.length] : "transparent" }} />
                <span className="flex flex-col items-start">
                  <ItemContent text={p.text} media={p.media} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {reveal && <div className="mt-2 text-[12px] text-muted2">Garis menunjukkan pasangan yang benar; kotak merah berarti pasanganmu belum tepat.</div>}
    </div>
  );
}

// ── Grouping: tap an item, then a bucket (or drag it there) ─────────────────

export function GroupingInput({ question, value, onChange, reveal, disabled }: InputProps<"grouping">) {
  const placement = value?.placement ?? question.items.map(() => null);
  const [active, setActive] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | "pool" | null>(null);
  const right = reveal ? (reveal.answer as RevealOf<"grouping">).groups : [];
  const locked = Boolean(reveal) || disabled;

  const place = (item: number, bucket: number | null) => {
    onChange({ placement: placement.map((p, i) => (i === item ? bucket : p)) });
    setActive(null);
  };
  const chip = (i: number, bucket: number | null) => {
    const color = bucket === null ? undefined : PALETTE[bucket % PALETTE.length];
    const ok = reveal ? right[i] === bucket : null;
    return (
      <button
        key={i}
        type="button"
        draggable={!locked}
        disabled={locked}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(i));
          setActive(i);
        }}
        onClick={() => (bucket === null ? setActive(active === i ? null : i) : place(i, null))}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
          ok === true && "border-success bg-[rgba(123,201,126,0.12)] text-success",
          ok === false && "border-danger bg-[rgba(242,112,92,0.1)] text-danger",
          ok === null && (active === i ? "border-teal bg-[rgba(69,217,195,0.1)] text-teal" : bucket === null ? "border-border-light bg-surface2 text-text hover:border-teal" : "text-text")
        )}
        style={ok === null && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
      >
        <ItemContent text={question.items[i].text} media={question.items[i].media} />
      </button>
    );
  };
  const dropProps = (target: number | "pool") => ({
    onDragOver: (e: React.DragEvent) => {
      if (locked) return;
      e.preventDefault();
      setDragOver(target);
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const item = Number(e.dataTransfer.getData("text/plain"));
      if (Number.isInteger(item)) place(item, target === "pool" ? null : target);
    },
  });

  const pool = question.items.map((_, i) => i).filter((i) => placement[i] === null);
  return (
    <div>
      {!locked && <div className="mb-2 text-[12px] text-muted2">Pilih item lalu klik kelompoknya, atau seret item ke kelompok. Klik item di dalam kelompok untuk mengembalikannya.</div>}
      <div {...dropProps("pool")} className={cx("mb-3 flex min-h-[52px] flex-wrap gap-2 rounded-[14px] border-2 border-dashed p-3", dragOver === "pool" ? "border-teal" : "border-border-light")}>
        {pool.length ? pool.map((i) => chip(i, null)) : <span className="text-[12.5px] text-muted2">Semua item sudah dikelompokkan.</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {question.groups.map((g, gi) => {
          const color = PALETTE[gi % PALETTE.length];
          return (
            <div
              key={gi}
              {...dropProps(gi)}
              role="button"
              tabIndex={locked ? -1 : 0}
              onClick={() => active !== null && !locked && place(active, gi)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && active !== null && !locked) place(active, gi);
              }}
              className={cx("min-h-[84px] rounded-[14px] border-2 p-3 transition-colors", dragOver === gi ? "border-solid" : "border-dashed", active !== null && !locked && "cursor-pointer")}
              style={{ borderColor: dragOver === gi || active !== null ? color : "var(--border-light)" }}
            >
              <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold text-muted">
                {g}
                <span className="rounded-lg px-1.5 text-[10.5px] text-ink" style={{ background: color }}>
                  {placement.filter((p) => p === gi).length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">{question.items.map((_, i) => i).filter((i) => placement[i] === gi).map((i) => chip(i, gi))}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Guess the blank: one box per hidden letter (or word) ────────────────────

export function WordBlankInput({ question, value, onChange, reveal, disabled }: InputProps<"wordblank">) {
  const values = value?.values ?? {};
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const full = reveal ? (reveal.answer as RevealOf<"wordblank">).tokens : null;
  const word = question.blankMode === "word";
  const blanks = question.tokens.flatMap((t, i) => (t === null ? [i] : []));

  function set(i: number, v: string) {
    onChange({ values: { ...values, [String(i)]: v } });
    if (!word && v) {
      const next = blanks.find((b) => b > i);
      if (next !== undefined) refs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {question.tokens.map((t, i) => {
          if (!word && t === " ") return <span key={i} className="w-3" />;
          if (t !== null) {
            return (
              <span key={i} className={cx("flex h-11 items-center justify-center rounded-[10px] border-[1.5px] border-border-light bg-surface font-bold text-text", word ? "px-3 text-[14px]" : "w-11 text-[17px]")}>
                {t}
              </span>
            );
          }
          const ok = full ? (values[String(i)] ?? "").trim().toLowerCase() === full[i].toLowerCase() : null;
          return (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={full && !ok ? full[i] : (values[String(i)] ?? "")}
              maxLength={word ? 40 : 1}
              disabled={Boolean(reveal) || disabled}
              aria-label={`Kotak ${i + 1}`}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !values[String(i)] && !word) {
                  const prev = [...blanks].reverse().find((b) => b < i);
                  if (prev !== undefined) refs.current[prev]?.focus();
                }
              }}
              className={cx(
                "h-11 rounded-[10px] border-[1.5px] border-dashed bg-surface2 text-center font-bold text-text outline-none focus:border-solid",
                word ? "w-[110px] px-2 text-[14px]" : "w-11 text-[17px] uppercase",
                ok === null && "border-teal",
                ok === true && "border-solid border-success text-success",
                ok === false && "border-solid border-danger text-danger"
              )}
            />
          );
        })}
      </div>
      {question.hint && <div className="mt-3 rounded-[10px] bg-surface2 px-3.5 py-2.5 text-[13px] text-muted">💡 {question.hint}</div>}
    </div>
  );
}

// ── Sequencing: drag, or use the arrows ─────────────────────────────────────

export function SequencingInput({ question, value, onChange, reveal, disabled }: InputProps<"sequencing">) {
  const order = value?.order ?? question.items.map((_, i) => i);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const right = reveal ? (reveal.answer as RevealOf<"sequencing">).order : null;
  const locked = Boolean(reveal) || disabled;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ order: next });
  };

  return (
    <div className="flex flex-col gap-2">
      {!locked && <div className="text-[12px] text-muted2">Seret item atau pakai tombol ▲▼ sampai urutannya benar.</div>}
      {order.map((shown, pos) => {
        const ok = right ? right[pos] === shown : null;
        return (
          <div
            key={shown}
            draggable={!locked}
            onDragStart={() => setDragIdx(pos)}
            onDragOver={(e) => !locked && e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) move(dragIdx, pos);
              setDragIdx(null);
            }}
            className={cx(
              "flex items-center gap-3 rounded-[12px] border-[1.5px] bg-surface px-3 py-2.5",
              ok === true ? "border-success" : ok === false ? "border-danger" : "border-border-light",
              !locked && "cursor-grab"
            )}
          >
            <span className={cx("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-ink", ok === false ? "bg-danger" : ok ? "bg-success" : "bg-teal")}>{pos + 1}</span>
            <span className="flex-1 text-[14px] text-text">
              <ItemContent text={question.items[shown].text} media={question.items[shown].media} />
            </span>
            {!locked && (
              <span className="flex flex-col gap-0.5">
                <button type="button" aria-label="Naik" disabled={pos === 0} onClick={() => move(pos, pos - 1)} className="rounded bg-surface2 px-1.5 text-[10px] text-muted hover:text-text disabled:opacity-30">
                  ▲
                </button>
                <button type="button" aria-label="Turun" disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)} className="rounded bg-surface2 px-1.5 text-[10px] text-muted hover:text-text disabled:opacity-30">
                  ▼
                </button>
              </span>
            )}
          </div>
        );
      })}
      {right && <div className="text-[12px] text-muted2">Urutan yang benar: {right.map((i) => question.items[i].text).join(" → ")}</div>}
    </div>
  );
}

// ── Odd one out ─────────────────────────────────────────────────────────────

export function OddOneOutInput({ question, value, onChange, reveal, disabled }: InputProps<"oddoneout">) {
  const picked = value?.selected;
  const odd = reveal ? (reveal.answer as RevealOf<"oddoneout">).odd : null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
      {question.items.map((it, i) => {
        const state = reveal ? (odd === i ? optionRight : picked === i ? optionWrong : optionIdle) : picked === i ? optionPicked : optionIdle;
        return (
          <button key={i} type="button" disabled={Boolean(reveal) || disabled} onClick={() => onChange({ selected: i })} className={cx(optionBase, state, "flex flex-col items-center justify-center py-5 text-center font-semibold")}>
            <ItemContent text={it.text} media={it.media} />
          </button>
        );
      })}
    </div>
  );
}

// ── Hotspot: click the image to place as many marks as there are spots ─────

export function HotspotInput({ question, value, onChange, reveal, disabled }: InputProps<"hotspot">) {
  const marks = value?.marks ?? [];
  const spots = reveal ? (reveal.answer as RevealOf<"hotspot">).spots : [];
  const locked = Boolean(reveal) || disabled;

  function add(e: React.MouseEvent<HTMLDivElement>) {
    if (locked || marks.length >= question.spotCount) return;
    const r = e.currentTarget.getBoundingClientRect();
    onChange({ marks: [...marks, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }] });
  }

  return (
    <div>
      <div role="presentation" onClick={add} className={cx("relative overflow-hidden rounded-[14px] border-[1.5px] border-border-light", !locked && "cursor-crosshair")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authored media can live on any storage host */}
        <img src={question.image.url} alt={question.image.alt ?? ""} className="pointer-events-none block h-auto w-full select-none" />
        {/* Spots are scored in percent of each axis, so on a non-square image the hit area is an ellipse — drawn as one. */}
        {spots.map((s, i) => (
          <span key={`s${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-success bg-[rgba(123,201,126,0.2)]" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.radius * 2}%`, height: `${s.radius * 2}%` }} />
        ))}
        {marks.map((m, i) => (
          <button
            key={i}
            type="button"
            disabled={locked}
            aria-label={`Hapus tanda ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange({ marks: marks.filter((_, j) => j !== i) });
            }}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-teal text-[11px] font-bold text-ink shadow"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-muted2">
        {locked ? `${reveal?.score.correct ?? 0} dari ${question.spotCount} titik ditemukan. Lingkaran hijau menunjukkan titik yang benar.` : `Tandai ${question.spotCount} titik (${marks.length}/${question.spotCount}). Klik tanda untuk menghapusnya.`}
      </div>
    </div>
  );
}

// ── Branching story ─────────────────────────────────────────────────────────

export function BranchingInput({ question, value, onChange, reveal, disabled }: InputProps<"branching">) {
  const choices = value?.choices ?? [];
  const byId = new Map(question.nodes.map((n) => [n.id, n]));
  const path = [byId.get(question.start)!];
  for (const c of choices) {
    const next = byId.get(path[path.length - 1]?.choices[c]?.target ?? "");
    if (!next) break;
    path.push(next);
  }
  const node = path[path.length - 1];
  const steps = reveal ? (reveal.answer as RevealOf<"branching">).correctSteps : [];
  const locked = Boolean(reveal) || disabled;

  return (
    <div className="flex flex-col gap-3">
      {path.slice(0, -1).map((n, i) => (
        <div key={i} className="rounded-[12px] border border-border bg-surface px-4 py-3 text-[13px] text-muted">
          <div>{n.text}</div>
          <div className={cx("mt-1.5 font-semibold", reveal ? (steps[i] ? "text-success" : "text-danger") : "text-teal")}>
            → {n.choices[choices[i]]?.text}
          </div>
        </div>
      ))}
      <div className="rounded-[14px] bg-surface2 px-[18px] py-4 text-[14.5px] leading-[1.65] text-text">{node.text}</div>
      {node.ending ? (
        <div className="rounded-[12px] bg-[rgba(69,217,195,0.1)] px-4 py-3 text-center text-[13.5px] font-bold text-teal">{node.endingLabel || "Akhir cerita"}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {node.choices.map((c, i) => (
            <button key={i} type="button" disabled={locked} onClick={() => onChange({ choices: [...choices, i] })} className={cx(optionBase, optionIdle)}>
              {c.text}
            </button>
          ))}
        </div>
      )}
      {!locked && choices.length > 0 && (
        <button type="button" onClick={() => onChange({ choices: choices.slice(0, -1) })} className="self-start text-[12.5px] text-muted underline hover:text-text">
          ← Ubah pilihan terakhir
        </button>
      )}
    </div>
  );
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export function QuestionInput(props: { question: PublicQuestion; value: unknown; onChange: (v: unknown) => void; reveal: Reveal | null; disabled?: boolean }): ReactNode {
  const { question } = props;
  // Each branch narrows `question`; the value/onChange contract is per type (see InputProps).
  const p = props as never;
  switch (question.type) {
    case "singlechoice":
    case "multiselect":
      return <ChoiceInput question={question} value={props.value} onChange={props.onChange} reveal={props.reveal} disabled={props.disabled} />;
    case "boolean":
      return <BooleanInput {...(p as InputProps<"boolean">)} />;
    case "number":
      return <NumberInput {...(p as InputProps<"number">)} />;
    case "range":
      return <RangeInput {...(p as InputProps<"range">)} />;
    case "matching":
      return <MatchingInput {...(p as InputProps<"matching">)} />;
    case "grouping":
      return <GroupingInput {...(p as InputProps<"grouping">)} />;
    case "wordblank":
      return <WordBlankInput {...(p as InputProps<"wordblank">)} />;
    case "sequencing":
      return <SequencingInput {...(p as InputProps<"sequencing">)} />;
    case "oddoneout":
      return <OddOneOutInput {...(p as InputProps<"oddoneout">)} />;
    case "hotspot":
      return <HotspotInput {...(p as InputProps<"hotspot">)} />;
    case "branching":
      return <BranchingInput {...(p as InputProps<"branching">)} />;
  }
}
