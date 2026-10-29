// 同步狀態小標籤：已同步／待同步／同步中／離線／同步失敗（絕不假裝已寫入雲端）
import { store, syncer, useData, useOnline, useSync } from '../app/services.ts';
import { Icon } from './icons.tsx';

export function useSyncSummary() {
  useData();
  const sync = useSync();
  const online = useOnline();
  const pending = store.pending();
  const failed = pending.filter((e) => e.status === 'failed').length;
  const waiting = pending.length - failed;
  let tone: 'ok' | 'busy' | 'wait' | 'off' | 'error' = 'ok';
  let label = '已同步';
  if (failed) { tone = 'error'; label = `${failed} 筆同步失敗`; }
  else if (!online || sync.status === 'offline') { tone = 'off'; label = waiting ? `離線・${waiting} 筆待同步` : '離線'; }
  else if (sync.status === 'syncing') { tone = 'busy'; label = '同步中…'; }
  else if (waiting) { tone = 'wait'; label = `${waiting} 筆待同步`; }
  else if (sync.status === 'error') { tone = 'error'; label = '同步失敗'; }
  return { tone, label, failed, waiting, online, sync };
}

export function SyncBadge({ onClick }: { onClick: () => void }) {
  const { tone, label } = useSyncSummary();
  return (
    <button type="button" className={`sync-badge sync-${tone}`} onClick={onClick} aria-label={`同步狀態：${label}`}>
      <Icon.cloud />
      <span>{label}</span>
    </button>
  );
}

export function manualSync() {
  return syncer.sync({ retryFailed: true });
}
