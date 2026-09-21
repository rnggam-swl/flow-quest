import dynamic from "next/dynamic";
import { loadFlowQuestPageData } from "@/lib/quest2";
import { QUEST4_NODE_LIBRARY, getRubricMax } from "@/lib/flowScoring";
import { PageLoading } from "@/components/ui";

const FlowBuilderCanvas = dynamic(() => import("@/components/FlowBuilderCanvas").then((m) => m.FlowBuilderCanvas), {
  loading: () => <PageLoading />,
});

const RUBRIC = getRubricMax(4);
const BASE_MAX = RUBRIC.goal + RUBRIC.flow + RUBRIC.logic + RUBRIC.constraint + RUBRIC.edgeCase + RUBRIC.simplicity;

export default async function Quest4Page() {
  const { submissionId, nodes, connections, remaining, viewMode } = await loadFlowQuestPageData(4, "/result/4");

  return (
    <FlowBuilderCanvas
      submissionId={submissionId}
      questLabel="Quest 4 · Break the Flow"
      scenarioLine="Sistem sekolah kadang gagal memproses konfirmasi pendaftaran — siapkan jalur pemulihannya."
      questOrder={4}
      nodeLibrary={QUEST4_NODE_LIBRARY}
      resultHref="/result/4"
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
