import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { findCaseProblems, parseCase } from "./case";
import { flowQuestionOf, questOf } from "./questHelpers";
import { graphFromFlow, scoreFlow, type EdgeKind } from "./rubric";

/**
 * prisma/cases/ruang-belajar.json is the second case: a different number of quests, a mix of
 * question types, its own node dictionary, rubric and module. It exists to prove a case is
 * playable from its JSON alone — if it parses here, `prisma/import-case.ts` accepts it.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const parsed = parseCase(JSON.parse(readFileSync(path.join(root, "prisma/cases/ruang-belajar.json"), "utf8")));
if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
const content = parsed.content;

const labelOf = new Map(content.nodes.map((n) => [n.key, n.label]));
function score(edges: string[]) {
  const rubric = flowQuestionOf(questOf(content, 2)!)!.rubric;
  const kinds: Record<string, EdgeKind> = { Y: "YES", N: "NO", R: "RECOVERY" };
  const keys = new Set(edges.flatMap((e) => e.split(":")[0].split(">")));
  const nodes = [...keys].map((k) => ({ id: k, label: labelOf.get(k)! }));
  const connections = edges.map((e) => {
    const [pair, kind] = e.split(":");
    const [from, to] = pair.split(">");
    return { sourceNodeId: from, targetNodeId: to, connectionType: kind ? kinds[kind] : "DEFAULT" };
  });
  return scoreFlow(rubric, graphFromFlow(nodes, connections, content.nodes));
}

const main = ["beranda>daftarruang", "daftarruang>detailruang", "detailruang>cekslot", "cekslot>formpesan:Y", "formpesan>konfirmasi", "konfirmasi>berhasil"];
const failures = ["cekslot>penuh:N", "konfirmasi>gagal", "gagal>formpesan:R", "penuh>daftarruang:R"];

describe("Ruang Belajar case file", () => {
  it("parses with no problems and mixes question types across three quests", () => {
    expect(findCaseProblems(content)).toEqual([]);
    expect(content.quests.map((q) => q.questions.map((x) => x.type))).toEqual([
      ["singlechoice", "multiselect", "sequencing", "boolean"],
      ["flow"],
      ["matching", "grouping", "wordblank", "oddoneout", "number", "range", "hotspot", "branching"],
    ]);
  });

  it("gives the model flow full marks", () => {
    const r = score([...main, ...failures]);
    expect(r.total).toBe(100);
    expect(r.tier).toBe("great");
  });

  it("asks for recovery paths once the main path and the slot check are right", () => {
    const r = score([...main, "cekslot>penuh:N", "konfirmasi>gagal"]);
    expect(r.tier).toBe("good");
    expect(r.scores.edgeCase).toBe(5);
  });

  it("wants both sides of the slot check", () => {
    expect(score(main).tier).toBe("almost");
  });

  it("sends an incomplete main path back to work", () => {
    const r = score(["beranda>daftarruang", "daftarruang>detailruang"]);
    expect(r.tier).toBe("needs-work");
    expect(r.scores.goal).toBe(10);
  });
});
