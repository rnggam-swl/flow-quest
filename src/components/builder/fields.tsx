"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { CaseNode } from "@/lib/content/case";
import type { Media } from "@/lib/content/questions";
import s from "./builder.module.css";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const replaceAt = <T,>(xs: T[], i: number, v: T) => xs.map((x, j) => (j === i ? v : x));
export const removeAt = <T,>(xs: T[], i: number) => xs.filter((_, j) => j !== i);
export function moveItem<T>(xs: T[], from: number, to: number): T[] {
  if (to < 0 || to >= xs.length || from === to) return xs;
  const next = [...xs];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

// ── Context: what every editor may need from the builder ───────────────────

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export interface BuilderContextValue {
  caseKey: string;
  nodes: CaseNode[];
  /** Null when uploads aren't configured on this server (no storage key) — media is then added by URL. */
  upload: ((file: File) => Promise<UploadResult>) | null;
  toast: (message: string, kind?: "ok" | "error") => void;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);
export const BuilderProvider = BuilderContext.Provider;
export function useBuilder(): BuilderContextValue {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder outside BuilderProvider");
  return ctx;
}

// ── Inputs ─────────────────────────────────────────────────────────────────

/** A textarea that grows with its content — the canvas title and help lines. */
export function AutoTextarea({ value, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={className} {...rest} />;
}

/**
 * A number field that lets the author type freely ("-", "1.", an empty box)
 * and only reports values that parse. `allowEmpty` reports null for an empty box.
 */
export function NumberField({
  value,
  onChange,
  className,
  allowEmpty,
  placeholder,
  min,
  step,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
  allowEmpty?: boolean;
  placeholder?: string;
  min?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState<{ text: string; value: number | null } | null>(null);
  const shown = draft && draft.value === value ? draft.text : value === null ? "" : String(value);
  return (
    <input
      type="number"
      inputMode="decimal"
      className={className}
      value={shown}
      placeholder={placeholder}
      min={min}
      step={step ?? "any"}
      onChange={(e) => {
        const text = e.target.value;
        if (text.trim() === "") {
          if (allowEmpty) onChange(null);
          setDraft({ text, value: allowEmpty ? null : value });
          return;
        }
        const n = Number(text);
        if (Number.isFinite(n)) {
          onChange(n);
          setDraft({ text, value: n });
        } else {
          setDraft({ text, value });
        }
      }}
    />
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <div className={s.trow}>
      <span className={s.tlbl}>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx(s.tog, on && s.togOn)} onClick={() => onChange(!on)} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={s.seg} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cx(s.segOpt, value === o.value && s.segOptOn)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const MARKDOWN_HINT = "Markdown: **tebal**, *miring*, baris diawali - untuk daftar.";

/** Optional markdown text; an empty box stores nothing. */
export function MarkdownArea({
  value,
  onChange,
  placeholder,
  className,
  rows = 3,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  return <textarea className={className ?? s.textarea} rows={rows} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />;
}

// ── Media ──────────────────────────────────────────────────────────────────

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|webm)(\?|#|$)/i;
export const guessKind = (url: string): Media["kind"] => (AUDIO_EXT.test(url) ? "audio" : "image");

function MediaThumb({ m, small, onRemove }: { m: Media; small?: boolean; onRemove?: () => void }) {
  return (
    <div className={cx(s.mediaThumb, small && s.mediaThumbSmall)} title={m.url}>
      {m.kind === "image" && m.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- authored media can live on any host
        <img src={m.url} alt={m.alt ?? ""} />
      ) : (
        <span>{m.kind === "audio" ? "🎵" : "🖼"}</span>
      )}
      {onRemove && (
        <button type="button" className={s.mediaRm} aria-label="Hapus media" onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  );
}

/** The "add media" form: upload a file (when storage is configured) or paste a URL. */
function MediaAdder({ onAdd, onClose, imageOnly }: { onAdd: (m: Media) => void; onClose: () => void; imageOnly?: boolean }) {
  const { upload, toast } = useBuilder();
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    if (!upload) return;
    setBusy(true);
    const r = await upload(file);
    setBusy(false);
    if (!r.ok) {
      toast(r.error, "error");
      return;
    }
    onAdd({ kind: file.type.startsWith("audio/") ? "audio" : "image", url: r.url, ...(alt.trim() ? { alt: alt.trim() } : {}) });
    onClose();
  }

  return (
    <div className={s.popover} onClick={(e) => e.stopPropagation()}>
      <div className={s.pg}>
        <label className={s.plbl}>Teks alternatif (untuk pembaca layar)</label>
        <input className={s.pin} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Mis. Layar detail ruang" />
      </div>
      {upload ? (
        <div className={s.pg}>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={imageOnly ? "image/*" : "image/*,audio/*"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className={cx(s.btn, s.btnPrimary)} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Mengunggah…" : imageOnly ? "📎 Upload gambar" : "📎 Upload gambar / audio"}
          </button>
        </div>
      ) : null}
      <div className={s.pg}>
        <label className={s.plbl}>{upload ? "…atau tempel URL" : "URL gambar / audio"}</label>
        <input className={cx(s.pin, s.mono)} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… atau /cases/…" />
      </div>
      <div className={s.trow}>
        <button type="button" className={cx(s.btn, s.btnGhost)} onClick={onClose}>
          Batal
        </button>
        <button
          type="button"
          className={cx(s.btn, s.btnPrimary)}
          disabled={!url.trim()}
          onClick={() => {
            const u = url.trim();
            onAdd({ kind: imageOnly ? "image" : guessKind(u), url: u, ...(alt.trim() ? { alt: alt.trim() } : {}) });
            onClose();
          }}
        >
          Tambah
        </button>
      </div>
    </div>
  );
}

/** A list of media attached to a question, option or item. `compact` is the 📎 button used inside rows. */
export function MediaEditor({ media, onChange, compact }: { media: Media[] | undefined; onChange: (m: Media[] | undefined) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const list = media ?? [];
  const set = (next: Media[]) => onChange(next.length ? next : undefined);
  return (
    <div style={{ position: "relative" }}>
      <div className={s.mediaList}>
        {list.map((m, i) => (
          <MediaThumb key={i} m={m} small={compact} onRemove={() => set(removeAt(list, i))} />
        ))}
        <button
          type="button"
          className={cx(s.mediaBtn, compact && s.mediaBtnSmall, compact && list.length > 0 && s.mediaBtnOn)}
          title="Tambah gambar atau audio"
          onClick={() => setOpen((o) => !o)}
        >
          📎{compact ? (list.length ? ` ${list.length}` : "") : <span>Tambah Media</span>}
        </button>
      </div>
      {open && <MediaAdder onAdd={(m) => set([...list, m])} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** One required image (the hotspot picture): pick or replace it. */
export function ImagePicker({ media, onChange, children }: { media: Media; onChange: (m: Media) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button type="button" className={s.mediaBtn} onClick={() => setOpen((o) => !o)}>
        📎 {media.url ? "Ganti gambar" : "Pilih gambar"}
      </button>
      {children}
      {open && <MediaAdder imageOnly onAdd={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}
