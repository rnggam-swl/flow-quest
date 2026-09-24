"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

type SessionStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "ARCHIVED";

interface QuestRow {
  id: string;
  order: number;
  title: string;
  timeLimitMinutes: number | null;
  implemented: boolean;
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

const STATUS_OPTIONS: SessionStatus[] = ["DRAFT", "SCHEDULED", "ACTIVE", "CLOSED", "ARCHIVED"];

export function SessionSettingsForm({
  session,
  quests,
}: {
  session: { status: SessionStatus; startAt: string | null; endAt: string | null; timeLimitMinutes: number | null };
  quests: QuestRow[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>(session.status);
  const [startAt, setStartAt] = useState(toLocalInputValue(session.startAt));
  const [endAt, setEndAt] = useState(toLocalInputValue(session.endAt));
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(session.timeLimitMinutes ?? 60);
  const [questLimits, setQuestLimits] = useState<Record<string, number | null>>(
    Object.fromEntries(quests.map((q) => [q.id, q.timeLimitMinutes]))
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          startAt: fromLocalInputValue(startAt),
          endAt: fromLocalInputValue(endAt),
          timeLimitMinutes,
          questTimeLimits: questLimits,
        }),
      });
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-border bg-surface p-6">
      <Field label="Status Session" htmlFor="status">
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as SessionStatus)}
          className="w-full rounded-[9px] border border-border-light bg-surface2 px-[13px] py-[11px] text-[14.5px] text-text outline-none focus:border-teal"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mulai (opsional)" htmlFor="startAt">
          <Input id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </Field>
        <Field label="Selesai (opsional)" htmlFor="endAt">
          <Input id="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </Field>
      </div>

      <Field label="Batas waktu personal (menit, sejak peserta memulai)" htmlFor="timeLimitMinutes">
        <Input
          id="timeLimitMinutes"
          type="number"
          min={1}
          value={timeLimitMinutes}
          onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
        />
        <div className="mt-1.5 text-[12px] text-muted2">
          Dihitung sejak peserta login pertama kali (bukan sejak session diaktifkan). Setelah batas
          ini lewat, peserta tidak bisa memulai quest baru lagi — perubahan di sini hanya berlaku
          untuk peserta yang belum login sama sekali.
        </div>
      </Field>

      <div className="mb-1 mt-6 text-[13px] font-semibold text-muted">Batas Waktu per Quest</div>
      <div className="mb-2 text-[12px] text-muted2">Berlaku untuk session ini saja. Kosongkan untuk quest tanpa timer.</div>
      <div className="mb-5 flex flex-col gap-2">
        {quests.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-surface2 px-3.5 py-2.5">
            <div className="text-[13.5px]">
              {q.order}. {q.title}
              {!q.implemented && <span className="ml-2 text-[11px] text-muted2">(tidak pakai timer)</span>}
            </div>
            <input
              type="number"
              min={1}
              disabled={!q.implemented}
              value={questLimits[q.id] ?? ""}
              onChange={(e) =>
                setQuestLimits((prev) => ({ ...prev, [q.id]: e.target.value ? Number(e.target.value) : null }))
              }
              placeholder="menit"
              className="w-20 rounded-md border border-border-light bg-surface3 px-2 py-1.5 text-[13.5px] text-text outline-none focus:border-teal disabled:opacity-40"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan Pengaturan"}
        </Button>
        {savedAt && <span className="text-[13px] text-success">✓ Tersimpan</span>}
      </div>
    </div>
  );
}
