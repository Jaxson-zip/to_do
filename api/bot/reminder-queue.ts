import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasValidBotSecret, readJsonBody, requirePost, sendJson } from '../_bot/http.js';
import { getSupabaseAdmin } from '../_bot/supabaseAdmin.js';
import { claimReminderDelivery, getBotBinding, memoItemFromRow, type MemoItemRow } from '../_bot/todoRepository.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store');
  if (!requirePost(request, response)) return;
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); } catch { sendJson(response, 400, { error: 'Invalid JSON' }); return; }
  if (!hasValidBotSecret(request, body)) { sendJson(response, 401, { error: 'Invalid bot secret' }); return; }
  if (!body || typeof body.senderId !== 'string' || !body.senderId.trim() || body.senderId.length > 256 || !['claim', 'ack'].includes(String(body.action))) {
    sendJson(response, 400, { error: 'Invalid request' }); return;
  }
  if (body.action === 'claim' && (!iso(body.since) || (body.offset !== undefined && (!Number.isSafeInteger(body.offset) || Number(body.offset) < 0)))) {
    sendJson(response, 400, { error: 'Invalid scan window' }); return;
  }
  if (body.action === 'ack' && (!uuid.test(String(body.itemId)) || !uuid.test(String(body.claimToken)) || !iso(body.reminderAt))) {
    sendJson(response, 400, { error: 'Invalid acknowledgement' }); return;
  }
  try {
    const db = getSupabaseAdmin();
    const binding = await getBotBinding(db, body.senderId);
    if (!binding) { sendJson(response, 200, { bound: false, deliveries: [] }); return; }
    const now = new Date().toISOString();
    if (body.action === 'ack') {
      // Retain the successful token so an identical acknowledgement is idempotent.
      const { data, error } = await db.from('bot_reminder_events')
        .update({ sent_at: now, claim_expires_at: null })
        .eq('provider', 'clawbot').eq('user_id', binding.user_id).eq('provider_user_id', body.senderId)
        .eq('item_id', body.itemId).eq('reminder_at', body.reminderAt).eq('claim_token', body.claimToken)
        .is('sent_at', null).gt('claim_expires_at', now).select('id').maybeSingle();
      if (error) throw error;
      if (data) { sendJson(response, 200, { acknowledged: true }); return; }
      const { data: prior, error: priorError } = await db.from('bot_reminder_events').select('sent_at')
        .eq('provider', 'clawbot').eq('user_id', binding.user_id).eq('provider_user_id', body.senderId)
        .eq('item_id', body.itemId).eq('reminder_at', body.reminderAt).eq('claim_token', body.claimToken).maybeSingle();
      if (priorError) throw priorError;
      sendJson(response, prior?.sent_at ? 200 : 409, prior?.sent_at ? { acknowledged: true } : { error: 'Claim expired or changed' });
      return;
    }
    const since = new Date(Math.max(Date.parse(body.since as string), Date.now() - 86_400_000)).toISOString();
    const offset = Number(body.offset) || 0;
    const { data, error } = await db.from('memo_items').select('*')
      .eq('user_id', binding.user_id).eq('kind', 'task').eq('status', 'open').eq('archived', false)
      .is('deleted_at', null).gte('reminder_at', since).lte('reminder_at', now)
      .order('reminder_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 49);
    if (error) throw error;
    const rows = (data ?? []) as MemoItemRow[];
    const deliveries = [];
    let consumed = 0;
    for (const row of rows) {
      consumed++;
      const item = memoItemFromRow(row);
      const claim = await claimReminderDelivery(db, item, binding, now);
      if (claim.status !== 'claimed') continue;
      deliveries.push({ itemId: item.id, reminderAt: item.reminderAt, claimToken: claim.token,
        recipientId: binding.provider_user_id,
        text: `待办提醒：${item.title}\n回复「td 完成 ${item.title}」可标记完成。` });
      if (deliveries.length >= 5) break;
    }
    sendJson(response, 200, { bound: true, deliveries, nextOffset: consumed < rows.length || rows.length === 50 ? offset + consumed : 0 });
  } catch {
    console.error('Reminder queue operation failed');
    sendJson(response, 500, { error: 'Reminder queue unavailable' });
  }
}
