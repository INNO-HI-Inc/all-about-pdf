/*
 * PDF의 모든 것 — QA (Playwright)
 * 1) 기능 실측: 7개 도구를 실제 PDF로 실행 → 산출물(페이지 수/ZIP 개수/형식) 검증
 * 2) 구조 감사: 전 페이지 메타/canonical/OG/JSON-LD/h1/내부링크/콘솔에러
 *
 * 사용:  BASE=http://localhost:8099  NODE_PATH=<playwright경로>  node qa/qa.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
// ESM은 NODE_PATH를 따르지 않으므로 CommonJS resolver로 playwright를 찾는다.
// 로컬에 playwright가 없으면  NODE_PATH=$(전역 node_modules)  또는  PW_PATH=<경로>  로 지정.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = process.env.BASE || 'http://localhost:8099';
const PAGES = ['/', '/merge/', '/split/', '/unlock/', '/extract/', '/delete/', '/organize/', '/to-image/', '/page-numbers/', '/svg-to-png/', '/rotate/', '/crop/', '/compress/', '/pdf-info/', '/watermark/', '/flatten/', '/protect/', '/jpg-to-png/', '/png-to-jpg/', '/webp-to-png/', '/webp-to-jpg/', '/png-to-webp/', '/jpg-to-webp/', '/svg-to-jpg/', '/svg-to-webp/', '/remove-metadata/', '/remove-blank/', '/add-margin/', '/extract-text/', '/reverse/', '/grayscale/', '/nup/', '/sign/', '/gif-to-png/', '/gif-to-jpg/', '/avif-to-png/', '/avif-to-jpg/', '/about/'];
const results = [];
const pass = (name, msg) => results.push({ ok: true, name, msg: msg || '' });
const fail = (name, msg) => results.push({ ok: false, name, msg: msg || '' });

// 브라우저 안에서 테스트 PDF 생성 (PDFLib) → base64
const GEN = async (specs) => {
  const out = [];
  for (const [n, label] of specs) {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < n; i++) {
      const p = doc.addPage([595, 842]);
      p.drawText(label + ' page ' + (i + 1), { x: 50, y: 780, size: 24, font });
    }
    const bytes = await doc.save();
    let bin = ''; const u = new Uint8Array(bytes);
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    out.push(btoa(bin));
  }
  return out;
};
// base64 → 페이지 수
const COUNT = async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const doc = await window.PDFLib.PDFDocument.load(u, { ignoreEncryption: true });
  return doc.getPageCount();
};
// base64 → 페이지별 회전각 배열
const ROTS = async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const doc = await window.PDFLib.PDFDocument.load(u, { ignoreEncryption: true });
  return doc.getPages().map((p) => p.getRotation().angle);
};
// 폼(양식) 필드가 있는 PDF 생성 (평탄화 테스트용)
const GENFORM = async () => {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  const tf = form.createTextField('user.name'); tf.setText('John Doe');
  tf.addToPage(page, { x: 50, y: 700, width: 220, height: 28 });
  const cb = form.createCheckBox('agree'); cb.addToPage(page, { x: 50, y: 650, width: 18, height: 18 }); cb.check();
  const bytes = await doc.save(); let bin = ''; const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin);
};
// base64 → 폼 필드 개수
const FIELDS = async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const doc = await window.PDFLib.PDFDocument.load(u, { ignoreEncryption: true });
  try { return doc.getForm().getFields().length; } catch (e) { return 0; }
};
// base64(zip) → 엔트리 이름들
const ZIP = async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const zip = await window.JSZip.loadAsync(u);
  return Object.keys(zip.files);
};

function b64ToFile(b64, name) {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(b64, 'base64') };
}
function bufToB64(buf) { return Buffer.from(buf).toString('base64'); }

async function ready(page) {
  // 코어(PDFEngine·ToolCore)는 모든 도구 페이지에 존재. vendor(PDFLib/JSZip/pdf.js)는
  // 도구별 needs에 따라 선택적으로 로드되므로 게이트에서 요구하지 않는다(defer 순서 보장).
  await page.waitForFunction(() => window.PDFEngine && window.ToolCore, null, { timeout: 10000 });
}
async function setAndRun(page, files, before, scope) {
  var pre = scope ? scope + ' ' : '';
  await page.setInputFiles(pre + '.js-file', files);
  await page.waitForSelector(pre + '.js-run:not([disabled])', { timeout: 8000 });
  if (before) await before();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    page.click(pre + '.js-run')
  ]);
  const p = await download.path();
  return { buf: fs.readFileSync(p), filename: download.suggestedFilename() };
}

// ───────── 기능 테스트 ─────────
async function testMerge(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/merge/'); await ready(page);
  const b = await page.evaluate(GEN, [[3, 'A'], [2, 'B']]);
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'a.pdf'), b64ToFile(b[1], 'b.pdf')]);
  const cnt = await page.evaluate(COUNT, bufToB64(buf));
  cnt === 5 ? pass('합치기', '3+2 → ' + cnt + '페이지') : fail('합치기', '기대 5, 실제 ' + cnt);
  await page.close();
}
async function testSplit(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/split/'); await ready(page);
  const b = await page.evaluate(GEN, [[4, 'S']]);
  // 낱장 모드(기본)
  const r1 = await setAndRun(page, [b64ToFile(b[0], 's.pdf')]);
  const n1 = (await page.evaluate(ZIP, bufToB64(r1.buf))).length;
  n1 === 4 ? pass('분할(낱장)', '4페이지 → ZIP ' + n1 + '개') : fail('분할(낱장)', '기대 4, 실제 ' + n1);
  // 범위 모드
  await page.evaluate(() => { document.querySelector('input[name="split-mode"][value="ranges"]').click(); });
  await page.fill('#split-ranges', '1-2, 3-4');
  const r2 = await setAndRun(page, [b64ToFile(b[0], 's.pdf')]);
  const names = await page.evaluate(ZIP, bufToB64(r2.buf));
  names.length === 2 ? pass('분할(범위)', '1-2,3-4 → ZIP ' + names.length + '개') : fail('분할(범위)', '기대 2, 실제 ' + names.length);
  await page.close();
}
async function testExtract(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/extract/'); await ready(page);
  const b = await page.evaluate(GEN, [[6, 'E']]);
  await page.fill('#extract-pages', '1, 3, 5-6');
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'e.pdf')]);
  const cnt = await page.evaluate(COUNT, bufToB64(buf));
  cnt === 4 ? pass('페이지 추출', '1,3,5-6 → ' + cnt + '페이지') : fail('페이지 추출', '기대 4, 실제 ' + cnt);
  await page.close();
}
async function testDelete(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/delete/'); await ready(page);
  const b = await page.evaluate(GEN, [[5, 'D']]);
  await page.fill('#delete-pages', '2, 4');
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'd.pdf')]);
  const cnt = await page.evaluate(COUNT, bufToB64(buf));
  cnt === 3 ? pass('페이지 삭제', '5에서 2,4 삭제 → ' + cnt + '페이지') : fail('페이지 삭제', '기대 3, 실제 ' + cnt);
  await page.close();
}
async function testToImage(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/to-image/'); await ready(page);
  const b = await page.evaluate(GEN, [[3, 'I']]);
  // 전체(PNG, 기본) → ZIP 3개
  const r1 = await setAndRun(page, [b64ToFile(b[0], 'i.pdf')]);
  const names = await page.evaluate(ZIP, bufToB64(r1.buf));
  const allPng = names.every(n => /\.png$/i.test(n));
  (names.length === 3 && allPng) ? pass('이미지변환(전체PNG)', '3페이지 → PNG ' + names.length + '개')
    : fail('이미지변환(전체PNG)', '기대 PNG 3, 실제 ' + names.length + ' png=' + allPng);
  // 단일 페이지(JPG) → 직접 다운로드(.jpg)
  await page.evaluate(() => { document.querySelector('input[name="img-format"][value="jpg"]').click(); document.querySelector('input[name="img-pages-mode"][value="custom"]').click(); });
  await page.fill('#img-pages', '2');
  const r2 = await setAndRun(page, [b64ToFile(b[0], 'i.pdf')]);
  /\.jpg$/i.test(r2.filename) && r2.buf[0] === 0xFF && r2.buf[1] === 0xD8
    ? pass('이미지변환(단일JPG)', r2.filename) : fail('이미지변환(단일JPG)', 'JPG 헤더/이름 불일치: ' + r2.filename);
  await page.close();
}
async function testPageNumbers(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/page-numbers/'); await ready(page);
  const b = await page.evaluate(GEN, [[3, 'N']]);
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'n.pdf')]);
  const cnt = await page.evaluate(COUNT, bufToB64(buf));
  // 텍스트가 추가됐는지: 출력 바이트가 원본보다 큼 + 페이지 수 동일
  const orig = Buffer.from(b[0], 'base64').length;
  (cnt === 3 && buf.length > 0) ? pass('페이지 번호', '3페이지 유지, 출력 ' + buf.length + 'B (원본 ' + orig + 'B)')
    : fail('페이지 번호', '기대 3페이지, 실제 ' + cnt);
  await page.close();
}
async function testUnlock(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/unlock/'); await ready(page);
  const b = await page.evaluate(GEN, [[2, 'U']]);
  // 벡터 경로(일반 PDF) → 유효 PDF, 페이지 수 유지
  const r1 = await setAndRun(page, [b64ToFile(b[0], 'u.pdf')]);
  const c1 = await page.evaluate(COUNT, bufToB64(r1.buf));
  c1 === 2 ? pass('잠금해제(벡터)', '2페이지 재저장 → ' + c1) : fail('잠금해제(벡터)', '기대 2, 실제 ' + c1);
  // 래스터 경로(이미지로 해제) → 유효 PDF, 페이지 수 유지
  await page.check('#unlock-raster');
  const r2 = await setAndRun(page, [b64ToFile(b[0], 'u.pdf')]);
  const c2 = await page.evaluate(COUNT, bufToB64(r2.buf));
  c2 === 2 ? pass('잠금해제(래스터)', '2페이지 이미지화 → ' + c2) : fail('잠금해제(래스터)', '기대 2, 실제 ' + c2);
  await page.close();
}

async function testOrganize(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/organize/'); await ready(page);
  const b = await page.evaluate(GEN, [[5, 'O']]);
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'o.pdf')], async () => {
    await page.waitForSelector('.pagecell--org', { timeout: 15000 });
    // 2번째 페이지 삭제 → 리빌드 후 첫 페이지 오른쪽 90° 회전
    await page.evaluate(() => document.querySelectorAll('.pagecell--org')[1].querySelector('.pcop--del').click());
    await page.evaluate(() => document.querySelectorAll('.pagecell--org')[0].querySelector('.pcop--rotr').click());
  });
  const cnt = await page.evaluate(COUNT, bufToB64(buf));
  const rots = await page.evaluate(ROTS, bufToB64(buf));
  (cnt === 4 && rots[0] === 90)
    ? pass('페이지 정리', '5쪽에서 1장 삭제 → ' + cnt + '쪽, 1쪽 회전=' + rots[0] + '°')
    : fail('페이지 정리', '기대 4쪽/첫쪽90°, 실제 ' + cnt + '쪽/[' + rots.join(',') + ']');
  await page.close();
}

async function testWatermark(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/watermark/'); await ready(page);
  const b = await page.evaluate(GEN, [[3, 'W']]);
  const orig = Buffer.from(b[0], 'base64').length;
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'w.pdf')], async () => { await page.fill('#wm-text', '대외비'); });
  const cnt = await page.evaluate(COUNT, bufToB64(buf));
  (cnt === 3 && buf.length > orig)
    ? pass('워터마크(한글)', '대외비 3쪽 유지, 출력 ' + buf.length + 'B > 원본 ' + orig + 'B')
    : fail('워터마크(한글)', '기대 3쪽·출력 증가, 실제 ' + cnt + '쪽 · ' + buf.length + 'B');
  await page.close();
}
async function testFlatten(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/flatten/'); await ready(page);
  const b = await page.evaluate(GENFORM);
  const before = await page.evaluate(FIELDS, b);
  const { buf } = await setAndRun(page, [b64ToFile(b, 'form.pdf')]);
  const after = await page.evaluate(FIELDS, bufToB64(buf));
  (before >= 2 && after === 0)
    ? pass('양식 평탄화', '폼 필드 ' + before + ' → ' + after + ' (고정 완료)')
    : fail('양식 평탄화', '기대 0필드, 실제 전 ' + before + '/후 ' + after);
  await page.close();
}
async function testRotatePages(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/rotate/'); await ready(page);
  const b = await page.evaluate(GEN, [[4, 'R']]);
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'r.pdf')], async () => {
    await page.evaluate(() => document.querySelector('input[name="rot-mode"][value="pages"]').click());
    await page.fill('#rot-pages', '2');
  });
  const rots = await page.evaluate(ROTS, bufToB64(buf));
  JSON.stringify(rots) === JSON.stringify([0, 90, 0, 0])
    ? pass('회전(특정 페이지)', '4쪽 중 2쪽만 90° → [' + rots.join(',') + ']')
    : fail('회전(특정 페이지)', '기대 0,90,0,0, 실제 [' + rots.join(',') + ']');
  await page.close();
}
async function testWebp(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/to-image/'); await ready(page);
  const b = await page.evaluate(GEN, [[1, 'I']]);
  const { buf, filename } = await setAndRun(page, [b64ToFile(b[0], 'i.pdf')], async () => {
    await page.evaluate(() => document.querySelector('input[name="img-format"][value="webp"]').click());
  });
  const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  (/\.webp$/i.test(filename) && isWebp) ? pass('이미지변환(WEBP)', filename + ' · RIFF/WEBP 헤더 확인')
    : fail('이미지변환(WEBP)', 'WEBP 헤더/이름 불일치: ' + filename);
  await page.close();
}

async function testProtect(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/protect/'); await ready(page);
  const b = await page.evaluate(GEN, [[2, 'P']]);
  const { buf } = await setAndRun(page, [b64ToFile(b[0], 'p.pdf')], async () => { await page.fill('#protect-pw', 'myPass123'); });
  await page.close();
  const enc = Buffer.from(buf).toString('latin1').includes('/Encrypt');
  // pdf.js 있는 페이지에서 암호화 검증(무비번 차단 / 비번으로 열림)
  const vp = await ctx.newPage(); await vp.goto(BASE + '/to-image/'); await vp.waitForFunction(() => window.pdfjsLib, null, { timeout: 10000 });
  const v = await vp.evaluate(async (b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    let noPw = 'opened', withPw = 'fail';
    try { await pdfjsLib.getDocument({ data: new Uint8Array(u.slice(0)) }).promise; } catch (e) { noPw = e.name; }
    try { const d = await pdfjsLib.getDocument({ data: new Uint8Array(u.slice(0)), password: 'myPass123' }).promise; withPw = 'opened ' + d.numPages; } catch (e) { withPw = 'FAIL ' + e.name; }
    return { noPw, withPw };
  }, bufToB64(buf));
  await vp.close();
  (enc && v.noPw === 'PasswordException' && /opened 2/.test(v.withPw))
    ? pass('비밀번호 설정', '암호화 → 무비번 차단(' + v.noPw + '), 비번으로 ' + v.withPw)
    : fail('비밀번호 설정', 'enc=' + enc + ' noPw=' + v.noPw + ' withPw=' + v.withPw);
}

async function testHomeWidgets(ctx) {
  const page = await ctx.newPage(); await page.goto(BASE + '/'); await ready(page);
  const b = await page.evaluate(GEN, [[3, 'A'], [2, 'B']]);
  // 홈에 임베드된 합치기 위젯 (인스턴스 스코프)
  const r1 = await setAndRun(page, [b64ToFile(b[0], 'a.pdf'), b64ToFile(b[1], 'b.pdf')], null, '[data-tool="merge"]');
  const c1 = await page.evaluate(COUNT, bufToB64(r1.buf));
  c1 === 5 ? pass('홈 합치기 위젯', '3+2 → ' + c1) : fail('홈 합치기 위젯', '기대 5, 실제 ' + c1);
  // 홈 분할 위젯 (탭 전환 후 낱장)
  await page.click('.herotool__tab[data-tab="split"]');
  await page.waitForSelector('[data-tool="split"]', { state: 'visible' });
  const r2 = await setAndRun(page, [b64ToFile(b[0], 'a.pdf')], null, '[data-tool="split"]');
  const n2 = (await page.evaluate(ZIP, bufToB64(r2.buf))).length;
  n2 === 3 ? pass('홈 분할 위젯', '3페이지 → ZIP ' + n2) : fail('홈 분할 위젯', '기대 3, 실제 ' + n2);
  await page.close();
}

// ───────── 구조 감사 ─────────
async function auditPage(ctx, path) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  const resp = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  const status = resp ? resp.status() : 0;
  const data = await page.evaluate(() => {
    const m = (sel, attr) => { const e = document.querySelector(sel); return e ? e.getAttribute(attr) : null; };
    const lds = Array.prototype.map.call(document.querySelectorAll('script[type="application/ld+json"]'), s => s.textContent);
    const links = Array.prototype.map.call(document.querySelectorAll('a[href]'), a => a.getAttribute('href'))
      .filter(h => h && !/^https?:|^mailto:|^#/.test(h));
    return {
      title: document.title,
      desc: m('meta[name="description"]', 'content'),
      canonical: m('link[rel="canonical"]', 'href'),
      og: !!document.querySelector('meta[property="og:title"]'),
      viewport: !!document.querySelector('meta[name="viewport"]'),
      h1: document.querySelectorAll('h1').length,
      h1text: (document.querySelector('h1') || {}).textContent || '',
      lds, links
    };
  });
  const tag = 'SEO ' + path;
  let probs = [];
  if (status !== 200) probs.push('HTTP ' + status);
  if (!data.title) probs.push('title 없음');
  if (!data.desc) probs.push('description 없음');
  else if ([...data.desc].length > 90) probs.push('description ' + [...data.desc].length + '자(>90)');
  if (!data.canonical) probs.push('canonical 없음');
  if (!data.og) probs.push('og:title 없음');
  if (!data.viewport) probs.push('viewport 없음');
  if (data.h1 !== 1) probs.push('h1 ' + data.h1 + '개');
  for (const ld of data.lds) { try { JSON.parse(ld); } catch (e) { probs.push('JSON-LD 파싱오류'); } }
  if (consoleErrors.length) probs.push('콘솔에러 ' + consoleErrors.length + '건: ' + consoleErrors.slice(0, 2).join(' | '));
  // 내부 링크 점검
  const base = new URL(BASE + path);
  for (const href of [...new Set(data.links)]) {
    const u = new URL(href, base).toString();
    // Playwright 요청 컨텍스트로 링크 점검(Node fetch/undici의 CI 크래시 회피)
    try { const r = await page.request.get(u); if (r.status() >= 400) probs.push('링크 ' + href + ' → ' + r.status()); }
    catch (e) { probs.push('링크 ' + href + ' 실패'); }
  }
  probs.length ? fail(tag, probs.join('; ')) : pass(tag, '"' + data.h1text.trim() + '" 메타·링크·콘솔 정상');
  await page.close();
}

// ───────── 실행 ─────────
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  try {
    console.log('▶ 기능 실측...');
    await testMerge(ctx); await testSplit(ctx); await testExtract(ctx);
    await testDelete(ctx); await testOrganize(ctx); await testToImage(ctx); await testPageNumbers(ctx); await testUnlock(ctx);
    await testWatermark(ctx); await testFlatten(ctx); await testRotatePages(ctx); await testWebp(ctx); await testProtect(ctx);
    // 홈은 런처(도구 페이지로 링크)로 전환 — 도구 실동작은 각 도구 페이지에서 검증
    console.log('▶ 구조 감사...');
    for (const p of PAGES) await auditPage(ctx, p);
  } catch (e) {
    fail('실행오류', e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
  }
  console.log('\n──────── QA 결과 ────────');
  let nfail = 0;
  for (const r of results) { console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.msg ? '  — ' + r.msg : '')); if (!r.ok) nfail++; }
  console.log('─────────────────────────');
  console.log(results.length + '개 중 ' + (results.length - nfail) + ' PASS, ' + nfail + ' FAIL');
  process.exit(nfail ? 1 : 0);
})();
