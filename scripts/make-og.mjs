/* OG 이미지(1200x630) 생성 — 브랜드 카드를 Playwright로 렌더해 PNG 저장.
 * 사용: NODE_PATH=<playwright> node scripts/make-og.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'img');
const OUT = join(ASSETS, 'og-default.png');
const LOGO = 'data:image/png;base64,' + readFileSync(join(ASSETS, 'logo.png')).toString('base64');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}
.card{width:1200px;height:630px;background:#ffffff;
  color:#17172a;padding:80px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.brand{display:flex;align-items:center;gap:15px;margin-bottom:34px}
.logo{width:74px;height:74px;object-fit:contain;display:block}
.bname{font-size:32px;font-weight:800;color:#17172a;letter-spacing:-1px}
.title{font-size:66px;font-weight:800;line-height:1.16;letter-spacing:-3px;margin-bottom:24px}
.title .mk{color:#e5252a}
.sub{font-size:29px;font-weight:500;color:#585e6e;letter-spacing:-.5px}
.tags{display:flex;gap:13px;margin-top:44px}
.tag{display:flex;align-items:center;gap:10px;background:#fff1f0;color:#c01a12;padding:13px 24px;border-radius:999px;font-size:24px;font-weight:700;border:1px solid #ffd5d1}
.tag i{width:11px;height:11px;border-radius:50%;background:#18a957;display:block}
</style></head><body>
<div class="card">
  <div class="brand"><img class="logo" src="${LOGO}"><div class="bname">PDF의 모든 것</div></div>
  <div class="title">설치 없이 무료로,<br><span class="mk">22가지 PDF 도구</span>를 한곳에서</div>
  <div class="sub">합치기 · 분할 · 변환 · 잠금해제 · 페이지 정리까지 — 파일은 서버에 올리지 않고 내 브라우저에서</div>
  <div class="tags"><span class="tag"><i></i>서버에 안 올림</span><span class="tag"><i></i>완전 무료</span><span class="tag"><i></i>설치 불필요</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(HTML, { waitUntil: 'networkidle' });
await page.waitForTimeout(200);
await page.locator('.card').screenshot({ path: OUT });
await browser.close();
console.log('✓ OG 이미지 생성:', OUT);
