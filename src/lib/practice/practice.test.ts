import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, vi } from "vitest";
import { caseContentSchema, findPlanWidgetProblems } from "@/lib/content/case";
import { checkRules, parseEdge, checkRule } from "./flowRules";
import { buildPracticeDiagram } from "./flowDiagram";
import { nodeDictionary } from "./nodes";
import { ANSWER_KEY_PATTERN, MAIN_PART, allModulesView, answerKey, findPlanProblems, planParts, resolvePlan, widgetForAnswerKey } from "./plan";
import { practicePlanContentSchema, type FixerWidget } from "./schema";

const root = path.resolve(import.meta.dirname, "../../..");
const klub = caseContentSchema.parse(JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8")));
const dict = nodeDictionary(klub.nodes);
const moduleKeys = klub.modules.map((m) => m.key);

const rules = (specs: string[], edges: string[], nodes: string[], start = "regform") =>
  Object.fromEntries(checkRules(specs, nodes, edges, start, dict).map((r, i) => [specs[i], r.pass]));

describe("checkRule", () => {
  const nodes = ["regform", "confirmation", "success", "error"];

  it("accepts Success and Error as sibling outcomes of Confirmation", () => {
    const edges = ["regform>confirmation", "confirmation>success", "confirmation>error"];
    expect(rules(["connected", "reach:success", "before:confirmation:success", "terminal:success", "branch:error"], edges, nodes)).toEqual({
      connected: true,
      "reach:success": true,
      "before:confirmation:success": true,
      "terminal:success": true,
      "branch:error": true,
    });
  });

  it("rejects Error chained after Success", () => {
    const edges = ["regform>confirmation", "confirmation>success", "success>error"];
    expect(rules(["terminal:success", "branch:error"], edges, nodes)).toEqual({ "terminal:success": false, "branch:error": false });
  });

  it("fails `before` when some path reaches the target without passing through the checkpoint", () => {
    const edges = ["regform>success", "regform>confirmation", "confirmation>success"];
    expect(rules(["before:confirmation:success"], edges, nodes)["before:confirmation:success"]).toBe(false);
  });

  it("fails `connected` while any node is left floating", () => {
    expect(rules(["connected"], ["regform>confirmation", "confirmation>success"], nodes).connected).toBe(false);
  });

  it("never counts a recovery path as forward progress", () => {
    const edges = ["regform>confirmation", "confirmation>error", "error>success:R"];
    expect(rules(["reach:success"], edges, nodes)["reach:success"]).toBe(false);
  });

  it("needs both a Ya and a Tidak branch for `twoSides`", () => {
    const decisionNodes = ["regform", "verif", "success", "error"];
    expect(rules(["twoSides:verif"], ["regform>verif", "verif>success:Y"], decisionNodes)["twoSides:verif"]).toBe(false);
    expect(rules(["twoSides:verif"], ["regform>verif", "verif>success:Y", "verif>error:N"], decisionNodes)["twoSides:verif"]).toBe(true);
  });

  it("checks recovery targets and forbidden edges", () => {
    const edges = ["confirmation>error", "error>home:R"].map(parseEdge);
    expect(checkRule("recovery:error:regform", nodes, edges, "regform", dict).pass).toBe(false);
    expect(checkRule("not:error>home:R", nodes, edges, "regform", dict)).toEqual({
      label: "Error tidak mengarahkan kembali ke Home",
      pass: false,
    });
  });
});

describe("findPlanWidgetProblems", () => {
  const base: FixerWidget = {
    type: "fixer",
    nodes: ["regform", "confirmation", "success", "error"],
    start: "regform",
    initial: ["regform>confirmation", "confirmation>success", "success>error"],
    extra: ["confirmation>error"],
    rules: ["terminal:success", "branch:error"],
    solution: ["regform>confirmation", "confirmation>success", "confirmation>error"],
  };

  it("accepts a well-formed fixer", () => {
    expect(findPlanWidgetProblems(base, "w", klub)).toEqual([]);
  });

  it("flags a model solution that breaks its own rules", () => {
    const problems = findPlanWidgetProblems({ ...base, solution: base.initial }, "w", klub);
    expect(problems.some((p) => p.includes("contoh jawaban belum memenuhi semua aturan"))).toBe(true);
  });

  it("flags a solution the switches can't produce", () => {
    const problems = findPlanWidgetProblems({ ...base, extra: [] }, "w", klub);
    expect(problems.some((p) => p.includes("tidak bisa dinyalakan: confirmation>error"))).toBe(true);
  });

  it("flags a starting flow with nothing to fix", () => {
    expect(findPlanWidgetProblems({ ...base, initial: base.solution }, "w", klub).join("\n")).toMatch(/flow awal sudah memenuhi/);
  });

  it("flags unknown nodes and rules", () => {
    const problems = findPlanWidgetProblems({ ...base, rules: [...base.rules, "sparkle:x"], nodes: [...base.nodes, "mystery"] }, "w", klub);
    expect(problems.join("\n")).toMatch(/aturan tidak dikenal: sparkle:x/);
    expect(problems.join("\n")).toMatch(/node tidak ada di kamus kasus: mystery/);
  });
});

describe("example plan file", () => {
  it("imports cleanly", () => {
    const file = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../../prisma/practice-plans/example.json"), "utf8"));
    for (const plan of file.plans) {
      const parsed = practicePlanContentSchema.safeParse(plan);
      expect(parsed.success).toBe(true);
      expect(findPlanProblems(parsed.data!, klub)).toEqual([]);
    }
  });
});

describe("resolvePlan", () => {
  it("falls back to every module of the case, greeting by first name, when there's no personal plan", () => {
    const plan = resolvePlan(null, "Siti Nur Mirra", klub.modules);
    expect(plan.personal).toBe(false);
    expect(plan.heading).toBe("Halo, Siti");
    expect(plan.subtitle).toBe("Siti Nur Mirra");
    expect(plan.content.modules).toEqual(moduleKeys);
    expect(planParts(plan.content)).toEqual(moduleKeys);
    expect(allModulesView(klub.modules).content.modules).toEqual(moduleKeys);
  });

  it("uses the mentor's greeting name and adds the main exercise as the last part", () => {
    const plan = resolvePlan(
      {
        first: "Mirra",
        intro: "Halo",
        modules: ["A", "B"],
        main: { title: "Perbaiki", intro: "…", widgets: [{ type: "selfcheck", items: ["Sudah"] }] },
      },
      "Siti Nur Mirra",
      klub.modules
    );
    expect(plan.personal).toBe(true);
    expect(plan.heading).toBe("Halo, Mirra");
    expect(plan.content.strengths).toEqual([]);
    expect(planParts(plan.content)).toEqual(["A", "B", MAIN_PART]);
  });

  it("ignores stored content that fails the schema instead of breaking the page — including raw HTML widgets", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const plan = resolvePlan(
      { intro: "x", modules: ["A"], main: { title: "t", intro: "i", widgets: [{ type: "text", html: "<img src=x onerror=alert(1)>" }] } },
      "Rani",
      klub.modules
    );
    expect(plan.personal).toBe(false);
    expect(plan.content.main).toBeFalsy();
    log.mockRestore();
  });
});

describe("answer keys", () => {
  it("resolve to the write widgets they were saved from", () => {
    const content = resolvePlan(null, "Rani", klub.modules).content;
    const key = answerKey("E", "latihan", 1);
    expect(ANSWER_KEY_PATTERN.test(key)).toBe(true);
    expect(widgetForAnswerKey(content, key, klub.modules)?.type).toBe("write");
    expect(widgetForAnswerKey(content, answerKey("F", "coba", 0), klub.modules)?.type).toBe("write");
    expect(widgetForAnswerKey(content, answerKey("A", "coba", 0), klub.modules)?.type).toBe("mcq");
    expect(widgetForAnswerKey(content, answerKey("Z", "coba", 0), klub.modules)).toBeNull();
  });

  it("reject anything that isn't a module stage or the main exercise", () => {
    for (const bad of ["A.penjelasan.0", "main.coba.0", "A.coba", "__proto__", "A.coba.0.x", "a b.coba.0"]) {
      expect(ANSWER_KEY_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe("buildPracticeDiagram", () => {
  it("pulls nodes that aren't reachable from the start into a captioned floating column", () => {
    const flow = { start: "home", nodes: ["home", "clublist", "clubdetail", "regform", "confirmation", "success"] };
    const diagram = buildPracticeDiagram(flow.nodes, ["home>clublist", "clublist>clubdetail", "clubdetail>confirmation", "confirmation>success"], flow.start, dict);
    expect(diagram.floatCaption).not.toBeNull();
    expect(diagram.nodes.filter((n) => n.floating).map((n) => n.id)).toEqual(["regform"]);
  });

  it("doesn't mark anything floating when the whole flow is one fragment", () => {
    const diagram = buildPracticeDiagram(undefined, ["regform>confirmation", "confirmation>success", "confirmation>error", "error>regform:R"], "regform", dict);
    expect(diagram.floatCaption).toBeNull();
    expect(diagram.nodes.some((n) => n.floating)).toBe(false);
    expect(diagram.edges.map((e) => e.kind)).toEqual(["D", "D", "D", "R"]);
    expect(diagram.ariaLabel).toContain("Error ⟲ Registration Form");
  });
});
