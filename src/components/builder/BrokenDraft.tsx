"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "./fields";
import s from "./builder.module.css";

/**
 * Shown instead of the builder when a case's stored draft is missing fields
 * the editors need (e.g. written straight to the DB or by an older import).
 * The author can download it to repair by hand, or discard it.
 */
export function BrokenDraft({ caseKey, title, revision, details, published }: { caseKey: string; title: string; revision: string; details: string; published: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={s.root}>
      <div className={s.canvas}>
        <div className={s.canvasInner} style={{ maxWidth: 640 }}>
          <div className={s.card}>
            <div className={s.dialogTitle}>Draf “{title}” tidak bisa dibuka</div>
            <p className={s.dialogText}>
              Draf yang tersimpan tidak punya semua isian yang dibutuhkan builder. Unduh drafnya untuk diperbaiki lalu impor ulang dari halaman Konten, atau buang
              drafnya{published ? " dan kembali ke versi terbit" : " (kasus yang belum pernah terbit ikut terhapus)"}.
            </p>
            <pre className={cx(s.hint, s.mono)} style={{ whiteSpace: "pre-wrap" }}>
              {details}
            </pre>
            {error && <p className={s.warn}>{error}</p>}
            <div className={s.dialogActs}>
              <Link href="/admin/konten" className={cx(s.btn, s.btnGhost)}>
                Kembali
              </Link>
              <a href={`/api/admin/content/${caseKey}/export?v=draft`} className={cx(s.btn, s.btnGhost)}>
                ⬇ Unduh draf
              </a>
              <button
                type="button"
                className={cx(s.btn, s.btnDanger)}
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(published ? "Buang draf ini?" : "Hapus kasus ini beserta drafnya?")) return;
                  setBusy(true);
                  const res = await fetch(`/api/admin/content/${caseKey}/draft?rev=${encodeURIComponent(revision)}`, { method: "DELETE" }).catch(() => null);
                  setBusy(false);
                  const data = await res?.json().catch(() => ({}));
                  if (!res?.ok) return setError(data?.error ?? "Gagal membuang draf.");
                  if (data?.deletedCase) router.push("/admin/konten");
                  else router.refresh();
                }}
              >
                {published ? "Buang draf" : "Hapus kasus"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
