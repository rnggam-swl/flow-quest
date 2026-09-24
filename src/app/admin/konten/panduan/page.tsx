import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Eyebrow, Headline, Sub } from "@/components/ui";

export const metadata: Metadata = { title: "Panduan Konten · Admin" };

/**
 * How to make content with the builder, end to end (Fase 5). Written for the
 * people using the editors; the JSON format for case files lives in
 * docs/panduan-konten.md.
 */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[14px] border border-border bg-surface p-6">
      <h2 className="mb-3 font-display text-[20px] font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-[14.5px] leading-[1.7] text-muted [&_b]:text-text">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal pl-5">
      {items.map((it, i) => (
        <li key={i} className="py-0.5">
          {it}
        </li>
      ))}
    </ol>
  );
}

const TOC = [
  ["alur", "Alur kerja"],
  ["kasus", "Kasus & kamus node"],
  ["quest", "Quest & soal"],
  ["flow", "Soal flow & rubrik"],
  ["gamifikasi", "Gamifikasi"],
  ["modul", "Modul Latihan"],
  ["rencana", "Rencana peserta"],
  ["versi", "Versi & session"],
  ["tips", "Tips menulis soal"],
] as const;

export default function ContentGuidePage() {
  return (
    <div className="mx-auto max-w-[860px] px-6 pt-4 pb-20">
      <Link href="/admin/konten" className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-text">
        ← Kembali ke Konten
      </Link>
      <Eyebrow>Panduan</Eyebrow>
      <Headline>Membuat Konten</Headline>
      <Sub>
        Dari kasus kosong sampai dimainkan peserta. Konten juga bisa ditulis sebagai file JSON; formatnya dijelaskan di <code>docs/panduan-konten.md</code>.
      </Sub>

      <nav className="mb-6 flex flex-wrap gap-2 text-[13px]">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-[20px] border border-border-light px-3 py-1 text-muted hover:text-text">
            {label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        <Section id="alur" title="Alur kerja">
          <Steps
            items={[
              <>
                Di <b>Konten</b>, klik <b>+ Kasus baru</b>. Mulai dari kasus kosong, dari salinan kasus lain, atau dari file JSON (<b>Impor kasus</b>).
              </>,
              <>
                Isi cerita dan <b>kamus node</b> di tampilan <b>Kasus</b>, lalu soal-soalnya di tampilan <b>Quest</b>, lalu modul di tampilan <b>Modul</b>.
              </>,
              <>
                <b>Simpan</b> (Ctrl+S) kapan saja. Draf boleh belum lengkap, dan peserta tidak pernah melihat draf.
              </>,
              <>
                Coba sebagai peserta dengan <b>Preview</b> (satu soal) dan <b>Play</b> (seluruh quest). Tidak ada yang tersimpan.
              </>,
              <>
                Selesaikan semua isian di panel <b>Cek</b> (klik masalahnya untuk melompat ke tempatnya), lalu klik <b>Publish</b>.
              </>,
              <>
                Buat session baru untuk kasus itu di <b>Pengaturan Session</b>, atau pindahkan session yang belum dimulai ke versi baru.
              </>,
            ]}
          />
        </Section>

        <Section id="kasus" title="Kasus & kamus node">
          <p>
            Satu kasus adalah satu cerita: siapa penggunanya, apa tujuannya, dan node apa saja yang boleh dipakai flow-nya. Semua quest dan modul dalam kasus itu
            memakai kamus node yang sama.
          </p>
          <p>
            Setiap node punya <b>label</b> (yang dilihat peserta), <b>jenis</b> (layar, sistem, keputusan, hasil akhir, error), <b>ikon</b>, dan <b>kunci</b>. Label
            harus unik karena flow peserta disimpan per label. Mengganti kunci ikut mengganti semua tempat yang memakainya. Node yang masih dipakai tidak bisa
            dihapus; kolom <b>Dipakai</b> menunjukkan di mana saja.
          </p>
        </Section>

        <Section id="quest" title="Quest & soal">
          <p>
            Quest adalah urutan soal dengan XP, timer, dan <b>mode cek</b>. Dengan <b>Cek langsung</b>, setiap soal dikunci dan dibahas sebelum lanjut. Dengan{" "}
            <b>Cek di akhir</b>, jawaban bisa diubah sampai dikirim, dan pembahasannya muncul di halaman hasil. Urutan, duplikat, dan impor/ekspor quest ada di{" "}
            <b>Kasus → Daftar quest</b>.
          </p>
          <p>
            Ada 12 tipe soal quiz: pilihan tunggal, pilihan ganda, ya/tidak, angka, slider, matching, grouping, isian, urutan, odd one out, hotspot gambar, dan
            branching story. Setiap tipe punya kunci jawaban. Pilihan bisa diberi feedback sendiri, dan soal bisa diberi feedback untuk jawaban benar atau belum
            tepat. Penilaian selalu di server, dan kunci jawaban tidak pernah dikirim ke peserta.
          </p>
        </Section>

        <Section id="flow" title="Soal flow & rubrik">
          <Steps
            items={[
              <>
                Pilih node yang muncul di <b>palet</b> peserta.
              </>,
              <>
                Gambar <b>kunci jawaban</b> di kanvas, yaitu flow yang ideal.
              </>,
              <>
                Klik <b>Usulkan rubrik</b>. Sistem membuat aturan dan poin dari kunci itu untuk enam kategori: Goal, Flow, Logic, Constraint, Edge Case, dan
                Simplicity.
              </>,
              <>
                Sesuaikan label, poin, dan pesan tier. Uji dengan menggambar flow contoh di panel uji. Kunci jawaban harus mendapat nilai penuh.
              </>,
            ]}
          />
          <p>
            Satu quest paling banyak punya satu soal flow, dan soal itu selalu dikerjakan terakhir. Refleksi setelah kirim (alasan) bisa dibuat wajib atau opsional.
          </p>
        </Section>

        <Section id="gamifikasi" title="Gamifikasi">
          <p>
            Di tab <b>Quest</b>, nyalakan <b>XP per soal & combo</b>:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <b>XP per soal benar</b>: jawaban sebagian benar mendapat bagiannya.
            </li>
            <li>
              <b>Bonus combo</b>: untuk jawaban benar beruntun (×1 di jawaban ke-2, ×2 di ke-3, sampai ×4).
            </li>
            <li>
              <b>Reaksi</b>: muncul setelah setiap jawaban, hanya di mode Cek langsung.
            </li>
          </ul>
          <p>XP dihitung di server saat quest selesai. Peserta melihat rinciannya di halaman hasil, dan panel quest menampilkan XP maksimalnya.</p>
        </Section>

        <Section id="modul" title="Modul Latihan">
          <p>
            Modul terbuka untuk peserta setelah semua quest selesai. Setiap modul punya tiga tahap: <b>Coba dulu</b> (pertanyaan pembuka), <b>Penjelasan</b>, dan{" "}
            <b>Latihan</b> (harus selesai semua supaya modul tercatat selesai). Isinya disusun dari widget: teks, aturan, diagram, pilihan ganda, polling, tulisan,
            pilih tujuan, kartu keputusan, cari yang keliru, cek diri, perencana cabang, dan <b>perbaiki flow</b>.
          </p>
          <p>
            Di widget perbaiki flow, pilih node dan sambungan. Tandai sambungan yang <b>menyala di awal</b> dan yang dipakai <b>contoh jawaban</b>, lalu tulis
            aturannya. Editor langsung menunjukkan apakah flow awal masih punya yang perlu diperbaiki dan apakah contoh jawabannya memenuhi semua aturan.
          </p>
        </Section>

        <Section id="rencana" title="Rencana peserta">
          <p>
            Dari <b>Modul Latihan</b>, buka <b>Buat/Edit rencana</b> seorang peserta. Isi sapaan dan kekuatannya, lalu pilih modul yang relevan dengan celahnya.{" "}
            <b>Buat dari jawaban Quest X</b> menyalin flow yang ia kirim menjadi latihan utama. Aturan yang belum ia penuhi sudah dicentang dan menjadi langkah
            latihan. Kalau soal belum punya kunci jawaban, lengkapi contoh jawabannya di kolom <b>Contoh</b>. Menyimpan rencana tidak menghapus progres peserta.
          </p>
        </Section>

        <Section id="versi" title="Versi & session">
          <p>
            Setiap publish membuat <b>versi</b> baru. Session memakai versi tempat ia dibuat, jadi jawaban peserta selalu dinilai dengan soal yang mereka kerjakan.
            Session <b>terkunci</b> di versinya selama aktif, dan untuk seterusnya setelah ada progres peserta. Session lain bisa dipindah ke versi terbaru dari
            dialog publish, halaman <b>Konten</b>, atau riwayat session, dan daftar quest-nya ikut diperbarui.
          </p>
          <p>
            Lihat hasilnya di <b>Analitik</b>: soal yang paling sulit, pilihan yang paling sering diambil, jawaban keliru yang berulang, dan check rubrik yang paling
            sering belum terpenuhi. Dari situ bisa diputuskan soal mana yang perlu diperbaiki di versi berikutnya.
          </p>
        </Section>

        <Section id="tips" title="Tips menulis soal">
          <ul className="list-disc pl-5">
            <li>Satu soal menguji satu hal. Kalau jawabannya butuh dua alasan, jadikan dua soal.</li>
            <li>Pengecoh yang baik adalah kesalahan yang memang sering terjadi; lihat &ldquo;jawaban belum tepat yang paling sering&rdquo; di Analitik.</li>
            <li>Feedback menjelaskan kenapa, bukan hanya benar atau salah.</li>
            <li>Pakai cerita kasus di pertanyaan (&ldquo;Dimas…&rdquo;), bukan istilah abstrak.</li>
            <li>Ubah soal setelah melihat data: soal dengan skor rata-rata di bawah 50% ditandai ⚠ sulit.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
