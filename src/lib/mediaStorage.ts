import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Images and audio for questions live in Supabase Storage, in one public
 * bucket. The browser uploads straight to Storage with a signed upload URL
 * this server issues to admins only — files never pass through the app
 * server (so no request-size limits), and nobody can upload without one.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (server-only; never NEXT_PUBLIC_) next to
 * NEXT_PUBLIC_SUPABASE_URL. Without it the builder falls back to media URLs.
 */

export const MEDIA_BUCKET = "content-media";

const LIMITS: Record<string, number> = {
  "image/png": 8,
  "image/jpeg": 8,
  "image/webp": 8,
  "image/gif": 8,
  "audio/mpeg": 15,
  "audio/wav": 15,
  "audio/x-wav": 15,
  "audio/ogg": 15,
  "audio/mp4": 15,
  "audio/x-m4a": 15,
  "audio/webm": 15,
};
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
};

export function mediaUploadConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let admin: SupabaseClient | null = null;
function storageAdmin() {
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

let bucketReady = false;
async function ensureBucket(client: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await client.storage.getBucket(MEDIA_BUCKET);
  if (!data) {
    const { error } = await client.storage.createBucket(MEDIA_BUCKET, { public: true, fileSizeLimit: 15 * 1024 * 1024, allowedMimeTypes: Object.keys(LIMITS) });
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  }
  bucketReady = true;
}

export type SignResult =
  | { ok: true; bucket: string; path: string; token: string; publicUrl: string }
  | { ok: false; status: number; error: string };

export async function signMediaUpload(params: { caseKey: string; contentType: string; size: number }): Promise<SignResult> {
  if (!mediaUploadConfigured()) return { ok: false, status: 501, error: "Upload belum dikonfigurasi di server ini (SUPABASE_SERVICE_ROLE_KEY belum diisi)." };
  const limitMb = LIMITS[params.contentType];
  if (!limitMb) return { ok: false, status: 415, error: "Format tidak didukung. Pakai PNG, JPG, WebP, GIF, MP3, WAV, OGG, M4A, atau WebM." };
  if (params.size > limitMb * 1024 * 1024) return { ok: false, status: 413, error: `Ukuran maksimal ${limitMb} MB.` };

  const client = storageAdmin();
  await ensureBucket(client);
  const path = `cases/${params.caseKey}/${crypto.randomUUID()}.${EXT[params.contentType]}`;
  const { data, error } = await client.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, status: 502, error: error?.message ?? "Gagal menyiapkan upload" };
  const publicUrl = client.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  return { ok: true, bucket: MEDIA_BUCKET, path: data.path, token: data.token, publicUrl };
}
