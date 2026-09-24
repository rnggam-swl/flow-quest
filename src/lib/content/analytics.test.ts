import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { caseContentSchema } from "./case";
import { flowQuestionStats, median, quizQuestionStats } from "./analytics";
import type { QuizQuestion } from "./questions";

const root = path.resolve(import.meta.dirname, "../../..");
const klub = caseContentSchema.parse(JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8")));

describe("quizQuestionStats", () => {
  const q: QuizQuestion = {
    id: "q",
    type: "singlechoice",
    prompt: "Tujuan?",
    options: [{ text: "Buka app" }, { text: "Sampai tepat waktu", correct: true }, { text: "Isi form" }],
  };
  const row = (selected: number, correct: number) => ({ questionKey: "q", answer: { selected }, correct, total: 1 });

  it("counts picks, the right share, and the wrong answers given most", () => {
    const s = quizQuestionStats(q, [row(1, 1), row(0, 0), row(0, 0), row(2, 0), { ...row(1, 1), questionKey: "other" }]);
    expect(s.answered).toBe(4);
    expect(s.fullyRight).toBe(0.25);
    expect(s.avgScore).toBe(0.25);
    expect(s.options).toEqual([
      { label: "Buka app", count: 2, correct: false },
      { label: "Sampai tepat waktu", count: 1, correct: true },
      { label: "Isi form", count: 1, correct: false },
    ]);
    expect(s.commonWrong).toEqual([
      { text: "Buka app", count: 2 },
      { text: "Isi form", count: 1 },
    ]);
  });

  it("copes with no answers and with answers that don't parse", () => {
    expect(quizQuestionStats(q, [])).toMatchObject({ answered: 0, avgScore: null, fullyRight: null });
    expect(quizQuestionStats(q, [{ questionKey: "q", answer: {}, correct: 0, total: 1 }]).options!.every((o) => o.count === 0)).toBe(true);
  });
});

describe("flowQuestionStats", () => {
  it("re-scores canvases and orders rubric checks hardest first", () => {
    const flow = klub.quests[4].questions.find((x) => x.type === "flow");
    if (flow?.type !== "flow") throw new Error("expected flow");
    const label = new Map(klub.nodes.map((n) => [n.key, n.label]));
    const canvas = (keys: string[], arrows: [number, number, string][]) => ({
      nodes: keys.map((k, i) => ({ id: `n${i}`, label: label.get(k)! })),
      connections: arrows.map(([a, b, kind]) => ({ sourceNodeId: `n${a}`, targetNodeId: `n${b}`, connectionType: kind })),
      total: null,
    });
    const good = canvas(["home", "clublist", "clubdetail", "regform", "verif", "confirmation", "success", "error"], [
      [0, 1, "DEFAULT"], [1, 2, "DEFAULT"], [2, 3, "DEFAULT"], [3, 4, "DEFAULT"], [4, 5, "YES"], [5, 6, "DEFAULT"], [4, 7, "NO"],
    ]);
    const bare = canvas(["home"], []);
    const s = flowQuestionStats(flow, [good, bare], klub.nodes);
    expect(s.submitted).toBe(2);
    expect(s.tiers.reduce((n, t) => n + t.count, 0)).toBe(2);
    expect(s.checks.find((c) => c.name === "hasHome")!.passRate).toBe(1);
    expect(s.checks.find((c) => c.name === "noReachesError")!.passRate).toBe(0.5);
    expect(s.checks.map((c) => c.passRate)).toEqual([...s.checks.map((c) => c.passRate)].sort((a, b) => a - b));
    expect(s.maxTotal).toBe(110);
  });
});

it("median", () => {
  expect(median([])).toBeNull();
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 2, 3])).toBe(2.5);
});
