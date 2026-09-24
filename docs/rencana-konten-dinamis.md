# Rencana: Konten Dinamis (Kasus, Quest, Soal, Modul Latihan)

Dokumen acuan untuk mengubah semua konten yang dilihat peserta menjadi data yang bisa dibuat dan
diedit, bukan kode. Perbarui status di bagian bawah setiap kali satu langkah selesai.

## Tujuan

- **Kasus** (studi kasus seperti "Pendaftaran Klub Fotografi") sepenuhnya dinamis: cerita, persona,
  tujuan pengguna, dan kamus node yang tersedia.
- **Quest dan soal** dinamis: jumlah soal, jenis soal, isi soal, kunci jawaban (termasuk kunci
  jawaban flow), XP, dan timer.
- **Modul latihan** dinamis: modul, tahap Coba/Penjelasan/Latihan, widget, dan rencana per peserta.
- Konten dibuat oleh pemilik proyek (lewat editor) dan oleh Claude (lewat file JSON). Keduanya
  melewati validator yang sama.
- Komponen builder soal diambil dari prototipe `formulir-builder-quiz-mode.html`.

## Keputusan desain (disetujui)

1. **Satu quest boleh berisi banyak soal campuran** (quiz dan flow), dengan maksimal **satu soal
   flow per quest** di versi pertama. Alasannya, `FlowSubmission` unik per (tim, quest). Batasan
   ini bisa dibuka nanti dengan menambah kunci soal di `FlowSubmission`.
2. **Kategori rubrik flow tetap enam** (Goal, Flow, Logic, Constraint, Edge Case, Simplicity)
   ditambah Rationale. Aturan dan poinnya dinamis, kategorinya tetap, supaya skor lama dan baru
   sebanding dan tabel `Score` tidak berubah.
3. **Tampilan builder** mengikuti gaya terang prototipe HTML, di-scope dengan CSS Module seperti
   Modul Latihan. Preview memakai komponen peserta yang asli.
4. **Media** (gambar/audio, termasuk gambar hotspot) disimpan di Supabase Storage.

## Konsep

- **Kasus** berisi cerita, persona, tujuan pengguna, dan **kamus node** (kunci, label, jenis, ikon).
  Quest dan modul latihan dalam kasus itu memakai kamus yang sama.
- **Quest** adalah urutan soal dalam satu kasus, dengan XP, timer, dan mode cek (langsung atau di
  akhir).
- **Tipe soal (13):**
  - 12 tipe quiz dari prototipe: pilihan tunggal, pilihan ganda, ya/tidak, angka, slider,
    matching, grouping, isian per huruf/kata, urutan, odd one out, hotspot gambar, branching story.
    Tipe yang di prototipe belum punya kunci jawaban (pilihan tunggal/ganda, ya/tidak, angka,
    slider) dilengkapi kunci jawaban dan feedback per opsi.
  - Soal flow: peserta menyusun flow di kanvas, lalu dinilai dengan **rubrik berbasis aturan**.
- **Rubrik flow** adalah data, bukan kode. Setiap kategori punya daftar kasus "jika kondisi X maka
  N poin" yang dicek berurutan. Kondisi dibangun dari primitif seperti node ada, jalur A→B, cabang
  Ya/Tidak dari node keputusan, sambungan langsung, node tanpa panah keluar, dan jumlah node yang
  melayang, digabung dengan dan/atau/bukan/minimal-N. Tier dan pesan feedback juga berupa aturan
  berurutan.
- **Modul latihan** memakai komponen soal yang sama, ditambah widget belajar (teks, poll, tulisan,
  self-check, diagram, fixer). Teks penjelasan disimpan sebagai markdown terbatas, bukan HTML.
- **Versi konten di-pin per session.** Mengedit quest tidak mengubah session yang sudah berjalan.
  Sekarang timer quest berlaku untuk semua session sekaligus.

## Fase

### Fase 1: Fondasi bersama (tanpa perubahan tampilan)

- **1a. Rubrik flow sebagai data.** Evaluator kondisi dan rubrik. Penilaian Quest 2–5 ditulis ulang
  sebagai data. Diuji terhadap fungsi penilaian lama (graf acak) dan terhadap semua submission yang
  sudah dinilai di DB. Skor harus sama persis.
- **1b. Skema konten.** Skema zod untuk kasus, quest, 13 tipe soal beserta kunci jawaban dan
  penilaiannya, dan modul. Klub Fotografi ditulis sebagai file kasus JSON pertama.
- **1c. Tabel DB.** Konten kasus dan quest, versi konten yang di-pin per session, dan jawaban soal
  non-flow. Jawaban Quest 1 lama (tersimpan di ActivityLog) dipindahkan ke tabel baru. Perubahan
  hanya menambah, dan dikonfirmasi sebelum dijalankan ke DB live.
- **Selesai jika:** semua test lulus, skor identik, dan app berjalan seperti sekarang.

### Fase 2: Semua yang dilihat peserta dibaca dari DB

- Satu route `/quest/[order]` merender soal apa pun sesuai konfigurasinya. Komponen 12 tipe quiz
  di-port dari preview prototipe ke React dengan tema gelap app. Soal flow memakai
  `FlowBuilderCanvas` dan rubrik dari data.
- Halaman hasil, daftar quest di `/brief`, laporan admin, dan CSV export menyesuaikan tipe soal.
- Modul latihan dan kamus node pindah dari `src/lib/practice/content.ts` ke DB. HTML penjelasan
  diubah ke markdown terbatas.
- Session memilih kasus. Konstanta `SCENARIO_TITLE` dihapus.
- **Selesai jika:** Klub Fotografi dan 6 modul berjalan dari data dengan tampilan identik, dan kasus
  kedua bisa dimainkan hanya dengan mengimpor JSON.

Sub-langkah:

- **2a. Data.** Kolom override timer per session (`SessionQuest.timeLimitMinutes`), sehingga timer
  tidak lagi berlaku untuk semua session sekaligus. Field konten baru: teks brief per kasus, dan
  refleksi wajib/opsional. Klub Fotografi diimpor sebagai versi 2, lalu keempat session dipindah
  ke versi 2 karena bedanya hanya teks tambahan.
- **2b. Lapisan konten & progres.** Baca konten dari versi yang di-pin. Progres quest dibaca dari
  `QuestAttempt`. Penilaian soal selalu di server. Soal dikirim ke browser tanpa kunci jawaban,
  dan urutan acak (urutan, matching) di-seed per attempt supaya kunci tidak terlihat di payload.
- **2c. Player quiz.** Route `/quest/[order]`, 12 komponen soal, mode cek langsung/di akhir, dan
  halaman hasil per soal.
- **2d. Soal flow.** `FlowBuilderCanvas` dan submit memakai rubrik dari data. Hasil Quest 2 dan
  Quest 3–5 disatukan dalam satu halaman.
- **2e. Brief & admin.** Daftar quest, pembuatan session (pilih kasus), timer per session, laporan,
  CSV, dan export HTML mengikuti tipe soal.
- **2f. Modul latihan dari data.** Modul, kamus node, dan label aturan fixer diambil dari kasus.
  Teks dirender dari markdown tanpa `dangerouslySetInnerHTML`.
- **2g. Bersih-bersih.** Hapus konten hardcoded, penilaian lama, dan halaman `/quest/1..5`. Seed
  memakai file kasus. Tambahkan kasus kedua sebagai contoh.

### Fase 3: Builder soal

- Kerangka builder di admin mengikuti prototipe: daftar soal (drag untuk mengurutkan, duplikat,
  hapus), editor di tengah, panel tipe dan pengaturan di kanan, Build/Preview/Play, dan validasi
  sebelum publish.
- Editor untuk 12 tipe quiz, dan editor soal flow. Alurnya: gambar kunci jawaban di kanvas, sistem
  mengusulkan aturan dan poin, lalu panel "uji kunci" menilai flow contoh.
- Upload gambar dan audio ke Supabase Storage.

Sub-langkah:

- **3a. Draf & publish.** Draf per kasus disimpan sebagai `ScenarioVersion` versi 0 berstatus DRAFT,
  jadi skema DB tidak berubah. Menyimpan draf menerima isi yang belum lengkap dan mengembalikan
  daftar masalahnya. Publish hanya jika lolos `parseCase`, lalu draf menjadi versi baru. Session
  yang sudah ada tetap di versinya. `import-case.ts` membandingkan dengan versi published terakhir.
- **3b. Kerangka builder.** Halaman `/admin/konten` (daftar kasus, versi, draf) dan builder layar
  penuh `/builder/[kasus]/[quest]` bergaya prototipe:
  - daftar soal (tambah per tipe, drag, duplikat, hapus);
  - editor di tengah;
  - panel kanan (Soal / Quest);
  - Simpan, Publish, dan daftar masalah yang bisa diklik.
- **3c. Editor 12 tipe quiz**, termasuk kunci jawaban, feedback per opsi, dan feedback benar/salah.
- **3d. Preview & Play.** Preview satu soal dan main seluruh quest memakai komponen peserta
  (`QuizPlayer`, kanvas flow) dengan penilaian lokal, tanpa menulis progres apa pun.
- **3e. Editor soal flow.**
  - Palet dan kanvas kunci jawaban.
  - Usulan rubrik dari kunci.
  - Edit label, poin, dan pesan tier (plus JSON untuk aturan lanjutan).
  - Panel "uji kunci" yang menilai flow contoh secara langsung.
- **3f. Media.** Upload gambar/audio ke Supabase Storage lewat signed upload URL (butuh
  `SUPABASE_SERVICE_ROLE_KEY` di env), dengan isian URL sebagai cadangan.

### Fase 4: Editor kasus, quest, modul, dan rencana peserta

- Editor kasus (cerita, persona, kamus node), quest (urutan soal, XP, timer, mode cek), dan modul
  (tahap Coba/Penjelasan/Latihan), semuanya memakai builder dari Fase 3.
- Status draft/publish, duplikasi kasus atau quest, dan penguncian versi saat session aktif.
- Editor rencana peserta menggantikan impor JSON, termasuk tombol "buat latihan utama dari jawaban
  Quest X" yang menyalin flow peserta dan menandai aturan yang belum terpenuhi.
- Ekspor/impor JSON untuk kasus, quest, dan modul.

### Fase 5: Penyempurnaan (opsional)

- Gamifikasi dari prototipe (XP per soal, combo, reaksi), analitik per soal, dan panduan membuat
  konten.

## Catatan teknis

- Penilaian lama (`src/lib/flowScoring.ts`) menelusuri jalur **termasuk jalur pemulihan**, sedangkan
  mesin Modul Latihan (`src/lib/practice/flowRules.ts`) **mengabaikannya**. Primitif jalur di rubrik
  baru punya opsi eksplisit untuk ini, supaya kedua perilaku bisa direproduksi.
- Penilaian lama mengenali node dari labelnya, dan satu label bisa muncul lebih dari sekali dalam
  satu flow. Rubrik baru mereferensikan kunci node di kamus kasus. Label dipetakan ke kunci, dan
  label harus unik dalam satu kamus.
- Halaman hasil sekarang menebak tier dari angka skor yang tersimpan (`deriveTierFromScores`,
  `deriveGenericTier`). Dengan rubrik dinamis, tier dihitung ulang dari graf submission memakai
  versi konten yang di-pin.
- Data baseline saat rencana dibuat: 51 submission flow yang sudah dinilai (50 di Klub Fotografi, 1 di data
  demo lama "Meeting Room Booking"), dan 17 jawaban Quest 1.

## Status

- [x] Rencana disetujui
- [x] 1a. Rubrik flow sebagai data
  - Evaluator: `src/lib/content/rubric.ts`. Rubrik Quest 2–5: `prisma/cases/klub-fotografi.json`.
  - Uji: `src/lib/content/rubric.test.ts` (4.000 flow acak per quest identik dengan penilaian lama di
    semua tier, dan aturan fixer Modul Latihan identik dengan `flowRules.ts`).
  - Data nyata: `prisma/verify-rubrics.ts`. Ke-50 submission Klub Fotografi cocok persis dengan skor
    tersimpan.
  - Penilaian lama belum diganti. Penggantiannya dilakukan di Fase 2, saat quest dibaca dari DB.
- [x] 1b. Skema konten
  - Skema: `src/lib/content/case.ts` (kasus, quest, modul), `questions.ts` (13 tipe soal, jawaban,
    penilaian), `markdown.ts` (format teks yang aman). Uji: `case.test.ts`.
  - `prisma/cases/klub-fotografi.json` lengkap: 14 node, 5 quest (meta sesuai nilai live, termasuk
    timer yang sudah diubah admin), dan 6 modul. Quest 1 dan keenam modul terbukti identik dengan
    versi hardcoded, dengan HTML diubah ke markdown.
- [x] 1c. Tabel DB
  - Baru: `ScenarioVersion`, `QuestAttempt`, `QuestionResponse`, enum `ContentStatus`, serta
    kolom `Scenario.key` dan `Session.scenarioVersionId`. Semua RLS aktif. Hanya menambah.
  - `prisma/import-case.ts`: impor file kasus menjadi versi baru hanya jika isinya berubah.
    Klub Fotografi sudah diimpor sebagai versi 1.
  - `prisma/backfill-attempts.ts`: 4 session Klub Fotografi di-pin ke versi 1; 67 attempt
    (52 flow, 15 Quest 1) dan 15 jawaban Quest 1. Satu log Quest 1 dari akun yang sudah dihapus
    dilewati.
  - **Jalankan ulang `backfill-attempts.ts` tepat sebelum cutover di Fase 2**, karena app masih
    menulis progres ke tempat lama sampai saat itu.
- [x] Fase 2 (kode selesai; tiga langkah DB di bawah menunggu persetujuan)
  - 2a. `SessionQuest.timeLimitMinutes` (null = ikut konten, 0 = tanpa timer) sudah di DB live.
    Klub Fotografi versi 2 (brief + refleksi) diimpor, dan keempat session dipindah ke versi 2.
  - 2b. `src/lib/content/sessionContent.ts` (konten versi yang di-pin), `src/lib/questPlay.ts`
    (attempt, timer, XP sekali saja, penutupan quest), `publicQuestion.ts` (soal tanpa kunci
    jawaban, acakan di-seed per attempt, penilaian di server).
  - 2c. `/quest/[order]` + `src/components/quiz/` (12 input, mode cek langsung/di akhir),
    `/result/[order]` dengan review per soal. Diuji di browser untuk semua tipe dan kedua mode.
  - 2d. `FlowBuilderCanvas` menerima rubrik dan kamus dari konten, dan timer boleh kosong. Hasil
    flow semua quest memakai satu halaman (`FlowResultClient`).
  - 2e. `/brief` (brief dari kasus), pembuatan session memilih kasus dan mem-pin versi terbarunya,
    timer per session, laporan admin, export HTML, dan kolom CSV mengikuti soal di konten.
  - 2f. Modul, kamus node, dan penutup halaman (`practiceClosing`) diambil dari kasus. Markdown
    dirender tanpa `dangerouslySetInnerHTML`.
  - 2g. Konten dan penilaian lama dihapus (`quest2.ts`, `quest1Content.ts`, `practice/content.ts`,
    `constants.ts`, `/quest/1..5`). Seed mengimpor file kasus. Kasus kedua:
    `prisma/cases/ruang-belajar.json` (3 quest, 13 tipe soal, 1 modul), dengan uji
    `ruangBelajar.test.ts`.
  - Menunggu persetujuan (menulis ke DB live):
    1. Impor Klub Fotografi versi 3 (`practiceClosing`) dengan `--move-sessions`, karena bedanya
       hanya teks tampilan. Tanpa ini, penutup Modul Latihan tidak tampil untuk session lama.
    2. Impor `ruang-belajar.json` sebagai kasus kedua.
    3. Setelah deploy, jalankan ulang `backfill-attempts.ts` untuk progres yang ditulis app lama.
- [x] Fase 3 (kode selesai; upload menunggu `SUPABASE_SERVICE_ROLE_KEY`)
  - 3a. `src/lib/content/drafts.ts` + `/api/admin/content/[caseKey]/draft|publish`:
    - draf = versi 0 berstatus DRAFT;
    - simpan dijaga revisi (409 kalau diubah di tab lain);
    - publish ditolak (422) selama masih ada masalah;
    - opsi memindahkan session yang belum ada progres.
    `draftProblems.ts` menerjemahkan error skema ke "quest N, soal X: …".
    Diuji ke DB live lewat simpan → gagal publish → buang draf (tidak ada versi baru).
  - 3b. `/admin/konten` (daftar kasus, versi, draf) dan `/builder/[caseKey]?quest=N`
    (`src/components/builder/`, tema terang di `builder.module.css`).
  - 3c. `QuizEditors.tsx` dan `BranchingEditor.tsx`: 12 tipe, termasuk feedback per opsi dan
    kanvas cerita. `builderDefaults.ts` untuk soal baru, ganti tipe, dan duplikat.
  - 3d. `PlayPane.tsx`:
    - `QuizPlayer` punya `transport` (penilaian di browser);
    - `FlowBuilderCanvas` punya `persistence` (`localPersistence`) dan mode `sandbox`,
      sehingga tidak ada log fokus dan tidak ada yang tersimpan.
  - 3e. `FlowQuestionEditor.tsx`:
    - palet dan kanvas kunci (`answerKey`, tidak pernah dikirim ke peserta);
    - `rubricSuggest.ts`: kunci selalu 100 dan tier great, total 100, kategori kosong
      bobotnya dibagi;
    - panel rubrik (`rubricDescribe.ts`) dan panel uji.
    Kunci yang tidak mendapat nilai penuh jadi masalah publish.
  - 3f. `src/lib/mediaStorage.ts` + `/api/admin/media/sign` + `builder/upload.ts`:
    - signed upload URL ke bucket publik `content-media`;
    - PNG/JPG/WebP/GIF maks 8 MB, audio maks 15 MB.
    Tanpa kunci service role, builder memakai isian URL.
  - Uji: `builder.test.ts`, `rubricSuggest.test.ts` (total 112 test). Builder diperiksa di
    browser lewat halaman sementara tanpa login (sudah dihapus): semua editor, usulan rubrik,
    uji, Preview, Play quiz → flow → hasil, dan penolakan simpan tanpa login.
- [ ] Fase 4
- [ ] Fase 5
