/**
 * A short login password for a participant: 8 characters with look-alikes
 * (0/o, 1/l/i) left out, from the platform's CSPRNG. Shared by the admin's
 * participant form (browser) and the password reset route (server).
 */
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomPassword(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
}
