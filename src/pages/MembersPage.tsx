// 成員與邀請連結
import { useEffect, useState } from 'react';
import { canEditTrip, remote, roleOf, store, syncer, useData, useOnline, useSession } from '../app/services.ts';
import { goBack } from '../app/router.ts';
import type { Invite, Member, Role } from '../data/types.ts';
import { Badge, BackButton, Button, List, Notice, Row, Screen, Section, Segmented, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

const ROLE_TEXT: Record<Role, string> = { owner: '擁有者', editor: '可編輯', viewer: '只能查看' };

export function inviteUrl(token: string) {
  return `${location.origin}${location.pathname}#/join/${token}`;
}

async function shareLink(url: string, title: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text: `加入「${title}」的旅行行程`, url });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  await copy(url);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製連結');
  } catch {
    window.prompt('請長按複製這個連結', text);
  }
}

export function MembersPage({ tripId }: { tripId: string }) {
  useData();
  const { user } = useSession();
  const online = useOnline();
  const trip = store.get('trips', tripId);
  const editable = canEditTrip(trip, user?.id);
  const isOwner = roleOf(trip, user?.id) === 'owner';
  const members = store.members(tripId);
  const travelers = store.byTrip('travelers', tripId);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [newRole, setNewRole] = useState<'viewer' | 'editor'>('viewer');
  const [busy, setBusy] = useState(false);
  const close = () => goBack(`/t/${tripId}/settings`);

  useEffect(() => {
    if (!editable || !online) return;
    remote.listInvites(tripId).then(setInvites).catch(() => setInvites([]));
  }, [tripId, editable, online]);

  useEffect(() => { void syncer.sync(); }, []);

  async function createInvite() {
    setBusy(true);
    try {
      const inv = await remote.createInvite(tripId, newRole, newRole === 'editor');
      setInvites((xs) => [...(xs ?? []), inv]);
      await shareLink(inviteUrl(inv.token), trip?.title || '家庭旅行');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inv: Invite) {
    const ok = await confirmDialog({
      title: '停用這個邀請連結？',
      message: '停用後沒有人能再用這個連結加入。已經加入的成員不受影響。',
      confirmText: '停用',
      danger: true,
    });
    if (!ok) return;
    try {
      await remote.revokeInvite(inv.id);
      setInvites((xs) => (xs ?? []).filter((x) => x.id !== inv.id));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function changeRole(m: Member) {
    const next: Role = m.role === 'editor' ? 'viewer' : 'editor';
    const ok = await confirmDialog({
      title: `改成「${ROLE_TEXT[next]}」？`,
      message: next === 'editor' ? '這位成員將可以新增、修改、刪除行程。' : '這位成員將只能查看，不能修改。',
      confirmText: '確定',
    });
    if (!ok) return;
    try {
      await remote.updateMember(tripId, m.user_id, next, m.see_all_groups || next === 'editor', m.traveler_id);
      await syncer.sync();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function removeMember(m: Member) {
    const ok = await confirmDialog({
      title: '移除這位成員？',
      message: '移除後他的手機就看不到這趟旅行。旅行資料不會被刪除。',
      confirmText: '移除',
      danger: true,
    });
    if (!ok) return;
    try {
      await remote.removeMember(tripId, m.user_id);
      await syncer.sync();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const travelerName = (id: string | null) => travelers.find((t) => t.id === id)?.name;

  return (
    <Screen header={<TopBar title="成員與邀請" left={<BackButton onClick={close} />} />}>
      <div className="pad stack-lg">
        {!online ? <Notice tone="warn">目前離線。成員和邀請連結需要連上網路才能管理。</Notice> : null}

        <Section title="成員">
          <List>
            {members.length ? members
              .slice()
              .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.created_at.localeCompare(b.created_at)))
              .map((m) => {
                const who = travelerName(m.traveler_id);
                const self = m.user_id === user?.id;
                return (
                  <Row key={m.user_id}
                    leading={<Icon.user />}
                    title={<>{who ?? (m.display_name || '家人')}{self ? '（我）' : ''}</>}
                    detail={[m.display_name && who ? m.display_name : null, who ? null : '尚未選擇身分'].filter(Boolean).join('・') || undefined}
                    trailing={
                      <span className="row-actions">
                        <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_TEXT[m.role]}</Badge>
                        {isOwner && !self && m.role !== 'owner' && online ? (
                          <>
                            <Button variant="text" onClick={() => changeRole(m)}>改權限</Button>
                            <Button variant="text" className="danger" onClick={() => removeMember(m)}>移除</Button>
                          </>
                        ) : null}
                      </span>
                    } />
                );
              }) : <Row title="同步後會顯示成員" />}
          </List>
        </Section>

        {editable ? (
          <Section title="邀請家人">
            <div className="card stack">
              <p className="small">產生一個連結傳給家人（LINE、訊息都可以）。家人打開後選「我是誰」就能加入，<strong>不需要註冊</strong>。</p>
              <Segmented label="權限" value={newRole} onChange={setNewRole}
                options={[{ value: 'viewer', label: '只能查看' }, { value: 'editor', label: '可以編輯' }]} />
              <Button variant="primary" block busy={busy} disabled={!online} onClick={createInvite}>
                <Icon.share /> 產生並分享邀請連結
              </Button>
            </div>

            {invites && invites.length ? (
              <List>
                {invites.map((inv) => (
                  <Row key={inv.id} leading={<Icon.link />}
                    title={`${ROLE_TEXT[inv.role]}的邀請連結`}
                    detail={`建立於 ${new Date(inv.created_at).toLocaleDateString('zh-TW')}`}
                    trailing={
                      <span className="row-actions">
                        <button type="button" className="icon-btn" aria-label="分享" onClick={() => shareLink(inviteUrl(inv.token), trip?.title || '家庭旅行')}><Icon.share /></button>
                        <button type="button" className="icon-btn" aria-label="複製" onClick={() => copy(inviteUrl(inv.token))}><Icon.copy /></button>
                        <Button variant="text" className="danger" onClick={() => revoke(inv)}>停用</Button>
                      </span>
                    } />
                ))}
              </List>
            ) : null}
            <p className="muted small">連結可以重複使用（例如換手機時再打開一次）。不想再讓人加入時按「停用」。</p>
          </Section>
        ) : (
          <Notice>只有可編輯的成員能邀請其他人。</Notice>
        )}
      </div>
    </Screen>
  );
}
