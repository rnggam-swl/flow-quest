import { loadFlowQuestPageData } from "@/lib/quest2";
import { QUEST3_NODE_LIBRARY, getRubricMax } from "@/lib/flowScoring";
import { FlowBuilderCanvas } from "@/components/FlowBuilderCanvas";

const RUBRIC = getRubricMax(3);
const BASE_MAX = RUBRIC.goal + RUBRIC.flow + RUBRIC.logic + RUBRIC.constraint + RUBRIC.edgeCase + RUBRIC.simplicity;

export default async function Quest3Page() {
  const { submissionId, nodes, connections, remaining, viewMode } = await loadFlowQuestPageData(3, "/result/3");

  return (
    <FlowBuilderCanvas
      submissionId={submissionId}
      questLabel="Quest 3 · Add the Logic"
      scenarioLine="Sistem sekolah perlu memverifikasi NIS Rani sebelum pendaftaran dianggap sah."
      questOrder={3}
      nodeLibrary={QUEST3_NODE_LIBRARY}
      resultHref="/result/3"
      baseMax={BASE_MAX}
      initialViewMode={viewMode}
      initialNodes={nodes.map((n) => ({
        id: n.id,
        label: n.label,
        nodeType: n.nodeType,
        positionX: n.positionX,
        positionY: n.positionY,
      }))}
      initialConnections={connections.map((c) => ({
        id: c.id,
        sourceNodeId: c.sourceNodeId,
        targetNodeId: c.targetNodeId,
        connectionType: c.connectionType,
      }))}
      initialRemainingSeconds={remaining}
    />
  );
}
