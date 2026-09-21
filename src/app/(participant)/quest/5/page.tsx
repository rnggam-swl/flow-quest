import dynamic from "next/dynamic";
import { loadFlowQuestPageData } from "@/lib/quest2";
import { QUEST5_NODE_LIBRARY, getRubricMax } from "@/lib/flowScoring";
import { PageLoading } from "@/components/ui";

const FlowBuilderCanvas = dynamic(() => import("@/components/FlowBuilderCanvas").then((m) => m.FlowBuilderCanvas), {
  loading: () => <PageLoading />,
});

const RUBRIC = getRubricMax(5);
const BASE_MAX = RUBRIC.goal + RUBRIC.flow + RUBRIC.logic + RUBRIC.constraint + RUBRIC.edgeCase + RUBRIC.simplicity;

export default async function Quest5Page() {
  const { submissionId, nodes, connections, remaining, viewMode } = await loadFlowQuestPageData(5, "/result/5");

  return (
    <FlowBuilderCanvas
      submissionId={submissionId}
      questLabel="Quest 5 · Final Challenge"
      scenarioLine="Gabungkan semua yang sudah kamu pelajari: flow lengkap, verifikasi NIS, dan penanganan error."
      questOrder={5}
      nodeLibrary={QUEST5_NODE_LIBRARY}
      resultHref="/result/5"
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
