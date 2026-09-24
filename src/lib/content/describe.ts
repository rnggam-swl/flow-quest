import { answerSchemas, replayBranching, wordBlankTokens, type QuizQuestion } from "@/lib/content/questions";

/**
 * Plain-text readings of a quiz answer — what the participant answered and
 * what the key says — for result pages, admin reports and CSV exports.
 */

const join = (xs: string[]) => (xs.length ? xs.join(", ") : "—");

export function describeCorrectAnswer(q: QuizQuestion): string {
  switch (q.type) {
    case "singlechoice":
    case "multiselect":
      return join(q.options.filter((o) => o.correct).map((o) => o.text));
    case "boolean":
      return q.answer ? "Ya" : "Tidak";
    case "number":
    case "range":
      return `${q.answer}${q.tolerance ? ` (±${q.tolerance})` : ""}${q.type === "number" && q.unit ? ` ${q.unit}` : ""}`;
    case "matching":
      return q.items.map((it) => `${it.label} → ${it.pairs.map((p) => p.text).join(" / ")}`).join("; ");
    case "grouping":
      return q.groups.map((g, gi) => `${g}: ${join(q.items.filter((it) => it.group === gi).map((it) => it.text))}`).join("; ");
    case "wordblank":
      return q.answerText;
    case "sequencing":
      return q.items.map((it) => it.text).join(" → ");
    case "oddoneout":
      return q.items[q.odd]?.text ?? "—";
    case "hotspot":
      return `${q.spots.length} titik${q.spots.some((s) => s.label) ? `: ${join(q.spots.map((s) => s.label ?? "—"))}` : ""}`;
    case "branching":
      return "Pilihan yang ditandai benar di setiap langkah";
  }
}

/** Never throws: a stored answer that doesn't match the question any more reads as "—". */
export function describeAnswer(q: QuizQuestion, answer: unknown): string {
  try {
    switch (q.type) {
      case "singlechoice":
        return q.options[answerSchemas.singlechoice.parse(answer).selected]?.text ?? "—";
      case "multiselect":
        return join(answerSchemas.multiselect.parse(answer).selected.map((i) => q.options[i]?.text ?? "?"));
      case "boolean":
        return answerSchemas.boolean.parse(answer).value ? "Ya" : "Tidak";
      case "number":
      case "range":
        return String(answerSchemas[q.type].parse(answer).value);
      case "matching": {
        const { links } = answerSchemas.matching.parse(answer);
        return (
          q.items
            .map((it, i) => {
              const pairs = links.filter((l) => l.item === i).map((l) => {
                const [pi, pj] = l.pair.split("_").map(Number);
                return q.items[pi]?.pairs[pj]?.text ?? "?";
              });
              return pairs.length ? `${it.label} → ${pairs.join(" / ")}` : null;
            })
            .filter(Boolean)
            .join("; ") || "—"
        );
      }
      case "grouping": {
        const { placement } = answerSchemas.grouping.parse(answer);
        return q.groups.map((g, gi) => `${g}: ${join(q.items.filter((_, i) => placement[i] === gi).map((it) => it.text))}`).join("; ");
      }
      case "wordblank": {
        const { values } = answerSchemas.wordblank.parse(answer);
        return wordBlankTokens(q)
          .map((t, i) => (q.blanks.includes(i) ? (values[String(i)] || "_").toUpperCase() : t))
          .join(q.blankMode === "word" ? " " : "");
      }
      case "sequencing":
        return answerSchemas.sequencing.parse(answer).order.map((i) => q.items[i]?.text ?? "?").join(" → ");
      case "oddoneout":
        return q.items[answerSchemas.oddoneout.parse(answer).selected]?.text ?? "—";
      case "hotspot":
        return `${answerSchemas.hotspot.parse(answer).marks.length} titik ditandai`;
      case "branching": {
        const { node, made } = replayBranching(q, answerSchemas.branching.parse(answer).choices);
        return `${made.length} pilihan, berakhir di "${node?.endingLabel || node?.text || "—"}"`;
      }
    }
  } catch {
    return "—";
  }
}
