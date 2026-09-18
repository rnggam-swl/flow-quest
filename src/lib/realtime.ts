import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let serverClient: SupabaseClient | null = null;
if (url && anonKey) {
  serverClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export const ADMIN_ACTIVITY_CHANNEL = "admin-activity";

/**
 * Best-effort broadcast to the admin live activity feed. No-ops (and the
 * admin dashboard falls back to polling) when Supabase Realtime credentials
 * haven't been configured yet.
 */
export async function broadcastActivity(payload: Record<string, unknown>) {
  if (!serverClient) return;
  try {
    const channel = serverClient.channel(ADMIN_ACTIVITY_CHANNEL);
    await channel.send({
      type: "broadcast",
      event: "activity",
      payload,
    });
  } catch {
    // Realtime is a nice-to-have for the live feed; never fail the request over it.
  }
}

export const isRealtimeConfigured = Boolean(url && anonKey);
