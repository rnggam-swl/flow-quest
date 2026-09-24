"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { MAIN_PART, answerKey, planParts, type ResolvedPlan, type WidgetStage } from "@/lib/practice/plan";
import type { MainExercise } from "@/lib/practice/schema";
import { nodeDictionary } from "@/lib/practice/nodes";
import type { CaseNode, ModuleContent, PracticeClosing } from "@/lib/content/case";
import { PracticeWidget, cx, initialWidgetStatus, type Widget, type WidgetStatus } from "./widgets";
import { PracticeNodesProvider, usePracticeNodes } from "./nodesContext";
import { RichText } from "@/components/RichText";
import s from "./practice.module.css";

/**
 * The Modul Latihan page: a learning-path sidebar plus one section per
 * module (Coba dulu → Penjelasan → Latihan) and the participant's own
 * "latihan utama". In "participant" mode progress and written answers are
 * saved through /api/latihan/*; in "preview" (the mentor's view) the page
 * is fully interactive but nothing is sent anywhere.
 */

type Mode = "participant" | "preview";

interface Step {
  key: string;
  anchor: string;
  label: string;
  meta: string;
  num: string;
}

async function postJson(url: string, body?: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function jumpTo(e: MouseEvent<HTMLAnchorElement>, anchor: string) {
  const target = document.getElementById(anchor);
  if (!target) return;
  e.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${anchor}`);
}

export function PracticeWorkbook({
  plan,
  modules,
  nodes,
  closing,
  initialCompleted,
  initialAnswers,
  mode,
  embedded = false,
}: {
  plan: ResolvedPlan;
  /** The case's modules; the plan picks which of them this page shows, and in what order. */
  modules: ModuleContent[];
  /** The case's node library, which every diagram and fixer on the page names its nodes from. */
  nodes: CaseNode[];
  /** The case's closing checklist, shown after the last part. */
  closing?: PracticeClosing;
  initialCompleted: string[];
  initialAnswers: Record<string, string>;
  mode: Mode;
  /** Rendered inside another scrolling panel (the builder's preview) rather than under the app's top bar. */
  embedded?: boolean;
}) {
  const { content } = plan;
  const dict = useMemo(() => nodeDictionary(nodes), [nodes]);
  const moduleByKey = useMemo(() => new Map(modules.map((m) => [m.key, m])), [modules]);
  const planModules = content.modules.flatMap((k) => moduleByKey.get(k) ?? []);
  const [completed, setCompleted] = useState<string[]>(initialCompleted);
  const [answers, setAnswers] = useState(initialAnswers);
  const [notice, setNotice] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  // Bumped by a preview-mode reset to remount every section with fresh widget state.
  const [generation, setGeneration] = useState(0);
  const mainRef = useRef<HTMLElement>(null);

  const steps: Step[] = [
    ...planModules.map((m, i) => ({
      key: m.key,
      anchor: `modul-${m.key}`,
      label: m.title,
      meta: `Modul ${i + 1}, ${m.time}`,
      num: String(i + 1),
    })),
    ...(content.main ? [{ key: MAIN_PART, anchor: "latihan-utama", label: content.main.title, meta: "Latihan utama", num: "★" }] : []),
  ];
  const parts = planParts(content);
  const doneCount = parts.filter((p) => completed.includes(p)).length;

  function markDone(part: string) {
    if (completed.includes(part)) return;
    setCompleted((prev) => (prev.includes(part) ? prev : [...prev, part]));
    if (mode !== "participant") return;
    void postJson("/api/latihan/progress", { part }).then((ok) => {
      if (!ok) setNotice("Progres terakhir belum tersimpan. Periksa koneksi internet kamu, lalu muat ulang halaman.");
    });
  }

  async function saveAnswer(key: string, text: string) {
    if (mode === "participant" && !(await postJson("/api/latihan/answer", { key, text }))) return false;
    setAnswers((prev) => ({ ...prev, [key]: text }));
    return true;
  }

  async function reset() {
    if (!window.confirm("Hapus progres dan mulai dari awal?")) return;
    if (mode === "participant") {
      if (!(await postJson("/api/latihan/reset"))) {
        setNotice("Progres belum bisa dihapus. Periksa koneksi internet kamu, lalu coba lagi.");
        return;
      }
      window.location.reload();
      return;
    }
    setCompleted([]);
    setAnswers({});
    setNotice(null);
    setGeneration((g) => g + 1);
    window.scrollTo({ top: 0 });
  }

  // Highlight the section currently being read in the sidebar path.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) setCurrent(en.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    main.querySelectorAll("section[id]").forEach((sec) => observer.observe(sec));
    return () => observer.disconnect();
  }, [generation]);

  const pathItem = (anchor: string, dot: string, label: string, done: boolean, meta?: string) => (
    <li key={anchor} className={cx(done && s.done, current === anchor && s.current)}>
      <span className={s.pathDot}>{dot}</span>
      <a href={`#${anchor}`} onClick={(e) => jumpTo(e, anchor)}>
        {label}
      </a>
      {meta ? <div className={s.pathMeta}>{meta}</div> : null}
    </li>
  );

  return (
    <PracticeNodesProvider value={dict}>
    <div className={cx(s.root, embedded && s.embedded)}>
      <div className={s.shell}>
        <nav className={s.path} aria-label="Jalur belajar">
          <div className={s.brand}>Modul Latihan Flow</div>
          <div className={s.brandSub}>{plan.subtitle}</div>
          <ol className={s.pathList}>
            {pathItem("mulai", "•", "Mulai di sini", false)}
            {steps.map((st) => pathItem(st.anchor, st.num, st.label, completed.includes(st.key), st.meta))}
            {closing ? pathItem("selesai", "✓", "Selesai", false) : null}
          </ol>
          <div className={s.pathProgress}>{`${doneCount} dari ${parts.length} bagian selesai`}</div>
          <div className={s.pathBar}>
            <span style={{ width: `${parts.length ? (doneCount / parts.length) * 100 : 0}%` }} />
          </div>
          {notice ? (
            <div className={s.pathNotice} role="alert">
              {notice}
            </div>
          ) : null}
          <button type="button" className={cx(s.btn, s.btnGhost, s.resetBtn)} onClick={reset}>
            Ulangi dari awal
          </button>
        </nav>

        <main className={s.main} ref={mainRef} key={generation}>
          <section className={cx(s.section, s.hero, s.prose)} id="mulai">
            <h1>{plan.heading}</h1>
            <p className={s.lede}>{content.intro}</p>
            {content.strengths.length > 0 ? (
              <div className={s.strengths}>
                <h3>Yang sudah kuat dari kamu</h3>
                <ul>
                  {content.strengths.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={s.howto}>
              <div>
                <b>Coba dulu</b>Jawab pertanyaan pembuka sebelum membaca penjelasan.
              </div>
              <div>
                <b>Buka penjelasan</b>Penjelasan terbuka setelah kamu mencoba.
              </div>
              <div>
                <b>Latihan</b>Ubah flow langsung dan lihat aturannya terpenuhi satu per satu.
              </div>
            </div>
          </section>

          {planModules.map((m, i) => (
            <ModuleSection
              key={m.key}
              module={m}
              index={i}
              done={completed.includes(m.key)}
              onDone={() => markDone(m.key)}
              answers={answers}
              onSaveAnswer={saveAnswer}
            />
          ))}

          {content.main ? (
            <MainExerciseSection
              main={content.main}
              done={completed.includes(MAIN_PART)}
              onDone={() => markDone(MAIN_PART)}
              answers={answers}
              onSaveAnswer={saveAnswer}
            />
          ) : null}

          {closing ? (
            <section className={cx(s.section, s.prose)} id="selesai">
              <h2 className={s.finishTitle}>{closing.title}</h2>
              {closing.intro ? <RichText source={closing.intro} /> : null}
              <ol className={s.checklist}>
                {closing.checklist.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
              {closing.outro ? <RichText source={closing.outro} /> : null}
            </section>
          ) : null}
        </main>
      </div>
    </div>
    </PracticeNodesProvider>
  );
}

interface SectionProps {
  done: boolean;
  onDone: () => void;
  answers: Record<string, string>;
  onSaveAnswer: (key: string, text: string) => Promise<boolean>;
}

/**
 * Renders a list of widgets and tracks their statuses; `onAllComplete`
 * fires the moment every widget in the group is complete at once.
 */
function WidgetGroup({
  part,
  stage,
  widgets,
  answers,
  onSaveAnswer,
  onChange,
}: {
  part: string;
  stage: WidgetStage | "penjelasan";
  widgets: Widget[];
  answers: Record<string, string>;
  onSaveAnswer: SectionProps["onSaveAnswer"];
  onChange?: (statuses: WidgetStatus[]) => void;
}) {
  const dict = usePracticeNodes();
  const [statuses, setStatuses] = useState(() =>
    widgets.map((w, i) => initialWidgetStatus(w, dict, stage === "penjelasan" ? undefined : answers[answerKey(part, stage, i)]))
  );

  function report(i: number, status: WidgetStatus) {
    const next = statuses.map((p, j) => (j === i ? status : p));
    setStatuses(next);
    onChange?.(next);
  }

  return widgets.map((w, i) => {
    const key = stage === "penjelasan" ? null : answerKey(part, stage, i);
    return (
      <PracticeWidget
        key={i}
        widget={w}
        onStatus={(st) => report(i, st)}
        write={key ? { saved: answers[key], save: (text) => onSaveAnswer(key, text) } : undefined}
      />
    );
  });
}

function ModuleSection({ module: m, index, done, onDone, answers, onSaveAnswer }: SectionProps & { module: ModuleContent; index: number }) {
  const moduleKey = m.key;
  const dict = usePracticeNodes();
  const [cobaReady, setCobaReady] = useState(() =>
    m.coba.every((w, i) => initialWidgetStatus(w, dict, answers[answerKey(moduleKey, "coba", i)]).attempted)
  );
  // A module finished on an earlier visit opens with everything already revealed.
  const [revealed, setRevealed] = useState(done);
  const learnRef = useRef<HTMLDivElement>(null);

  function reveal() {
    flushSync(() => setRevealed(true));
    learnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className={s.section} id={`modul-${moduleKey}`}>
      <div className={s.moduleHead}>
        <div className={s.moduleNum} style={{ background: m.color }}>
          {index + 1}
        </div>
        <div>
          <h2>{m.title}</h2>
          <div className={s.moduleTagline}>{m.tagline}</div>
          <div className={s.moduleTime}>{`Sekitar ${m.time}`}</div>
        </div>
      </div>

      <div className={s.stage}>
        <div className={s.stageTitle}>
          Coba dulu<span className={cx(s.pill, s.pillTry)}>Sebelum membaca</span>
        </div>
        <WidgetGroup
          part={moduleKey}
          stage="coba"
          widgets={m.coba}
          answers={answers}
          onSaveAnswer={onSaveAnswer}
          onChange={(st) => setCobaReady(st.every((x) => x.attempted))}
        />
        {!revealed ? (
          <>
            <button type="button" className={s.revealBtn} disabled={!cobaReady} onClick={reveal}>
              Lihat penjelasan
            </button>
            {!cobaReady ? <div className={s.revealHint}>Jawab dulu pertanyaannya, ya.</div> : null}
          </>
        ) : null}
      </div>

      {revealed ? (
        <>
          <div className={s.stage} ref={learnRef}>
            <div className={s.stageTitle}>
              Penjelasan<span className={cx(s.pill, s.pillLearn)}>Pahami</span>
            </div>
            <WidgetGroup part={moduleKey} stage="penjelasan" widgets={m.penjelasan} answers={answers} onSaveAnswer={onSaveAnswer} />
          </div>
          <div className={s.stage}>
            <div className={s.stageTitle}>
              Latihan<span className={cx(s.pill, s.pillPractice)}>Praktikkan</span>
            </div>
            <WidgetGroup
              part={moduleKey}
              stage="latihan"
              widgets={m.latihan}
              answers={answers}
              onSaveAnswer={onSaveAnswer}
              onChange={(st) => {
                if (st.every((x) => x.complete)) onDone();
              }}
            />
            {done ? <div className={s.doneBanner}>Modul ini selesai. Lanjut ke bagian berikutnya.</div> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function MainExerciseSection({ main, done, onDone, answers, onSaveAnswer }: SectionProps & { main: MainExercise }) {
  return (
    <section className={s.section} id="latihan-utama">
      <div className={s.moduleHead}>
        <div className={s.moduleNum} style={{ background: "#C9821B" }}>
          {"★"}
        </div>
        <div>
          <h2>{main.title}</h2>
          <div className={s.moduleTagline}>Belajar paling melekat dari memperbaiki hasil kerja sendiri.</div>
        </div>
      </div>
      <div className={s.prose}>
        <p>{main.intro}</p>
        {main.steps ? (
          <ol className={s.steps}>
            {main.steps.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        ) : null}
      </div>
      <WidgetGroup
        part={MAIN_PART}
        stage="main"
        widgets={main.widgets}
        answers={answers}
        onSaveAnswer={onSaveAnswer}
        onChange={(st) => {
          if (st.every((x) => x.complete)) onDone();
        }}
      />
      {done ? <div className={s.doneBanner}>Latihan utama selesai. Kerja bagus.</div> : null}
      {main.extra ? (
        <div className={cx(s.extraBox, s.prose)}>
          <h3>{main.extra.title}</h3>
          <p>{main.extra.text}</p>
        </div>
      ) : null}
    </section>
  );
}
