import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { registerServiceWorker } from './app/pwa.ts';
import './styles.css';
import { applyFontSize } from './lib/fontSize.ts';

applyFontSize();

// 打開 App 時，行程頁一律從「今天」開始（旅行還沒開始就是第一天）：
// 不要停在上次看的日期（iPhone 加到主畫面時，網址可能記住了某一天）
const DATED_PLAN = /^#\/t\/([^/]+)\/plan\/\d{4}-\d{2}-\d{2}$/;
function resetPlanDate() {
  const m = DATED_PLAN.exec(location.hash);
  if (!m) return false;
  history.replaceState(history.state, '', `${location.pathname}${location.search}#/t/${m[1]}/plan`);
  return true;
}
resetPlanDate();
// 放在背景超過 30 分鐘再回來，也當作重新打開
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000 && resetPlanDate()) window.dispatchEvent(new PopStateEvent('popstate'));
});
registerServiceWorker();
createRoot(document.getElementById('root')!).render(<App />);
