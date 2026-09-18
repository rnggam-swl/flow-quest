/**
 * Port of the prototype's runValidation()/pathExists() engine (see
 * spec/user-flow-quest-prototype.html) to operate on real FlowNode/FlowConnection
 * rows instead of in-memory canvas arrays. Node "kind" isn't a column in the
 * existing schema, so nodes are identified by their fixed library label instead
 * (see NODE_LIBRARY in the Quest 2 UI) — the label strings are controlled by us,
 * not free user input, so exact match is safe.
 */

export interface ScoringNode {
  id: string;
  label: string;
}

export type ConnectionKind = "DEFAULT" | "YES" | "NO" | "RECOVERY";

export interface ScoringConnection {
  sourceNodeId: string;
  targetNodeId: string;
  connectionType?: ConnectionKind;
}

export interface FlowValidationResult {
  goalScore: number;
  flowScore: number;
  logicScore: number;
  constraintScore: number;
  edgeCaseScore: number;
  simplicityScore: number;
  totalScore: number;
  tier: "needs-work" | "almost" | "good" | "great";
  message: string;
}

/** Category maxes per quest order, used to render "x / y" consistently across the UI. */
export interface RubricMax {
  goal: number;
  flow: number;
  logic: number;
  constraint: number;
  edgeCase: number;
  simplicity: number;
}

export const QUEST_RUBRIC_MAX: Record<number, RubricMax> = {
  2: { goal: 20, flow: 25, logic: 20, constraint: 0, edgeCase: 15, simplicity: 10 },
  3: { goal: 20, flow: 20, logic: 20, constraint: 20, edgeCase: 5, simplicity: 5 },
  4: { goal: 20, flow: 20, logic: 20, constraint: 20, edgeCase: 5, simplicity: 5 },
  5: { goal: 20, flow: 25, logic: 20, constraint: 20, edgeCase: 15, simplicity: 10 },
};

export function getRubricMax(order: number): RubricMax {
  return QUEST_RUBRIC_MAX[order] ?? QUEST_RUBRIC_MAX[2];
}

/**
 * Resolves the validator by quest order rather than passing a function prop
 * across the server/client boundary (Server Components can't serialize
 * functions to Client Components).
 */
export function getValidatorForOrder(
  order: number
): (
  nodes: ScoringNode[],
  connections: ScoringConnection[]
) => FlowValidationResult {
  if (order === 3) return runQuest3Validation;
  if (order === 4) return runQuest4Validation;
  return runFlowValidation;
}

function findByLabel(nodes: ScoringNode[], label: string) {
  return nodes.filter((n) => n.label === label);
}

function pathExists(
  nodes: ScoringNode[],
  connections: ScoringConnection[],
  fromLabel: string,
  toLabel: string
) {
  const starts = findByLabel(nodes, fromLabel).map((n) => n.id);
  const targets = new Set(findByLabel(nodes, toLabel).map((n) => n.id));
  if (starts.length === 0 || targets.size === 0) return false;

  const adjacency = new Map<string, string[]>();
  connections.forEach((c) => {
    const list = adjacency.get(c.sourceNodeId) ?? [];
    list.push(c.targetNodeId);
    adjacency.set(c.sourceNodeId, list);
  });

  const visited = new Set<string>();
  const queue = [...starts];
  while (queue.length) {
    const current = queue.shift()!;
    if (targets.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    (adjacency.get(current) ?? []).forEach((n) => queue.push(n));
  }
  return false;
}

function labelOf(nodes: ScoringNode[], id: string) {
  return nodes.find((n) => n.id === id)?.label;
}

function bfsReachesLabel(
  nodes: ScoringNode[],
  connections: ScoringConnection[],
  startIds: string[],
  targetLabel: string
) {
  const targets = new Set(findByLabel(nodes, targetLabel).map((n) => n.id));
  if (startIds.length === 0 || targets.size === 0) return false;
  const adjacency = new Map<string, string[]>();
  connections.forEach((c) => {
    const list = adjacency.get(c.sourceNodeId) ?? [];
    list.push(c.targetNodeId);
    adjacency.set(c.sourceNodeId, list);
  });
  const visited = new Set<string>();
  const queue = [...startIds];
  while (queue.length) {
    const current = queue.shift()!;
    if (targets.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    (adjacency.get(current) ?? []).forEach((n) => queue.push(n));
  }
  return false;
}

/** Whether a typed edge (e.g. the YES branch of a Decision node) eventually reaches targetLabel. */
function branchReaches(
  nodes: ScoringNode[],
  connections: ScoringConnection[],
  sourceIds: Set<string>,
  connType: ConnectionKind,
  targetLabel: string
) {
  const starts = connections
    .filter((c) => sourceIds.has(c.sourceNodeId) && c.connectionType === connType)
    .map((c) => c.targetNodeId);
  return bfsReachesLabel(nodes, connections, starts, targetLabel);
}

function hasDirectEdge(nodes: ScoringNode[], connections: ScoringConnection[], fromLabel: string, toLabel: string) {
  return connections.some(
    (c) => labelOf(nodes, c.sourceNodeId) === fromLabel && labelOf(nodes, c.targetNodeId) === toLabel
  );
}

function orphanPenalty(nodes: ScoringNode[], connections: ScoringConnection[], max: number, floor: number) {
  const orphanCount = nodes.filter(
    (n) => !connections.some((c) => c.sourceNodeId === n.id || c.targetNodeId === n.id)
  ).length;
  return Math.max(floor, max - orphanCount);
}

export function runFlowValidation(
  nodes: ScoringNode[],
  connections: ScoringConnection[]
): FlowValidationResult {
  const hasHome = findByLabel(nodes, "Home").length > 0;
  const hasRegForm = findByLabel(nodes, "Registration Form").length > 0;
  const hasSuccess = findByLabel(nodes, "Success").length > 0;
  const hasClubList = findByLabel(nodes, "Club List").length > 0;
  const hasError = findByLabel(nodes, "Error").length > 0;

  const homeToDetail = pathExists(nodes, connections, "Home", "Club Detail");
  const detailToReg = pathExists(nodes, connections, "Club Detail", "Registration Form");
  const regToSuccess = pathExists(nodes, connections, "Registration Form", "Success");
  const listBridged =
    pathExists(nodes, connections, "Home", "Club List") &&
    pathExists(nodes, connections, "Club List", "Club Detail");
  const errorBranch =
    pathExists(nodes, connections, "Registration Form", "Error") ||
    pathExists(nodes, connections, "Confirmation", "Error");

  const goalScore = hasHome && hasSuccess ? 20 : hasHome || hasSuccess ? 10 : 0;

  const coreChain = [homeToDetail, detailToReg, regToSuccess].filter(Boolean).length;
  const flowScore = coreChain === 3 ? 25 : coreChain === 2 ? 16 : coreChain === 1 ? 8 : 0;

  const logicScore = listBridged ? 20 : hasClubList ? 10 : 12;
  const edgeCaseScore = errorBranch ? 15 : hasError ? 6 : 3;
  const simplicityScore = orphanPenalty(nodes, connections, 10, 4);

  // Bonus dimension: only scored when a Decision node is present (Quest 5's
  // capstone flow includes it; plain Quest 2 flows never do, so this is
  // always 0 there and the constraint row stays hidden in the UI).
  const decisionIds = new Set(findByLabel(nodes, "Verifikasi NIS").map((n) => n.id));
  let constraintScore = 0;
  if (decisionIds.size > 0) {
    const yesOk = branchReaches(nodes, connections, decisionIds, "YES", "Success");
    const noOk = branchReaches(nodes, connections, decisionIds, "NO", "Error");
    constraintScore = yesOk && noOk ? 20 : yesOk || noOk ? 10 : 0;
  }

  let tier: FlowValidationResult["tier"];
  let message: string;
  if (!hasHome || !hasRegForm || !hasSuccess || coreChain < 2) {
    tier = "needs-work";
    message =
      "Flow-nya belum lengkap. Pastikan minimal ada langkah masuk (Home), form pendaftaran, dan halaman berhasil (Success), lalu sambungkan berurutan.";
  } else if (coreChain < 3) {
    tier = "needs-work";
    message =
      "Sudah ada bagian-bagian pentingnya, tapi beberapa langkah belum tersambung. Coba cek lagi urutan dari Home sampai Success.";
  } else if (!listBridged) {
    tier = "almost";
    message =
      "Hampir tepat! Kamu melewati langkah dimana user menemukan atau memilih klubnya (Club List) sebelum masuk ke detail.";
  } else if (!errorBranch) {
    tier = "good";
    message =
      "Flow inti kamu solid! Coba pikirkan juga apa yang terjadi kalau user gagal atau salah isi data (skenario error).";
  } else {
    tier = "great";
    message =
      "Flow ini matang — jalur utama jelas dan kamu juga mempertimbangkan skenario gagal. Ini persis cara berpikir yang dipakai designer di industri.";
  }

  if (decisionIds.size > 0 && constraintScore < 20) {
    message +=
      " Verifikasi NIS juga perlu menangani dua kemungkinan: kalau valid (Ya) lanjut ke Success, kalau tidak (Tidak) arahkan ke Error.";
  }

  const totalScore = goalScore + flowScore + logicScore + constraintScore + edgeCaseScore + simplicityScore;

  return { goalScore, flowScore, logicScore, constraintScore, edgeCaseScore, simplicityScore, totalScore, tier, message };
}

/**
 * Re-derives the tier/message from persisted Score fields (used on the result
 * page, which only has the Score row, not the original FlowNode graph). The
 * score-to-flag mapping is exact because each branch in runFlowValidation
 * produces a distinct score value for logicScore/edgeCaseScore/flowScore.
 */
export function deriveTierFromScores(scores: {
  flowScore: number;
  logicScore: number;
  edgeCaseScore: number;
}): Pick<FlowValidationResult, "tier" | "message"> {
  const coreChainComplete = scores.flowScore === 25;
  const listBridged = scores.logicScore === 20;
  const errorBranch = scores.edgeCaseScore === 15;

  if (!coreChainComplete) {
    return {
      tier: "needs-work",
      message:
        "Flow-nya belum lengkap. Pastikan minimal ada langkah masuk (Home), form pendaftaran, dan halaman berhasil (Success), lalu sambungkan berurutan.",
    };
  }
  if (!listBridged) {
    return {
      tier: "almost",
      message:
        "Hampir tepat! Kamu melewati langkah dimana user menemukan atau memilih klubnya (Club List) sebelum masuk ke detail.",
    };
  }
  if (!errorBranch) {
    return {
      tier: "good",
      message:
        "Flow inti kamu solid! Coba pikirkan juga apa yang terjadi kalau user gagal atau salah isi data (skenario error).",
    };
  }
  return {
    tier: "great",
    message:
      "Flow ini matang — jalur utama jelas dan kamu juga mempertimbangkan skenario gagal. Ini persis cara berpikir yang dipakai designer di industri.",
  };
}

export function computeRationaleScore(text: string) {
  const len = text.trim().length;
  if (len === 0) return 0;
  if (len < 20) return 5;
  if (len < 60) return 8;
  return 10;
}

export const TIER_LABELS: Record<FlowValidationResult["tier"], { badge: string; label: string }> = {
  "needs-work": { badge: "🧭", label: "Perlu Dicoba Lagi" },
  almost: { badge: "🥉", label: "Path Finder" },
  good: { badge: "🥈", label: "Flow Builder" },
  great: { badge: "🥇", label: "Flow Master" },
};


/**
 * Quest 3 · Add the Logic — a Decision node ("Verifikasi NIS") must be wired
 * with both a YES branch reaching Success and a NO branch reaching Error.
 * A bonus RECOVERY edge from Error back to Registration Form is rewarded
 * as good UX practice (letting the user retry instead of dead-ending).
 */
export function runQuest3Validation(nodes: ScoringNode[], connections: ScoringConnection[]): FlowValidationResult {
  const hasDecision = findByLabel(nodes, "Verifikasi NIS").length > 0;
  const decisionIds = new Set(findByLabel(nodes, "Verifikasi NIS").map((n) => n.id));

  const flowToDecision = pathExists(nodes, connections, "Registration Form", "Verifikasi NIS");
  const yesReachesSuccess = branchReaches(nodes, connections, decisionIds, "YES", "Success");
  const noReachesError = branchReaches(nodes, connections, decisionIds, "NO", "Error");
  const hasRecovery = connections.some(
    (c) => c.connectionType === "RECOVERY" && labelOf(nodes, c.targetNodeId) === "Registration Form"
  );

  const goalScore = hasDecision ? 20 : 0;
  const flowScore = flowToDecision ? 20 : 0;
  const logicScore = yesReachesSuccess ? 20 : 0;
  const constraintScore = noReachesError ? 20 : 0;
  const edgeCaseScore = hasRecovery ? 5 : 0;
  const simplicityScore = orphanPenalty(nodes, connections, 5, 2);
  const totalScore = goalScore + flowScore + logicScore + constraintScore + edgeCaseScore + simplicityScore;

  let tier: FlowValidationResult["tier"];
  let message: string;
  if (!hasDecision || !flowToDecision) {
    tier = "needs-work";
    message =
      "Tambahkan node Verifikasi NIS dan sambungkan Registration Form ke sana — sistem perlu memutuskan sesuatu sebelum lanjut.";
  } else if (!yesReachesSuccess || !noReachesError) {
    tier = "almost";
    message =
      "Decision node-nya sudah tersambung, tapi belum kedua cabangnya benar. Cabang 'Ya' harus berakhir di Success, cabang 'Tidak' harus berakhir di Error.";
  } else if (!hasRecovery) {
    tier = "good";
    message =
      "Kedua cabang keputusan sudah benar! Coba pikirkan juga: kalau user gagal verifikasi, bagaimana caranya dia bisa mencoba lagi tanpa mulai dari awal?";
  } else {
    tier = "great";
    message =
      "Logika keputusannya lengkap — kedua cabang benar, dan kamu juga menyediakan jalur pemulihan supaya user tidak buntu di halaman Error.";
  }

  return { goalScore, flowScore, logicScore, constraintScore, edgeCaseScore, simplicityScore, totalScore, tier, message };
}

/**
 * Quest 4 · Break the Flow — an unexpected disruption (Event) can occur at
 * Confirmation. The happy path (-> Success) must survive alongside the
 * disruption path (-> Error), and Error must recover back into the flow
 * via a RECOVERY edge to Registration Form rather than dead-ending.
 */
export function runQuest4Validation(nodes: ScoringNode[], connections: ScoringConnection[]): FlowValidationResult {
  const hasSuccess = findByLabel(nodes, "Success").length > 0;
  const hasError = findByLabel(nodes, "Error").length > 0;

  const regToConfirm = pathExists(nodes, connections, "Registration Form", "Confirmation");
  const confirmToSuccess = pathExists(nodes, connections, "Confirmation", "Success");
  const confirmToError = pathExists(nodes, connections, "Confirmation", "Error");
  const hasRecovery = connections.some(
    (c) =>
      c.connectionType === "RECOVERY" &&
      labelOf(nodes, c.sourceNodeId) === "Error" &&
      labelOf(nodes, c.targetNodeId) === "Registration Form"
  );
  const skipsConfirmation = hasDirectEdge(nodes, connections, "Registration Form", "Success");

  const goalScore = hasSuccess && hasError ? 20 : hasSuccess || hasError ? 10 : 0;
  const flowScore = regToConfirm && confirmToSuccess ? 20 : regToConfirm || confirmToSuccess ? 10 : 0;
  const logicScore = confirmToError ? 20 : 0;
  const constraintScore = hasRecovery ? 20 : 0;
  const edgeCaseScore = skipsConfirmation ? 0 : 5;
  const simplicityScore = orphanPenalty(nodes, connections, 5, 2);
  const totalScore = goalScore + flowScore + logicScore + constraintScore + edgeCaseScore + simplicityScore;

  let tier: FlowValidationResult["tier"];
  let message: string;
  if (!regToConfirm || !confirmToSuccess) {
    tier = "needs-work";
    message =
      "Jalur normalnya belum lengkap. Pastikan Registration Form -> Confirmation -> Success tersambung dulu sebelum menambahkan skenario gangguan.";
  } else if (!confirmToError) {
    tier = "almost";
    message =
      "Jalur normal sudah baik, tapi flow-mu belum memodelkan kemungkinan gangguan — sambungkan Confirmation ke Error juga.";
  } else if (!hasRecovery) {
    tier = "good";
    message =
      "Gangguan sudah dimodelkan! Sekarang tambahkan jalur pemulihan (Error kembali ke Registration Form) supaya user tidak buntu.";
  } else {
    tier = "great";
    message =
      "Flow ini menangani gangguan dengan baik — ada jalur normal, jalur gagal, dan jalur pemulihan yang jelas.";
  }

  return { goalScore, flowScore, logicScore, constraintScore, edgeCaseScore, simplicityScore, totalScore, tier, message };
}

/**
 * Re-derives Quest 3/4 tier & message from persisted Score fields by
 * reversing the same branch checks runQuest3Validation/runQuest4Validation
 * used — each branch produces a distinct score value, so this is exact
 * (not an approximation), keeping the result page's badge consistent with
 * what was actually computed at submit time.
 */
export function deriveGenericTier(
  score: { goalScore: number; flowScore: number; logicScore: number; constraintScore: number; edgeCaseScore: number },
  order: 3 | 4
): Pick<FlowValidationResult, "tier" | "message"> {
  if (order === 3) {
    const decisionWired = score.goalScore === 20 && score.flowScore === 20;
    const bothBranchesCorrect = score.logicScore === 20 && score.constraintScore === 20;
    const hasRecovery = score.edgeCaseScore === 5;

    if (!decisionWired) {
      return {
        tier: "needs-work",
        message:
          "Tambahkan node Verifikasi NIS dan sambungkan Registration Form ke sana — sistem perlu memutuskan sesuatu sebelum lanjut.",
      };
    }
    if (!bothBranchesCorrect) {
      return {
        tier: "almost",
        message:
          "Decision node-nya sudah tersambung, tapi belum kedua cabangnya benar. Cabang 'Ya' harus berakhir di Success, cabang 'Tidak' harus berakhir di Error.",
      };
    }
    if (!hasRecovery) {
      return {
        tier: "good",
        message:
          "Kedua cabang keputusan sudah benar! Coba pikirkan juga: kalau user gagal verifikasi, bagaimana caranya dia bisa mencoba lagi tanpa mulai dari awal?",
      };
    }
    return {
      tier: "great",
      message:
        "Logika keputusannya lengkap — kedua cabang benar, dan kamu juga menyediakan jalur pemulihan supaya user tidak buntu di halaman Error.",
    };
  }

  // order === 4
  const happyPathIntact = score.flowScore === 20;
  const disruptionModeled = score.logicScore === 20;
  const hasRecovery = score.constraintScore === 20;

  if (!happyPathIntact) {
    return {
      tier: "needs-work",
      message:
        "Jalur normalnya belum lengkap. Pastikan Registration Form -> Confirmation -> Success tersambung dulu sebelum menambahkan skenario gangguan.",
    };
  }
  if (!disruptionModeled) {
    return {
      tier: "almost",
      message:
        "Jalur normal sudah baik, tapi flow-mu belum memodelkan kemungkinan gangguan — sambungkan Confirmation ke Error juga.",
    };
  }
  if (!hasRecovery) {
    return {
      tier: "good",
      message:
        "Gangguan sudah dimodelkan! Sekarang tambahkan jalur pemulihan (Error kembali ke Registration Form) supaya user tidak buntu.",
    };
  }
  return {
    tier: "great",
    message: "Flow ini menangani gangguan dengan baik — ada jalur normal, jalur gagal, dan jalur pemulihan yang jelas.",
  };
}

/**
 * Best-effort topological ordering of nodes for read-only display (admin
 * submission viewer). Falls back to creation order for any nodes left over
 * after a cycle or a node with no path from a root.
 */
export function orderNodesForDisplay<T extends { id: string; createdAt: Date }>(
  nodes: T[],
  connections: ScoringConnection[]
): T[] {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adjacency = new Map<string, string[]>();
  connections.forEach((c) => {
    if (!inDegree.has(c.targetNodeId)) return;
    inDegree.set(c.targetNodeId, (inDegree.get(c.targetNodeId) ?? 0) + 1);
    const list = adjacency.get(c.sourceNodeId) ?? [];
    list.push(c.targetNodeId);
    adjacency.set(c.sourceNodeId, list);
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byCreatedAt = (a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime();

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0).sort(byCreatedAt);
  const ordered: T[] = [];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    ordered.push(current);
    const next = (adjacency.get(current.id) ?? [])
      .map((id) => byId.get(id))
      .filter((n): n is T => Boolean(n) && !visited.has(n!.id));
    queue.push(...next);
    queue.sort(byCreatedAt);
  }

  const leftover = nodes.filter((n) => !visited.has(n.id)).sort(byCreatedAt);
  return [...ordered, ...leftover];
}

export interface NodeLibItem {
  kind: string;
  label: string;
  nodeType: "START" | "ACTION" | "SCREEN" | "SYSTEM" | "DECISION" | "OUTCOME" | "ERROR";
  icon: string;
  /** Decision nodes render two output handles (Ya/Tidak) instead of one. */
  decision?: boolean;
}

export const NODE_LIBRARY: NodeLibItem[] = [
  { kind: "home", label: "Home", nodeType: "SCREEN", icon: "🏠" },
  { kind: "clublist", label: "Club List", nodeType: "SCREEN", icon: "📋" },
  { kind: "clubdetail", label: "Club Detail", nodeType: "SCREEN", icon: "📄" },
  { kind: "regform", label: "Registration Form", nodeType: "SCREEN", icon: "📝" },
  { kind: "confirmation", label: "Confirmation", nodeType: "SYSTEM", icon: "⚙️" },
  { kind: "success", label: "Success", nodeType: "OUTCOME", icon: "✅" },
  { kind: "error", label: "Error", nodeType: "ERROR", icon: "⚠️" },
];

const DECISION_NODE: NodeLibItem = {
  kind: "verifynis",
  label: "Verifikasi NIS",
  nodeType: "DECISION",
  icon: "❓",
  decision: true,
};

const REG_FORM = NODE_LIBRARY.find((n) => n.kind === "regform")!;
const CONFIRMATION = NODE_LIBRARY.find((n) => n.kind === "confirmation")!;
const SUCCESS_NODE = NODE_LIBRARY.find((n) => n.kind === "success")!;
const ERROR_NODE = NODE_LIBRARY.find((n) => n.kind === "error")!;

/** Quest 3 · Add the Logic — focused palette around the decision itself. */
export const QUEST3_NODE_LIBRARY: NodeLibItem[] = [REG_FORM, DECISION_NODE, CONFIRMATION, SUCCESS_NODE, ERROR_NODE];

/** Quest 4 · Break the Flow — happy path + disruption + recovery. */
export const QUEST4_NODE_LIBRARY: NodeLibItem[] = [REG_FORM, CONFIRMATION, SUCCESS_NODE, ERROR_NODE];

/** Quest 5 · Final Challenge — everything from Quest 2 plus the Quest 3 decision. */
export const QUEST5_NODE_LIBRARY: NodeLibItem[] = [...NODE_LIBRARY, DECISION_NODE];
