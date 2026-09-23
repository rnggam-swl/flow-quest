import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, vi } from "vitest";
import { MODULES } from "./content";
import { checkRules, parseEdge, checkRule } from "./flowRules";
import { buildPracticeDiagram } from "./flowDiagram";
import {
  ANSWER_KEY_PATTERN,
  MAIN_PART,
  answerKey,
  findPlanProblems,
  findWidgetProblems,
  planParts,
  resolvePlan,
  widgetForAnswerKey,
} from "./plan";
import { MODULE_KEYS, planWidgetSchema, practicePlanContentSchema, type FixerWidget } from "./schema";

const rules = (specs: string[], edges: string[], nodes: string[], start = "regform") =>
  Object.fromEntries(checkRules(specs, nodes, edges, start).map((r, i) => [specs[i], r.pass]));

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
    expect(checkRule("recovery:error:regform", nodes, edges, "regform").pass).toBe(false);
    expect(checkRule("not:error>home:R", nodes, edges, "regform")).toEqual({
      label: "Error tidak mengarahkan kembali ke Home",
      pass: false,
    });
  });
});

describe("core module content", () => {
  const all = MODULE_KEYS.flatMap((k) =>
    (["coba", "penjelasan", "latihan"] as const).flatMap((stage) =>
      MODULES[k][stage].map((w, i) => ({ where: `${k}.${stage}.${i}`, widget: w }))
    )
  );

  it("matches the widget schema everywhere except the trusted prose blocks", () => {
    for (const { where, widget } of all) {
      if (widget.type === "text") continue;
      expect(planWidgetSchema.safeParse(widget).success, where).toBe(true);
    }
  });

  it("has no broken references, unreachable answers, or fixers that are already solved", () => {
    expect(all.flatMap(({ where, widget }) => findWidgetProblems(widget, where))).toEqual([]);
  });

  it("never puts a write widget in Penjelasan, where answers aren't saved", () => {
    expect(all.filter(({ where, widget }) => where.includes(".penjelasan.") && widget.type === "write")).toEqual([]);
  });
});

describe("findWidgetProblems", () => {
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
    expect(findWidgetProblems(base, "w")).toEqual([]);
  });

  it("flags a model solution that breaks its own rules", () => {
    const problems = findWidgetProblems({ ...base, solution: base.initial }, "w");
    expect(problems.some((p) => p.includes("contoh jawaban belum memenuhi aturan"))).toBe(true);
  });

  it("flags a solution the switches can't produce", () => {
    const problems = findWidgetProblems({ ...base, extra: [] }, "w");
    expect(problems.some((p) => p.includes("tidak bisa dinyalakan: confirmation>error"))).toBe(true);
  });

  it("flags a starting flow with nothing to fix", () => {
    expect(findWidgetProblems({ ...base, initial: base.solution }, "w").join("\n")).toMatch(/flow awal sudah memenuhi/);
  });

  it("flags unknown nodes and rules", () => {
    const problems = findWidgetProblems({ ...base, rules: [...base.rules, "sparkle:x"], nodes: [...base.nodes, "mystery"] }, "w");
    expect(problems.join("\n")).toMatch(/aturan tidak dikenal: sparkle:x/);
    expect(problems.join("\n")).toMatch(/node "mystery"/);
  });
});

describe("example plan file", () => {
  it("imports cleanly", () => {
    const file = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../../prisma/practice-plans/example.json"), "utf8"));
    for (const plan of file.plans) {
      const parsed = practicePlanContentSchema.safeParse(plan);
      expect(parsed.success).toBe(true);
      expect(findPlanProblems(parsed.data!)).toEqual([]);
    }
  });
});

describe("resolvePlan", () => {
  it("falls back to all six modules, greeting by first name, when there's no personal plan", () => {
    const plan = resolvePlan(null, "Siti Nur Mirra");
    expect(plan.personal).toBe(false);
    expect(plan.heading).toBe("Halo, Siti");
    expect(plan.subtitle).toBe("Siti Nur Mirra");
    expect(plan.content.modules).toEqual([...MODULE_KEYS]);
    expect(planParts(plan.content)).toEqual([...MODULE_KEYS]);
  });

  it("uses the mentor's greeting name and adds the main exercise as the last part", () => {
    const plan = resolvePlan(
      {
        first: "Mirra",
        intro: "Halo",
        modules: ["A", "B"],
        main: { title: "Perbaiki", intro: "…", widgets: [{ type: "selfcheck", items: ["Sudah"] }] },
      },
      "Siti Nur Mirra"
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
      "Rani"
    );
    expect(plan.personal).toBe(false);
    expect(plan.content.main).toBeFalsy();
    log.mockRestore();
  });
});

describe("answer keys", () => {
  it("resolve to the write widgets they were saved from", () => {
    const content = resolvePlan(null, "Rani").content;
    const key = answerKey("E", "latihan", 1);
    expect(ANSWER_KEY_PATTERN.test(key)).toBe(true);
    expect(widgetForAnswerKey(content, key)?.type).toBe("write");
    expect(widgetForAnswerKey(content, answerKey("F", "coba", 0))?.type).toBe("write");
    expect(widgetForAnswerKey(content, answerKey("A", "coba", 0))?.type).toBe("mcq");
  });

  it("reject anything that isn't a module stage or the main exercise", () => {
    for (const bad of ["G.coba.0", "A.penjelasan.0", "main.coba.0", "A.coba", "__proto__", "A.coba.0.x"]) {
      expect(ANSWER_KEY_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe("buildPracticeDiagram", () => {
  it("pulls nodes that aren't reachable from the start into a captioned floating column", () => {
    const flow = { start: "home", nodes: ["home", "clublist", "clubdetail", "regform", "confirmation", "success"] };
    const diagram = buildPracticeDiagram(flow.nodes, ["home>clublist", "clublist>clubdetail", "clubdetail>confirmation", "confirmation>success"], flow.start);
    expect(diagram.floatCaption).not.toBeNull();
    expect(diagram.nodes.filter((n) => n.floating).map((n) => n.id)).toEqual(["regform"]);
  });

  it("doesn't mark anything floating when the whole flow is one fragment", () => {
    const diagram = buildPracticeDiagram(undefined, ["regform>confirmation", "confirmation>success", "confirmation>error", "error>regform:R"], "regform");
    expect(diagram.floatCaption).toBeNull();
    expect(diagram.nodes.some((n) => n.floating)).toBe(false);
    expect(diagram.edges.map((e) => e.kind)).toEqual(["D", "D", "D", "R"]);
    expect(diagram.ariaLabel).toContain("Error ⟲ Registration Form");
  });
});
