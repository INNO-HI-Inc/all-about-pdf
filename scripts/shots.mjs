/* 시각 QA: 주요 페이지 스크린샷. 로컬 서버 필요. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8099';
const OUT = '/tmp/aap-shots';
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  ['home-desktop', '/', 1280, false],
  ['home-mobile', '/', 390, true],
  ['merge-desktop', '/merge/', 1280, false],
  ['unlock-mobile', '/unlock/', 390, true],
  ['pagenum-desktop', '/page-numbers/', 1280, false],
];
const browser = await chromium.launch();
for (const [name, path, width, full] of shots) {
  const page = await browser.newPage({ viewport: { width, height: full ? 844 : 900 } });
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await page.close();
  console.log('✓', name);
}
await browser.close();
console.log('saved to', OUT);
