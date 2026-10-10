import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(), getBotBindingByUserId: vi.fn() }));
vi.mock('../../api/_bot/supabaseAdmin.js', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('../../api/_bot/todoRepository.js', () => ({ getBotBindingByUserId: mocks.getBotBindingByUserId }));
const { default: handler } = await import('../../api/bot/binding-code');
const getUser = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.getSupabaseAdmin.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: 'current-user' } }, error: null });
});
async function invoke(method = 'GET', authorization = 'Bearer valid') {
  const response: any = { code: 0, body: null, status(code: number) { this.code = code; return this }, setHeader() { return this }, json(body: unknown) { this.body = body } };
  await handler({ method, headers: { authorization } } as any, response); return response;
}
it('requires authenticated user for status', async () => {
  expect((await invoke('GET', '')).code).toBe(401); expect(mocks.getBotBindingByUserId).not.toHaveBeenCalled();
});
it('only returns a boolean for the current user, without private WeChat identifiers', async () => {
  mocks.getBotBindingByUserId.mockResolvedValue({ provider_user_id: 'private-sender', user_id: 'current-user' });
  expect((await invoke()).body).toEqual({ bound: true });
  expect(mocks.getBotBindingByUserId).toHaveBeenCalledWith(expect.anything(), 'current-user');
});
it('does not create binding credentials for an already-bound account', async () => {
  mocks.getBotBindingByUserId.mockResolvedValue({ user_id: 'current-user' });
  expect((await invoke('POST')).code).toBe(409);
});
