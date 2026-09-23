import type { ModuleKey, PracticeModule } from "@/lib/practice/schema";

/**
 * Shared content library for Modul Latihan Flow: the node dictionary and the
 * six core modules. Participants' personal data never lives here — it's in
 * each participant's PracticePlan row.
 *
 * Edge format: "from>to" or "from>to:K", where K is empty for a normal step,
 * Y for the Ya branch, N for the Tidak branch, and R for a recovery path.
 *
 * "text" widgets render their html as-is, so they belong here (trusted,
 * code-reviewed content) and nowhere else.
 */

export type PracticeNodeType = "screen" | "system" | "decision" | "outcome" | "error";

export interface PracticeNodeDef {
  label: string;
  type: PracticeNodeType;
}

export const NODES: Record<string, PracticeNodeDef> = {
  home:         { label: "Home",               type: "screen" },
  clublist:     { label: "Club List",          type: "screen" },
  clubdetail:   { label: "Club Detail",        type: "screen" },
  regform:      { label: "Registration Form",  type: "screen" },
  confirmation: { label: "Confirmation",       type: "system" },
  verif:        { label: "Verifikasi NIS",     type: "decision" },
  success:      { label: "Success",            type: "outcome" },
  error:        { label: "Error",              type: "error" },
  error1:       { label: "Error Konfirmasi",   type: "error" },
  error2:       { label: "Error NIS",          type: "error" },
  kuota:        { label: "Kuota tersedia?",    type: "decision" },
  kuotapenuh:   { label: "Kuota Penuh",        type: "error" },
  terdaftar:    { label: "Sudah terdaftar?",   type: "decision" },
  status:       { label: "Status Keanggotaan", type: "outcome" },
};

export const MODULES: Record<ModuleKey, PracticeModule> = {
  /* ═══════════════════════════════ A ═══════════════════════════════ */
  A: {
    title: "Tujuan vs Langkah", time: "15 menit", color: "#6D5BD0",
    tagline: "Sebelum menyusun flow, pastikan kamu tahu flow itu menuju ke mana.",
    coba: [
      { type: "mcq",
        q: "Dimas membuka aplikasi ojek online karena harus sampai di kampus sebelum jam 8 pagi. Apa tujuan Dimas yang sebenarnya?",
        options: [
          { t: "Membuka aplikasi ojek online", fb: "Itu langkah pertama. Setelah aplikasinya terbuka, apakah Dimas sudah sampai di kampus? Belum." },
          { t: "Memasukkan alamat kampus", fb: "Itu langkah. Setelah alamat dimasukkan, Dimas masih belum sampai." },
          { t: "Sampai di kampus sebelum jam 8 pagi", ok: true, fb: "Tepat. Ini alasan Dimas membuka aplikasi. Semua hal lain adalah langkah menuju ke sini." },
          { t: "Memilih metode pembayaran", fb: "Itu langkah menjelang akhir, tapi bukan alasan Dimas membuka aplikasi." },
        ] },
    ],
    penjelasan: [
      { type: "text", html: "<p><b>Tujuan</b> adalah keadaan akhir yang diinginkan pengguna, yaitu alasan kenapa dia membuka aplikasi. <b>Langkah</b> adalah hal-hal yang harus dilakukan untuk sampai ke tujuan itu.</p><p>Cara paling mudah membedakannya adalah dengan satu pertanyaan:</p>" },
      { type: "rule", text: "Kalau hal ini sudah selesai, apakah pengguna sudah puas dan bisa menutup aplikasi?" },
      { type: "text", html: "<p>Kalau jawabannya <i>belum</i>, itu masih langkah. Kalau jawabannya <i>sudah</i>, itu tujuannya.</p><p>Kembali ke kasus Rani di Quest 1. Setelah Rani memasukkan NIS dengan benar, apakah dia sudah puas? Belum, karena dia belum terdaftar di Klub Fotografi. Jadi memasukkan NIS adalah langkah, sedangkan tujuannya adalah <b>berhasil terdaftar</b>.</p><p>Ini penting karena tujuan menentukan di mana flow berakhir. Kalau tujuannya keliru, flow bisa berhenti di tempat yang salah.</p>" },
    ],
    latihan: [
      { type: "goalpick", intro: "Untuk setiap skenario, pilih mana yang merupakan tujuan pengguna.",
        scenarios: [
          { text: "Sinta memesan tiket bioskop lewat aplikasi untuk nonton bareng teman malam ini.",
            items: ["Memilih film", "Memilih kursi", "Punya tiket untuk film dan jam yang diinginkan", "Membayar tiket"], goal: 2,
            why: "Memilih film, memilih kursi, dan membayar adalah langkah. Sinta baru puas saat tiketnya sudah di tangan." },
          { text: "Budi mengumpulkan tugas PKL lewat Google Classroom sebelum batas waktu.",
            items: ["Membuka kelas", "Tugas terkumpul sebelum batas waktu", "Mengunggah file", "Menekan tombol Serahkan"], goal: 1,
            why: "Mengunggah file saja belum cukup. Budi baru tenang saat tugasnya tercatat terkumpul." },
          { text: "Rani mendaftar Klub Fotografi lewat aplikasi sekolah.",
            items: ["Memilih Klub Fotografi", "Memasukkan NIS dengan benar", "Berhasil terdaftar di Klub Fotografi", "Mengisi formulir"], goal: 2,
            why: "Memasukkan NIS dengan benar adalah langkah wajib, tapi setelah itu Rani belum terdaftar." },
        ] },
    ],
  },

  /* ═══════════════════════════════ B ═══════════════════════════════ */
  B: {
    title: "Success Adalah Titik Akhir", time: "15 menit", color: "#0F9D8A",
    tagline: "Success dan Error itu saudara, bukan kakak-adik.",
    coba: [
      { type: "flows", items: [
        { title: "Flow 1", flow: { start: "regform", edges: ["regform>confirmation", "confirmation>success", "success>error"] } },
        { title: "Flow 2", flow: { start: "regform", edges: ["regform>confirmation", "confirmation>success", "confirmation>error"] } },
      ] },
      { type: "mcq", q: "Mana flow yang masuk akal?",
        options: [
          { t: "Flow 1", fb: "Coba ikuti panahnya. Setelah Success, pengguna malah diarahkan ke Error. Masuk akal?" },
          { t: "Flow 2", ok: true, fb: "Tepat. Success dan Error sama-sama keluar dari Confirmation sebagai dua kemungkinan hasil." },
        ] },
    ],
    penjelasan: [
      { type: "text", html: "<p>Di Flow 1, pengguna sudah dinyatakan berhasil, lalu tiba-tiba mendapat Error. Rasanya seperti diberi ucapan selamat, lalu diberi tahu pendaftarannya gagal.</p><p>Ada tiga aturan sederhana:</p><ul><li><b>Success adalah titik akhir.</b> Setelah Success, flow selesai. Tidak boleh ada panah yang keluar dari Success.</li><li><b>Confirmation harus sebelum Success.</b> Sistem memeriksa dulu, baru menyatakan berhasil.</li><li><b>Error adalah cabang, bukan lanjutan.</b> Error keluar dari titik pemeriksaan yang sama dengan Success, sebagai kemungkinan yang lain.</li></ul>" },
      { type: "rule", text: "Success dan Error itu saudara: lahir dari titik pemeriksaan yang sama. Bukan kakak-adik yang berurutan." },
    ],
    latihan: [
      { type: "fixer", title: "Perbaiki flow a",
        intro: "Nyalakan dan matikan sambungan sampai semua aturan terpenuhi.",
        nodes: ["regform", "confirmation", "success", "error"], start: "regform",
        initial: ["regform>success", "success>confirmation", "confirmation>error"],
        extra: ["regform>confirmation", "confirmation>success", "success>error"],
        rules: ["connected", "reach:success", "before:confirmation:success", "terminal:success", "branch:error"],
        solution: ["regform>confirmation", "confirmation>success", "confirmation>error"] },
      { type: "fixer", title: "Perbaiki flow b",
        nodes: ["regform", "confirmation", "success", "error"], start: "regform",
        initial: ["regform>confirmation", "confirmation>success", "success>error"],
        extra: ["confirmation>error"],
        rules: ["terminal:success", "branch:error"],
        solution: ["regform>confirmation", "confirmation>success", "confirmation>error"],
        afterNote: "Kesalahan yang sama di flow a dan b: Success masih punya panah keluar, sehingga Error menjadi lanjutan dari Success, bukan cabang." },
    ],
  },

  /* ═══════════════════════════════ C ═══════════════════════════════ */
  C: {
    title: "Setiap Keputusan Punya Dua Sisi", time: "15 menit", color: "#6D5BD0",
    tagline: "Kalau ada pertanyaan, pasti ada lebih dari satu jawaban.",
    coba: [
      { type: "flows", items: [{ title: "Flow dengan satu cabang saja",
        flow: { start: "regform", nodes: ["regform", "verif", "success", "error"], edges: ["regform>verif", "verif>success:Y"] } }] },
      { type: "mcq", q: "Node Verifikasi NIS sebenarnya adalah pertanyaan \u201CApakah NIS terdaftar?\u201D. Di flow ini, apa yang dilihat pengguna yang NIS-nya salah?",
        options: [
          { t: "Layar Success", fb: "Kalau begitu, NIS yang salah justru dianggap berhasil." },
          { t: "Layar Error", fb: "Layar Error memang ada, tapi tidak ada satu panah pun yang menuju ke sana." },
          { t: "Tidak ada. Pengguna tersesat", ok: true, fb: "Tepat. Tanpa cabang Tidak, tidak ada layar yang menunggu pengguna." },
        ] },
    ],
    penjelasan: [
      { type: "text", html: "<p>Node keputusan (berbentuk diamond) selalu berupa pertanyaan yang jawabannya bisa berbeda-beda. Karena itu, node keputusan minimal punya dua cabang: <b>Ya</b> dan <b>Tidak</b>.</p><p>Kalau cabang Tidak tidak digambar, pengguna yang jawabannya Tidak akan tersesat. Di aplikasi nyata, ini bisa berarti layar kosong, loading tanpa akhir, atau pengguna keluar dari aplikasi.</p><p>Cara mengeceknya:</p><ul><li>Bacakan node keputusan sebagai pertanyaan.</li><li>Tanyakan: kalau jawabannya Ya, pengguna melihat layar apa?</li><li>Tanyakan lagi: kalau jawabannya Tidak, pengguna melihat layar apa?</li><li>Kalau salah satunya belum terjawab, flow belum lengkap.</li></ul>" },
    ],
    latihan: [
      { type: "decisions", intro: "Tentukan ke mana cabang Ya dan cabang Tidak pergi.",
        items: [
          { q: "Apakah kuota klub masih tersedia?",
            options: ["Registration Form", "Layar Kuota Penuh, lalu pilih klub lain", "Success", "Home"],
            ya: ["Registration Form"], tidak: ["Layar Kuota Penuh, lalu pilih klub lain"],
            note: "Kalau kuota tersedia, pengguna lanjut mengisi formulir. Kalau penuh, beri tahu dan arahkan untuk memilih klub lain." },
          { q: "Apakah pengguna sudah login?",
            options: ["Halaman yang dituju", "Halaman Login", "Error", "Home"],
            ya: ["Halaman yang dituju"], tidak: ["Halaman Login"],
            note: "Yang belum login diarahkan ke Login, lalu dikembalikan ke halaman yang tadi dituju." },
          { q: "Apakah pembayaran berhasil?",
            options: ["Success", "Error dengan pilihan coba lagi atau ganti metode", "Home", "Registration Form"],
            ya: ["Success"], tidak: ["Error dengan pilihan coba lagi atau ganti metode"],
            note: "Pembayaran gagal tetap butuh jalan keluar: coba lagi atau ganti metode pembayaran." },
        ] },
      { type: "fixer", title: "Lengkapi keputusan ini",
        nodes: ["regform", "verif", "success", "error"], start: "regform",
        initial: ["regform>verif", "verif>success:Y"],
        extra: ["verif>error:N", "success>error"],
        rules: ["connected", "twoSides:verif", "branch:error", "terminal:success"],
        solution: ["regform>verif", "verif>success:Y", "verif>error:N"] },
    ],
  },

  /* ═══════════════════════════════ D ═══════════════════════════════ */
  D: {
    title: "Setiap Gagal Butuh Jalan Kembali", time: "15 menit", color: "#C9821B",
    tagline: "Pertanyaan paling penting setelah Error: pengguna ke mana?",
    coba: [
      { type: "poll",
        q: "Kamu salah mengetik NIS, lalu muncul layar Error tanpa tombol apa pun. Apa yang paling mungkin kamu lakukan?",
        options: ["Menutup aplikasi", "Menekan tombol kembali dan berharap datanya masih ada", "Mengulang dari Home", "Menghubungi admin sekolah"],
        note: "Semua pilihan ini sama-sama merepotkan, dan sebagian besar orang memilih menutup aplikasi. Karena itu Error butuh jalan kembali yang jelas." },
    ],
    penjelasan: [
      { type: "text", html: "<p>Layar Error tanpa jalan keluar membuat pengguna terjebak. Kebanyakan akan menutup aplikasi, dan pendaftarannya tidak pernah selesai.</p><p>Karena itu, setiap Error butuh <b>jalur pemulihan</b>: jalan yang membawa pengguna kembali ke tempat dia bisa memperbaiki kesalahannya. Di kanvas, jalur ini digambar putus-putus berwarna emas.</p>" },
      { type: "flows", items: [{ title: "Contoh jalur pemulihan",
        flow: { start: "regform", edges: ["regform>verif", "verif>success:Y", "verif>error:N", "error>regform:R"] } }] },
      { type: "text", html: "<ul><li><b>Kembalikan ke tempat terdekat untuk memperbaiki.</b> Kalau NIS salah, kembali ke Registration Form, bukan ke Home, supaya pengguna tidak mengulang dari awal.</li><li><b>Jalur pemulihan hanya berguna kalau Error bisa dicapai.</b> Pastikan ada cabang gagal yang menuju Error terlebih dulu.</li></ul>" },
    ],
    latihan: [
      { type: "fixer", title: "Tambahkan jalan kembali",
        nodes: ["home", "regform", "confirmation", "success", "error"], start: "home",
        initial: ["home>regform", "regform>confirmation", "confirmation>success", "confirmation>error"],
        extra: ["error>home:R", "error>regform:R"],
        rules: ["recovery:error:regform", "not:error>home:R", "terminal:success", "branch:error"],
        solution: ["home>regform", "regform>confirmation", "confirmation>success", "confirmation>error", "error>regform:R"] },
      { type: "mcq", q: "Kenapa pengguna sebaiknya kembali ke Registration Form, bukan ke Home?",
        options: [
          { t: "Supaya pengguna bisa langsung memperbaiki data tanpa mengulang dari awal", ok: true, fb: "Tepat. Kembali ke Home berarti mengulang dari memilih klub, dan data yang sudah diisi kemungkinan besar hilang." },
          { t: "Karena Home sedang tidak bisa diakses", fb: "Home bisa diakses. Pertimbangannya ada pada seberapa jauh pengguna harus mengulang." },
          { t: "Karena Registration Form adalah halaman terpenting", fb: "Bukan soal penting atau tidak, tapi soal tempat terdekat untuk memperbaiki kesalahan." },
        ] },
    ],
  },

  /* ═══════════════════════════════ E ═══════════════════════════════ */
  E: {
    title: "Cek Sebelum Kirim", time: "10 menit", color: "#D4533E",
    tagline: "Lima pertanyaan, satu menit, flow yang jauh lebih rapi.",
    coba: [
      { type: "flows", items: [{ title: "Temukan masalahnya",
        flow: { start: "home", nodes: ["home", "clublist", "clubdetail", "regform", "confirmation", "success"],
          edges: ["home>clublist", "clublist>clubdetail", "clubdetail>confirmation", "confirmation>success"] } }] },
      { type: "spot", q: "Tandai semua masalah yang kamu temukan di flow ini.",
        statements: [
          { t: "Registration Form tidak tersambung, jadi pengguna melompati formulir", bad: true },
          { t: "Tidak ada cabang gagal dari Confirmation", bad: true },
          { t: "Success punya panah keluar", bad: false },
          { t: "Flow tidak dimulai dari Home", bad: false },
        ],
        note: "Dua masalah: Registration Form melayang sehingga pengguna langsung loncat ke Confirmation, dan tidak ada jalur untuk kemungkinan pendaftaran gagal." },
    ],
    penjelasan: [
      { type: "text", html: "<p>Kesalahan kecil seperti node yang lupa disambung bisa membuat flow yang sebenarnya benar menjadi tidak lengkap. Biasakan mengecek lima hal ini sebelum menekan Kirim:</p><ol><li>Semua node sudah tersambung, tidak ada yang melayang sendirian.</li><li>Flow dimulai dari titik masuk dan berakhir di Success.</li><li>Success tidak punya panah keluar.</li><li>Setiap node keputusan punya cabang Ya dan Tidak.</li><li>Setiap Error punya jalan kembali.</li></ol><p>Satu teknik tambahan: bacakan flow seperti cerita dari sudut pandang pengguna. \u201CRani membuka Home, lalu melihat daftar klub, lalu...\u201D Kalau ceritanya tiba-tiba loncat atau berhenti, di situ ada langkah yang hilang.</p>" },
    ],
    latihan: [
      { type: "selfcheck", intro: "Buka lagi flow kamu dari User Flow Quest dan cek satu per satu.",
        items: ["Semua node sudah tersambung", "Flow dimulai dari titik masuk dan berakhir di Success", "Success tidak punya panah keluar", "Setiap node keputusan punya cabang Ya dan Tidak", "Setiap Error punya jalan kembali"] },
      { type: "write", q: "Bacakan flow kamu sebagai cerita. Tulis bagian mana yang terasa loncat atau berhenti.",
        placeholder: "Rani membuka Home, lalu..." },
    ],
  },

  /* ═══════════════════════════════ F ═══════════════════════════════ */
  F: {
    title: "Lebih dari Satu Titik Gagal", time: "25 menit", color: "#6D5BD0",
    tagline: "Flow yang matang memikirkan semua cara sesuatu bisa gagal.",
    coba: [
      { type: "write", q: "Dalam proses pendaftaran klub, tulis sebanyak mungkin hal yang bisa membuat pendaftaran gagal. Targetkan minimal empat.",
        placeholder: "1. NIS salah ketik\n2. ...",
        note: "Beberapa contoh: NIS salah ketik, NIS sudah terdaftar di klub ini, kuota klub penuh, pendaftaran sudah ditutup, koneksi terputus saat mengirim formulir." },
    ],
    penjelasan: [
      { type: "text", html: "<p>Setiap titik gagal berbeda, dan tidak semuanya harus kembali ke tempat yang sama:</p><ul><li>NIS salah ketik: kembali ke Registration Form untuk diperbaiki.</li><li>NIS sudah terdaftar: tampilkan status keanggotaan, tidak perlu mengisi ulang.</li><li>Kuota klub penuh: kembali ke Club List untuk memilih klub lain.</li><li>Pendaftaran sudah ditutup: tampilkan jadwal pendaftaran berikutnya.</li></ul>" },
      { type: "rule", text: "Cek sedini mungkin. Kalau kuota sudah penuh, pengguna sebaiknya tahu di Club Detail, sebelum repot mengisi formulir." },
    ],
    latihan: [
      { type: "planner", intro: "Untuk setiap titik gagal, tentukan di mana dicek dan ke mana pengguna diarahkan.",
        checkOptions: ["Club List", "Club Detail", "Saat formulir dikirim"],
        goOptions: ["Registration Form", "Club List", "Status Keanggotaan", "Info jadwal berikutnya", "Home"],
        rows: [
          { problem: "NIS salah ketik", check: ["Saat formulir dikirim"], go: ["Registration Form"],
            why: "NIS baru diketahui salah saat formulir dikirim, dan pengguna perlu memperbaikinya di formulir." },
          { problem: "NIS sudah terdaftar di klub ini", check: ["Saat formulir dikirim", "Club Detail"], go: ["Status Keanggotaan"],
            why: "Tidak perlu mengisi ulang. Tunjukkan saja bahwa dia sudah terdaftar." },
          { problem: "Kuota klub penuh", check: ["Club List", "Club Detail"], go: ["Club List"],
            why: "Cek sebelum formulir supaya pengguna tidak buang waktu, lalu arahkan memilih klub lain." },
          { problem: "Pendaftaran sudah ditutup", check: ["Club List", "Club Detail"], go: ["Info jadwal berikutnya"],
            why: "Beri tahu sedini mungkin, lalu tunjukkan kapan pendaftaran dibuka lagi." },
        ] },
    ],
  },
};

export function nodeLabel(id: string): string {
  return NODES[id]?.label ?? id;
}

export function nodeType(id: string): PracticeNodeType | undefined {
  return NODES[id]?.type;
}
