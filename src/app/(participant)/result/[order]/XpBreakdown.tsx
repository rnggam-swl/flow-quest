import type { RewardSummary } from "@/lib/content/rewards";

/** What a quest with rewards earned: completion XP, right answers, and combo bonus. */
export function XpBreakdown({ questXp, rewards, completed }: { questXp: number; rewards: RewardSummary; completed: boolean }) {
  const earnedQuest = completed ? questXp : 0;
  const best = Math.max(0, ...rewards.questions.map((q) => q.streak));
  const parts = [
    { label: "Quest selesai", xp: earnedQuest },
    { label: "Jawaban benar", xp: rewards.questionXp },
    { label: best >= 2 ? `Combo (terpanjang ×${best})` : "Combo", xp: rewards.comboXp },
  ];
  return (
    <div className="mb-6 rounded-[14px] border border-gold-dim bg-[rgba(240,172,63,0.08)] px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[1px] text-gold">XP dari quest ini</span>
        <span className="font-display text-[26px] font-semibold text-gold">+{earnedQuest + rewards.total}</span>
      </div>
      <div className="flex flex-col gap-1 text-[13.5px] text-muted">
        {parts.map((p) => (
          <div key={p.label} className="flex justify-between">
            <span>{p.label}</span>
            <span className="tabular-nums text-text">+{p.xp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
