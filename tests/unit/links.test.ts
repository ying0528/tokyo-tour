import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, splitLinks } from '../../src/lib/links.ts';

test('文字中的多個網址都能切出來，標點不會被算進網址', () => {
  const parts = splitLinks('官網：https://a.example.com/x?y=1，訂位 https://b.example.com/。\n地圖(https://naver.me/abc)');
  const links = parts.filter((p) => p.type === 'link').map((p) => (p as { href: string }).href);
  assert.deepEqual(links, ['https://a.example.com/x?y=1', 'https://b.example.com/', 'https://naver.me/abc']);
  assert.equal(parts.map((p) => p.text).join(''), '官網：https://a.example.com/x?y=1，訂位 https://b.example.com/。\n地圖(https://naver.me/abc)');
});

test('拒絕不安全的網址', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('naver.me/abc'), 'https://naver.me/abc');
  assert.equal(splitLinks('<img src=x onerror=alert(1)>').filter((p) => p.type === 'link').length, 0);
});
