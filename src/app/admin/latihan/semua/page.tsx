import Link from "next/link";
import { ALL_MODULES_VIEW } from "@/lib/practice/plan";
import { PracticeWorkbook } from "@/components/practice/PracticeWorkbook";
import { Eyebrow } from "@/components/ui";

export default function AdminAllModulesPage() {
  return (
    <>
      <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-5">
        <Link href="/admin/latihan" className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-text">
          ← Kembali ke Modul Latihan
        </Link>
        <Eyebrow>Semua Modul</Eyebrow>
        <p className="text-[13.5px] text-muted">
          Keenam modul inti dalam satu halaman. Semua interaksi di sini hanya untuk pratinjau dan tidak disimpan.
        </p>
      </div>
      <PracticeWorkbook plan={ALL_MODULES_VIEW} initialCompleted={[]} initialAnswers={{}} mode="preview" />
    </>
  );
}
