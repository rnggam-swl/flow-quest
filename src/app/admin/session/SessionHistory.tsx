"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

interface SessionRow {
  id: string;
  title: string;
  sessionCode: string;
  status: string;
  createdAt: string;
  participantCount: number;
  caseTitle: string;
  caseVersion: number | null;
}

interface CaseOption {
  id: string;
  title: string;
  version: number;
}

export function SessionHistory({
  sessions,
  currentSessionId,
  cases,
}: {
  sessions: SessionRow[];
  currentSessionId: string;
  cases: CaseOption[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [scenarioId, setScenarioId] = useState(cases[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sessionCode, scenarioId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat session.");
        return;
      }
      setShowForm(false);
      setTitle("");
      setSessionCode("");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!showForm ? (
        <Button variant="ghost" className="self-start" onClick={() => setShowForm(true)}>
          + Buat Session Baru (Batch Berikutnya)
        </Button>
      ) : (
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <Field label="Kasus" htmlFor="newCase">
            <select
              id="newCase"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className="w-full rounded-[9px] border border-border-light bg-surface2 px-[13px] py-[11px] text-[14.5px] text-text outline-none focus:border-teal"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} (versi {c.version})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Judul Session" htmlFor="newTitle">
            <Input
              id="newTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="User Flow Quest — Oktober Batch"
            />
          </Field>
          <Field label="Kode Session" htmlFor="newCode" error={error ?? undefined}>
            <Input
              id="newCode"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="UFQ-1026"
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !title.trim() || !sessionCode.trim() || !scenarioId}>
              {creating ? "Membuat…" : "Buat Session"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={creating}>
              Batal
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-surface2 text-left text-[12px] uppercase tracking-[0.5px] text-muted">
              <th className="px-4 py-2.5 font-semibold">Judul</th>
              <th className="px-4 py-2.5 font-semibold">Kode</th>
              <th className="px-4 py-2.5 font-semibold">Kasus</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Peserta</th>
              <th className="px-4 py-2.5 font-semibold">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className={`border-t border-border ${s.id === currentSessionId ? "bg-[rgba(69,217,195,0.06)]" : ""}`}>
                <td className="px-4 py-2.5">
                  {s.title}
                  {s.id === currentSessionId && (
                    <span className="ml-2 rounded-md bg-teal px-1.5 py-0.5 text-[10px] font-bold text-[#0A2723]">
                      AKTIF DIKELOLA
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12.5px] text-muted">{s.sessionCode}</td>
                <td className="px-4 py-2.5 text-muted2">
                  {s.caseTitle}
                  {s.caseVersion !== null && <span className="text-[11.5px]"> · v{s.caseVersion}</span>}
                </td>
                <td className="px-4 py-2.5 text-muted2">{s.status}</td>
                <td className="px-4 py-2.5 text-muted2">{s.participantCount}</td>
                <td className="px-4 py-2.5 text-muted2">
                  {new Date(s.createdAt).toLocaleDateString("id-ID")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
