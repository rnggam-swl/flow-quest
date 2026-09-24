import Link from "next/link";
import type { Metadata } from "next";
import { listEditableCases } from "@/lib/content/drafts";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/content/questions";
import { Eyebrow, Headline, Sub } from "@/components/ui";

export const metadata: Metadata = { title: "Konten · Admin" };

function typeSummary(types: string[]) {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n > 1 ? `${n}× ` : ""}${QUESTION_TYPE_LABELS[t as QuestionType] ?? t}`).join(", ");
}

export default async function ContentPage() {
  const cases = await listEditableCases();
  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Eyebrow>Konten</Eyebrow>
      <Headline>Kasus & Quest</Headline>
      <Sub>
        Buka builder untuk mengubah soal sebuah quest. Perubahan disimpan sebagai draf dan baru dipakai session baru setelah dipublish. Session yang sudah
        berjalan tetap memakai versinya sendiri.
      </Sub>

      <div className="mt-6 flex flex-col gap-4">
        {cases.map((c) => (
          <div key={c.key} className="rounded-[14px] border border-border bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display text-[20px] font-semibold">{c.title}</div>
                <div className="mt-0.5 text-[12.5px] text-muted2">
                  <span className="font-mono">{c.key}</span> · {c.publishedVersion ? `versi ${c.publishedVersion} terbit` : "belum pernah terbit"} · {c.sessions} session
                </div>
              </div>
              {c.hasDraft && (
                <span className="rounded-[20px] border border-gold-dim bg-[rgba(240,172,63,0.1)] px-3 py-1 text-[12px] font-semibold text-gold">
                  Draf belum terbit{c.draftBy ? ` · ${c.draftBy}` : ""}
                </span>
              )}
            </div>
            <div className="flex flex-col divide-y divide-border">
              {c.quests.map((q) => (
                <Link key={q.order} href={`/builder/${c.key}?quest=${q.order}`} className="flex items-center justify-between gap-4 py-2.5 text-[14px] hover:text-teal">
                  <span>
                    <b>Quest {q.order}</b> · {q.title}
                    <span className="block text-[12.5px] text-muted">
                      {q.questions} soal — {typeSummary(q.types)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-teal">Buka builder →</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {cases.length === 0 && <p className="text-muted">Belum ada kasus. Impor file kasus dengan prisma/import-case.ts.</p>}
      </div>
    </div>
  );
}
