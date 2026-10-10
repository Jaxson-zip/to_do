import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(), getBotBinding: vi.fn(), claimReminderDelivery: vi.fn() }));
vi.mock('../../api/_bot/supabaseAdmin.js', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('../../api/_bot/todoRepository.js', async original => ({ ...await original<object>(), ...mocks }));
const { default: handler } = await import('../../api/bot/reminder-queue');
const itemId = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
let query: Record<string, any>;
let db: { from: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks(); process.env.BOT_WEBHOOK_SECRET = 'test-secret';
  query = {};
  for (const method of ['select','eq','is','gte','lte','order','limit','update','gt','range']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
  query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  db = { from: vi.fn(() => query) }; mocks.getSupabaseAdmin.mockReturnValue(db);
  mocks.getBotBinding.mockResolvedValue({ provider: 'clawbot', user_id: 'owner', provider_user_id: 'sender' });
});
async function invoke(body: unknown, secret = 'test-secret') {
  const response: any = { statusCode: 0, body: null, status(code: number) { this.statusCode = code; return this }, setHeader() { return this }, json(value: unknown) { this.body = value } };
  await handler({ method: 'POST', headers: { 'x-bot-secret': secret }, body } as any, response);
  return response;
}
it('rejects wrong credentials before accessing private data', async () => {
  expect((await invoke({ action: 'claim', senderId: 'sender', since: new Date().toISOString() }, 'wrong')).statusCode).toBe(401);
  expect(db.from).not.toHaveBeenCalled();
});
it('unbound sender gets no tasks', async () => {
  mocks.getBotBinding.mockResolvedValue(null);
  expect((await invoke({ action: 'claim', senderId: 'sender', since: new Date().toISOString() })).body).toEqual({ bound: false, deliveries: [] });
  expect(db.from).not.toHaveBeenCalled();
});
it('scopes due query to owner before limiting and clamps historical catchup', async () => {
  const result = await invoke({ action: 'claim', senderId: 'sender', since: '2020-01-01T00:00:00.000Z' });
  expect(result.statusCode).toBe(200);
  expect(query.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(query.eq).toHaveBeenCalledWith('status', 'open');
  const since = query.gte.mock.calls.find((x: string[]) => x[0] === 'reminder_at')[1];
  expect(Date.now() - Date.parse(since)).toBeLessThan(86_401_000);
});
it('acknowledgement requires owner, sender, live lease and exact token', async () => {
  expect((await invoke({ action: 'ack', senderId: 'sender', itemId, claimToken: token, reminderAt: new Date().toISOString() })).statusCode).toBe(409);
  expect(query.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(query.eq).toHaveBeenCalledWith('provider_user_id', 'sender');
  expect(query.eq).toHaveBeenCalledWith('claim_token', token);
  expect(query.gt).toHaveBeenCalledWith('claim_expires_at', expect.any(String));
});
it('malformed acknowledgement cannot mutate the queue', async () => {
  expect((await invoke({ action: 'ack', senderId: 'sender', itemId: 'bad', claimToken: token, reminderAt: 'bad' })).statusCode).toBe(400);
  expect(db.from).not.toHaveBeenCalled();
});
it('acknowledges a delivery only when the atomic update matched', async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: { id: 'receipt' }, error: null });
  expect((await invoke({ action: 'ack', senderId: 'sender', itemId, claimToken: token, reminderAt: new Date().toISOString() })).body).toEqual({ acknowledged: true });
});
it('allows an identical acknowledgement after success', async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { sent_at: new Date().toISOString() }, error: null });
  expect((await invoke({ action: 'ack', senderId: 'sender', itemId, claimToken: token, reminderAt: new Date().toISOString() })).body).toEqual({ acknowledged: true });
});
