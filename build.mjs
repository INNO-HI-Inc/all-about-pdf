#!/usr/bin/env node
/*
 * PDF의 모든 것 — 정적 사이트 빌드 스크립트
 * 콘텐츠(_workspace/content_*.json) + 템플릿 → 기능별 정적 HTML + sitemap/robots/manifest
 * 사용: node build.mjs
 * ※ 배포 URL이 바뀌면 아래 SITE_URL / GITHUB_URL 한 곳만 고치면 됩니다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WS = join(ROOT, '_workspace');

// ───────── 설정 (배포 시 여기만 수정) ─────────
const SITE_URL = process.env.SITE_URL || 'https://inno-hi-inc.github.io/all-about-pdf';
const GITHUB_URL = process.env.GITHUB_URL || 'https://github.com/INNO-HI-Inc/all-about-pdf';
const BRAND = 'PDF의 모든 것';
const TODAY = '2026-06-04';

// ───────── 유틸 ─────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const read = (slug) => JSON.parse(readFileSync(join(WS, `content_${slug}.json`), 'utf8'));

// ───────── 도구 메타 ─────────
const TOOLS = [
  { slug: 'merge', emoji: '🔗', nav: '합치기', multiple: true, reorder: true,
    runLabel: 'PDF 합치기', dropTitle: '합칠 PDF들을 끌어다 놓으세요', pagecount: false,
    feature: ['여러 PDF 병합', '페이지 순서 변경', '무료·무제한'], options: '' },
  { slug: 'split', emoji: '✂️', nav: '분할', multiple: false,
    runLabel: 'PDF 분할하기', dropTitle: '분할할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['낱장 분리', '범위 지정 분할', 'ZIP 일괄 다운로드'], options: optSplit() },
  { slug: 'unlock', emoji: '🔓', nav: '잠금해제', multiple: false,
    runLabel: '잠금 해제하기', dropTitle: '잠금을 풀 PDF를 끌어다 놓으세요', pagecount: false,
    feature: ['인쇄·편집 제한 해제', '비밀번호 제거', '브라우저 내 처리'], options: optUnlock() },
  { slug: 'extract', emoji: '📑', nav: '페이지 추출', multiple: false,
    runLabel: '페이지 추출하기', dropTitle: '페이지를 추출할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['특정 페이지 추출', '여러 구간 지정', '순서 유지'], options: optPages('extract-pages', '1, 3, 5-7', '추출할 페이지') },
  { slug: 'delete', emoji: '🗑️', nav: '페이지 삭제', multiple: false,
    runLabel: '페이지 삭제하기', dropTitle: '페이지를 삭제할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['특정 페이지 삭제', '여러 페이지 일괄', '원본 보존'], options: optPages('delete-pages', '2, 4, 6-8', '삭제할 페이지') },
  { slug: 'to-image', emoji: '🖼️', nav: '이미지 변환', multiple: false,
    runLabel: '이미지로 변환하기', dropTitle: '이미지로 바꿀 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['PNG·JPG 변환', '화질(배율) 선택', '페이지 지정'], options: optImage() },
  { slug: 'page-numbers', emoji: '🔢', nav: '페이지 번호', multiple: false,
    runLabel: '페이지 번호 넣기', dropTitle: '번호를 넣을 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['위치·형식 선택', '시작 번호 지정', '표지 제외'], options: optPageNumbers() },
];
const TOOL_BY = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));

// ───────── 옵션 마크업 (tools/*.js의 ID와 일치) ─────────
function optSplit() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">분할 방식</span>
    <div class="segmented" role="radiogroup" aria-label="분할 방식">
      <label><input type="radio" name="split-mode" value="each" checked><span>낱장으로 분리</span></label>
      <label><input type="radio" name="split-mode" value="ranges"><span>범위 지정</span></label>
    </div>
  </div>
  <div class="option">
    <label class="option__label" for="split-ranges">페이지 범위 <span class="option__hint">'범위 지정' 선택 시 · 예: 1-3, 4-8, 9</span></label>
    <input type="text" id="split-ranges" class="field" placeholder="1-3, 4-8, 9" inputmode="numeric" autocomplete="off">
  </div>
</div>`;
}
function optUnlock() {
  return `<div class="options">
  <div class="option">
    <label class="option__label" for="unlock-pw">비밀번호 <span class="option__hint">열 때 비밀번호를 묻는 경우에만 입력</span></label>
    <input type="password" id="unlock-pw" class="field" placeholder="아는 비밀번호 (선택)" autocomplete="off">
  </div>
  <label class="checkbox"><input type="checkbox" id="unlock-raster"> 이미지로 해제 (비밀번호가 걸린 PDF용)</label>
  <p class="callout callout--warn"><span class="callout__ic">⚖️</span><span><strong>암호 크랙이 아닙니다.</strong> 본인이 아는 비밀번호, 또는 인쇄·편집 제한만 제거합니다. 모르는 비밀번호는 풀 수 없어요.</span></p>
</div>`;
}
function optPages(id, ph, label) {
  return `<div class="options">
  <div class="option">
    <label class="option__label" for="${id}">${label} <span class="option__hint">예: ${ph}</span></label>
    <input type="text" id="${id}" class="field" placeholder="${ph}" inputmode="numeric" autocomplete="off">
  </div>
</div>`;
}
function optImage() {
  return `<div class="options">
  <div class="option-row">
    <div class="option">
      <span class="option__label">이미지 형식</span>
      <div class="segmented" role="radiogroup" aria-label="이미지 형식">
        <label><input type="radio" name="img-format" value="png" checked><span>PNG</span></label>
        <label><input type="radio" name="img-format" value="jpg"><span>JPG</span></label>
      </div>
    </div>
    <div class="option">
      <label class="option__label" for="img-scale">화질(배율)</label>
      <select id="img-scale" class="field">
        <option value="1">보통 (1배)</option>
        <option value="2" selected>선명 (2배)</option>
        <option value="3">아주 선명 (3배)</option>
      </select>
    </div>
  </div>
  <div class="option">
    <span class="option__label">변환 범위</span>
    <div class="segmented" role="radiogroup" aria-label="변환 범위">
      <label><input type="radio" name="img-pages-mode" value="all" checked><span>전체 페이지</span></label>
      <label><input type="radio" name="img-pages-mode" value="custom"><span>특정 페이지</span></label>
    </div>
  </div>
  <div class="option">
    <label class="option__label" for="img-pages">페이지 지정 <span class="option__hint">'특정 페이지' 선택 시 · 예: 1, 3, 5-7</span></label>
    <input type="text" id="img-pages" class="field" placeholder="1, 3, 5-7" inputmode="numeric" autocomplete="off">
  </div>
</div>`;
}
function optPageNumbers() {
  return `<div class="options">
  <div class="option-row">
    <div class="option">
      <label class="option__label" for="pn-position">위치</label>
      <select id="pn-position" class="field">
        <option value="bottom-center" selected>아래 가운데</option>
        <option value="bottom-right">아래 오른쪽</option>
        <option value="bottom-left">아래 왼쪽</option>
        <option value="top-center">위 가운데</option>
        <option value="top-right">위 오른쪽</option>
        <option value="top-left">위 왼쪽</option>
      </select>
    </div>
    <div class="option">
      <label class="option__label" for="pn-start">시작 번호</label>
      <input type="number" id="pn-start" class="field" value="1" min="0" inputmode="numeric">
    </div>
  </div>
  <div class="option">
    <span class="option__label">번호 형식</span>
    <div class="segmented" role="radiogroup" aria-label="번호 형식">
      <label><input type="radio" name="pn-format" value="n" checked><span>1</span></label>
      <label><input type="radio" name="pn-format" value="n/total"><span>1 / N</span></label>
      <label><input type="radio" name="pn-format" value="dash"><span>- 1 -</span></label>
    </div>
  </div>
  <label class="checkbox"><input type="checkbox" id="pn-skip"> 표지(첫 페이지)는 번호 제외</label>
</div>`;
}

// ───────── 공통 셸 ─────────
function header(rel) {
  const home = rel === '' ? './' : rel;
  const navItems = ['merge', 'split', 'unlock', 'to-image', 'page-numbers']
    .map((s) => `<a href="${home}${s}/">${TOOL_BY[s].nav}</a>`).join('');
  return `<header class="site-header"><div class="container"><div class="site-header__inner">
  <a class="brand" href="${home}"><span class="brand__logo">PDF</span><span>PDF의 <span class="brand__dot">모든 것</span></span></a>
  <nav class="site-nav" aria-label="주요 도구">${navItems}<a href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">GitHub</a></nav>
</div></div></header>`;
}
function footer(rel) {
  const home = rel === '' ? './' : rel;
  const toolLinks = TOOLS.map((t) => `<li><a href="${home}${t.slug}/">${t.nav}</a></li>`).join('');
  return `<footer class="site-footer"><div class="container">
  <div class="site-footer__grid">
    <div class="site-footer__col site-footer__brand">
      <a class="brand" href="${home}"><span class="brand__logo">PDF</span><span>PDF의 <span class="brand__dot">모든 것</span></span></a>
      <p>필요한 PDF 작업을 설치 없이, 파일을 서버에 올리지 않고 무료로. 모든 처리는 내 브라우저 안에서만 이뤄집니다.</p>
    </div>
    <div class="site-footer__col"><h4>도구</h4><ul>${toolLinks}</ul></div>
    <div class="site-footer__col"><h4>정보</h4><ul>
      <li><a href="${home}about/">소개 · 개인정보</a></li>
      <li><a href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">오픈소스(GitHub)</a></li>
      <li><a href="${escAttr(GITHUB_URL)}/issues" rel="noopener" target="_blank">문의 · 제안</a></li>
    </ul></div>
  </div>
  <div class="site-footer__bottom">
    <span>© 2026 ${BRAND} · 오픈소스 · 모든 파일은 내 기기에서만 처리됩니다.</span>
    <span>광고·추적·업로드 없음</span>
  </div>
</div></footer>`;
}

function page({ title, desc, canonical, ogTitle, rel, jsonld, main, withScripts }) {
  const ld = jsonld ? `\n  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : '';
  const scripts = withScripts ? `
  <script>window.AAP_BASE='${rel}';</script>
  <script src="${rel}assets/vendor/pdf-lib.min.js" defer></script>
  <script src="${rel}assets/vendor/pdf.min.js" defer></script>
  <script src="${rel}assets/vendor/jszip.min.js" defer></script>
  <script src="${rel}assets/js/ui.js" defer></script>
  <script src="${rel}assets/js/pdf-engine.js" defer></script>
  <script src="${rel}assets/js/tool-core.js" defer></script>
  <script src="${rel}assets/js/tools/${withScripts}.js" defer></script>` : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(desc)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow">
  <!-- 검색엔진 소유확인: 등록 후 아래 두 줄의 content 값을 채워 주석 해제 -->
  <!-- <meta name="naver-site-verification" content=""> -->
  <!-- <meta name="google-site-verification" content=""> -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escAttr(BRAND)}">
  <meta property="og:title" content="${escAttr(ogTitle || title)}">
  <meta property="og:description" content="${escAttr(desc)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:image" content="${SITE_URL}/assets/img/og-default.png">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${rel}assets/img/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="${rel}site.webmanifest">
  <meta name="theme-color" content="#3d6dfb">
  <link rel="stylesheet" href="${rel}assets/css/style.css">${ld}
</head>
<body>
  <a class="skip-link" href="#main">본문 바로가기</a>
${header(rel)}
  <main id="main">
${main}
  </main>
${footer(rel)}${scripts}
</body>
</html>
`;
}

// ───────── 도구 위젯 ─────────
function widget(t) {
  const pc = t.pagecount ? `\n      <p class="pagecount" id="aap-pagecount"></p>` : '';
  return `<div class="tool" data-tool="${t.slug}">
      <div class="dropzone" id="aap-drop" tabindex="0" role="button" aria-label="PDF 파일 선택 또는 끌어다 놓기">
        <input type="file" id="aap-file" accept="application/pdf" ${t.multiple ? 'multiple ' : ''}hidden>
        <svg class="dropzone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
        <p class="dropzone__title">${t.dropTitle}</p>
        <p class="dropzone__hint">또는 <span class="link">파일 선택</span> · 파일은 내 브라우저에서만 처리됩니다</p>
      </div>${pc}
      <ul class="filelist" id="aap-files"></ul>
      ${t.options}
      <div class="actions"><button class="btn btn--primary btn--lg btn--block" id="aap-run" disabled>${t.runLabel}</button></div>
      <div class="progress" id="aap-progress" hidden><div class="progress__bar" id="aap-bar"></div><span class="progress__text" id="aap-progress-text"></span></div>
      <div class="result" id="aap-result" hidden></div>
      <noscript><p class="callout callout--warn" style="margin-top:16px"><span class="callout__ic">ℹ️</span><span>이 도구는 자바스크립트가 필요합니다. 브라우저의 자바스크립트를 켜 주세요. 파일은 여전히 서버로 전송되지 않고 내 브라우저에서만 처리됩니다.</span></p></noscript>
    </div>`;
}

// ───────── 관련 도구 ─────────
function related(slug, rel) {
  const others = TOOLS.filter((t) => t.slug !== slug);
  const cards = others.map((t) => `<a href="${rel}${t.slug}/"><span class="ic">${t.emoji}</span> ${t.nav}</a>`).join('\n        ');
  return `<section class="section section--tight">
      <h2 class="center">다른 PDF 도구도 써보세요</h2>
      <div class="related">
        ${cards}
      </div>
    </section>`;
}

// ───────── 도구 페이지 ─────────
function buildTool(t) {
  const c = read(t.slug);
  const rel = '../';
  const canonical = `${SITE_URL}/${t.slug}/`;
  const steps = c.steps.map((s) => `<li>${esc(s)}</li>`).join('\n        ');
  const faqs = c.faq.map((f) => `<details><summary>${esc(f.q)}</summary><div class="faq__a">${esc(f.a)}</div></details>`).join('\n        ');
  const extra = (c.extraSections || []).map((s) =>
    `<section class="section section--tight prose"><h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p></section>`).join('\n    ');

  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'WebApplication',
      name: `${c.h1} - ${BRAND}`, url: canonical,
      applicationCategory: 'UtilitiesApplication', operatingSystem: 'All',
      browserRequirements: 'Requires JavaScript', inLanguage: 'ko',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      featureList: t.feature,
      publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL + '/' }
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: c.h1, item: canonical }
      ]
    }
  ];

  const main = `    <div class="container container--read">
      <nav class="breadcrumb" aria-label="위치"><a href="../">홈</a><span>›</span>${esc(c.h1)}</nav>
      <div class="tool-hero">
        <h1>${esc(c.h1)}</h1>
        <p class="tool-hero__sub">${esc(c.subtitle)}</p>
        <div class="badges badges--center">
          <span class="badge"><span class="badge__ic">✓</span> 서버 미전송 · 내 기기 처리</span>
          <span class="badge"><span class="badge__ic">✓</span> 완전 무료 · 워터마크 없음</span>
          <span class="badge"><span class="badge__ic">✓</span> 설치·회원가입 불필요</span>
        </div>
      </div>
      ${widget(t)}
      <section class="section section--tight prose">
        <p class="lead">${esc(c.intro)}</p>
      </section>
      <section class="section section--tight prose">
        <h2>${esc(c.h1)} 사용 방법</h2>
        <ol class="steps">
        ${steps}
        </ol>
      </section>
      <section class="section section--tight">
        <p class="callout callout--security"><span class="callout__ic">🔒</span><span><strong>파일은 서버로 전송되지 않습니다.</strong>${esc(c.security)}</span></p>
      </section>
    ${extra}
      <section class="section section--tight">
        <h2>자주 묻는 질문</h2>
        <div class="faq">
        ${faqs}
        </div>
      </section>
      ${related(t.slug, rel)}
    </div>`;

  const html = page({
    title: c.title, desc: c.metaDescription, canonical,
    ogTitle: `${c.h1} 무료 - ${BRAND}`, rel, jsonld, main, withScripts: t.slug
  });
  const dir = join(ROOT, t.slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`✓ /${t.slug}/index.html`);
}

// ───────── 홈 ─────────
function buildHome() {
  const c = read('home');
  const rel = '';
  const canonical = SITE_URL + '/';
  const cards = TOOLS.map((t) => {
    const tc = read(t.slug);
    return `<a class="tool-card" href="${t.slug}/">
          <span class="tool-card__ic">${t.emoji}</span>
          <span class="tool-card__title">${tc.h1}</span>
          <span class="tool-card__desc">${esc(tc.subtitle)}</span>
          <span class="tool-card__go">바로 사용하기 →</span>
        </a>`;
  }).join('\n        ');
  const usp = c.uspCards.map((u) =>
    `<div class="tool-card"><span class="tool-card__title">${esc(u.title)}</span><span class="tool-card__desc">${esc(u.desc)}</span></div>`).join('\n          ');
  const faqs = c.faq.map((f) => `<details><summary>${esc(f.q)}</summary><div class="faq__a">${esc(f.a)}</div></details>`).join('\n          ');

  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: BRAND, url: SITE_URL + '/', inLanguage: 'ko',
      description: c.metaDescription
    },
    {
      '@context': 'https://schema.org', '@type': 'Organization',
      name: BRAND, url: SITE_URL + '/', sameAs: [GITHUB_URL]
    }
  ];

  const main = `    <div class="container">
      <section class="hero">
        <span class="hero__eyebrow">🔒 파일을 서버에 올리지 않는 PDF 도구</span>
        <h1>${esc(c.heroTitle)}</h1>
        <p class="hero__sub">${esc(c.heroSubtitle)}</p>
        <div class="badges badges--center">
          <span class="badge"><span class="badge__ic">✓</span> 100% 브라우저 처리</span>
          <span class="badge"><span class="badge__ic">✓</span> 완전 무료 · 무제한</span>
          <span class="badge"><span class="badge__ic">✓</span> 설치·회원가입 없음</span>
        </div>
      </section>
      <section class="section section--tight">
        <div class="tools-grid">
        ${cards}
        </div>
      </section>
      <section class="section prose">
        <p class="lead">${esc(c.intro)}</p>
      </section>
      <section class="section--tight">
        <h2 class="center">${esc(c.whyTitle)}</h2>
        <div class="tools-grid" style="margin-top:20px">
          ${usp}
        </div>
        <p class="prose" style="max-width:760px;margin:24px auto 0">${esc(c.why)}</p>
      </section>
      <section class="section">
        <h2 class="center">자주 묻는 질문</h2>
        <div class="faq" style="max-width:760px;margin:20px auto 0">
          ${faqs}
        </div>
      </section>
    </div>`;

  const html = page({
    title: c.metaTitle, desc: c.metaDescription, canonical,
    ogTitle: c.metaTitle, rel, jsonld, main, withScripts: null
  });
  writeFileSync(join(ROOT, 'index.html'), html);
  console.log('✓ /index.html');
}

// ───────── 소개 페이지 ─────────
function buildAbout() {
  const rel = '../';
  const canonical = `${SITE_URL}/about/`;
  const main = `    <div class="container container--read prose">
      <nav class="breadcrumb" aria-label="위치"><a href="../">홈</a><span>›</span>소개 · 개인정보</nav>
      <h1>소개 · 개인정보 처리방침</h1>
      <p class="lead">「${BRAND}」은 설치와 회원가입 없이 쓰는 무료 PDF 도구 모음입니다. 가장 큰 차이는 <strong>파일을 서버에 올리지 않는다</strong>는 점입니다.</p>
      <h2>파일은 어떻게 처리되나요?</h2>
      <p>합치기·분할·변환 등 모든 작업은 여러분의 <strong>웹 브라우저 안(내 기기)</strong>에서만 이뤄집니다. PDF 파일은 어떤 서버로도 업로드되지 않으며, 작업이 끝나거나 창을 닫으면 메모리에서 사라집니다. 인터넷 연결이 끊긴 상태에서도 한 번 페이지를 열어두면 대부분의 기능이 동작합니다.</p>
      <h2>개인정보 수집을 하나요?</h2>
      <p>이 사이트는 회원가입을 받지 않고, 파일·이메일 등 어떤 개인정보도 수집·저장하지 않습니다. 파일을 외부로 전송하지 않으므로 업로드된 문서가 외부에 보관될 일이 없습니다.</p>
      <h2>무료인가요?</h2>
      <p>네. 완전 무료이며 결과물에 워터마크가 붙지 않고, 파일 개수·용량 제한도 없습니다.</p>
      <h2>오픈소스입니다</h2>
      <p>「${BRAND}」은 누구나 코드를 보고 함께 개선할 수 있는 오픈소스 프로젝트입니다. 기능 제안·버그 제보·기여를 환영합니다. <a href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">GitHub 저장소</a>에서 참여하실 수 있습니다.</p>
      <h2>잠금해제 도구 안내</h2>
      <p>잠금해제는 암호를 알아내는 크랙 도구가 아니라, 본인이 알고 있는 비밀번호 또는 인쇄·편집 제한을 제거하는 도구입니다. 권한이 있는 본인의 문서에만 사용해 주세요.</p>
      ${related('', rel).replace('다른 PDF 도구도 써보세요', '도구 바로가기')}
    </div>`;
  const html = page({
    title: `소개 · 개인정보 | ${BRAND}`,
    desc: `${BRAND}은 파일을 서버에 올리지 않고 내 브라우저에서만 처리하는 무료 오픈소스 PDF 도구 모음입니다. 개인정보를 수집하지 않습니다.`,
    canonical, ogTitle: `소개 · 개인정보 | ${BRAND}`, rel, jsonld: null, main, withScripts: null
  });
  const dir = join(ROOT, 'about');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log('✓ /about/index.html');
}

// ───────── 404 ─────────
function build404() {
  const rel = '';
  const main = `    <div class="container center" style="padding:80px 0">
      <h1>페이지를 찾을 수 없어요 (404)</h1>
      <p class="muted">주소가 바뀌었거나 삭제된 페이지일 수 있습니다.</p>
      <p style="margin-top:24px"><a class="btn btn--primary btn--lg" href="${SITE_URL}/">홈으로 가기</a></p>
    </div>`;
  const html = page({
    title: `페이지를 찾을 수 없어요 | ${BRAND}`,
    desc: '요청하신 페이지를 찾을 수 없습니다.',
    canonical: SITE_URL + '/404/', ogTitle: '404', rel, jsonld: null, main, withScripts: null
  });
  writeFileSync(join(ROOT, '404.html'), html);
  console.log('✓ /404.html');
}

// ───────── SEO 파일 ─────────
function buildSeoFiles() {
  const urls = [SITE_URL + '/', ...TOOLS.map((t) => `${SITE_URL}/${t.slug}/`), SITE_URL + '/about/'];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u, i) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${i === 0 ? '1.0' : '0.8'}</priority>\n  </url>`).join('\n')}
</urlset>
`;
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
  console.log('✓ /sitemap.xml');

  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  writeFileSync(join(ROOT, 'robots.txt'), robots);
  console.log('✓ /robots.txt');

  const manifest = {
    name: BRAND, short_name: 'PDF모든것', lang: 'ko',
    description: '파일을 서버에 올리지 않는 무료 PDF 도구 모음',
    start_url: './', display: 'standalone', background_color: '#f4f6fb', theme_color: '#3d6dfb',
    icons: [
      { src: 'assets/img/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  };
  writeFileSync(join(ROOT, 'site.webmanifest'), JSON.stringify(manifest, null, 2));
  console.log('✓ /site.webmanifest');
}

// ───────── 실행 ─────────
console.log(`\nPDF의 모든 것 — 빌드 (SITE_URL=${SITE_URL})\n`);
buildHome();
TOOLS.forEach(buildTool);
buildAbout();
build404();
buildSeoFiles();
console.log('\n빌드 완료.\n');
