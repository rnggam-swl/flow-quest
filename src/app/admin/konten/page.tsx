import Link from "next/link";
import type { Metadata } from "next";
import { listEditableCases } from "@/lib/content/drafts";
import { listCaseVersions } from "@/lib/content/caseAdmin";
import { LOCK_LABELS } from "@/lib/content/versionLock";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/content/questions";
import { Eyebrow, Headline, Sub } from "@/components/ui";
import { ContentToolbar, DuplicateCaseButton, UpgradeSessionButton } from "./ContentActions";

export const metadata: Metadata = { title: "Konten · Admin" };

function typeSummary(types: string[]) {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n > 1 ? `${n}× ` : ""}${QUESTION_TYPE_LABELS[t as QuestionType] ?? t}`).join(", ");
}

export default async function ContentPage() {
  const [cases, versions] = await Promise.all([listEditableCases(), listCaseVersions()]);
  const caseOptions = cases.map((c) => ({ key: c.key, title: c.title }));
  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Eyebrow>Konten</Eyebrow>
      <Headline>Kasus, Quest & Modul</Headline>
      <Sub>
        Semua yang dilihat peserta diedit di builder: cerita dan kamus node kasus, quest dan soalnya, serta Modul Latihan. Perubahan disimpan sebagai draf dan
        baru dipakai session baru setelah dipublish. Session yang sedang aktif atau sudah ada progres peserta terkunci di versinya sendiri.
      </Sub>

      <p className="-mt-2 text-[13.5px]">
        <Link href="/admin/konten/panduan" className="text-teal underline">
          Panduan membuat konten →
        </Link>
      </p>

      <ContentToolbar cases={caseOptions} />

      <div className="mt-6 flex flex-col gap-4">
        {cases.map((c) => {
          const vs = versions.get(c.key) ?? [];
          const latest = vs.find((v) => v.latest)?.version ?? c.publishedVersion;
          return (
            <div key={c.key} className="rounded-[14px] border border-border bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-display text-[20px] font-semibold">{c.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted2">
                    <span className="font-mono">{c.key}</span> · {c.publishedVersion ? `versi ${c.publishedVersion} terbit` : "belum pernah terbit"} · {c.sessions} session ·{" "}
                    {c.modules} modul
                  </div>
                </div>
                {c.hasDraft && (
                  <span className="rounded-[20px] border border-gold-dim bg-[rgba(240,172,63,0.1)] px-3 py-1 text-[12px] font-semibold text-gold">
                    Draf belum terbit{c.draftBy ? ` · ${c.draftBy}` : ""}
                  </span>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <Link href={`/builder/${c.key}?view=kasus`} className="font-semibold text-teal hover:underline">
                  Edit kasus
                </Link>
                <Link href={`/builder/${c.key}?view=modul`} className="text-teal hover:underline">
                  Modul Latihan
                </Link>
                <DuplicateCaseButton cases={caseOptions} from={c.key} />
                {c.publishedVersion && (
                  <a href={`/api/admin/content/${c.key}/export?v=latest`} className="text-teal hover:underline">
                    Ekspor v{c.publishedVersion} (JSON)
                  </a>
                )}
                {c.hasDraft && (
                  <a href={`/api/admin/content/${c.key}/export?v=draft`} className="text-teal hover:underline">
                    Ekspor draf (JSON)
                  </a>
                )}
              </div>

              <div className="flex flex-col divide-y divide-border">
                {c.quests.map((q) => (
                  <Link key={q.order} href={`/builder/${c.key}?view=quest&quest=${q.order}`} className="flex items-center justify-between gap-4 py-2.5 text-[14px] hover:text-teal">
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

              {vs.some((v) => v.sessions.length > 0) && (
                <div className="mt-4 rounded-[10px] bg-surface2 p-3.5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-muted">Versi yang dipakai session</div>
                  <div className="flex flex-col gap-2 text-[13px]">
                    {vs
                      .filter((v) => v.sessions.length > 0)
                      .map((v) => (
                        <div key={v.version} className="flex flex-col gap-1">
                          <div className="text-muted">
                            <b className="text-text">v{v.version}</b>
                            {v.latest ? " (terbaru)" : ""}
                            {v.publishedAt ? ` · terbit ${v.publishedAt.toLocaleDateString("id-ID")}` : ""}
                            {v.note ? ` · ${v.note}` : ""}
                          </div>
                          {v.sessions.map((s) => (
                            <div key={s.id} className="flex flex-wrap items-center gap-2 pl-3 text-muted2">
                              <span>
                                {s.title} <span className="font-mono text-[12px]">{s.sessionCode}</span> · {s.status}
                              </span>
                              {s.lock ? (
                                <span className="text-[12px] text-gold" title="Session ini tidak akan dipindah ke versi lain">
                                  🔒 {LOCK_LABELS[s.lock]}
                                </span>
                              ) : latest && latest > v.version ? (
                                <UpgradeSessionButton sessionId={s.id} toVersion={latest} />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {cases.length === 0 && <p className="text-muted">Belum ada kasus. Buat kasus baru atau impor file kasus di atas.</p>}
      </div>
    </div>
  );
}
