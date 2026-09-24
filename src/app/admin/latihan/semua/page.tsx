import Link from "next/link";
import { getManagedSession } from "@/lib/managedSession";
import { getSessionContent } from "@/lib/content/sessionContent";
import { allModulesView } from "@/lib/practice/plan";
import { PracticeWorkbook } from "@/components/practice/PracticeWorkbook";
import { Eyebrow } from "@/components/ui";

export default async function AdminAllModulesPage() {
  const session = await getManagedSession();
  const content = session ? (await getSessionContent(session.id))?.content : null;
  if (!content) {
    return (
      <div className="mx-auto max-w-[1080px] px-6 pt-9 pb-20">
        <p className="text-muted">Session yang dikelola belum punya konten kasus.</p>
      </div>
    );
  }
  return (
    <>
      <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-5">
        <Link href="/admin/latihan" className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-text">
          ← Kembali ke Modul Latihan
        </Link>
        <Eyebrow>Semua Modul</Eyebrow>
        <p className="text-[13.5px] text-muted">
          Semua modul kasus {content.title} dalam satu halaman. Semua interaksi di sini hanya untuk pratinjau dan tidak disimpan.
        </p>
      </div>
      <PracticeWorkbook
        plan={allModulesView(content.modules)}
        modules={content.modules}
        nodes={content.nodes}
        closing={content.practiceClosing}
        initialCompleted={[]}
        initialAnswers={{}}
        mode="preview"
      />
    </>
  );
}
