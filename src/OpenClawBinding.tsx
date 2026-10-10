import { useEffect, useRef, useState } from 'react';
import { createBotBindingCode, type BotBindingCode } from './supabase';

export function OpenClawBinding({ accessToken }: { accessToken: string }) {
  const [bound, setBound] = useState<boolean | null>(null);
  const [code, setCode] = useState<BotBindingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const generation = useRef(0);

  async function refresh(token = accessToken) {
    const run = ++generation.current;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/bot/binding-code', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || typeof data.bound !== 'boolean') throw new Error('读取绑定状态失败，请重试。');
      if (tokenRef.current !== token || generation.current !== run) return;
      setBound(data.bound);
      if (data.bound) setCode(null);
    } catch (e) {
      if (tokenRef.current === token && generation.current === run) setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      if (tokenRef.current === token && generation.current === run) setBusy(false);
    }
  }
  useEffect(() => {
    setBound(null); setCode(null); setCopied(false);
    void refresh(accessToken);
    return () => { generation.current++; };
  }, [accessToken]);
  useEffect(() => {
    if (!code) return;
    const timer = window.setTimeout(() => { setCode(null); setError('绑定码已过期，请重新生成。'); }, Math.max(0, Date.parse(code.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [code]);

  async function generate() {
    const token = accessToken;
    const run = ++generation.current;
    setBusy(true); setError(''); setCopied(false);
    try {
      const result = await createBotBindingCode(token);
      if (tokenRef.current === token && generation.current === run) setCode(result);
    } catch (e) {
      if (tokenRef.current === token && generation.current === run) setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      if (tokenRef.current === token && generation.current === run) setBusy(false);
    }
  }
  async function copy() {
    if (!code) return;
    try { await navigator.clipboard.writeText(code.instruction); setCopied(true); }
    catch { setError('复制失败，请选中下方指令手动复制。'); }
  }
  return <div className="wechat-binding" aria-label="OpenClaw 微信待办">
    <div className="wechat-binding-main">
      <div className="wechat-binding-summary"><span>OpenClaw 微信待办</span>
        <strong aria-live="polite">{bound === null ? (busy ? '读取中…' : '状态暂不可用') : bound ? '已绑定当前账号' : '尚未绑定'}</strong>
      </div>
      <button type="button" disabled={busy} onClick={() => void refresh()}>刷新状态</button>
      {bound === false && <button type="button" disabled={busy} onClick={() => void generate()}>{busy ? '处理中…' : '生成绑定码'}</button>}
    </div>
    {bound ? <p>在已连接的微信会话发送「td 任务列表」即可查询。绑定状态不代表网关实时在线，无需再次扫码。</p>
      : <p>先连接你的 OpenClaw 微信，再把一次性绑定指令发送到该会话。</p>}
    {code && <div className="wechat-qr-panel">
      <code style={{ userSelect: 'all', overflowWrap: 'anywhere' }}>{code.instruction}</code>
      <p>有效期至 {new Date(code.expiresAt).toLocaleTimeString()}。发送后点击“刷新状态”。</p>
      <button type="button" onClick={() => void copy()}>{copied ? '已复制' : '复制绑定指令'}</button>
    </div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
