import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadEditableCase } from "@/lib/content/drafts";
import { mediaUploadConfigured } from "@/lib/mediaStorage";
import { QuestBuilder } from "@/components/builder/QuestBuilder";

export const metadata: Metadata = { title: "Builder" };

export default async function BuilderPage({ params, searchParams }: { params: Promise<{ caseKey: string }>; searchParams: Promise<{ quest?: string }> }) {
  const [{ caseKey }, { quest }] = await Promise.all([params, searchParams]);
  const editable = await loadEditableCase(caseKey);
  if (!editable) notFound();
  const { key, title, content, revision, fromDraft, publishedVersion, idleSessions } = editable;
  return (
    <QuestBuilder
      // A new revision (after publishing or discarding) starts the builder over from the server's copy.
      key={`${revision}:${fromDraft}`}
      initial={{ caseKey: key, title, content, revision, fromDraft, publishedVersion, idleSessions }}
      initialQuest={Number(quest) || 1}
      uploadEnabled={mediaUploadConfigured()}
    />
  );
}
