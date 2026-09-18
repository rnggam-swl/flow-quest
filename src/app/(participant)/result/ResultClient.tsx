"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";
import { TIER_LABELS, computeRationaleScore, deriveTierFromScores } from "@/lib/flowScoring";

interface Scores {
  goalScore: number;
  flowScore: number;
  logicScore: number;
  edgeCaseScore: number;
  simplicityScore: number;
}

export function ResultClient({
  submissionId,
  timeExpired,
  elapsedSeconds,
  score,
  existingReflection,
}: {
  submissionId: string;
  timeExpired: boolean;
  elapsedSeconds: number;
  score: Scores;
  existingReflection: string;
}) {
  const router = useRouter();
  const { tier, message } = deriveTierFromScores(score);
  const tierInfo = TIER_LABELS[tier];

  const [reflection, setReflection] = useState(existingReflection);
  const [saved, setSaved] = useState(Boolean(existingReflection));
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rationaleScore = saved ? computeRationaleScore(reflection) : 0;
  const baseTotal = score.goalScore + score.flowScore + score.logicScore + score.edgeCaseScore + score.simplicityScore;
  const total = baseTotal + rationaleScore;
  const max = saved ? 100 : 90;

  const mm = Math.floor(elapsedSeconds / 60);
  const ss = String(elapsedSeconds % 60).padStart(2, "0");

  async function submitReflection() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: reflection, submissionId }),
      });
      if (!res.ok) {
        setSaveError("Gagal menyimpan alasan — coba lagi.");
        return;
      }
      setSaved(true);
      setShowDetail(true);
    } catch {
      setSaveError("Gagal menyimpan alasan — periksa koneksi internet kamu.");
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, string][] = [
    ["Goal Understanding", `${score.goalScore} / 20`],
    ["Flow Validity", `${score.flowScore} / 25`],
    ["Logic", `${score.logicScore} / 20`],
    ["Edge Case", `${score.edgeCaseScore} / 15`],
    ["Simplicity", `${score.simplicityScore} / 10`],
    ["Rationale", saved ? `${rationaleScore} / 10` : "Belum diisi"],
    ["Total", `${total} / 100`],
  ];

  return (
    <div className="mx-auto max-w-[600px] px-5 pt-[50px] pb-24 text-center">
      <div
        className="mx-auto mb-[18px] flex h-[92px] w-[92px] items-center justify-center rounded-full border-[3px] border-gold text-[38px]"
        style={{ background: "radial-gradient(circle, rgba(240,172,63,0.18), transparent 70%)" }}
      >
        {tierInfo.badge}
      </div>
      <div className="font-display mb-2 text-[24px] font-semibold text-gold">{tierInfo.label}</div>
      <p className="mb-5 text-[14.5px] text-muted">
        {timeExpired
          ? `Waktu habis — flow terakhir kamu otomatis dikirim (${mm}m ${ss}s).`
          : `Quest 2 selesai dalam ${mm}m ${ss}s.`}
      </p>
      <div className="mb-6 rounded-xl border border-border bg-surface px-[18px] py-4 text-left text-[14.5px] leading-[1.6] text-muted">
        {message}
      </div>

      <div className="mb-2">
        <div className="mb-1.5 flex justify-between text-[13px] text-muted">
          <span>Skor Flow Kamu</span>
          <span>
            {total} / {max}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-md bg-surface2">
          <div
            className="h-full rounded-md transition-all"
            style={{
              width: `${Math.min(100, (total / 100) * 100)}%`,
              background: "linear-gradient(90deg, var(--teal), var(--gold))",
            }}
          />
        </div>
        <div className="mt-1.5 text-left text-[12px] text-muted2">
          Skor akan bertambah setelah kamu isi alasan di bawah — reasoning kamu bagian dari
          penilaian juga, lho.
        </div>
      </div>

      <button
        className="my-4 text-[13px] text-teal underline"
        onClick={() => setShowDetail((s) => !s)}
      >
        Lihat rincian penilaian (versi mentor) ▾
      </button>
      {showDetail && (
        <div className="mb-6 rounded-xl border border-border bg-surface px-[18px] py-4 text-left">
          {rows.map(([label, value], i) => (
            <div
              key={label}
              className={`flex justify-between py-[7px] text-[13.5px] ${
                i < rows.length - 1 ? "border-b border-border" : "pt-2.5 font-bold"
              }`}
            >
              <span>{label}</span>
              <span className={value === "Belum diisi" ? "italic text-muted2" : "tabular-nums text-muted"}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="text-left">
        <label className="mb-2 block text-[13.5px] font-semibold">
          Kenapa kamu memilih flow ini? (jelaskan alasannya)
        </label>
        <Textarea
          value={reflection}
          disabled={saved}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Contoh: Saya menempatkan konfirmasi sebelum success supaya user bisa cek data dulu sebelum dikirim..."
        />
        <Button variant="gold" className="mt-3" onClick={submitReflection} disabled={saved || saving || !reflection.trim()}>
          {saving ? "Menyimpan…" : "Kirim Alasan"}
        </Button>
        {saved && (
          <div className="mt-3 rounded-[9px] border border-success bg-[rgba(123,201,126,0.1)] px-3.5 py-2.5 text-[13.5px] text-success">
            ✓ Alasan kamu tersimpan dan sudah masuk ke penilaian akhir.
          </div>
        )}
        {saveError && (
          <div className="mt-3 rounded-[9px] border border-danger bg-[rgba(242,112,92,0.1)] px-3.5 py-2.5 text-[13.5px] text-danger">
            ⚠️ {saveError}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        className="mt-6 w-full"
        onClick={() => {
          router.push("/brief");
          router.refresh();
        }}
      >
        ← Kembali ke Session Brief
      </Button>
    </div>
  );
}
