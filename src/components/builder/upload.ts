import { createClient } from "@supabase/supabase-js";
import type { UploadResult } from "./fields";

/**
 * Uploads one file for the builder: asks the server for a signed upload URL
 * (admins only), then sends the file straight to Supabase Storage with it.
 * Loaded on demand, so the Storage client only ships to admins who upload.
 */
export async function uploadMedia(caseKey: string, file: File): Promise<UploadResult> {
  const signRes = await fetch("/api/admin/media/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseKey, contentType: file.type, size: file.size }),
  }).catch(() => null);
  if (!signRes) return { ok: false, error: "Gagal terhubung ke server." };
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok) return { ok: false, error: sign.error ?? "Upload ditolak." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, error: "Supabase belum dikonfigurasi di aplikasi ini." };
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
  if (error) return { ok: false, error: `Upload gagal: ${error.message}` };
  return { ok: true, url: sign.publicUrl };
}
