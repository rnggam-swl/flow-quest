import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { caseContentSchema, findPlanWidgetProblems } from "@/lib/content/case";
import { analyzeFlowForFixer, mainExerciseFromAnalysis, type ParticipantFlow } from "./fixerFromFlow";

const root = path.resolve(import.meta.dirname, "../../..");
const klub = caseContentSchema.parse(JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8")));
const quest5 = klub.quests.find((q) => q.order === 5)!;
const flowQ = quest5.questions.find((q) => q.type === "flow");
if (flowQ?.type !== "flow") throw new Error("Quest 5 has no flow question");

const labelOf = new Map(klub.nodes.map((n) => [n.key, n.label]));

/** A participant canvas from library keys: "a>b" / "a>b:YES" etc. */
function canvas(keys: string[], arrows: string[]): ParticipantFlow {
  return {
    nodes: keys.map((k) => ({ id: `id-${k}`, label: labelOf.get(k) ?? k })),
    connections: arrows.map((a) => {
      const [pair, kind = "DEFAULT"] = a.split(":");
      const [f, t] = pair.split(">");
      return { sourceNodeId: `id-${f}`, targetNodeId: `id-${t}`, connectionType: kind };
    }),
  };
}

// The flow from prisma/practice-plans/example.json: Success leads on to Error, and Verifikasi NIS has no Tidak branch.
const participant = canvas(
  ["home", "clublist", "clubdetail", "regform", "verif", "confirmation", "success", "error"],
  ["home>clublist", "clublist>clubdetail", "clubdetail>regform", "regform>verif", "verif>confirmation:YES", "confirmation>success", "success>error"]
);

describe("analyzeFlowForFixer", () => {
  const result = analyzeFlowForFixer({ order: 5, questTitle: quest5.title, flow: participant, question: flowQ, library: klub.nodes });
  if (!result.ok) throw new Error(result.error);
  const a = result.analysis;

  it("carries the participant's arrows over as the fixer's starting state", () => {
    expect(a.start).toBe("home");
    expect(a.initial).toEqual(["home>clublist", "clublist>clubdetail", "clubdetail>regform", "regform>verif", "verif>confirmation:Y", "confirmation>success", "success>error"]);
    expect(a.solution).toBeNull();
    expect(a.skipped).toEqual([]);
  });

  it("pre-selects exactly the rules the flow doesn't meet yet", () => {
    const suggested = a.candidates.filter((c) => c.suggested).map((c) => c.rule);
    expect(suggested).toEqual(["terminal:success", "twoSides:verif", "branch:error", "not:success>error"]);
    expect(a.candidates.find((c) => c.rule === "reach:success")).toMatchObject({ initialPasses: true, suggested: false });
    expect(a.candidates.find((c) => c.rule === "twoSides:verif")!.label).toBe("Verifikasi NIS punya cabang Ya dan Tidak");
  });

  it("names the rubric checks the flow missed", () => {
    expect(a.rubricMisses).toContain("Cabang Tidak dari Verifikasi NIS sampai ke Error");
    expect(a.rubricMisses).not.toContain("Ada Home");
  });

  it("builds a main exercise whose missing solution the problem list asks the mentor for", () => {
    const main = mainExerciseFromAnalysis(a, a.candidates.filter((c) => c.suggested).map((c) => c.rule));
    expect(main.title).toBe("Perbaiki Flow Quest 5 Kamu");
    expect(main.steps).toEqual(["Success tidak punya panah keluar.", "Verifikasi NIS punya cabang Ya dan Tidak.", "Error muncul sebagai cabang gagal, bukan setelah hasil akhir.", "Tidak ada sambungan Success → Error."]);
    const [fixer] = main.widgets;
    expect(findPlanWidgetProblems(fixer, "w", klub)).toEqual(["w: contoh jawaban belum memenuhi semua aturan"]);
    // Once the mentor switches on the right arrows, it's a valid exercise.
    if (fixer.type !== "fixer") throw new Error("expected fixer");
    const fixed = { ...fixer, extra: ["verif>error:N"], solution: [...fixer.initial.filter((e) => e !== "success>error"), "verif>error:N"] };
    expect(findPlanWidgetProblems(fixed, "w", klub)).toEqual([]);
  });

  it("uses the question's answer key as the model solution when there is one", () => {
    const key = ["home", "clublist", "clubdetail", "regform", "verif", "confirmation", "success", "error"];
    const edges: [string, string, "DEFAULT" | "YES" | "NO" | "RECOVERY"][] = [
      ["home", "clublist", "DEFAULT"],
      ["clublist", "clubdetail", "DEFAULT"],
      ["clubdetail", "regform", "DEFAULT"],
      ["regform", "verif", "DEFAULT"],
      ["verif", "confirmation", "YES"],
      ["confirmation", "success", "DEFAULT"],
      ["verif", "error", "NO"],
      ["error", "regform", "RECOVERY"],
    ];
    const withKey = {
      ...flowQ,
      answerKey: { nodes: key.map((k, i) => ({ id: `k${i}`, key: k, x: 0, y: 0 })), edges: edges.map(([f, t, kind]) => ({ from: `k${key.indexOf(f)}`, to: `k${key.indexOf(t)}`, kind })) },
    };
    const r = analyzeFlowForFixer({ order: 5, questTitle: quest5.title, flow: participant, question: withKey, library: klub.nodes });
    if (!r.ok) throw new Error(r.error);
    expect(r.analysis.extra).toEqual(["verif>error:N", "error>regform:R"]);
    expect(r.analysis.candidates.find((c) => c.rule === "recovery:error:regform")).toMatchObject({ initialPasses: false, solutionPasses: true, suggested: true });
    const main = mainExerciseFromAnalysis(r.analysis, r.analysis.candidates.filter((c) => c.suggested).map((c) => c.rule));
    expect(findPlanWidgetProblems(main.widgets[0], "w", klub)).toEqual([]);
  });

  it("refuses a canvas with too little to fix, and skips labels the library doesn't know", () => {
    const tiny = analyzeFlowForFixer({ order: 5, questTitle: "x", flow: canvas(["home"], []), question: flowQ, library: klub.nodes });
    expect(tiny.ok).toBe(false);
    const odd = analyzeFlowForFixer({ order: 5, questTitle: "x", flow: canvas(["home", "clublist", "Langkah Aneh"], ["home>clublist"]), question: flowQ, library: klub.nodes });
    expect(odd.ok && odd.analysis.skipped).toEqual(["Langkah Aneh (tidak ada di kamus node)"]);
  });
});
