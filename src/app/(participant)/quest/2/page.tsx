import dynamic from "next/dynamic";
import { loadFlowQuestPageData } from "@/lib/quest2";
import { NODE_LIBRARY, getRubricMax } from "@/lib/flowScoring";
import { PageLoading } from "@/components/ui";

// The canvas is the heaviest client bundle on this route (routing/alignment math, drag handling) —
// splitting it into its own chunk lets the page shell stream in first instead of waiting on it.
const FlowBuilderCanvas = dynamic(() => import("@/components/FlowBuilderCanvas").then((m) => m.FlowBuilderCanvas), {
  loading: () => <PageLoading />,
});

const RUBRIC = getRubricMax(2);
const BASE_MAX = RUBRIC.goal + RUBRIC.flow + RUBRIC.logic + RUBRIC.constraint + RUBRIC.edgeCase + RUBRIC.simplicity;

export default async function Quest2Page() {
  const { submissionId, nodes, connections, remaining, viewMode } = await loadFlowQuestPageData(2, "/result");

  return (
    <FlowBuilderCanvas
      submissionId={submissionId}
      questOrder={2}
      questLabel="Quest 2 · Build the Path"
      scenarioLine="Rani ingin mendaftar Klub Fotografi lewat aplikasi sekolah."
      nodeLibrary={NODE_LIBRARY}
      resultHref="/result"
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
