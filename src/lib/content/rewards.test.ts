import { describe, it, expect } from "vitest";
import type { QuestContent } from "./case";
import { maxQuestXp, questRewards, reactionFor } from "./rewards";

const quiz = (id: string) => ({ id, type: "boolean" as const, prompt: "?", answer: true });
const quest = (rewards?: QuestContent["rewards"]): Pick<QuestContent, "xp" | "questions" | "rewards"> => ({
  xp: 50,
  questions: [quiz("a"), quiz("b"), quiz("c"), quiz("d"), quiz("e"), quiz("f"), quiz("g")],
  rewards,
});
const scores = (...s: [number, number][]) => new Map(s.map(([correct, total], i) => [String.fromCharCode(97 + i), { correct, total }]));

describe("questRewards", () => {
  it("earns nothing extra for a quest without rewards", () => {
    expect(questRewards(quest(), scores([1, 1], [1, 1])).total).toBe(0);
    expect(maxQuestXp(quest())).toBe(50);
  });

  it("gives XP per right answer, partial credit rounded down", () => {
    const r = questRewards(quest({ questionXp: 10, comboBonus: 0, reactions: true }), scores([1, 1], [2, 3], [0, 1]));
    expect(r.questions.map((q) => q.xp)).toEqual([10, 6, 0, 0, 0, 0, 0]);
    expect(r.total).toBe(16);
  });

  it("builds a combo on right answers in a row, capped, and breaks it on a miss or a gap", () => {
    const q = quest({ questionXp: 0, comboBonus: 5, reactions: true });
    const r = questRewards(q, scores([1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]));
    expect(r.questions.map((x) => x.streak)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.questions.map((x) => x.combo)).toEqual([0, 5, 10, 15, 20, 20, 20]);
    const broken = questRewards(q, scores([1, 1], [1, 1], [1, 2], [1, 1], [1, 1]));
    expect(broken.questions.map((x) => x.combo)).toEqual([0, 5, 0, 0, 5, 0, 0]);
    // An unanswered question (no score) also ends the streak.
    const gap = new Map([["a", { correct: 1, total: 1 }], ["c", { correct: 1, total: 1 }]]);
    expect(questRewards(q, gap).comboXp).toBe(0);
  });

  it("only counts the answers so far when asked", () => {
    const q = quest({ questionXp: 10, comboBonus: 5, reactions: true });
    expect(questRewards(q, scores([1, 1], [1, 1], [1, 1]), 2).total).toBe(25);
  });

  it("knows the most a quest can earn", () => {
    expect(maxQuestXp(quest({ questionXp: 10, comboBonus: 5, reactions: true }))).toBe(50 + 70 + (5 + 10 + 15 + 20 + 20 + 20));
  });
});

describe("reactionFor", () => {
  it("matches the tone to the answer and is stable per position", () => {
    const reward = (streak: number) => ({ questionId: "a", xp: 0, streak, combo: 0 });
    expect(reactionFor({ correct: 1, total: 1 }, reward(1), 0).tone).toBe("great");
    expect(reactionFor({ correct: 1, total: 1 }, reward(3), 0)).toMatchObject({ tone: "combo", emoji: "🔥" });
    expect(reactionFor({ correct: 1, total: 1 }, reward(3), 0).text).toMatch(/×3$/);
    expect(reactionFor({ correct: 1, total: 3 }, reward(0), 1).tone).toBe("partial");
    expect(reactionFor({ correct: 0, total: 1 }, reward(0), 2).tone).toBe("miss");
    expect(reactionFor({ correct: 0, total: 1 }, reward(0), 2)).toEqual(reactionFor({ correct: 0, total: 1 }, reward(0), 2));
  });
});
