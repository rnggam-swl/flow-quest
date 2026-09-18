export const QUEST1_SCENARIO =
  "Rani membuka aplikasi sekolah karena ingin bergabung dengan Klub Fotografi. Ia perlu memasukkan Nomor Induk Siswa untuk bisa mendaftar.";

export const QUEST1_QUESTION = "Apa tujuan sebenarnya dari pengguna ini?";

export const QUEST1_OPTIONS = [
  { text: "Melihat informasi tentang Klub Fotografi", correct: false },
  { text: "Berhasil mendaftar menjadi anggota Klub Fotografi", correct: true },
  { text: "Memasukkan Nomor Induk Siswa dengan benar", correct: false },
  { text: "Membuka aplikasi sekolah", correct: false },
] as const;

export const QUEST1_FEEDBACK = {
  correct:
    "<b>Tepat!</b> Tujuan Rani bukan sekadar melihat info atau mengisi form — dia ingin transaksinya (pendaftaran) benar-benar berhasil. Semua langkah di flow nanti harus mengarah ke situ.",
  incorrect:
    "<b>Belum tepat, tapi dekat.</b> Yang kamu pilih itu salah satu <i>langkah</i> menuju tujuan, bukan tujuan akhirnya. Tujuan sebenarnya Rani adalah <b>berhasil mendaftar</b> — semua langkah lain cuma cara menuju ke sana.",
};
