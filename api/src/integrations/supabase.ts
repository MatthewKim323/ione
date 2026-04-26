import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

/**
 * Server-side Supabase client. Uses the service role key — bypasses RLS, so
 * NEVER expose the resulting client (or this module) to the browser.
 * Routes are responsible for re-applying ownership filters via auth.uid().
 */
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { "x-margin-source": "ione-api" },
      },
    });
  }
  return client;
}

/**
 * Verify a Supabase JWT (Authorization: Bearer ...) and return the user id.
 * Throws if invalid. Used by every route that takes user-scoped action.
 */
export async function userIdFromAuthHeader(
  authHeader: string | undefined,
): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user.id;
}
