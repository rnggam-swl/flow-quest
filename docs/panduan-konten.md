# Panduan Konten: Format JSON Kasus

Referensi untuk menulis konten sebagai file JSON, oleh orang maupun oleh Claude. Penulis yang
memakai builder cukup membaca panduan di app (`/admin/konten/panduan`). Keduanya menghasilkan
bentuk yang sama dan melewati pemeriksaan yang sama (`caseContentSchema` dan `findCaseProblems`
di `src/lib/content/case.ts`).

Contoh lengkap: `prisma/cases/ruang-belajar.json` (kecil, memakai semua tipe soal) dan
`prisma/cases/klub-fotografi.json` (workshop asli).

## Alur kerja

1. Tulis atau ubah file kasus di `prisma/cases/<kunci>.json`.
2. Periksa: `npx tsx --env-file=.env prisma/import-case.ts prisma/cases/<kunci>.json --dry-run`.
   Kalau ada masalah, semuanya dicetak dan tidak ada yang ditulis.
3. Pilih salah satu:
   - Impor sebagai versi baru dengan perintah yang sama tanpa `--dry-run`.
   - Impor sebagai draf dari `/admin/konten` → *Impor kasus (JSON)*, lalu periksa dan publish dari builder.
4. Session yang sudah berjalan tetap memakai versinya. Session yang belum dimulai bisa dipindah
   dengan *Perbarui* di `/admin/konten`.

Quest, modul, dan rencana peserta juga bisa diekspor/impor satu per satu dari builder. File ekspor
dibungkus `{ "format": "flow-quest", "kind": "case" | "quest" | "module" | "plan", "data": … }`.
File tanpa pembungkus juga diterima.

## Kasus

```jsonc
{
  "key": "ruang-belajar",            // huruf kecil, angka, -; tidak bisa diubah setelah dibuat
  "title": "Pemesanan Ruang Belajar Perpustakaan",
  "description": "Cerita yang dibaca peserta.",
  "persona": "Dimas, siswa kelas 11",   // opsional
  "userGoal": "Punya ruang terpesan",   // opsional
  "brief": "Markdown di atas daftar quest",  // opsional
  "nodes": [ … ],                    // kamus node, lihat di bawah
  "quests": [ … ],                   // urutan 1..n tanpa lompatan
  "modules": [ … ],                  // Modul Latihan, boleh kosong
  "practiceClosing": { … }           // opsional: checklist penutup halaman latihan
}
```

Teks berformat ditulis dalam **markdown terbatas**: paragraf, daftar `-`/`1.`, `**tebal**`, dan
`*miring*`. HTML ditolak.

## Kamus node

```json
{ "key": "cekslot", "label": "Slot tersedia?", "nodeType": "DECISION", "icon": "❓" }
```

- `nodeType`: `START`, `ACTION`, `SCREEN`, `SYSTEM`, `DECISION`, `OUTCOME`, atau `ERROR`.
- **Label harus unik**, karena flow peserta disimpan per label.
- Kunci yang dipakai di Modul Latihan (fixer, diagram) hanya boleh huruf kecil dan angka, tanpa `_`.

## Quest

```jsonc
{
  "order": 1,
  "title": "Kenali Dimas",
  "objective": "Tujuan quest",
  "xp": 30,                          // XP saat quest selesai
  "timeLimitMinutes": 10,            // null = tanpa timer (admin bisa mengubah per session)
  "intro": "Markdown pembuka",       // opsional
  "checkMode": "end",                // "end" = dicek setelah kirim; "instant" = per soal
  "rewards": { "questionXp": 10, "comboBonus": 5, "reactions": true },  // opsional (gamifikasi)
  "questions": [ … ]                 // soal quiz, lalu paling banyak satu soal flow
}
```

**Gamifikasi (`rewards`)**:
- `questionXp` diberikan untuk setiap soal quiz yang benar penuh. Jawaban sebagian benar
  mendapat bagiannya, dibulatkan ke bawah.
- `comboBonus` diberikan untuk jawaban benar beruntun: ×1 di jawaban ke-2, ×2 di ke-3, sampai ×4.
- `reactions` menampilkan reaksi setelah setiap jawaban. Reaksi hanya tampil di `checkMode: "instant"`.

Tanpa `rewards`, quest hanya memberi `xp`. Quest yang hanya berisi soal flow tidak boleh memakai
`rewards`.

## Soal

Semua soal punya `id` (unik dalam quest), `type`, dan `prompt`, serta opsional `help`, `media`
(`[{ "kind": "image" | "audio", "url": "…", "alt": "…" }]`), dan `feedback`
(`{ "correct": md, "incorrect": md }`).

| type | Isian kunci jawaban |
|---|---|
| `singlechoice` | `options: [{ text, correct?, feedback? }]`, tepat satu `correct` |
| `multiselect` | `options` dengan satu atau lebih `correct` |
| `boolean` | `answer: true \| false` |
| `number` | `answer`, `tolerance`, `unit?` |
| `range` | `min`, `max`, `step`, `answer`, `tolerance` |
| `matching` | `items: [{ label, pairs: [{ text }] }]` |
| `grouping` | `groups: [nama]`, `items: [{ text, group: indeks }]` |
| `wordblank` | `answerText`, `blankMode: "letter" \| "word"`, `blanks: [indeks]`, `hint?` |
| `sequencing` | `items` dalam urutan yang benar (peserta melihatnya diacak) |
| `oddoneout` | `items`, `odd: indeks` |
| `hotspot` | `image`, `spots: [{ x, y, radius, label? }]` (persen) |
| `branching` | `start`, `nodes: [{ id, text, x, y, ending?, endingLabel?, choices: [{ text, target, correct? }] }]` |
| `flow` | `palette: [kunci node]`, `rubric`, `answerKey?`, `reflection?` |

Contoh setiap tipe ada di Quest 1 dan 3 `ruang-belajar.json`.

## Rubrik flow

Skor flow dihitung dari **kondisi atas graf**. Node dirujuk lewat kuncinya di kamus.

```jsonc
"rubric": {
  "checks": { "hasBeranda": { "label": "Ada Beranda", "when": { "has": "beranda" } } },
  "scores": {                        // kategori tetap: goal, flow, logic, constraint, edgeCase, simplicity
    "goal": { "max": 20, "cases": [{ "when": { "check": "hasBeranda" }, "points": 20 }], "otherwise": 0 },
    "simplicity": { "max": 10, "orphans": { "floor": 0 } }   // -1 per node yang tidak tersambung
  },
  "tiers": [{ "when": { … }, "tier": "great", "message": "…" }],   // aturan pertama yang cocok menang
  "otherwise": { "tier": "needs-work", "message": "…" },
  "notes": [{ "when": { … }, "message": "ditambahkan ke pesan" }]
}
```

Kondisi yang tersedia:
- **Primitif:**
  - `{ "has": k }`
  - `{ "reach": { "from", "to", "skipRecovery?", "avoid?" } }`
  - `{ "branch": { "from", "side": "YES" | "NO", "reaches" } }`
  - `{ "edge": { "from?", "to?", "kind?" } }`
  - `{ "terminal": k }`
  - `{ "twoSides": k }`
  - `{ "failBranch": k }`
  - `{ "connected": true }`
  - `{ "check": nama }`
- **Penggabung:** `all`, `any`, `not`, dan `{ "atLeast": n, "of": [...] }`.

Cara termudah membuat rubrik adalah menggambar `answerKey` di builder lalu klik *Usulkan rubrik*.
Kunci jawaban harus mendapat nilai penuh.

## Modul Latihan

```jsonc
{ "key": "A", "title": "…", "time": "15 menit", "color": "#0f9d8a", "tagline": "…",
  "coba": [widget], "penjelasan": [widget], "latihan": [widget, …] }   // latihan minimal satu widget
```

Tipe widget:
- `text` (`md`)
- `rule` (`text`)
- `flows` (`items: [{ title?, flow: { start, nodes?, edges } }]`)
- `mcq` (`q`, `options: [{ t, ok?, fb }]`)
- `poll` (`q`, `options`, `note`)
- `write` (`q`, `placeholder?`, `note?`); tidak boleh di Penjelasan
- `goalpick` (`scenarios: [{ text, items, goal, why }]`)
- `decisions` (`items: [{ q, options, ya, tidak, note }]`)
- `spot` (`q`, `statements: [{ t, bad }]`, `note`)
- `selfcheck` (`items`)
- `planner` (`checkOptions`, `goOptions`, `rows: [{ problem, check, go, why }]`)
- `fixer`

**Fixer**:
- `nodes` dan `start` menentukan kanvas.
- `initial` adalah panah yang menyala saat dibuka; `extra` adalah panah yang bisa dinyalakan.
- `solution` adalah contoh jawaban dan harus memenuhi semua `rules`.
- `initial` sendiri tidak boleh sudah memenuhi semuanya.
- Panah ditulis `"a>b"`, dengan akhiran `:Y` (cabang Ya), `:N` (cabang Tidak), atau `:R` (jalan kembali).
- Aturan yang tersedia:
  - `connected`
  - `reach:X`
  - `terminal:X`
  - `before:A:B`
  - `branch:X`
  - `twoSides:X`
  - `recovery:A:B`
  - `not:<panah>`

## Rencana peserta

Rencana dibuat di editor rencana (`/admin/latihan` → *Buat/Edit rencana*). Formatnya
`practicePlanContentSchema` di `src/lib/practice/schema.ts`: `first?`, `strengths`, `intro`,
`modules` (kunci modul berurutan), dan `main?` (`title`, `intro`, `steps?`, `widgets`, `extra?`).
Contohnya ada di `prisma/practice-plans/example.json`.
