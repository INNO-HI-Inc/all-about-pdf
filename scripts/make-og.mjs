/* OG 이미지(1200x630) 생성 — 브랜드 카드를 Playwright로 렌더해 PNG 저장.
 * 사용: NODE_PATH=<playwright> node scripts/make-og.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'img', 'og-default.png');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}
.card{width:1200px;height:630px;background:linear-gradient(135deg,#6c5ce7 0%,#9b5cf0 48%,#ff5d7e 120%);
  color:#fff;padding:78px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.card::after{content:'';position:absolute;right:-120px;top:-120px;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,.08)}
.brand{display:flex;align-items:center;gap:16px;margin-bottom:30px}
.logo{width:66px;height:66px;border-radius:17px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:23px;letter-spacing:-1px}
.bname{font-size:31px;font-weight:700;opacity:.96}
.title{font-size:66px;font-weight:800;line-height:1.22;letter-spacing:-2.5px;margin-bottom:22px}
.sub{font-size:31px;font-weight:500;opacity:.93}
.tags{display:flex;gap:13px;margin-top:42px}
.tag{background:rgba(255,255,255,.17);padding:13px 24px;border-radius:999px;font-size:25px;font-weight:600}
</style></head><body>
<div class="card">
  <div class="brand"><div class="logo">PDF</div><div class="bname">PDF의 모든 것</div></div>
  <div class="title">무료 PDF 도구 모음<br>합치기 · 분할 · 변환 · 잠금해제</div>
  <div class="sub">설치 없이 · 파일을 서버에 올리지 않고 · 내 브라우저에서</div>
  <div class="tags"><span class="tag">🔒 서버 미전송</span><span class="tag">💸 완전 무료</span><span class="tag">⚡ 설치 불필요</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(HTML, { waitUntil: 'networkidle' });
await page.locator('.card').screenshot({ path: OUT });
await browser.close();
console.log('✓ OG 이미지 생성:', OUT);
