"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugifyCaseKey } from "@/lib/content/caseEdit";
import { readTransfer } from "@/lib/content/transfer";
import { Button, Field, Input } from "@/components/ui";

/**
 * /admin/konten's actions: start a case (blank or as a copy), import a case
 * file as a draft, and move a session that hasn't started onto a newer
 * version. Everything new lands as a draft; publishing happens in the builder.
 */

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

const selectClass = "w-full rounded-[9px] border border-border-light bg-surface2 px-[13px] py-[11px] text-[14.5px] text-text outline-none focus:border-teal";

export function NewCaseForm({ cases, from: initialFrom, onDone }: { cases: { key: string; title: string }[]; from?: string; onDone: () => void }) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom ?? "");
  const source = cases.find((c) => c.key === from);
  const [title, setTitle] = useState(source ? `${source.title} (salinan)` : "");
  const [key, setKey] = useState(source ? slugifyCaseKey(`${source.key}-salinan`) : "");
  const [keyTouched, setKeyTouched] = useState(Boolean(source));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await post("/api/admin/content", { action: "create", key, title, ...(from ? { from } : {}) }).catch(() => null);
    setBusy(false);
    if (!res) return setError("Terjadi kesalahan jaringan.");
    if (!res.ok) return setError(res.data.error ?? "Gagal membuat kasus.");
    router.push(`/builder/${res.data.key}?view=kasus`);
    onDone();
  }

  return (
    <div className="rounded-[14px] border border-border bg-surface p-5">
      <Field label="Mulai dari" htmlFor="caseFrom">
        <select
          id="caseFrom"
          className={selectClass}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            const src = cases.find((c) => c.key === e.target.value);
            if (src && !title) setTitle(`${src.title} (salinan)`);
          }}
        >
          <option value="">Kasus kosong (1 quest, kamus node contoh)</option>
          {cases.map((c) => (
            <option key={c.key} value={c.key}>
              Salinan dari: {c.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Judul kasus" htmlFor="caseTitle">
        <Input
          id="caseTitle"
          value={title}
          placeholder="mis. Peminjaman Alat Lab"
          onChange={(e) => {
            setTitle(e.target.value);
            if (!keyTouched) setKey(slugifyCaseKey(e.target.value));
          }}
        />
      </Field>
      <Field label="Kunci kasus" htmlFor="caseKey" error={error ?? undefined}>
        <Input
          id="caseKey"
          value={key}
          className="font-mono"
          placeholder="peminjaman-alat-lab"
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value.toLowerCase());
          }}
        />
      </Field>
      <p className="-mt-2 mb-4 text-[12.5px] text-muted2">Kunci dipakai di alamat builder dan file ekspor, dan tidak bisa diubah. Huruf kecil, angka, dan tanda -.</p>
      <div className="flex gap-2">
        <Button onClick={() => void create()} disabled={busy || !title.trim() || !key.trim()}>
          {busy ? "Membuat…" : "Buat & buka builder"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Batal
        </Button>
      </div>
    </div>
  );
}

export function ContentToolbar({ cases }: { cases: { key: string; title: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function importFile(file: File) {
    setMessage(null);
    const read = readTransfer(await file.text(), "case");
    if (!read.ok) return setMessage({ text: read.error, error: true });
    setBusy(true);
    let res = await post("/api/admin/content", { action: "import", content: read.data }).catch(() => null);
    if (res?.status === 409 && window.confirm(`${res.data.error}\n\nGanti draf yang ada dengan isi file ini?`)) {
      res = await post("/api/admin/content", { action: "import", content: read.data, replaceDraft: true }).catch(() => null);
    }
    setBusy(false);
    if (!res) return setMessage({ text: "Terjadi kesalahan jaringan.", error: true });
    if (!res.ok) return setMessage({ text: res.data.error ?? "Gagal mengimpor.", error: true });
    setMessage({ text: res.data.created ? `Kasus "${read.data.title}" dibuat sebagai draf.` : `Draf "${read.data.title}" diganti dari file.` });
    router.push(`/builder/${res.data.key}?view=kasus`);
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setForm((f) => !f)}>+ Kasus baru</Button>
        <label className={`inline-flex cursor-pointer items-center rounded-[9px] border border-border-light bg-surface2 px-[22px] py-3 text-[14.5px] font-semibold text-text hover:bg-surface3 ${busy ? "opacity-60" : ""}`}>
          {busy ? "Mengimpor…" : "⬆ Impor kasus (JSON)"}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {message && <p className={`text-[13px] ${message.error ? "whitespace-pre-wrap text-danger" : "text-teal"}`}>{message.text}</p>}
      {form && <NewCaseForm cases={cases} onDone={() => setForm(false)} />}
    </div>
  );
}

export function DuplicateCaseButton({ cases, from }: { cases: { key: string; title: string }[]; from: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-[13px] text-teal hover:underline" onClick={() => setOpen((o) => !o)}>
        Duplikat
      </button>
      {open && (
        <div className="basis-full">
          <NewCaseForm cases={cases} from={from} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** Moves one session that hasn't started onto the case's newest version. */
export function UpgradeSessionButton({ sessionId, toVersion }: { sessionId: string; toVersion: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="rounded-md border border-teal-dim px-2 py-0.5 text-[12px] font-semibold text-teal hover:bg-[rgba(69,217,195,0.08)] disabled:opacity-50"
        onClick={async () => {
          if (!window.confirm(`Pindahkan session ini ke versi ${toVersion}? Daftar quest-nya ikut diperbarui.`)) return;
          setBusy(true);
          setError(null);
          const res = await post(`/api/admin/sessions/${sessionId}/version`).catch(() => null);
          setBusy(false);
          if (!res?.ok) return setError(res?.data?.error ?? "Gagal memperbarui.");
          router.refresh();
        }}
      >
        {busy ? "Memindah…" : `Perbarui ke v${toVersion}`}
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}
