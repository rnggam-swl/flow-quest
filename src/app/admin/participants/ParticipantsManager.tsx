"use client";

import { useState } from "react";
import { randomPassword } from "@/lib/randomPassword";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Textarea, StatusPill } from "@/components/ui";

interface ExistingParticipant {
  userId: string;
  name: string;
  email: string;
  school: string | null;
  group: string | null;
  status: string;
}

interface ProvisionedResult {
  name: string;
  email: string;
  password: string;
  status: string;
}

/** `initialPassword` comes from the server so the first render matches on both sides (no hydration mismatch). */
export function ParticipantsManager({ existing, initialPassword }: { existing: ExistingParticipant[]; initialPassword: string }) {
  const router = useRouter();
  const [lines, setLines] = useState("");
  const [password, setPassword] = useState(initialPassword);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProvisionedResult[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ userId: string; email: string; password: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const lineCount = lines.split("\n").map((l) => l.trim()).filter(Boolean).length;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal menambahkan peserta.");
        return;
      }
      setResults(data.results);
      setLines("");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(userId: string) {
    setResettingId(userId);
    setResetError(null);
    setResetResult(null);
    try {
      const res = await fetch("/api/admin/participants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error ?? "Gagal mereset password.");
        return;
      }
      setResetResult({ userId, email: data.email, password: data.password });
    } catch {
      setResetError("Terjadi kesalahan jaringan.");
    } finally {
      setResettingId(null);
    }
  }

  async function deleteParticipant(userId: string) {
    setDeletingId(userId);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin/participants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Gagal menghapus peserta.");
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    } catch {
      setDeleteError("Terjadi kesalahan jaringan.");
    } finally {
      setDeletingId(null);
    }
  }

  function copyResults() {
    if (!results) return;
    const text = results.map((r) => `${r.name}\t${r.email}\t${r.password}`).join("\n");
    navigator.clipboard.writeText(`Nama\tEmail\tPassword\n${text}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Daftar Peserta (satu per baris)" htmlFor="lines">
          <Textarea
            id="lines"
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder={"Rani Anindita, SMKN 2 Sumedang, Tim UI/UX\nBagas Pratama, SMKN 2 Sumedang\nSiti Aminah"}
            className="min-h-[160px] font-mono text-[13px]"
          />
          <div className="mt-1.5 text-[12px] text-muted2">{lineCount} peserta terdeteksi</div>
        </Field>

        <Field label="Password untuk batch ini" htmlFor="password" error={error ?? undefined}>
          <div className="flex gap-2">
            <Input id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="ghost" className="!px-3.5 whitespace-nowrap" onClick={() => setPassword(randomPassword())}>
              Acak Ulang
            </Button>
          </div>
          <div className="mt-1.5 text-[12px] text-muted2">
            Semua peserta di batch ini akan memakai password yang sama — bagikan lisan/tulisan ke kelas.
          </div>
        </Field>

        <Button onClick={handleSubmit} disabled={submitting || lineCount === 0}>
          {submitting ? "Menambahkan…" : `Tambahkan ${lineCount || ""} Peserta`}
        </Button>
      </Card>

      {results && results.length > 0 && (
        <Card className="border-success">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13.5px] font-semibold text-success">
              ✓ {results.length} peserta berhasil dibuat — catat kredensial ini sekarang, tidak akan
              ditampilkan lagi.
            </div>
            <Button variant="gold" className="!px-3.5 !py-2 !text-[13px]" onClick={copyResults}>
              {copied ? "Tersalin!" : "Salin Semua"}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border-light">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-surface2 text-left text-muted">
                  <th className="px-3 py-2 font-semibold">Nama</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Password</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.email} className="border-t border-border">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-[12.5px]">{r.email}</td>
                    <td className="px-3 py-2 font-mono text-[12.5px] text-gold">{r.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <div className="mb-2.5 text-[13px] font-semibold text-muted">
          Peserta Terdaftar ({existing.length})
        </div>
        {resetError && (
          <div className="mb-2.5 rounded-lg border border-danger bg-[rgba(242,112,92,0.1)] px-3.5 py-2.5 text-[13px] text-danger">
            ⚠️ {resetError}
          </div>
        )}
        {deleteError && (
          <div className="mb-2.5 rounded-lg border border-danger bg-[rgba(242,112,92,0.1)] px-3.5 py-2.5 text-[13px] text-danger">
            ⚠️ {deleteError}
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-surface2 text-left text-[12px] uppercase tracking-[0.5px] text-muted">
                <th className="px-4 py-2.5 font-semibold">Nama</th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Sekolah / Kelompok</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Password</th>
                <th className="px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {existing.map((p) => (
                <tr key={p.userId} className="border-t border-border">
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[12.5px] text-muted">{p.email}</td>
                  <td className="px-4 py-2.5 text-muted2">
                    {p.school ?? "—"}
                    {p.group ? ` · ${p.group}` : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill tone={p.status === "COMPLETED" ? "completed" : "progress"}>{p.status}</StatusPill>
                  </td>
                  <td className="px-4 py-2.5">
                    {resetResult?.userId === p.userId ? (
                      <span className="font-mono text-[12.5px] text-gold">{resetResult.password}</span>
                    ) : (
                      <button
                        className="text-[12.5px] text-teal underline disabled:opacity-50"
                        disabled={resettingId === p.userId}
                        onClick={() => resetPassword(p.userId)}
                      >
                        {resettingId === p.userId ? "Mereset…" : "Reset Password"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {confirmDeleteId === p.userId ? (
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-[12.5px] text-muted2">Yakin?</span>
                        <button
                          className="text-[12.5px] font-semibold text-danger underline disabled:opacity-50"
                          disabled={deletingId === p.userId}
                          onClick={() => deleteParticipant(p.userId)}
                        >
                          {deletingId === p.userId ? "Menghapus…" : "Ya, Hapus"}
                        </button>
                        <button
                          className="text-[12.5px] text-muted2 underline disabled:opacity-50"
                          disabled={deletingId === p.userId}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-[12.5px] text-danger underline"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDeleteId(p.userId);
                        }}
                      >
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {existing.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted2">
                    Belum ada peserta terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
