import { randomInt } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthorizationBearer, requirePost, sendJson } from "../_bot/http.js";
import { getSupabaseAdmin } from "../_bot/supabaseAdmin.js";
import { getBotBindingByUserId } from "../_bot/todoRepository.js";

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && !requirePost(request, response)) return;

  const token = getAuthorizationBearer(request);
  if (!token) {
    sendJson(response, 401, { error: "Missing Authorization bearer token" });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      sendJson(response, 401, { error: "Invalid user token" });
      return;
    }

    const binding = await getBotBindingByUserId(supabase, data.user.id);
    if (request.method === "GET") { sendJson(response, 200, { bound: Boolean(binding) }); return; }
    if (binding) { sendJson(response, 409, { error: "当前账号已绑定 OpenClaw，无需重复绑定。" }); return; }
    const { error: deleteError } = await supabase.from("bot_binding_codes").delete().eq("user_id", data.user.id).is("used_at", null);
    if (deleteError) throw deleteError;
    const { code, expiresAt } = await createBindingCode(supabase, data.user.id);

    sendJson(response, 200, {
      code,
      expiresAt,
      instruction: `td 绑定 ${code}`,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Failed to create binding code" });
  }
}

function generateBindingCode(): string {
  return `TD-${randomInt(1_000_000_000, 10_000_000_000)}`;
}

async function createBindingCode(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<{ code: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateBindingCode();
    const { error } = await supabase.from("bot_binding_codes").insert({
      code,
      user_id: userId,
      expires_at: expiresAt,
    });

    if (!error) return { code, expiresAt };
    if (error.code !== "23505") throw error;
  }

  throw new Error("Could not generate a unique binding code");
}
