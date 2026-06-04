import { randomInt } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthorizationBearer, requirePost, sendJson } from "../_bot/http";
import { getSupabaseAdmin } from "../_bot/supabaseAdmin";

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (!requirePost(request, response)) return;

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

    const code = generateBindingCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    await supabase.from("bot_binding_codes").delete().eq("user_id", data.user.id).is("used_at", null);

    const { error: insertError } = await supabase.from("bot_binding_codes").insert({
      code,
      user_id: data.user.id,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    sendJson(response, 200, {
      code,
      expiresAt,
      instruction: `请在微信机器人里发送：绑定 ${code}`,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Failed to create binding code" });
  }
}

function generateBindingCode(): string {
  return `TD-${randomInt(100000, 999999)}`;
}

