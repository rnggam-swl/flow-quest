import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { parseCase } from "./case";
import { graphFromDrawing, type FlowDrawing } from "./questions";
import { findRubricProblems, flowRubricSchema, scoreFlow } from "./rubric";
import { suggestRubric } from "./rubricSuggest";

const root = path.resolve(import.meta.dirname, "../../..");
const parsed = parseCase(JSON.parse(readFileSync(path.join(root, "prisma/cases/ruang-belajar.json"), "utf8")));
if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
const ruang = parsed.content;
const typeOf = (k: string) => ruang.nodes.find((n) => n.key === k)?.nodeType;

/** A drawing from "a>b:Y"-style edges, one node instance per key. */
function drawing(edges: string[]): FlowDrawing {
  const kinds = { Y: "YES", N: "NO", R: "RECOVERY" } as const;
  const keys = [...new Set(edges.flatMap((e) => e.split(":")[0].split(">")))];
  return {
    nodes: keys.map((k, i) => ({ id: `n${i}`, key: k, x: i * 200, y: 0 })),
    edges: edges.map((e) => {
      const [pair, k] = e.split(":");
      const [from, to] = pair.split(">");
      return { from: `n${keys.indexOf(from)}`, to: `n${keys.indexOf(to)}`, kind: k ? kinds[k as keyof typeof kinds] : "DEFAULT" };
    }),
  };
}

const model = [
  "beranda>daftarruang",
  "daftarruang>detailruang",
  "detailruang>cekslot",
  "cekslot>formpesan:Y",
  "cekslot>penuh:N",
  "formpesan>konfirmasi",
  "konfirmasi>berhasil",
  "konfirmasi>gagal",
  "gagal>formpesan:R",
  "penuh>daftarruang:R",
];

function suggest(edges: string[]) {
  const r = suggestRubric(drawing(edges), ruang.nodes);
  if ("error" in r) throw new Error(r.error);
  return r;
}
const score = (rubric: ReturnType<typeof suggest>["rubric"], edges: string[]) => scoreFlow(rubric, graphFromDrawing(drawing(edges), typeOf));

describe("suggestRubric", () => {
  it("proposes a valid rubric that gives the key itself 100 and the top tier", () => {
    const { rubric, summary } = suggest(model);
    expect(flowRubricSchema.safeParse(rubric).success).toBe(true);
    expect(findRubricProblems(rubric, new Set(ruang.nodes.map((n) => n.key)))).toEqual([]);
    const r = score(rubric, model);
    expect(Object.values(r.max).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.total).toBe(100);
    expect(r.tier).toBe("great");
    expect(summary[0]).toBe("Jalur utama: Beranda → Daftar Ruang → Detail Ruang → Slot tersedia? → Form Pemesanan → Konfirmasi → Pemesanan Berhasil");
  });

  it("grades flows short of the key into the lower tiers", () => {
    const { rubric } = suggest(model);
    expect(score(rubric, model.filter((e) => !e.endsWith(":R"))).tier).toBe("good");
    expect(score(rubric, model.filter((e) => e !== "cekslot>penuh:N")).tier).toBe("almost");
    expect(score(rubric, ["beranda>daftarruang"]).tier).toBe("needs-work");
    // Skipping the slot check reaches the outcome without the decision — the constraint catches it.
    const bypass = score(rubric, [...model, "detailruang>formpesan"]);
    expect(bypass.scores.constraint).toBe(0);
    expect(bypass.tier).toBe("almost");
  });

  it("shares out the weight of categories the key has nothing for", () => {
    const { rubric } = suggest(["beranda>daftarruang", "daftarruang>detailruang", "detailruang>formpesan", "formpesan>konfirmasi", "konfirmasi>berhasil"]);
    expect(rubric.scores.logic).toBeUndefined();
    expect(rubric.scores.edgeCase).toBeUndefined();
    const max = Object.values(rubric.scores).reduce((a, s) => a + (s?.max ?? 0), 0);
    expect(max).toBe(100);
  });

  it("refuses a key with nothing to go on", () => {
    expect(suggestRubric({ nodes: [], edges: [] }, ruang.nodes)).toHaveProperty("error");
  });
});
