import { z } from "zod";
import type { QuestContent } from "@/lib/content/case";
import type { QuestionScore } from "@/lib/content/questions";

/**
 * Quest gamification (Fase 5): XP for every quiz question answered right, a
 * combo bonus for answers right in a row, and reactions after each checked
 * answer. All of it is optional per quest — a quest without `rewards` plays
 * and scores exactly as before, earning only its completion XP.
 *
 * XP is computed from the saved answers when the quest completes (server)
 * and, for the instant-check player, from the answers revealed so far
 * (browser), with this one function, so both always agree.
 */

/** A streak multiplies the combo bonus up to this many times. */
export const COMBO_CAP = 4;

export const questRewardsSchema = z.strictObject({
  /** XP for a fully right quiz question; partial credit earns its share, rounded down. */
  questionXp: z.number().int().nonnegative().default(0),
  /** Extra XP per right answer that continues a streak: ×1 on the 2nd in a row, ×2 on the 3rd … up to ×COMBO_CAP. */
  comboBonus: z.number().int().nonnegative().default(0),
  /** Show a short reaction (and the XP earned) after each checked answer. */
  reactions: z.boolean().default(true),
});
export type QuestRewards = z.infer<typeof questRewardsSchema>;

export interface QuestionReward {
  questionId: string;
  xp: number;
  /** Right answers in a row, ending with this one (0 when this one wasn't fully right). */
  streak: number;
  combo: number;
}

export interface RewardSummary {
  questions: QuestionReward[];
  questionXp: number;
  comboXp: number;
  /** questionXp + comboXp — what's added to the quest's own XP. */
  total: number;
}

const isFull = (s: QuestionScore | undefined) => Boolean(s && s.total > 0 && s.correct >= s.total);

/**
 * Rewards for the quiz questions of a quest, in question order. `scores` maps
 * a question id to its score; a question with no score yet (unanswered) earns
 * nothing and ends the streak. With `upTo`, only the first `upTo` quiz
 * questions count — the instant player's view of the answers so far.
 */
/** Just what the rewards read of a quest — the player has public questions, not the authored ones. */
export interface RewardQuest {
  questions: { id: string; type: string }[];
  rewards?: QuestRewards;
}

export function questRewards(quest: RewardQuest, scores: Map<string, QuestionScore>, upTo?: number): RewardSummary {
  const r = quest.rewards;
  const quiz = quest.questions.filter((q) => q.type !== "flow").slice(0, upTo);
  let streak = 0;
  const questions = quiz.map((q): QuestionReward => {
    const s = scores.get(q.id);
    streak = isFull(s) ? streak + 1 : 0;
    const xp = r && s && s.total > 0 ? Math.floor((r.questionXp * Math.min(s.correct, s.total)) / s.total) : 0;
    const combo = r && streak >= 2 ? r.comboBonus * Math.min(streak - 1, COMBO_CAP) : 0;
    return { questionId: q.id, xp, streak, combo };
  });
  const questionXp = questions.reduce((n, q) => n + q.xp, 0);
  const comboXp = questions.reduce((n, q) => n + q.combo, 0);
  return { questions, questionXp, comboXp, total: questionXp + comboXp };
}

/** The most a quest can earn: its completion XP plus every question right, in one streak. */
export function maxQuestXp(quest: Pick<QuestContent, "xp" | "questions" | "rewards">): number {
  const perfect = new Map(quest.questions.map((q) => [q.id, { correct: 1, total: 1 }]));
  return quest.xp + questRewards(quest, perfect).total;
}

export type ReactionTone = "great" | "combo" | "partial" | "miss";

const LINES: Record<ReactionTone, string[]> = {
  great: ["Tepat sekali!", "Mantap!", "Keren, benar!", "Pas!"],
  combo: ["Combo!", "Terus begitu!", "Lagi panas!"],
  partial: ["Hampir!", "Sedikit lagi!", "Sebagian sudah benar."],
  miss: ["Tidak apa-apa, lanjut!", "Catat dan coba lagi nanti.", "Belum kena, tetap semangat!"],
};
const EMOJI: Record<ReactionTone, string> = { great: "🎯", combo: "🔥", partial: "💪", miss: "🌱" };

/** The reaction shown after a checked answer; picked by position, so it's stable across renders. */
export function reactionFor(score: QuestionScore, reward: QuestionReward, index: number): { tone: ReactionTone; emoji: string; text: string } {
  const tone: ReactionTone = reward.streak >= 2 ? "combo" : isFull(score) ? "great" : score.correct > 0 ? "partial" : "miss";
  const lines = LINES[tone];
  const text = tone === "combo" ? `${lines[index % lines.length]} ×${reward.streak}` : lines[index % lines.length];
  return { tone, emoji: EMOJI[tone], text };
}
