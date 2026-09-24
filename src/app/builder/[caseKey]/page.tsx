import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadEditableCase } from "@/lib/content/drafts";
import { mediaUploadConfigured } from "@/lib/mediaStorage";
import { QuestBuilder, type BuilderView } from "@/components/builder/QuestBuilder";
import { BrokenDraft } from "@/components/builder/BrokenDraft";

export const metadata: Metadata = { title: "Builder" };

const VIEWS: BuilderView[] = ["kasus", "quest", "modul"];

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseKey: string }>;
  searchParams: Promise<{ quest?: string; view?: string; modul?: string }>;
}) {
  const [{ caseKey }, { quest, view, modul }] = await Promise.all([params, searchParams]);
  const editable = await loadEditableCase(caseKey);
  if (!editable) notFound();
  const { key, title, content, revision, fromDraft, publishedVersion, idleSessions, lockedSessions, broken } = editable;
  if (broken) return <BrokenDraft caseKey={key} title={title} revision={revision} details={broken} published={publishedVersion !== null} />;
  return (
    <QuestBuilder
      // A new revision (after publishing or discarding) starts the builder over from the server's copy.
      key={`${revision}:${fromDraft}`}
      initial={{ caseKey: key, title, content, revision, fromDraft, publishedVersion, idleSessions, lockedSessions }}
      initialQuest={Number(quest) || 1}
      initialView={VIEWS.includes(view as BuilderView) ? (view as BuilderView) : "quest"}
      initialModule={modul}
      uploadEnabled={mediaUploadConfigured()}
    />
  );
}
