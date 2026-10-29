// 登入、註冊、忘記密碼、尚未設定
import { useState } from 'react';
import type { FormEvent } from 'react';
import { backend, endRecovery } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { Button, Field, Notice, Screen, Segmented, TopBar } from '../ui/kit.tsx';
import { toast } from '../ui/dialog.tsx';

export function SetupNeededPage() {
  return (
    <Screen header={<TopBar title="家庭旅行" />}>
      <div className="pad stack">
        <Notice tone="warn">
          這個網站還沒連上資料庫。請依照 GitHub 專案中的 README「設定步驟」，把 Supabase 的網址和金鑰填進
          <code> app.config.json</code>。
        </Notice>
      </div>
    </Screen>
  );
}

/** 從貼上的文字找出邀請碼（可以貼整個連結或只有代碼） */
export function extractInviteToken(text: string): string | null {
  const m = text.match(/join\/([A-Za-z0-9]+)/) ?? text.trim().match(/^([A-Za-z0-9]{16,})$/);
  return m ? m[1] : null;
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [invite, setInvite] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError('請輸入 Email');
    if (mode !== 'forgot' && password.length < 6) return setError('密碼至少要 6 個字元');
    setBusy(true);
    try {
      if (mode === 'login') {
        await backend.auth.signIn(email.trim(), password);
        const pending = sessionStorage.getItem('pending-invite');
        if (pending) { sessionStorage.removeItem('pending-invite'); navigate(`/join/${pending}`, { replace: true }); }
        else navigate('/', { replace: true });
      } else if (mode === 'signup') {
        const { needsConfirm } = await backend.auth.signUp(email.trim(), password);
        if (needsConfirm) {
          setInfo('已寄出確認信。請到信箱點信中的連結，再回來這裡登入。');
          setMode('login');
        }
      } else {
        await backend.auth.resetPassword(email.trim());
        setInfo('已寄出重設密碼的信，請到信箱點信中的連結。');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function goInvite() {
    const token = extractInviteToken(invite);
    if (!token) return toast('看不懂這個邀請連結，請整段貼上', 'error');
    navigate(`/join/${token}`);
  }

  return (
    <Screen header={<TopBar title="家庭旅行" />}>
      <div className="pad stack-lg auth">
        <div className="hero">
          <p className="hero-kicker">家庭旅行</p>
          <h1 className="hero-title">一起規劃，<br />每個人手機上都看得到。</h1>
        </div>

        <form className="card stack" onSubmit={submit} noValidate>
          {mode === 'forgot' ? (
            <h2 className="card-title">重設密碼</h2>
          ) : (
            <Segmented label="登入或註冊" value={mode} onChange={(v) => { setMode(v); setError(null); }}
              options={[{ value: 'login', label: '登入' }, { value: 'signup', label: '註冊' }]} />
          )}
          <Field label="Email">
            <input className="input" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode !== 'forgot' ? (
            <Field label="密碼" hint={mode === 'signup' ? '至少 6 個字元' : undefined}>
              <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {info ? <Notice>{info}</Notice> : null}
          <Button type="submit" variant="primary" block busy={busy}>
            {mode === 'login' ? '登入' : mode === 'signup' ? '建立帳號' : '寄送重設信'}
          </Button>
          {mode === 'login' ? (
            <button type="button" className="link-btn" onClick={() => { setMode('forgot'); setError(null); }}>忘記密碼？</button>
          ) : mode === 'forgot' ? (
            <button type="button" className="link-btn" onClick={() => setMode('login')}>回到登入</button>
          ) : null}
        </form>

        <div className="card stack">
          <h2 className="card-title">家人用邀請連結加入</h2>
          <p className="muted small">不用註冊。把家人傳給你的邀請連結貼在這裡。</p>
          <input className="input" placeholder="貼上邀請連結" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <Button block onClick={goInvite} disabled={!invite.trim()}>前往加入</Button>
        </div>
      </div>
    </Screen>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) return setError('密碼至少要 6 個字元');
    setBusy(true);
    try {
      await backend.auth.updatePassword(password);
      toast('密碼已更新');
      endRecovery();
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<TopBar title="設定新密碼" />}>
      <form className="pad stack" onSubmit={submit}>
        <Field label="新密碼" hint="至少 6 個字元">
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" variant="primary" block busy={busy}>儲存新密碼</Button>
      </form>
    </Screen>
  );
}
