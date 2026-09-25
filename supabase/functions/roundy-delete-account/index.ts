import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function removeUserFiles(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  const { data, error } = await admin.storage.from(bucket).list(userId, {
    limit: 100,
  });
  if (error) throw error;
  const paths = (data ?? []).map((item) => `${userId}/${item.name}`);
  if (!paths.length) return;
  const { error: removeError } = await admin.storage.from(bucket).remove(paths);
  if (removeError) throw removeError;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== "delete account") {
      return json({ error: 'Type "delete account" to confirm.' }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Sign in required" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anon || !serviceRole) {
      return json({ error: "Account deletion is not configured." }, 503);
    }

    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Sign in required" }, 401);
    const userId = userData.user.id;

    await Promise.all([
      removeUserFiles(admin, "wis-profile-photos", userId),
      removeUserFiles(admin, "wis-verification-documents", userId),
    ]);

    const { error: anonymizeError } = await userClient.rpc("wis_anonymize_account");
    if (anonymizeError) throw anonymizeError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete account.";
    return json({ error: message }, 400);
  }
});
