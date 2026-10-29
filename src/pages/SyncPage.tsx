// 同步狀態：哪些修改還沒上傳、哪些失敗、最後同步時間
import { store, syncer, useData } from '../app/services.ts';
import { goBack } from '../app/router.ts';
import { TABLE_LABEL } from '../data/sync.ts';
import type { OutboxEntry } from '../data/types.ts';
import { ago } from '../lib/dates.ts';
import { BackButton, Badge, Button, List, Notice, Row, Screen, Section, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { manualSync, useSyncSummary } from '../ui/SyncBadge.tsx';
import { confirmDialog } from '../ui/dialog.tsx';

function entryTitle(e: OutboxEntry): string {
  const row = store.get(e.table, e.id) as unknown as Record<string, unknown> | undefined;
  const name = (row?.title || row?.name || row?.date || '') as string;
  const what = e.op === 'insert' ? '新增' : row?.deleted_at ? '刪除' : '修改';
  return `${what}${TABLE_LABEL[e.table]}${name ? `「${name}」` : ''}`;
}

export function SyncPage() {
  useData();
  const s = useSyncSummary();
  const entries = store.pending().sort((a, b) => a.seq - b.seq);
  const notices = store.notices();

  async function discard(e: OutboxEntry) {
    const ok = await confirmDialog({
      title: '放棄這筆修改？',
      message: '手機上的這筆修改會被取消，改回雲端上的內容。',
      confirmText: '放棄修改',
      danger: true,
    });
    if (ok) await syncer.discard(e.key);
  }

  return (
    <Screen header={<TopBar title="同步狀態" left={<BackButton onClick={() => goBack('/')} />} />}>
      <div className="pad stack-lg">
        <div className={`sync-panel sync-${s.tone}`}>
          <div className="sync-panel-label"><Icon.cloud /> {s.label}</div>
          <div className="muted small">上次和雲端同步：{ago(s.sync.lastSyncAt)}</div>
          {s.sync.lastError && s.tone === 'error' ? <div className="small">{s.sync.lastError}</div> : null}
          <Button variant="primary" block busy={s.tone === 'busy'} disabled={!s.online} onClick={() => manualSync()}>
            <Icon.refresh /> 立即同步
          </Button>
          {!s.online ? <p className="small muted">目前沒有網路。你仍然可以新增和修改，連上網路後會自動上傳。</p> : null}
        </div>

        <Section title={`尚未上傳（${entries.length}）`}>
          {entries.length ? (
            <List>
              {entries.map((e) => (
                <Row key={e.key} title={entryTitle(e)}
                  detail={e.status === 'failed' ? `失敗：${e.last_error ?? '未知原因'}` : '等待上傳'}
                  trailing={e.status === 'failed' ? (
                    <span className="row-actions">
                      <Badge tone="danger">失敗</Badge>
                      <Button variant="text" onClick={() => discard(e)}>放棄</Button>
                    </span>
                  ) : <Badge tone="warn">待同步</Badge>} />
              ))}
            </List>
          ) : (
            <Notice>所有修改都已存到雲端。</Notice>
          )}
        </Section>

        {notices.length ? (
          <Section title="同步紀錄" action={<button type="button" className="link-btn" onClick={() => store.clearNotices()}>清除</button>}>
            <List>
              {notices.map((n) => <Row key={n.id} title={n.message} detail={ago(n.at)} />)}
            </List>
          </Section>
        ) : null}

        <Section title="說明">
          <ul className="help-list small">
            <li>按「儲存」後，資料會先存在這支手機，再自動上傳到雲端。</li>
            <li>沒有網路時照常使用，恢復連線後自動上傳。</li>
            <li>兩支手機同時改同一筆資料時，會自動合併：你改的欄位以你的為準。</li>
            <li>「失敗」通常是權限不足（只能查看的成員）或資料已在其他手機被永久刪除。</li>
          </ul>
        </Section>
      </div>
    </Screen>
  );
}
