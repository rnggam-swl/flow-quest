import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { acceptDraftShape } from "./draftShape";
import { blankCase } from "./caseEdit";
import { readTransfer } from "./transfer";

const root = path.resolve(import.meta.dirname, "../../..");
const raw = JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8"));

describe("acceptDraftShape", () => {
  it("fills the defaults an unfinished hand-written case skipped", () => {
    const c = structuredClone(raw);
    delete c.modules;
    delete c.quests[0].checkMode;
    c.quests[0].objective = "";
    const flow = c.quests[1].questions[0];
    delete flow.rubric.notes;
    delete flow.rubric.checks;
    const r = acceptDraftShape("case", c);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.modules).toEqual([]);
    expect(r.data.quests[0].checkMode).toBe("end");
    const q = r.data.quests[1].questions[0];
    expect(q.type === "flow" && q.rubric.notes).toEqual([]);
    expect(q.type === "flow" && q.rubric.checks).toEqual({});
    // The input is left alone.
    expect(c.modules).toBeUndefined();
  });

  it("accepts what the builder itself produces while unfinished", () => {
    expect(acceptDraftShape("case", blankCase("baru", "Baru")).ok).toBe(true);
  });

  it("refuses content missing fields the editors read", () => {
    const c = structuredClone(raw);
    delete c.quests[0].questions;
    delete c.quests[1].title;
    c.quests[2].questions[0].type = "unknown";
    const r = acceptDraftShape("case", c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.map((i) => i.path.join("."))).toEqual(expect.arrayContaining(["quests.0.questions", "quests.1.title"]));
    expect(acceptDraftShape("case", [1, 2]).ok).toBe(false);
  });

  it("is what an import checks, so a file the builder can't open is refused up front", () => {
    const c = structuredClone(raw);
    delete c.nodes;
    const r = readTransfer(JSON.stringify(c), "case");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nodes/);
  });
});
