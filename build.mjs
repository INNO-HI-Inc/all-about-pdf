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
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WS = join(ROOT, '_workspace');

// ───────── 설정 (배포 시 여기만 수정) ─────────
// 커스텀 도메인. 값이 있으면 SITE_URL이 이 도메인 기준이 되고 CNAME 파일이 자동 생성된다.
// 커스텀 도메인을 쓰지 않으려면 '' 로 비우면 github.io 서브경로로 되돌아간다.
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN ?? 'everything-pdf.site';
const SITE_URL = process.env.SITE_URL || (CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}` : 'https://inno-hi-inc.github.io/all-about-pdf');
const GITHUB_URL = process.env.GITHUB_URL || 'https://github.com/INNO-HI-Inc/all-about-pdf';
// 공개 문의 이메일(애드센스 심사·이용자 신뢰용). 다른 주소를 쓰려면 이 한 줄만 교체.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'board@innohi.ai.kr';
const BRAND = 'PDF의 모든 것';
const TODAY = '2026-06-04';
const BUILD_DATE = new Date().toISOString().slice(0, 10); // sitemap lastmod git 폴백용(실제 빌드일)
let _outNameSeq = 0; // out-name 입력 id를 인스턴스마다 유니크하게(홈 다중 패널 중복 방지)
// Google 애드센스: 승인받은 게시자 ID로 아래 한 줄만 교체하면 전 페이지에 로더가 삽입되고
// ads.txt·개인정보 고지가 함께 켜집니다. (예: 'ca-pub-1234567890123456' — ca-pub- 뒤 16자리 숫자)
// 자동 광고(Auto ads)를 쓰므로 로더 스크립트만 넣으면 되고, 광고 위치 배치는
// 애드센스 대시보드 > 광고 > 자동 광고에서 켭니다. 수동 슬롯은 필요 없습니다.
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || 'ca-pub-4315758870466399';
const ADSENSE_ENABLED = /^ca-pub-\d{16}$/.test(ADSENSE_CLIENT);
// Google 애널리틱스(GA4): 측정 ID(G-XXXXXXXXXX)로 아래 한 줄만 교체하면 전 페이지에
// gtag가 삽입되고 개인정보 고지에 분석 쿠키 문구가 함께 켜집니다.
// GA4 속성 만들기 > 데이터 스트림(웹) 생성 > '측정 ID'(G-로 시작) 복사.
const GA_ID = process.env.GA_ID || 'G-XXXXXXXXXX';
// 실제 GA4 ID만 활성화. 플레이스홀더(G-XXXX…)는 영숫자라 정규식에 걸리므로 명시적으로 제외.
const GA_ENABLED = /^G-[A-Z0-9]{8,}$/.test(GA_ID) && !/^G-X+$/.test(GA_ID);
// 검색엔진 소유확인(HTML 태그 방식). 값이 있으면 전 페이지 <head>에 meta가 자동 삽입된다.
// 구글 서치콘솔: 'HTML 태그' 방식의 content 값(google-site-verification= 뒤 문자열)만 넣으면 됨.
// 네이버 서치어드바이저: 사이트 등록 후 받은 meta content 값을 NAVER_SITE_VERIFICATION에 넣으면 됨.
const GOOGLE_SITE_VERIFICATION = process.env.GSV || 'iu1zwZYBeFRbASv8E0ZcW3ge3H1p0eMzTcESJHWYhvA';
const NAVER_SITE_VERIFICATION = process.env.NSV || '';
function verifyHead() {
  var out = '';
  if (GOOGLE_SITE_VERIFICATION) out += `\n  <meta name="google-site-verification" content="${escAttr(GOOGLE_SITE_VERIFICATION)}">`;
  if (NAVER_SITE_VERIFICATION) out += `\n  <meta name="naver-site-verification" content="${escAttr(NAVER_SITE_VERIFICATION)}">`;
  return out;
}
// CSS/JS 캐시버스팅: 내용 해시 기반 — 파일 내용이 바뀔 때만 ?v= 가 변해 캐시가 유지되고
// 빌드마다 전체 HTML이 diff되던 문제도 사라진다(내용 무변경 → URL 무변경).
const _verCache = {};
function assetVer(relPath) {
  if (_verCache[relPath]) return _verCache[relPath];
  try {
    const h = createHash('md5').update(readFileSync(join(ROOT, relPath))).digest('hex').slice(0, 8);
    return (_verCache[relPath] = h);
  } catch (e) { return '0'; }
}

// 파일의 git 최종 커밋일(YYYY-MM-DD). JSON-LD dateModified·sitemap lastmod 공용.
// git 실패 시 실제 빌드일로 폴백. 결과를 캐시해 중복 git 호출을 막는다.
const _dateCache = {};
function fileDate(relPath) {
  if (_dateCache[relPath]) return _dateCache[relPath];
  try {
    const d = execSync(`git log -1 --format=%cs -- "${relPath}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return (_dateCache[relPath] = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : BUILD_DATE);
  } catch { return BUILD_DATE; }
}

// 로고 마크 (글로시 그라디언트 오브) — 헤더·푸터 공통
const LOGO_SVG = '<svg class="logo-mark" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs><radialGradient id="aapOrb" cx="34%" cy="27%" r="84%"><stop offset="0%" stop-color="#c8b9ff"/><stop offset="36%" stop-color="#6d6af6"/><stop offset="74%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#36178a"/></radialGradient></defs><circle cx="16" cy="16" r="13.6" fill="url(#aapOrb)"/><ellipse cx="11.6" cy="10.4" rx="4.7" ry="3" fill="#fff" opacity=".5" transform="rotate(-18 11.6 10.4)"/></svg>';

// ───────── 커스텀 라인 아이콘 (이모지 대체, currentColor) ─────────
const IC = (p) => `<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  merge: IC('<rect x="3.5" y="8" width="11" height="12.5" rx="2"/><path d="M9 8V5.5A2 2 0 0 1 11 3.5h7.5A2 2 0 0 1 20.5 5.5V15a2 2 0 0 1-2 2H14.5"/>'),
  split: IC('<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><line x1="20" y1="4" x2="8.6" y2="15.4"/><line x1="14.6" y1="14.6" x2="20" y2="20"/><line x1="8.6" y1="8.6" x2="11.4" y2="11.4"/>'),
  unlock: IC('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.9"/>'),
  extract: IC('<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9.5"/><path d="M14 3.5v5h5"/><path d="M12 17v-6.4"/><path d="M9.6 12.8 12 10.4l2.4 2.4"/>'),
  delete: IC('<path d="M4.5 7h15"/><path d="M9 7V5.4A1.6 1.6 0 0 1 10.6 3.8h2.8A1.6 1.6 0 0 1 15 5.4V7"/><path d="M6.6 7l.9 12.2A1.6 1.6 0 0 0 9 20.7h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7"/><line x1="10" y1="10.5" x2="10" y2="17"/><line x1="14" y1="10.5" x2="14" y2="17"/>'),
  image: IC('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M20.5 15.5 16 11 6 21"/>'),
  number: IC('<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8l-5-4.5z"/><path d="M14 3.5V8h5"/><path d="M10.3 12.6 9.7 17M13.7 12.6 13.1 17M9 14.1h5M8.7 15.6h5"/>'),
  free: IC('<path d="M11.6 3.6H18A2.4 2.4 0 0 1 20.4 6v6.3a2 2 0 0 1-.6 1.4l-7.4 7.4a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l7.5-7.5a2 2 0 0 1 1.5-.6z"/><circle cx="16" cy="8" r="1.3"/>'),
  infinity: IC('<path d="M9.4 9.3a3.1 3.1 0 1 0 0 5.4c1.7 0 2.6-1.6 2.6-2.7s.9-2.7 2.6-2.7a3.1 3.1 0 1 1 0 5.4c-1.7 0-2.6-1.6-2.6-2.7s-.9-2.7-2.6-2.7z"/>'),
  browser: IC('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.2h17"/><circle cx="6.6" cy="7.1" r=".55" fill="currentColor" stroke="none"/><circle cx="8.7" cy="7.1" r=".55" fill="currentColor" stroke="none"/>'),
  sparkle: IC('<path d="M12 3.4l1.7 4.9 4.9 1.7-4.9 1.7L12 16.6l-1.7-4.9L5.4 10l4.9-1.7L12 3.4z"/><path d="M18.5 14l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z"/>'),
  lock: IC('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'),
  info: IC('<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.8" r=".7" fill="currentColor" stroke="none"/>'),
  check: IC('<path d="M4.5 12.6l4.4 4.4L19.5 6.5"/>'),
  organize: IC('<rect x="3.4" y="3.4" width="7" height="7" rx="1.6"/><rect x="13.6" y="3.4" width="7" height="7" rx="1.6"/><rect x="3.4" y="13.6" width="7" height="7" rx="1.6"/><path d="M14.2 17.1h5.8M17.3 14.2l2.9 2.9-2.9 2.9"/>'),
  rotate: IC('<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 4.5V10H15"/>'),
  crop: IC('<path d="M6.5 2.5v13.5a1.5 1.5 0 0 0 1.5 1.5h13.5"/><path d="M2.5 6.5h13.5a1.5 1.5 0 0 1 1.5 1.5v13.5"/>'),
  compress: IC('<line x1="4" y1="12" x2="20" y2="12"/><path d="M8.5 5.5 12 9l3.5-3.5M8.5 18.5 12 15l3.5 3.5"/>'),
  shield: IC('<path d="M12 3l7 2.6v5.4c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8V5.6z"/><path d="M9 11.6h6"/>'),
  blankpage: IC('<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8l-5-4.5z"/><path d="M14 3.5V8h5"/><path d="M9.5 15.5h5"/>'),
  margin: IC('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="7.5" y="7.5" width="9" height="9" rx="1" stroke-dasharray="2.2 2"/>'),
  text: IC('<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8l-5-4.5z"/><path d="M14 3.5V8h5"/><path d="M8.5 12h7M8.5 15h7M8.5 9h3"/>'),
  reverse: IC('<path d="M7 8h10M7 8l3-3M7 8l3 3"/><path d="M17 16H7M17 16l-3-3M17 16l-3 3"/>'),
  grayscale: IC('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>'),
  nup: IC('<rect x="3.8" y="3.8" width="7" height="7" rx="1.2"/><rect x="13.2" y="3.8" width="7" height="7" rx="1.2"/><rect x="3.8" y="13.2" width="7" height="7" rx="1.2"/><rect x="13.2" y="13.2" width="7" height="7" rx="1.2"/>'),
  sign: IC('<path d="M4 16.8c2-.3 3-1.2 4.6-3.9.8-1.4 1.6-2.9 2.4-2.9.6 0 .7.7.4 1.6-.4 1.2-.9 2 0 2.5.7.4 1.6-.2 2.3-1.1"/><path d="M15.2 4.2l4.6 4.6"/><path d="M3.5 20.5h17"/>'),
  watermark: IC('<path d="M12 3.4c3.1 3.7 5.6 6.6 5.6 9.6a5.6 5.6 0 0 1-11.2 0c0-3 2.5-5.9 5.6-9.6z"/><path d="M9 13.4a3 3 0 0 0 3 3"/>'),
  flatten: IC('<path d="M12 3.4 20 7.6l-8 4.2-8-4.2z"/><path d="M4 12l8 4.2 8-4.2"/><path d="M4 16.4l8 4.2 8-4.2"/>'),
  protect: IC('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/><circle cx="12" cy="15.4" r="1.3"/><path d="M12 16.4v2"/>'),
};
const DOT_SVG = '<svg class="pill-dot" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>';

// PDF 레드 직관 아이콘(컬러): 빨간 PDF 문서 + 동작 컬러 배지. 한눈에 '무슨 PDF 작업'인지 읽힘.
const PDF_RED = '#E5252A', PDF_FOLD = '#B3160F';
const pdfPage = (lines) => `<path d="M6.4 2.6h6.6L17.6 7v11.4a1.5 1.5 0 0 1-1.5 1.5H6.4a1.5 1.5 0 0 1-1.5-1.5V4.1a1.5 1.5 0 0 1 1.5-1.5z" fill="${PDF_RED}"/><path d="M12.7 2.6 17.6 7h-3.8a1.1 1.1 0 0 1-1.1-1.1z" fill="${PDF_FOLD}"/>${lines >= 1 ? '<rect x="7.2" y="8.7" width="6" height="1.2" rx=".6" fill="#fff" opacity=".9"/>' : ''}${lines >= 2 ? '<rect x="7.2" y="11" width="4.2" height="1.2" rx=".6" fill="#fff" opacity=".9"/>' : ''}`;
const pdfBadge = (cx, cy, fill, inner) => `<circle cx="${cx}" cy="${cy}" r="4.4" fill="${fill}" stroke="#fff" stroke-width="1.2"/>${inner}`;
const pdfSvg = (inner) => `<svg viewBox="0 0 24 24" class="ic-svg ic-pdf" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const ICONS_PDF = {
  merge: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#18a957', '<path d="M17.4 15.5v3.8M15.5 17.4h3.8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>')),
  split: pdfSvg(`<path d="M6.4 2.6h7.4L17.6 7v12.3a1.5 1.5 0 0 1-1.5 1.5H6.4a1.5 1.5 0 0 1-1.5-1.5V4.1a1.5 1.5 0 0 1 1.5-1.5z" fill="${PDF_RED}"/><path d="M12.7 2.6 17.6 7h-3.8a1.1 1.1 0 0 1-1.1-1.1z" fill="${PDF_FOLD}"/><path d="M11.4 7.4v11.4" stroke="#fff" stroke-width="1.2" stroke-dasharray="1.8 1.6" stroke-linecap="round"/><g stroke="#fff" stroke-width="1.05" fill="none"><circle cx="9.4" cy="5.5" r="1.05"/><circle cx="9.4" cy="8.1" r="1.05"/><path d="M10.4 6 13.3 6.9M10.4 7.6 13.3 6.7" stroke-linecap="round"/></g>`),
  unlock: pdfSvg(pdfPage(1) + '<path d="M15.4 15.5v-1.7a2 2 0 0 1 3.8-.9" fill="none" stroke="#f5a623" stroke-width="1.4" stroke-linecap="round"/><rect x="13.8" y="15.3" width="6.5" height="5.4" rx="1.1" fill="#f5a623" stroke="#fff" stroke-width="1"/><circle cx="17.05" cy="17.7" r=".95" fill="#fff"/>'),
  extract: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2f6df6', '<path d="M17.4 19.6v-4.3M15.4 17l2-2 2 2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>')),
  delete: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2b303b', '<path d="M15.4 17.4h4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>')),
  'to-image': pdfSvg(pdfPage(1) + '<rect x="13" y="13" width="7.8" height="7.8" rx="1.4" fill="#18a957" stroke="#fff" stroke-width="1"/><circle cx="15.5" cy="15.7" r="1" fill="#fff"/><path d="M13.7 19.7l2.1-2.4 1.4 1.5 1.3-1.5 1.9 2.4z" fill="#fff"/>'),
  'page-numbers': pdfSvg(pdfPage(2) + '<circle cx="11.3" cy="17.6" r="3.6" fill="#4f46e5" stroke="#fff" stroke-width="1.1"/><path d="M11.55 15.9v3.4M10.5 16.5l1.05-.6" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  'image-to-pdf': pdfSvg(pdfPage(0) + '<rect x="6.8" y="8.2" width="6.8" height="5.4" rx="1" fill="#0ea5e9"/><circle cx="8.9" cy="10.1" r=".85" fill="#fff"/><path d="M7.2 13.2l1.9-2.2 1.25 1.35 1.15-1.25 1.7 2.1z" fill="#fff"/>' + pdfBadge(17.4, 17.4, '#e5252a', '<path d="M15.6 17.4h3.6M17.4 15.6v3.6" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>')),
  'organize': pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#7c3aed', '<path d="M19.4 16.5a2.5 2.5 0 1 0 .35 2.4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><path d="M19.6 15.3v1.7h-1.7" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>')),
  'svg-to-png': pdfSvg('<rect x="3.4" y="4.2" width="9.6" height="9.6" rx="1.6" fill="#8b5cf6"/><path d="M6 11.2l1.9-2.3 1.25 1.4 1.2-1.4 1.75 2.3z" fill="#fff"/><circle cx="6.4" cy="7.2" r="1.05" fill="#fff"/><rect x="11" y="10.4" width="9.6" height="9.6" rx="1.6" fill="${PDF_RED}" stroke="#fff" stroke-width="1.1"/><path d="M13.5 17.4l1.9-2.3 1.25 1.4 1.2-1.4 1.75 2.3z" fill="#fff"/><circle cx="13.9" cy="13.4" r="1.05" fill="#fff"/>'),
  rotate: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2f6df6', '<path d="M19.6 17.7a2.3 2.3 0 1 1-.7-1.9" fill="none" stroke="#fff" stroke-width="1.25" stroke-linecap="round"/><path d="M19.5 15.1v1.8h-1.8" fill="none" stroke="#fff" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>')),
  crop: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#0d9488', '<path d="M15.9 15.2v3.3a.5.5 0 0 0 .5.5h3.3M18.9 19.6v-3.3a.5.5 0 0 0-.5-.5h-3.3" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>')),
  compress: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#f59e0b', '<path d="M15.6 17.4h3.6" stroke="#fff" stroke-width="1.1"/><path d="M16.2 15.5l1.2 1.1 1.2-1.1M16.2 19.3l1.2-1.1 1.2 1.1" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>')),
  'pdf-info': pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2f6df6', '<circle cx="17.4" cy="15.5" r=".75" fill="#fff"/><path d="M17.4 16.9v2.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>')),
  'remove-metadata': pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2b303b', '<path d="M17.4 14.5l2.3.85v1.85c0 1.45-1 2.45-2.3 2.95-1.3-.5-2.3-1.5-2.3-2.95V15.35z" fill="none" stroke="#fff" stroke-width="1.05"/>')),
  'remove-blank': pdfSvg(pdfPage(1) + pdfBadge(17.4, 17.4, '#f59e0b', '<path d="M15.4 17.4h4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>')),
  'add-margin': pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#0d9488', '<rect x="15.3" y="15.3" width="4.2" height="4.2" rx=".6" fill="none" stroke="#fff" stroke-width="1.05" stroke-dasharray="1.6 1.2"/>')),
  'extract-text': pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2f6df6', '<path d="M15.6 15.9h3.6M15.9 17.5h3M16.1 19h2.6" stroke="#fff" stroke-width="1" stroke-linecap="round"/>')),
  reverse: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2f6df6', '<path d="M16 16l1.4-1.4 1.4 1.4M17.4 14.7v2.2M18.8 18.8l-1.4 1.4-1.4-1.4M17.4 20.3v-2.2" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')),
  grayscale: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#2b303b', '<circle cx="17.4" cy="17.4" r="2.7" fill="none" stroke="#fff" stroke-width="1"/><path d="M17.4 14.7a2.7 2.7 0 0 1 0 5.4z" fill="#fff"/>')),
  nup: pdfSvg(pdfPage(1) + pdfBadge(17.4, 17.4, '#0d9488', '<rect x="15.5" y="15.5" width="1.5" height="1.5" rx=".2" fill="#fff"/><rect x="17.8" y="15.5" width="1.5" height="1.5" rx=".2" fill="#fff"/><rect x="15.5" y="17.8" width="1.5" height="1.5" rx=".2" fill="#fff"/><rect x="17.8" y="17.8" width="1.5" height="1.5" rx=".2" fill="#fff"/>')),
  sign: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#db2777', '<path d="M15.4 19.1c1-.1 1.5-.7 2.2-2 .25-.45.5-.85.75-.85.2 0 .25.3.05.7-.18.36-.1.62.18.72" fill="none" stroke="#fff" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.2 20.4h4.3" stroke="#fff" stroke-width="1.05" stroke-linecap="round"/>')),
  watermark: pdfSvg('<path d="M6.4 2.6h6.6L17.6 7v11.4a1.5 1.5 0 0 1-1.5 1.5H6.4a1.5 1.5 0 0 1-1.5-1.5V4.1a1.5 1.5 0 0 1 1.5-1.5z" fill="' + PDF_RED + '"/><path d="M12.7 2.6 17.6 7h-3.8a1.1 1.1 0 0 1-1.1-1.1z" fill="' + PDF_FOLD + '"/><path d="M11.2 6.8c2 2.4 3.6 4.2 3.6 6a3.6 3.6 0 0 1-7.2 0c0-1.8 1.6-3.6 3.6-6z" fill="#fff" opacity=".85"/>'),
  flatten: pdfSvg(pdfPage(2) + pdfBadge(17.4, 17.4, '#7c3aed', '<path d="M17.4 14.6l2.5 1.35-2.5 1.35-2.5-1.35z" fill="#fff"/><path d="M14.9 17.4l2.5 1.35 2.5-1.35" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')),
  protect: pdfSvg(pdfPage(1) + '<rect x="13.6" y="15" width="6.8" height="5.6" rx="1.1" fill="#f59e0b" stroke="#fff" stroke-width="1"/><path d="M15 15v-1.5a2 2 0 0 1 4 0V15" fill="none" stroke="#f59e0b" stroke-width="1.3"/><circle cx="17" cy="17.6" r=".95" fill="#fff"/>'),
};

// ───────── 유틸 ─────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
// ───────── i18n (다국어) ─────────
// 저위험 additive: 한국어 루트 유지, 영어는 /en/ 추가. 빌드 함수 재사용 + 영어 패스에서
// (1) 영어 콘텐츠 로드 (2) 크롬/옵션 ko→en 사전 치환 (3) 자산 절대경로화 (4) lang/canonical/hreflang/switcher 후처리.
let CUR_LANG = 'ko';
const LANGS = ['ko', 'en', 'es', 'ja', 'zh'];
const LANG_LABEL = { ko: '한국어', en: 'English', es: 'Español', ja: '日本語', zh: '中文' };
const LANG_OG = { ko: 'ko_KR', en: 'en_US', es: 'es_ES', ja: 'ja_JP', zh: 'zh_CN' };
const I18N = {};
LANGS.filter((l) => l !== 'ko').forEach((l) => { try { I18N[l] = JSON.parse(readFileSync(join(WS, `i18n_${l}.json`), 'utf8')); } catch { I18N[l] = null; } });
const read = (slug) => {
  if (CUR_LANG !== 'ko') { try { return JSON.parse(readFileSync(join(WS, `content_${CUR_LANG}_${slug}.json`), 'utf8')); } catch {} }
  return JSON.parse(readFileSync(join(WS, `content_${slug}.json`), 'utf8'));
};
// JSON에 없는 크롬 조각의 언어별 값
const MISC = {
  en: { skip: 'Skip to content', lastUpdated: 'Last updated', terms: 'Terms of Service', noToolsFound: 'No tools found', searchTry: ' — try another search.', noUpload: 'Your files are never uploaded to any server.', browserOnly: 'No upload · 100% in your browser', note: 'Note', done: 'Done', next: 'What to do next', srH1: 'Free online PDF tools — no install, right in your browser', freeTools: 'Free online PDF tools', aboutPrivacy: 'About · Privacy', aboutPrivacyPolicy: 'About & Privacy Policy', image: 'images', heroCta: 'Start free', heroSee: 'Browse all tools', sceneH: 'See it in action', sceneSub: 'Real transformations, entirely in your browser' },
  es: { skip: 'Saltar al contenido', lastUpdated: 'Última actualización', terms: 'Términos del servicio', noToolsFound: 'No se encontraron herramientas', searchTry: ' — prueba otra búsqueda.', noUpload: 'Tus archivos nunca se suben a ningún servidor.', browserOnly: 'Sin subir · 100% en tu navegador', note: 'Nota', done: 'Listo', next: 'Qué sigue', srH1: 'Herramientas PDF gratis — sin instalar, en tu navegador', freeTools: 'Herramientas PDF gratis', aboutPrivacy: 'Acerca de · Privacidad', aboutPrivacyPolicy: 'Acerca de y privacidad', image: 'imágenes', heroCta: 'Empezar gratis', heroSee: 'Ver todas', sceneH: 'Míralo en acción', sceneSub: 'Transformaciones reales, todo en tu navegador' },
  ja: { skip: '本文へスキップ', lastUpdated: '最終更新', terms: '利用規約', noToolsFound: 'ツールが見つかりません', searchTry: ' — 別のキーワードでお試しください。', noUpload: 'ファイルはサーバーに送信されません。', browserOnly: 'アップロードなし・ブラウザ内で完結', note: '補足', done: '完了しました', next: '次にできること', srH1: '無料オンラインPDFツール — インストール不要、ブラウザで完結', freeTools: '無料オンラインPDFツール', aboutPrivacy: '概要・プライバシー', aboutPrivacyPolicy: '概要とプライバシーポリシー', image: '画像', heroCta: '無料で始める', heroSee: 'すべてのツール', sceneH: '実際の変換例', sceneSub: 'すべてブラウザ内で完結する実際の変換' },
  zh: { skip: '跳到正文', lastUpdated: '最后更新', terms: '服务条款', noToolsFound: '未找到工具', searchTry: ' — 换个关键词试试。', noUpload: '您的文件绝不会上传到任何服务器。', browserOnly: '无需上传 · 全程在浏览器', note: '说明', done: '已完成', next: '接下来可以做什么', srH1: '免费在线PDF工具 — 无需安装，在浏览器中完成', freeTools: '免费在线PDF工具', aboutPrivacy: '关于 · 隐私', aboutPrivacyPolicy: '关于与隐私政策', image: '图片', heroCta: '免费开始', heroSee: '查看全部工具', sceneH: '实际转换示例', sceneSub: '全程在浏览器中完成的真实转换' }
};
const _pairCache = {};
function langPairs(lang) {
  if (_pairCache[lang]) return _pairCache[lang];
  const E = I18N[lang]; if (!E) return (_pairCache[lang] = []);
  const M = MISC[lang] || MISC.en, pairs = [];
  const add = (ko, tx) => { if (ko != null && tx != null && String(tx) !== '' && String(ko) !== String(tx)) pairs.push([String(ko), String(tx)]); };
  add('PDF의 모든 것', 'Everything PDF');
  Object.keys(E.tools || {}).forEach((s) => { const t = TOOL_BY[s], et = E.tools[s]; if (t && et) { add(t.nav, et.nav); add(t.dropTitle, et.dropTitle); add(t.runLabel, et.runLabel); } });
  Object.keys(E.appDesc || {}).forEach((s) => add(APP_DESC[s], E.appDesc[s]));
  Object.keys(E.appShort || {}).forEach((s) => add(APP_SHORT[s], E.appShort[s]));
  CATEGORIES.forEach((c) => {
    const tx = (E.categories || {})[c.id] || '';
    add(c.title, tx);
    add('tp-dock__cat-name">' + c.title.replace(/^PDF\s*/, '') + '<', 'tp-dock__cat-name">' + tx.replace(/^PDF\s*/i, '') + '<');
    add('ws-cattile__title">' + c.title + '<', 'ws-cattile__title">' + tx + '<');
  });
  Object.values(E.optLabels || {}).forEach((o) => add(o.ko, o.en));
  const C = E.chrome || {};
  add('전체 도구', C.allTools);
  add('>소개</a>', '>' + (C.about || 'About') + '</a>');
  add('>인기 도구</h5>', '>' + (C.footPopular || '') + '</h5>');
  add('가장 많이 쓰는 도구', C.footPopular || 'Popular tools');
  add('>이미지 변환</h5>', '>' + (C.footImageConv || '') + '</h5>');
  add('>정보</h5>', '>' + (C.footInfo || '') + '</h5>');
  add('전체 37개 도구 →', C.footAllTools); add('모든 변환 →', C.footAllConv);
  add('서비스 소개', C.footAbout); add('개인정보 처리방침', C.footPrivacy); add('문의 · 제안', C.footContact);
  add('설치도 회원가입도 없이, 파일을 서버에 올리지 않고 내 브라우저에서 바로 처리하는 한국어 무료 PDF 도구 모음입니다.', C.footTagline);
  add('© 2026 PDF의 모든 것 · 이노하이(INNO-HI Inc) — made in Korea, runs on your device.', C.footCopyright);
  add('업로드 없음 · 100% 내 브라우저 처리', M.browserOnly);
  add('파일 선택', C.chooseFile); add('본문 바로가기', M.skip);
  const dh = C.dropHintSuffix || '';
  add('또는 끌어다 놓기·붙여넣기(여러 개 가능) · 파일은 내 브라우저에서만 처리됩니다', dh);
  add('또는 끌어다 놓기·붙여넣기 · 파일은 내 브라우저에서만 처리됩니다', dh);
  add('또는 끌어다 놓기 · 파일은 내 브라우저에서만 처리됩니다', dh);
  add('이 도구는 자바스크립트가 필요합니다. 브라우저의 자바스크립트를 켜 주세요. 파일은 여전히 서버로 전송되지 않고 내 브라우저에서만 처리됩니다.', C.noscript || '');
  add('무료 한국어 PDF 도구 모음', M.freeTools);
  add('설치 없이 무료로 쓰는 한국어 PDF 도구 모음', M.srH1);
  add('소개 · 개인정보 처리방침', M.aboutPrivacyPolicy); add('소개 · 개인정보', M.aboutPrivacy);
  add('마지막 업데이트: ', M.lastUpdated + ': '); add('마지막 업데이트', M.lastUpdated);
  add('>이용약관<', '>' + M.terms + '<'); add('이용약관', M.terms); add('이노하이', 'INNO-HI');
  add('찾는 도구가 없어요.', M.noToolsFound + '.'); add('찾는 도구가 없어요', M.noToolsFound);
  add(' 처럼 검색해 보세요.', M.searchTry);
  add('>파일은 서버로 전송되지 않습니다.<', '>' + M.noUpload + '<');
  add('>참고<', '>' + M.note + '<');
  add('완료됐어요', M.done); add('이어서 해보세요', M.next);
  add('>다른 도구<', '>' + (C.relHeading || '') + '<');
  add('다른 PDF 도구도 써보세요', C.relSub || ''); add('모두 무료 · 설치 없이 바로', C.relHint || '');
  add('>홈<', '>' + (C.breadHome || 'Home') + '<'); add('>도구<', '>' + (C.breadTools || 'Tools') + '<');
  add('처음으로 ✕', C.backToStart || '');
  add('사용 방법', C.howto || 'How to use');
  const wp = C.winbarPrefix || 'Drop your', wsuf = C.winbarSuffix || 'here';
  ['PDF', '이미지', 'JPG', 'PNG', 'WEBP', 'GIF', 'AVIF', 'SVG'].forEach((n) => {
    const noun = n === '이미지' ? M.image : n;
    add(`여기에 ${n}를 놓고 바로 작업`, `${wp} ${noun} ${wsuf}`);
    add(`여기에 ${n}을 놓고 바로 작업`, `${wp} ${noun} ${wsuf}`);
  });
  const nf = (E.pages && E.pages.notFound) || {};
  add('페이지를 찾을 수 없어요', nf.h1 || ''); add('홈으로 돌아가기', nf.button || '');
  add('주소가 바뀌었거나 삭제된 페이지일 수 있어요.<br>아래에서 처음으로 돌아가세요.', nf.body || '');
  const koTrust = [['서버 미전송', '100% 내 브라우저 처리'], ['완전 무료', '워터마크·가입 없음'], ['설치 불필요', '열면 바로 사용'], ['37개 도구', '합치기부터 변환까지']];
  (C.homeTrust || []).forEach((e, i) => { if (koTrust[i]) { add(koTrust[i][0], e.b); add(koTrust[i][1], e.span); } });
  add('3단계면 끝나요', C.homeStepsH);
  const koSteps = [['파일 올리기', 'PDF·이미지를 화면에 끌어다 놓거나 [파일 선택]으로 고르세요.'], ['옵션 고르고 실행', '순서·범위·화질 등 필요한 옵션을 정하고 실행 버튼을 누르세요.'], ['결과 내려받기', '완성된 파일을 바로 저장하세요. 창을 닫으면 흔적도 남지 않습니다.']];
  (C.homeSteps || []).forEach((e, i) => { if (koSteps[i]) { add(koSteps[i][0], e.b); add(koSteps[i][1], e.p); } });
  add('왜 「PDF의 모든 것」인가요?', C.homeWhyH);
  const koWhy = [['파일이 서버로 가지 않아요', '합치기·변환·압축 등 모든 처리가 여러분의 기기 안에서만 이뤄집니다. 계약서·신분증 같은 민감한 문서도 안심하고 다루세요.'], ['완전 무료, 워터마크 없음', '회원가입도 결제도 없고, 파일 개수·용량 제한도 없습니다. 결과물에 워터마크가 찍히지 않습니다.'], ['한국어에 진심입니다', '외산 도구의 어색한 기계번역 대신, 자연스러운 한국어 안내와 단계 설명으로 누구나 쉽게 쓸 수 있어요.']];
  (C.homeWhy || []).forEach((e, i) => { if (koWhy[i]) { add(koWhy[i][0], e.h); add(koWhy[i][1], e.p); } });
  add('자주 묻는 질문', C.homeFaqH || '');
  const koFaq = [['정말 무료인가요?', '네. 모든 도구가 완전 무료이며, 워터마크나 파일 개수·용량 제한이 없습니다.'], ['제 파일이 서버로 업로드되나요?', '아니요. 모든 작업은 여러분의 웹 브라우저 안에서만 실행되며, 파일은 어떤 서버로도 전송되지 않습니다. 창을 닫으면 메모리에서 사라집니다.'], ['회원가입이나 프로그램 설치가 필요한가요?', '둘 다 필요 없습니다. 이 페이지를 열면 바로 사용할 수 있습니다.'], ['스마트폰에서도 쓸 수 있나요?', '네. 스마트폰·태블릿 브라우저에서도 대부분의 도구가 그대로 동작합니다.']];
  (C.homeFaq || []).forEach((e, i) => { if (koFaq[i]) { add(koFaq[i][0], e.q); add(koFaq[i][1], e.a); } });
  add('무료로 시작하기', M.heroCta); add('전체 도구 둘러보기', M.heroSee);
  add('실제 변환 예시', M.sceneH); add('브라우저 안에서 바로, 이렇게 바뀝니다', M.sceneSub);
  if (E.tools && E.tools.compress) add('압축', E.tools.compress.nav);
  if (E.tools && E.tools.merge) add('합치기', E.tools.merge.nav);
  return (_pairCache[lang] = pairs.sort((a, b) => b[0].length - a[0].length));
}

function hreflangSet(canonical) {
  const path = canonical.replace(SITE_URL, '');
  return LANGS.map((lg) => `<link rel="alternate" hreflang="${lg}" href="${SITE_URL}${lg === 'ko' ? path : '/' + lg + path}">`).join('\n  ');
}
function langSwitch(canonical, curLang) {
  if (!canonical) return '';
  const path = canonical.replace(SITE_URL, '') || '/';
  const items = LANGS.map((lg) => {
    const href = lg === 'ko' ? path : '/' + lg + (path === '/' ? '/' : path);
    return `<a href="${href}" hreflang="${lg}"${lg === curLang ? ' aria-current="true"' : ''}>${LANG_LABEL[lg]}</a>`;
  }).join('');
  return `<details class="ws-langswitch"><summary aria-label="language / 언어"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21C9.5 18.5 8.2 15.3 8.2 12S9.5 5.5 12 3z"/></svg><span>${LANG_LABEL[curLang] || 'Language'}</span></summary><div class="ws-langmenu">${items}</div></details>`;
}
function localize(html, canonical, lang) {
  if (!I18N[lang]) return html;
  let out = html;
  for (const [ko, tx] of langPairs(lang)) if (out.indexOf(ko) >= 0) out = out.split(ko).join(tx);
  out = out.replace(/data-keywords="[^"]*"/g, (m) => m.replace(/[가-힣]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/ "/, '"'));
  out = out.replace(/(src|href)="\.\.\/assets\//g, '$1="/assets/').replace(/(src|href)="assets\//g, '$1="/assets/')
    .replace(/href="\.\.\/site\.webmanifest"/g, 'href="/site.webmanifest"').replace(/href="site\.webmanifest"/g, 'href="/site.webmanifest"')
    .replace(/window\.AAP_BASE='[^']*'/g, "window.AAP_BASE='/'");
  out = out.replace(/href="(?:\.\.\/)*terms\/"/g, 'href="/terms/"').replace(/href="(?:\.\.\/)*category\//g, 'href="/category/');
  out = out.replace('<html lang="ko">', '<html lang="' + lang + '">').replace('content="ko_KR"', 'content="' + (LANG_OG[lang] || 'en_US') + '"');
  if (canonical) {
    const langC = SITE_URL + '/' + lang + canonical.replace(SITE_URL, '');
    out = out.replace('rel="canonical" href="' + canonical + '"', 'rel="canonical" href="' + langC + '"')
      .replace('property="og:url" content="' + canonical + '"', 'property="og:url" content="' + langC + '"')
      .replace('<link rel="alternate" hreflang="ko" href="' + canonical + '">', hreflangSet(canonical));
  }
  out = out.replace('<nav class="ws-nav">', '<nav class="ws-nav">' + langSwitch(canonical, lang));
  return out;
}
function koPost(html, canonical) {
  if (!LANGS.some((l) => l !== 'ko' && I18N[l])) return html;
  let out = html;
  if (canonical) out = out.replace('<link rel="alternate" hreflang="ko" href="' + canonical + '">', hreflangSet(canonical));
  out = out.replace('<nav class="ws-nav">', '<nav class="ws-nav">' + langSwitch(canonical, 'ko'));
  return out;
}
function emitPage(subPath, html, canonical) {
  const base = CUR_LANG === 'ko' ? ROOT : join(ROOT, CUR_LANG);
  const outPath = join(base, subPath);
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, CUR_LANG === 'ko' ? koPost(html, canonical) : localize(html, canonical, CUR_LANG));
}
// about/privacy/contact 본문을 i18n_<lang>.json.pages 구조로 생성(프로즈 구조 스왑)
function langPageMain(key, rel, lang) {
  const E = I18N[lang]; const p = E && E.pages && E.pages[key];
  if (!p) return null;
  const home = (E.chrome && E.chrome.breadHome) || 'Home';
  const sec = (eb, h, body) => `        <div class="tp-sec" data-reveal><span class="tp-eyebrow">${esc(eb)}</span><h2 class="tp-h2">${esc(h)}</h2><p>${body}</p></div>`;
  const secs = (p.sections || []).map((s) => sec(s.eyebrow, s.h, s.body)).join('\n');
  return `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="location"><a href="${rel}">${esc(home)}</a><span class="s" aria-hidden="true">/</span><b>${esc(p.h1)}</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS.info}</span>
          <div><h1 class="tp-h1">${esc(p.h1)}</h1><p class="tp-sub">${esc(p.sub)}</p></div>
        </div>
      </div>
    </section>
    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">${p.lead}</p>
${secs}
      </div>
    </section>
${related('', rel)}`;
}
const enOr = (key, rel, koMain) => (CUR_LANG !== 'ko' && I18N[CUR_LANG] && I18N[CUR_LANG].pages && I18N[CUR_LANG].pages[key]) ? langPageMain(key, rel, CUR_LANG) : koMain;

// ───────── 도구 메타 ─────────
const TOOLS = [
  { slug: 'merge', icon: ICONS.merge, nav: '합치기', multiple: true, reorder: true,
    runLabel: 'PDF 합치기', dropTitle: '합칠 PDF들을 끌어다 놓으세요', pagecount: false,
    feature: ['여러 PDF 병합', '페이지 순서 변경', '무료·무제한'], options: optMerge() },
  { slug: 'split', icon: ICONS.split, nav: '분할', multiple: false,
    runLabel: 'PDF 분할하기', dropTitle: '분할할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['낱장 분리', '범위 지정 분할', 'ZIP 일괄 다운로드'], options: optSplit() },
  { slug: 'unlock', icon: ICONS.unlock, nav: '잠금해제', multiple: false,
    runLabel: '잠금 해제하기', dropTitle: '잠금을 풀 PDF를 끌어다 놓으세요', pagecount: false,
    feature: ['인쇄·편집 제한 해제', '비밀번호 제거', '브라우저 내 처리'], options: optUnlock() },
  { slug: 'extract', icon: ICONS.extract, nav: '페이지 추출', multiple: false,
    runLabel: '페이지 추출하기', dropTitle: '페이지를 추출할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['특정 페이지 추출', '여러 구간 지정', '순서 유지'], options: optPages('extract-pages', '1, 3, 5-7', '추출할 페이지', '추출된-페이지') },
  { slug: 'delete', icon: ICONS.delete, nav: '페이지 삭제', multiple: false,
    runLabel: '페이지 삭제하기', dropTitle: '페이지를 삭제할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['특정 페이지 삭제', '여러 페이지 일괄', '원본 보존'], options: optPages('delete-pages', '2, 4, 6-8', '삭제할 페이지', '페이지-삭제됨') },
  { slug: 'organize', icon: ICONS.organize, nav: '페이지 정리', multiple: false,
    runLabel: '페이지 정리하기', dropTitle: '정리할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['드래그로 순서 변경', '페이지별 회전', '페이지 삭제'], options: optOrganize() },
  { slug: 'page-numbers', icon: ICONS.number, nav: '페이지 번호', multiple: false,
    runLabel: '페이지 번호 넣기', dropTitle: '번호를 넣을 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['위치·형식 선택', '시작 번호 지정', '표지 제외'], options: optPageNumbers() },
  { slug: 'to-image', icon: ICONS.image, nav: 'PDF→이미지', multiple: false,
    runLabel: '이미지로 변환하기', dropTitle: '이미지로 바꿀 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['PNG·JPG 변환', '화질(배율) 선택', '페이지 지정'], options: optImage() },
  { slug: 'image-to-pdf', icon: ICONS.image, nav: '이미지→PDF', multiple: true, reorder: true,
    accept: 'image', imageThumbs: true, fileThumbs: true, needs: ['pdflib'],
    runLabel: 'PDF로 만들기', dropTitle: '이미지(JPG·PNG)를 끌어다 놓으세요', pagecount: false,
    feature: ['JPG·PNG → PDF', '여러 장 한 파일로', '순서 변경'], options: optImagesToPdf() },
  { slug: 'svg-to-png', icon: ICONS.image, nav: 'SVG→PNG', multiple: true, reorder: true,
    accept: 'svg', imageThumbs: true, fileThumbs: true, needs: ['zip'],
    runLabel: 'PNG로 변환하기', dropTitle: 'SVG 파일을 끌어다 놓으세요', pagecount: false,
    feature: ['SVG → PNG 변환', '배율(고화질) 선택', '여러 장 한 번에'], options: optSvgToPng() },
  { slug: 'rotate', icon: ICONS.rotate, nav: 'PDF 회전', multiple: false,
    runLabel: '회전하기', dropTitle: '회전할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['왼쪽·오른쪽·180도', '전체 페이지 한 번에', '화질·글자 보존'], options: optRotate() },
  { slug: 'crop', icon: ICONS.crop, nav: 'PDF 자르기', multiple: false,
    runLabel: '자르기', dropTitle: '여백을 자를 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['사방 여백 제거', '적게·보통·많이', '내용 보존'], options: optCrop() },
  { slug: 'compress', icon: ICONS.compress, nav: 'PDF 압축', multiple: false,
    runLabel: '압축하기', dropTitle: '압축할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['용량 줄이기', '화질 선택', '스캔 PDF에 효과적'], options: optCompress() },
  { slug: 'pdf-info', icon: ICONS.info, nav: 'PDF 정보', multiple: false,
    runLabel: '정보 보기', dropTitle: '정보를 볼 PDF를 끌어다 놓으세요', pagecount: false,
    feature: ['페이지·용량·크기', '메타데이터 확인', '잠김 여부'], options: optInfo() },
  { slug: 'remove-metadata', icon: ICONS.shield, nav: '개인정보 제거', multiple: false,
    runLabel: '개인정보 지우기', dropTitle: '개인정보를 지울 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['작성자·제목 등 제거', '본문은 그대로', '브라우저 내 처리'], options: optRemoveMeta() },
  { slug: 'remove-blank', icon: ICONS.blankpage, nav: '빈 페이지 제거', multiple: false,
    runLabel: '빈 페이지 제거하기', dropTitle: '빈 페이지를 정리할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['빈 페이지 자동 감지', '양면 스캔 정리', '새 PDF로 저장'], options: optRemoveBlank() },
  { slug: 'add-margin', icon: ICONS.margin, nav: '여백 추가', multiple: false,
    runLabel: '여백 추가하기', dropTitle: '여백을 더할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['사방 흰 여백', '좁게·보통·넓게', '내용 보존'], options: optAddMargin() },
  { slug: 'extract-text', icon: ICONS.text, nav: '텍스트 추출', multiple: false,
    runLabel: '텍스트 추출하기', dropTitle: '글자를 뽑을 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['글자를 .txt로', '복사·검색·재활용', 'OCR 아님'], options: optExtractText() },
  { slug: 'reverse', icon: ICONS.reverse, nav: '페이지 역순', multiple: false,
    runLabel: '역순으로 만들기', dropTitle: '순서를 뒤집을 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['페이지 순서 거꾸로', '마지막→처음', '원본 보존'], options: optReverse() },
  { slug: 'grayscale', icon: ICONS.grayscale, nav: '흑백 변환', multiple: false,
    runLabel: '흑백으로 변환하기', dropTitle: '흑백으로 바꿀 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['컬러→흑백', '용량 줄이기', '흑백 인쇄용'], options: optGrayscale() },
  { slug: 'nup', icon: ICONS.nup, nav: '모아찍기', multiple: false,
    runLabel: '모아찍기', dropTitle: '모아찍을 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['2·4쪽 한 장에', '종이 절약', '핸드아웃'], options: optNup() },
  { slug: 'sign', icon: ICONS.sign, nav: '서명 넣기', multiple: false, script: 'sign',
    runLabel: '서명 적용 후 다운로드', dropTitle: '서명할 PDF를 끌어다 놓으세요', pagecount: false,
    feature: ['그리기·이미지·타이핑', '미리보기에 드래그 배치', '도장·사인 모두'], options: optSign() },
  { slug: 'watermark', icon: ICONS.watermark, nav: '워터마크', multiple: false, script: 'watermark', needs: ['pdflib'],
    runLabel: '워터마크 넣기', dropTitle: '워터마크를 넣을 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['한글 문구·이미지', '가운데·바둑판 배치', '기울기·진하기 조절'], options: optWatermark() },
  { slug: 'flatten', icon: ICONS.flatten, nav: '양식 평탄화', multiple: false, script: 'flatten', needs: ['pdflib'],
    runLabel: '양식 고정하기', dropTitle: '양식을 고정할 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['입력값 페이지에 고정', '어디서나 동일하게', '글자 그대로 보존'], options: optFlatten() },
  { slug: 'protect', icon: ICONS.protect, nav: '비밀번호 설정', multiple: false, script: 'protect', needs: ['pdflib-crypto'],
    runLabel: '비밀번호 걸기', dropTitle: '비밀번호를 걸 PDF를 끌어다 놓으세요', pagecount: true,
    feature: ['열기 비밀번호', '인쇄·복사 제한', '브라우저 내 처리'], options: optProtect() },
];
const TOOL_BY = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));

// ───────── 카테고리(카탈로그) ─────────
const CATEGORIES = [
  { id: 'organize', title: 'PDF 구성', desc: '여러 PDF를 합치고, 나누고, 페이지를 자유롭게 정리하세요.', slugs: ['merge', 'split', 'organize', 'extract', 'delete', 'page-numbers', 'reverse', 'nup'] },
  { id: 'convert', title: 'PDF 변환', desc: 'PDF와 이미지를 서로 바꾸세요. 모두 내 브라우저에서 처리됩니다.', slugs: ['to-image', 'image-to-pdf', 'svg-to-png'] },
  { id: 'security', title: 'PDF 보안', desc: '비밀번호를 걸거나 풀고, 개인정보를 지우고, 워터마크로 지켜 안전하게.', slugs: ['protect', 'unlock', 'remove-metadata', 'watermark'] },
  { id: 'optimize', title: 'PDF 최적화', desc: '용량을 줄이고 빈 페이지를 정리해 가볍게.', slugs: ['compress', 'remove-blank', 'grayscale'] },
  { id: 'edit', title: 'PDF 편집', desc: '방향·여백·자르기·서명·양식으로 문서를 보기 좋게 다듬으세요.', slugs: ['rotate', 'crop', 'add-margin', 'sign', 'flatten'] },
  { id: 'analyze', title: 'PDF 분석', desc: '문서 정보를 확인하고 글자를 텍스트로 뽑으세요.', slugs: ['pdf-info', 'extract-text'] },
];

// 작업실 OS 공용 자원 (홈 + 도구 상세 공통)
const CHIP = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
const APP_FILE = { merge: 'merge.app', split: 'split.app', unlock: 'unlock.app', extract: 'extract.app', delete: 'delete.app', organize: 'organize.app', 'to-image': 'to-image.app', 'page-numbers': 'page-num.app', 'image-to-pdf': 'img-to-pdf.app', 'svg-to-png': 'svg-to-png.app', rotate: 'rotate.app', crop: 'crop.app', compress: 'compress.app', 'pdf-info': 'pdf-info.app', 'remove-metadata': 'remove-metadata.app', 'remove-blank': 'remove-blank.app', 'add-margin': 'add-margin.app', 'extract-text': 'extract-text.app', reverse: 'reverse.app', grayscale: 'grayscale.app', nup: 'nup.app', sign: 'sign.app', watermark: 'watermark.app', flatten: 'flatten.app', protect: 'protect.app' };
const APP_DESC = {
  merge: '여러 PDF를 순서대로 끌어다 하나로. 과제 묶음, 보고서 취합, 스캔본 결합까지 한 번에 끝냅니다.',
  split: '한 파일을 여러 개로. 자르는 지점을 눌러 필요한 부분만 깔끔하게 나눕니다.',
  unlock: '비밀번호가 걸린 PDF를 풀어 자유롭게. 내가 아는 암호로 내 기기에서만 처리합니다.',
  extract: '원하는 페이지만 콕 집어 새 PDF로. 썸네일을 눌러 특정 조항·핵심 장만 뽑아냅니다.',
  delete: '빈 페이지나 불필요한 장을 제거. 제출 전 군더더기를 정리해 문서를 깔끔하게.',
  organize: '페이지를 한눈에 펼쳐 끌어서 순서 변경·회전·삭제까지 한 번에. 뒤섞인 스캔과 엉킨 순서를 보이는 그대로 정리합니다.',
  'to-image': 'PDF 페이지를 JPG·PNG 이미지로. 블로그·SNS·발표 자료에 그대로 붙여 쓰기 좋습니다.',
  'page-numbers': '문서 하단에 페이지 번호를 자동으로. 위치·시작 번호·서식을 골라 보고서 형식을 갖춥니다.',
  'image-to-pdf': '사진·캡처 이미지를 한 PDF로. JPG·PNG 여러 장을 끌어다 순서대로 묶어 제출용 문서를 만듭니다.',
  'svg-to-png': '벡터 SVG를 또렷한 PNG 이미지로. 배율을 올려 고화질로 뽑고, 투명·흰색 배경을 골라 블로그·발표·디자인에 바로 씁니다.',
  rotate: '옆으로 누운 스캔본, 거꾸로 들어간 문서를 왼쪽·오른쪽 90도나 180도로 한 번에 바로잡아요. 글자·화질은 그대로.',
  crop: '페이지 사방의 넓은 여백을 적게·보통·많이로 잘라내 내용에 맞게 정리해요. 글자·화질은 그대로 보존합니다.',
  compress: '스캔본·사진이 많은 PDF의 용량을 줄여요. 메일 첨부나 제출 사이트의 용량 제한에 맞출 때 좋습니다.',
  'pdf-info': '페이지 수·용량·크기·제목·작성자·잠김 여부를 표로 한눈에. 파일은 바꾸지 않고 정보만 읽어요.',
  'remove-metadata': '제목·작성자·생성 프로그램 등 PDF에 숨은 문서 속성을 모두 비워 개인정보 흔적을 지워요. 본문은 그대로.',
  'remove-blank': '스캔에 섞인 빈 페이지를 자동으로 찾아 제거해 새 PDF로. 양면 스캔의 빈 뒷면 정리에 좋아요.',
  'add-margin': '모든 페이지 둘레에 흰 여백을 더해요. 제본 여백·필기 공간·가장자리 잘림 방지에 좋습니다.',
  'extract-text': 'PDF 속 글자를 .txt로 뽑아 복사·검색·재활용. 사진처럼 스캔된 PDF는 글자가 없어 제외(OCR 아님).',
  reverse: 'PDF 페이지 순서를 거꾸로 뒤집어 새 PDF로. 마지막 페이지가 처음으로 — 거꾸로 스캔된 문서 바로잡기에.',
  grayscale: '컬러 PDF를 흑백으로. 용량을 줄이고 흑백 인쇄에 맞춰요. 글자가 이미지로 바뀌어 선택은 안 될 수 있어요.',
  nup: '여러 페이지를 한 장에 2·4쪽씩 모아 배치해요. 인쇄 종이 절약, 핸드아웃 만들기에 좋습니다.',
  sign: '사인을 직접 그리거나 도장·사인 이미지를 올리거나 이름을 입력해 만들고, 미리보기에서 원하는 위치에 끌어다 놓아요. 계약서·동의서에 서명을 넣을 때 파일을 어디에도 올리지 않아 안전합니다.',
  watermark: '‘대외비’·‘사본’ 같은 한글 문구나 로고 이미지를 모든 페이지에. 가운데 대각선 또는 바둑판 반복으로, 기울기·진하기까지 골라 무단 복제를 막아요.',
  flatten: '채워 넣은 신청서·계약서의 입력값을 페이지에 고정해, 받는 사람이 못 바꾸고 어디서나 똑같이 보이게. 각 페이지를 이미지로 바꾸지 않아 글자는 그대로 보존돼요.',
  protect: 'PDF에 열기 비밀번호를 걸어 아는 사람만 열 수 있게. 인쇄·복사 제한도 선택할 수 있어요. 잠금해제(unlock)의 반대이며, 파일을 어디에도 올리지 않고 내 브라우저에서 암호화합니다.',
};
const APP_SHORT = {
  merge: '여러 PDF를 하나로', split: '한 파일을 여러 개로', unlock: '비밀번호·제한 해제',
  extract: '원하는 페이지만 추출', delete: '불필요한 페이지 삭제', organize: '순서·회전·삭제 한 번에', 'to-image': 'JPG·PNG로 변환', 'page-numbers': '페이지 번호 넣기',
  'image-to-pdf': 'JPG·PNG를 PDF로', 'svg-to-png': 'SVG를 PNG로',
  rotate: '페이지 회전', crop: '여백 제거', compress: '용량 줄이기', 'pdf-info': '문서 정보 보기',
  'remove-metadata': '개인정보 제거', 'remove-blank': '빈 페이지 제거', 'add-margin': '여백 추가', 'extract-text': '텍스트 추출',
  reverse: '페이지 역순', grayscale: '흑백 변환', nup: '모아찍기', sign: '서명·도장 넣기',
  watermark: '워터마크 넣기', flatten: '양식 값 고정', protect: '비밀번호 걸기',
};
// 도구 검색용 동의어/키워드(자연어로 찾을 수 있게). 이름·설명에 없는 표현만 보강.
const SEARCH_SYN = {
  merge: '합치기 병합 하나로 묶기 결합', split: '분할 나누기 쪼개기 낱장', organize: '정리 순서 재배열',
  extract: '추출 뽑기 특정 페이지', delete: '삭제 제거 페이지 빼기', 'page-numbers': '페이지 번호 쪽번호 넘버링',
  reverse: '역순 거꾸로 뒤집기', nup: '모아찍기 2쪽 4쪽 절약 핸드아웃', 'to-image': '이미지 변환 캡처 그림',
  'image-to-pdf': '이미지 사진 캡처 pdf로', 'svg-to-png': '벡터 이미지', unlock: '잠금해제 비밀번호 암호 제한 풀기',
  'remove-metadata': '개인정보 메타데이터 작성자 제거 흔적', watermark: '워터마크 대외비 사본 도장 로고 반복 보호',
  compress: '압축 용량 줄이기 가볍게', 'remove-blank': '빈 페이지 공백 제거', grayscale: '흑백 그레이 회색 인쇄',
  rotate: '회전 방향 돌리기 눕힘 세우기', crop: '자르기 여백 제거 크롭', 'add-margin': '여백 추가 제본 필기공간',
  sign: '서명 사인 도장 계약서 동의서', flatten: '양식 평탄화 폼 고정 신청서', 'pdf-info': '정보 페이지수 크기 메타',
  'extract-text': '텍스트 추출 글자 복사', protect: '비밀번호 설정 암호화 암호 걸기 보호 잠금 encrypt',
};
const searchKeywords = (slug) => {
  const t = TOOL_BY[slug];
  const conv = t && t.conv ? `${UP[t.conv.from]} ${UP[t.conv.to]} ${t.conv.from} ${t.conv.to} 변환` : '';
  return [t ? t.nav : '', dispName(slug), APP_SHORT[slug] || '', slug.replace(/-/g, ' '), SEARCH_SYN[slug] || '', conv]
    .join(' ').toLowerCase();
};
// 태블릿 대시보드 타일 색(도구별 컬러 구분)
const TILE_COLOR = {
  merge: '#e5252a', split: '#2f6df6', unlock: '#f59e0b', extract: '#10b981',
  delete: '#f43f5e', organize: '#7c3aed', 'to-image': '#8b5cf6', 'page-numbers': '#0ea5e9', 'image-to-pdf': '#0ea5e9', 'svg-to-png': '#8b5cf6',
};

// ───────── 이미지 변환 도구 자동 생성 (JPG/PNG/WEBP/SVG 상호변환) ─────────
const UP = { jpg: 'JPG', png: 'PNG', webp: 'WEBP', svg: 'SVG', gif: 'GIF', avif: 'AVIF' };
const CONVERTS = [
  { from: 'gif', to: 'png', feat: ['첫 장면 정지', '투명 유지'], desc: '움직이는 GIF의 첫 장면을 PNG로. 무손실·투명 유지. 어디서나 열리는 정지 이미지로.' },
  { from: 'gif', to: 'jpg', feat: ['첫 장면 정지', '용량↓'], desc: 'GIF를 가벼운 JPG로. 움직이는 GIF는 첫 장면만, 투명은 흰 배경 처리.' },
  { from: 'avif', to: 'png', feat: ['어디서나 열림', '투명 유지'], desc: '최신 AVIF를 어디서나 열리는 무손실 PNG로. 투명 배경 그대로 유지돼요.' },
  { from: 'avif', to: 'jpg', feat: ['호환성↑', '화질 선택'], desc: 'AVIF를 호환성 좋은 JPG로. 카톡·문서·메일에 바로 올릴 수 있어요.' },
  { from: 'jpg', to: 'png', feat: ['무손실·투명', '여러 장 ZIP'], desc: 'JPG 사진을 무손실·투명 지원 PNG로. PNG만 받는 곳이나 편집·보관용으로 좋아요.' },
  { from: 'png', to: 'jpg', feat: ['용량 축소', '화질 선택'], desc: '무거운 PNG를 가벼운 JPG로. 투명 배경은 흰색으로 채워지고, 화질을 고를 수 있어요.' },
  { from: 'webp', to: 'png', feat: ['어디서나 열림', '투명 유지'], desc: '웹용 WEBP를 어디서나 열리는 무손실 PNG로. 투명 배경 그대로 유지돼요.' },
  { from: 'webp', to: 'jpg', feat: ['호환성↑', '화질 선택'], desc: 'WEBP를 호환성 좋은 JPG로. 카톡·문서·메일에 바로 올릴 수 있어요.' },
  { from: 'png', to: 'webp', feat: ['용량 크게↓', '투명 유지'], desc: '무거운 PNG를 가벼운 WEBP로. 보이는 모양은 그대로, 용량만 줄여 웹을 빠르게.' },
  { from: 'jpg', to: 'webp', feat: ['웹 최적화', '용량↓'], desc: 'JPG를 더 가벼운 WEBP로. 같은 화질에 작은 용량으로 웹페이지를 빠르게.' },
  { from: 'svg', to: 'jpg', feat: ['배율 고화질', '흰 배경'], desc: '벡터 SVG를 어디서나 쓰는 JPG로. 배율을 올려 고화질로, 투명은 흰 배경 처리.' },
  { from: 'svg', to: 'webp', feat: ['배율 고화질', '용량↓'], desc: '벡터 SVG를 가벼운 WEBP로. 배율 선택, 투명 유지.' },
];
const convIcon = (c) => pdfSvg('<rect x="3" y="5.2" width="8.4" height="8.4" rx="1.5" fill="#9aa0ad"/><path d="M5 11.6l1.6-2 1.05 1.2 1-1.2 1.55 2z" fill="#fff"/><circle cx="5.5" cy="8" r=".9" fill="#fff"/><rect x="11.6" y="10.4" width="9.4" height="9.4" rx="1.6" fill="' + ({ png: '#18a957', jpg: '#f59e0b', webp: '#0ea5e9' }[c.to] || PDF_RED) + '" stroke="#fff" stroke-width="1.1"/><path d="M14 17.6l1.7-2.1 1.1 1.25 1.05-1.25 1.6 2.1z" fill="#fff"/><circle cx="14.3" cy="13.6" r="1" fill="#fff"/>');
const convTool = (c) => ({
  slug: c.from + '-to-' + c.to, icon: ICONS.image, nav: UP[c.from] + '→' + UP[c.to], multiple: true, reorder: true,
  accept: c.from, conv: { from: c.from, to: c.to }, script: 'img-convert', imageThumbs: true, fileThumbs: true,
  needs: ['zip'], // canvas 변환 + 다중 ZIP만 — pdf-lib·pdf.js 불필요(약 845KB 절감)
  runLabel: UP[c.to] + '로 변환하기', dropTitle: UP[c.from] + ' 파일을 끌어다 놓으세요', pagecount: false,
  feature: [UP[c.from] + ' → ' + UP[c.to]].concat(c.feat || []), options: optConv({ from: c.from, to: c.to })
});
CONVERTS.forEach((c) => {
  const slug = c.from + '-to-' + c.to;
  ICONS_PDF[slug] = convIcon(c);
  APP_DESC[slug] = c.desc;
  APP_SHORT[slug] = UP[c.from] + '→' + UP[c.to];
  APP_FILE[slug] = slug + '.app';
  TILE_COLOR[slug] = '#0ea5e9';
  TOOLS.push(convTool(c));
});
CATEGORIES.find((x) => x.id === 'convert').slugs.push(...CONVERTS.map((c) => c.from + '-to-' + c.to));
Object.assign(TOOL_BY, Object.fromEntries(TOOLS.map((t) => [t.slug, t])));
// 카드/네비에 보일 짧은 표시명 — 변환 도구는 "GIF → PNG"처럼 화살표로 한눈에
const dispName = (slug) => {
  const t = TOOL_BY[slug];
  if (t && t.conv) return UP[t.conv.from] + ' → ' + UP[t.conv.to];
  return read(slug).h1.replace(/^PDF\s*/, '');
};
const ARR_SVG = '<svg class="arr" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// 작업실 OS 태스크바 / 푸터 (rel: 홈은 '', 하위는 '../')
function wsTaskbar(rel) {
  const home = rel === '' ? './' : rel;
  // '전체 도구'를 상단 메뉴바의 주요 버튼(우측)으로. 홈이면 서랍 토글, 하위 페이지면 홈으로 이동.
  const allTools = rel === ''
    ? `<button class="ws-nav__cta" type="button" data-drawer-toggle aria-controls="tool-drawer" aria-expanded="false">전체 도구</button>`
    : `<a class="ws-nav__cta" href="${home}#tools">전체 도구</a>`;
  return `    <header class="ws-taskbar">
      <a href="${home}" class="ws-logo"><span class="chip" aria-hidden="true"><img src="${rel}assets/img/logo.png" alt="" width="30" height="30" decoding="async"></span><span class="ko">PDF의 모든 것</span><b class="sep" aria-hidden="true">/</b><span class="wk">workspace</span></a>
      <nav class="ws-nav"><a href="${home}about/">소개</a>${allTools}</nav>
    </header>`;
}
function wsFooter(rel) {
  const home = rel === '' ? './' : rel;
  // 링크 팜 방지: 전체 37개 대신 인기 도구만 큐레이션 + '전체 도구' 링크로 유도
  const popular = ['merge', 'split', 'compress', 'to-image', 'image-to-pdf', 'unlock', 'protect', 'watermark'];
  const convPop = ['jpg-to-png', 'png-to-jpg', 'webp-to-png', 'jpg-to-webp'];
  const linkList = (slugs) => slugs.filter((s) => TOOL_BY[s]).map((s) => `<a href="${home}${s}/">${esc(TOOL_BY[s].nav)}</a>`).join('');
  return `    <footer class="ws-foot">
      <div class="ws-wrap">
        <div class="ws-footgrid">
          <div class="ws-footbrand"><span class="fb"><span class="chip" aria-hidden="true"><img src="${rel}assets/img/logo.png" alt="" width="30" height="30" decoding="async"></span>PDF의 모든 것</span><p>설치도 회원가입도 없이, 파일을 서버에 올리지 않고 내 브라우저에서 바로 처리하는 한국어 무료 PDF 도구 모음입니다.</p></div>
          <div class="ws-footcols">
            <div class="ws-footcol"><h5>인기 도구</h5>${linkList(popular)}<a class="ws-footcol__all" href="${home}#tools">전체 37개 도구 →</a></div>
            <div class="ws-footcol"><h5>이미지 변환</h5>${linkList(convPop)}<a class="ws-footcol__all" href="${home}#tools">모든 변환 →</a></div>
            <div class="ws-footcol"><h5>정보</h5><a href="${home}about/">서비스 소개</a><a href="${home}terms/">이용약관</a><a href="${home}privacy/">개인정보 처리방침</a><a href="${home}contact/">문의 · 제안</a></div>
          </div>
        </div>
        <div class="ws-footbottom"><span>© 2026 PDF의 모든 것 · 이노하이(INNO-HI Inc) — made in Korea, runs on your device.</span><span>업로드 없음 · 100% 내 브라우저 처리</span></div>
      </div>
    </footer>`;
}

// ───────── 옵션 마크업 (tools/*.js의 ID와 일치) ─────────
// 공통: 저장 파일명(선택). 비우면 도구 기본 이름. class js-outname을 ToolCore가 읽음.
function optOutName(ph) {
  // id를 인스턴스마다 유니크하게 — 홈은 도구 패널을 여러 개 렌더하므로 고정 id면 중복(라벨 연결 깨짐).
  // 값은 class(js-outname)로 읽으므로 id 변경은 기능에 영향 없음.
  const uid = 'out-name-' + (++_outNameSeq);
  return `<div class="option">
    <label class="option__label" for="${uid}">저장 파일명 <span class="option__hint">선택 · 비우면 기본 이름</span></label>
    <input type="text" id="${uid}" class="field js-outname" placeholder="${ph}" autocomplete="off">
  </div>`;
}
function optMerge() {
  return `<div class="options">
  <label class="checkbox"><input type="checkbox" id="merge-blank"> 파일 사이에 빈 페이지 넣기</label>
  ${optOutName('합쳐진-PDF')}
</div>`;
}
function optOrganize() {
  return `<div class="options">
  <p class="option__hint" style="margin:0 0 2px">PDF를 올리면 모든 페이지가 아래에 펼쳐집니다. 끌어서 순서를 바꾸고, <b>↺ ↻</b>로 회전, <b>✕</b>로 삭제하세요.</p>
  ${optOutName('정리된-PDF')}
</div>`;
}
function optImagesToPdf() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">페이지 크기</span>
    <div class="segmented" role="radiogroup" aria-label="페이지 크기">
      <label><input type="radio" name="itp-size" value="image" checked><span>이미지 크기대로</span></label>
      <label><input type="radio" name="itp-size" value="a4"><span>A4에 맞춤</span></label>
    </div>
  </div>
  ${optOutName('이미지-PDF')}
</div>`;
}
function optSvgToPng() {
  return `<div class="options">
  <div class="option">
    <label class="option__label" for="svg-scale">출력 배율 <span class="option__hint">클수록 고화질·큰 파일</span></label>
    <select id="svg-scale" class="field">
      <option value="1">1배 (원본 크기)</option>
      <option value="2" selected>2배 (고화질)</option>
      <option value="3">3배</option>
      <option value="4">4배 (최고 화질)</option>
    </select>
  </div>
  <div class="option">
    <span class="option__label">배경</span>
    <div class="segmented" role="radiogroup" aria-label="배경">
      <label><input type="radio" name="svg-bg" value="transparent" checked><span>투명</span></label>
      <label><input type="radio" name="svg-bg" value="white"><span>흰색</span></label>
    </div>
  </div>
  ${optOutName('변환된-PNG')}
</div>`;
}
function optRotate() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">회전 방향</span>
    <div class="segmented" role="radiogroup" aria-label="회전 방향">
      <label><input type="radio" name="rot-angle" value="-90"><span>왼쪽 90°</span></label>
      <label><input type="radio" name="rot-angle" value="90" checked><span>오른쪽 90°</span></label>
      <label><input type="radio" name="rot-angle" value="180"><span>180°</span></label>
    </div>
  </div>
  <div class="option">
    <span class="option__label">적용 범위</span>
    <div class="segmented" role="radiogroup" aria-label="적용 범위">
      <label><input type="radio" name="rot-mode" value="all" class="js-nopersist" checked><span>전체 페이지</span></label>
      <label><input type="radio" name="rot-mode" value="pages" class="js-nopersist"><span>선택한 페이지</span></label>
    </div>
  </div>
  <div class="option">
    <label class="option__label" for="rot-pages">회전할 페이지 <span class="option__hint">'선택한 페이지'일 때 · 예: 1, 3, 5-7 · 썸네일을 눌러 골라도 됩니다</span></label>
    <input type="text" id="rot-pages" class="field js-nopersist" placeholder="1, 3, 5-7" inputmode="numeric" autocomplete="off">
  </div>
  ${optOutName('회전된-PDF')}
</div>`;
}
function optCrop() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">잘라낼 정도</span>
    <div class="segmented" role="radiogroup" aria-label="잘라낼 정도">
      <label><input type="radio" name="crop-amt" value="small"><span>적게</span></label>
      <label><input type="radio" name="crop-amt" value="medium" checked><span>보통</span></label>
      <label><input type="radio" name="crop-amt" value="large"><span>많이</span></label>
    </div>
  </div>
  ${optOutName('여백제거-PDF')}
</div>`;
}
function optCompress() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">화질 <span class="option__hint">낮을수록 용량↓</span></span>
    <div class="segmented" role="radiogroup" aria-label="화질">
      <label><input type="radio" name="cmp-quality" value="low"><span>낮음</span></label>
      <label><input type="radio" name="cmp-quality" value="medium" checked><span>보통</span></label>
      <label><input type="radio" name="cmp-quality" value="high"><span>높음</span></label>
    </div>
  </div>
  <p class="option__hint" style="margin:2px 0 0">스캔본·사진 PDF에 효과가 큽니다. 글자 위주 PDF는 거의 줄지 않거나 글자가 이미지로 바뀔 수 있어요.</p>
  ${optOutName('압축된-PDF')}
</div>`;
}
function optInfo() {
  return `<div class="options">
  <p class="option__hint" style="margin:0">PDF를 올리면 페이지 수·용량·크기·메타데이터·잠김 여부를 표로 보여줘요. 파일을 바꾸거나 저장하지 않습니다.</p>
</div>`;
}
function optRemoveMeta() {
  return `<div class="options">
  <p class="option__hint" style="margin:0 0 4px">제목·작성자·생성 프로그램·키워드 등 숨은 문서 속성을 모두 비웁니다. 본문 내용은 그대로 유지돼요.</p>
  ${optOutName('개인정보제거-PDF')}
</div>`;
}
function optRemoveBlank() {
  return `<div class="options">
  <p class="option__hint" style="margin:0 0 4px">거의 흰 페이지를 자동으로 찾아 제거합니다. 아주 옅은 내용은 빈 페이지로 볼 수 있으니 결과를 확인하세요.</p>
  ${optOutName('빈페이지제거-PDF')}
</div>`;
}
function optAddMargin() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">여백 너비</span>
    <div class="segmented" role="radiogroup" aria-label="여백 너비">
      <label><input type="radio" name="mg-amt" value="small"><span>좁게</span></label>
      <label><input type="radio" name="mg-amt" value="medium" checked><span>보통</span></label>
      <label><input type="radio" name="mg-amt" value="large"><span>넓게</span></label>
    </div>
  </div>
  ${optOutName('여백추가-PDF')}
</div>`;
}
function optExtractText() {
  return `<div class="options">
  <p class="option__hint" style="margin:0">PDF 속 글자를 .txt 파일로 뽑아요. 사진처럼 스캔된 PDF(이미지)는 글자가 없어 추출되지 않아요(OCR 아님).</p>
</div>`;
}
function optReverse() {
  return `<div class="options">
  <p class="option__hint" style="margin:0 0 4px">모든 페이지의 순서를 거꾸로 뒤집어요. 마지막 페이지가 첫 페이지가 됩니다. 본문은 그대로.</p>
  ${optOutName('역순-PDF')}
</div>`;
}
function optGrayscale() {
  return `<div class="options">
  <p class="option__hint" style="margin:0 0 4px">컬러를 흑백으로. 각 페이지를 이미지로 다시 그리는 방식이라 글자 선택·검색은 안 될 수 있어요. 흑백 인쇄·용량 절감에 좋아요.</p>
  ${optOutName('흑백-PDF')}
</div>`;
}
function optNup() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">한 장에</span>
    <div class="segmented" role="radiogroup" aria-label="한 장에 모을 쪽수">
      <label><input type="radio" name="nup-per" value="2" checked><span>2쪽</span></label>
      <label><input type="radio" name="nup-per" value="4"><span>4쪽</span></label>
    </div>
  </div>
  ${optOutName('모아찍기-PDF')}
</div>`;
}
function optSign() {
  return `<div class="options sign-panel">
  <p class="option__hint" style="margin:0 0 10px">사인을 그리거나, 도장·사인 이미지를 올리거나, 이름을 입력해 만든 뒤 <b>오른쪽 미리보기에 끌어다</b> 놓으세요. 모서리를 끌면 크기가 바뀝니다.</p>
  <div class="sign-tabs" role="tablist">
    <button type="button" class="sign-tab is-active" data-sigtab="draw" role="tab" aria-selected="true">✍️ 그리기</button>
    <button type="button" class="sign-tab" data-sigtab="upload" role="tab" aria-selected="false">🖼 이미지</button>
    <button type="button" class="sign-tab" data-sigtab="type" role="tab" aria-selected="false">⌨️ 타이핑</button>
  </div>
  <div class="sign-pane" data-pane="draw">
    <canvas class="js-sig-draw sign-draw" width="560" height="180" aria-label="여기에 서명을 그리세요"></canvas>
    <div class="sign-ctl">
      <span class="sign-pens" role="radiogroup" aria-label="펜 색">
        <label><input type="radio" name="sig-pen" value="#16233a" checked><span class="pen" style="background:#16233a"></span></label>
        <label><input type="radio" name="sig-pen" value="#1d4ed8"><span class="pen" style="background:#1d4ed8"></span></label>
        <label><input type="radio" name="sig-pen" value="#dc2626"><span class="pen" style="background:#dc2626"></span></label>
      </span>
      <button type="button" class="btn btn--ghost btn--sm js-sig-clear">지우기</button>
      <button type="button" class="btn btn--sm js-sig-usedraw">이 서명 사용</button>
    </div>
  </div>
  <div class="sign-pane" data-pane="upload" hidden>
    <label class="sign-upload"><input type="file" class="js-sig-img" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden><span class="dropzone__btn">이미지 선택 (PNG·JPG)</span></label>
    <p class="option__hint" style="margin:10px 0 0">투명 배경 PNG(도장·사인)를 권장해요. 흰 배경 이미지는 사각형으로 들어갑니다.</p>
  </div>
  <div class="sign-pane" data-pane="type" hidden>
    <input type="text" class="js-sig-text sign-typein" maxlength="24" placeholder="이름을 입력하세요" aria-label="서명할 이름">
    <div class="sign-fonts" role="radiogroup" aria-label="서명 글꼴">
      <label><input type="radio" name="sig-font" value="cursive" checked><span>영문 필기체</span></label>
      <label><input type="radio" name="sig-font" value="jeongja"><span>정자체</span></label>
      <label><input type="radio" name="sig-font" value="heullim"><span>흘림체</span></label>
    </div>
    <div class="js-sig-typeprev sign-typeprev" aria-live="polite"></div>
    <button type="button" class="btn btn--sm js-sig-usetype" disabled>이 서명 사용</button>
  </div>
  <div class="sign-cur">
    <span class="sign-cur__label">현재 서명</span>
    <div class="js-sig-preview sign-cur__prev"><span class="sign-cur__empty">아직 없음</span></div>
  </div>
  <button type="button" class="btn btn--block js-sig-add sign-add" disabled>＋ 페이지에 서명 올리기</button>
</div>`;
}
function optWatermark() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">종류</span>
    <div class="segmented" role="radiogroup" aria-label="워터마크 종류">
      <label><input type="radio" name="wm-type" value="text" checked><span>문구</span></label>
      <label><input type="radio" name="wm-type" value="image"><span>이미지</span></label>
    </div>
  </div>
  <div class="js-wm-textbox">
    <div class="option">
      <label class="option__label" for="wm-text">문구 <span class="option__hint">한글 가능 · 예: 대외비, 사본 금지</span></label>
      <input type="text" id="wm-text" class="field" placeholder="대외비" maxlength="40" autocomplete="off">
    </div>
    <div class="option">
      <label class="option__label" for="wm-color">글자 색</label>
      <select id="wm-color" class="field">
        <option value="888888" selected>회색</option>
        <option value="e5252a">빨강</option>
        <option value="2f6df6">파랑</option>
        <option value="1a1a1a">검정</option>
      </select>
    </div>
  </div>
  <div class="js-wm-imgbox" hidden>
    <label class="sign-upload"><input type="file" class="js-wm-img" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden><span class="dropzone__btn">이미지 선택 (PNG·JPG)</span></label>
    <p class="option__hint" style="margin:8px 0 0">선택한 이미지: <b class="js-wm-imgname">없음</b> · 투명 배경 PNG(로고·도장)를 권장해요.</p>
  </div>
  <div class="option-row">
    <div class="option">
      <span class="option__label">배치</span>
      <div class="segmented" role="radiogroup" aria-label="배치">
        <label><input type="radio" name="wm-mode" value="center" checked><span>가운데</span></label>
        <label><input type="radio" name="wm-mode" value="tile"><span>바둑판(반복)</span></label>
      </div>
    </div>
    <div class="option">
      <span class="option__label">기울기</span>
      <div class="segmented" role="radiogroup" aria-label="기울기">
        <label><input type="radio" name="wm-angle" value="0"><span>0°</span></label>
        <label><input type="radio" name="wm-angle" value="45" checked><span>45°</span></label>
        <label><input type="radio" name="wm-angle" value="90"><span>90°</span></label>
      </div>
    </div>
  </div>
  <div class="option-row">
    <div class="option">
      <label class="option__label" for="wm-size">크기</label>
      <select id="wm-size" class="field">
        <option value="small">작게</option>
        <option value="medium" selected>보통</option>
        <option value="large">크게</option>
      </select>
    </div>
    <div class="option">
      <label class="option__label" for="wm-opacity">진하기</label>
      <select id="wm-opacity" class="field">
        <option value="light">연하게</option>
        <option value="medium" selected>보통</option>
        <option value="strong">진하게</option>
      </select>
    </div>
  </div>
  ${optOutName('워터마크-PDF')}
</div>`;
}
function optFlatten() {
  return `<div class="options">
  <p class="option__hint" style="margin:0 0 4px">채워 넣은 양식(폼)의 입력값을 페이지에 고정해, 받는 사람이 수정할 수 없고 어떤 뷰어에서나 똑같이 보이도록 만들어요. 각 페이지를 이미지로 바꾸지 않아 글자는 그대로 보존됩니다. 입력 양식이 없는 PDF는 평탄화할 대상이 없어요.</p>
  ${optOutName('평탄화-PDF')}
</div>`;
}
function optProtect() {
  return `<div class="options">
  <div class="option">
    <label class="option__label" for="protect-pw">열기 비밀번호 <span class="option__hint">이 비밀번호를 알아야 PDF를 열 수 있어요</span></label>
    <input type="password" id="protect-pw" class="field js-nopersist" placeholder="설정할 비밀번호" autocomplete="new-password">
  </div>
  <label class="checkbox"><input type="checkbox" id="protect-showpw"> 비밀번호 표시</label>
  <label class="checkbox"><input type="checkbox" id="protect-allow-print" checked> 인쇄 허용</label>
  <label class="checkbox"><input type="checkbox" id="protect-allow-copy" checked> 텍스트 복사 허용</label>
  <p class="option__hint" style="margin:2px 0 0">인쇄·복사를 끄면 열기 비밀번호와 별개의 소유자 암호로 제한이 걸립니다(뷰어에 따라 제한 적용이 다를 수 있어요).</p>
  ${optOutName('비밀번호-PDF')}
  <p class="callout callout--warn"><span class="callout__ic">${ICONS.info}</span><span><strong>비밀번호를 잊으면 되돌릴 수 없어요.</strong> 설정한 비밀번호는 이 기기 어디에도 저장되지 않으니 꼭 따로 기억해 두세요. 파일은 서버로 전송되지 않고 브라우저에서 암호화됩니다.</span></p>
</div>`;
}
function optConv(conv) {
  const lossy = (conv.to === 'jpg' || conv.to === 'webp');
  const parts = [];
  if (conv.from === 'svg') {
    parts.push(`<div class="option">
    <label class="option__label" for="conv-scale">출력 배율 <span class="option__hint">클수록 고화질·큰 파일</span></label>
    <select id="conv-scale" class="field"><option value="1">1배</option><option value="2" selected>2배 (고화질)</option><option value="3">3배</option><option value="4">4배</option></select>
  </div>`);
  }
  if (lossy) {
    parts.push(`<div class="option">
    <label class="option__label" for="conv-quality">화질 <span class="option__hint">낮을수록 용량↓</span></label>
    <select id="conv-quality" class="field"><option value="0.6">낮음 (가벼움)</option><option value="0.8" selected>보통</option><option value="0.92">높음 (선명)</option></select>
  </div>`);
  }
  parts.push(optOutName(conv.to.toUpperCase() + '-변환'));
  return `<div class="options">
  ${parts.join('\n  ')}
</div>`;
}
function optSplit() {
  return `<div class="options">
  <div class="option">
    <span class="option__label">분할 방식</span>
    <div class="segmented" role="radiogroup" aria-label="분할 방식">
      <label><input type="radio" name="split-mode" value="each" class="js-nopersist" checked><span>낱장으로</span></label>
      <label><input type="radio" name="split-mode" value="every" class="js-nopersist"><span>N매마다</span></label>
      <label><input type="radio" name="split-mode" value="oddeven" class="js-nopersist"><span>홀/짝 분리</span></label>
      <label><input type="radio" name="split-mode" value="ranges" class="js-nopersist"><span>범위 지정</span></label>
    </div>
  </div>
  <div class="option-row">
    <div class="option">
      <label class="option__label" for="split-every">N매마다 <span class="option__hint">'N매마다' 선택 시</span></label>
      <input type="number" id="split-every" class="field" value="2" min="1" inputmode="numeric">
    </div>
    <div class="option">
      <label class="option__label" for="split-zipname">ZIP 파일명 <span class="option__hint">선택</span></label>
      <input type="text" id="split-zipname" class="field" placeholder="분할된-PDF" autocomplete="off">
    </div>
  </div>
  <div class="option">
    <label class="option__label" for="split-ranges">페이지 범위 <span class="option__hint">'범위 지정' 선택 시 · 예: 1-3, 4-8, 9</span></label>
    <input type="text" id="split-ranges" class="field js-nopersist" placeholder="1-3, 4-8, 9" inputmode="numeric" autocomplete="off">
  </div>
</div>`;
}
function optUnlock() {
  return `<div class="options">
  <div class="option">
    <label class="option__label" for="unlock-pw">비밀번호 <span class="option__hint">열 때 비밀번호를 묻는 경우에만 입력</span></label>
    <input type="password" id="unlock-pw" class="field js-nopersist" placeholder="아는 비밀번호 (선택)" autocomplete="off">
  </div>
  <label class="checkbox"><input type="checkbox" id="unlock-showpw"> 비밀번호 표시</label>
  <label class="checkbox"><input type="checkbox" id="unlock-raster"> 이미지로 해제 (비밀번호가 걸린 PDF용)</label>
  <div class="option">
    <label class="option__label" for="unlock-scale">이미지 해제 화질 <span class="option__hint">'이미지로 해제' 선택 시</span></label>
    <select id="unlock-scale" class="field">
      <option value="1.5">보통 (가벼움)</option>
      <option value="2" selected>선명</option>
      <option value="3">아주 선명 (용량 큼)</option>
    </select>
  </div>
  <p class="option__hint" style="margin-top:-6px">※ 이미지로 해제하면 글자 선택·복사·편집이 안 되는 이미지 PDF로 바뀝니다. 비밀번호가 걸려 일반 해제가 안 될 때만 쓰세요.</p>
  ${optOutName('잠금해제-PDF')}
  <p class="callout callout--warn"><span class="callout__ic">${ICONS.info}</span><span><strong>암호 크랙이 아닙니다.</strong> 본인이 아는 비밀번호, 또는 인쇄·편집 제한만 제거합니다. 모르는 비밀번호는 풀 수 없어요.</span></p>
</div>`;
}
function optPages(id, ph, label, outPh) {
  return `<div class="options">
  <div class="option">
    <label class="option__label" for="${id}">${label} <span class="option__hint">예: ${ph} · 썸네일을 눌러 골라도 됩니다</span></label>
    <input type="text" id="${id}" class="field js-nopersist" placeholder="${ph}" inputmode="numeric" autocomplete="off">
  </div>
  ${optOutName(outPh || '결과-PDF')}
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
        <label><input type="radio" name="img-format" value="webp"><span>WEBP</span></label>
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
  <div class="option-row">
    <div class="option">
      <label class="option__label" for="img-quality">JPG·WEBP 품질 <span class="option__hint">JPG·WEBP일 때</span></label>
      <select id="img-quality" class="field">
        <option value="0.7">보통 (가벼움)</option>
        <option value="0.85">좋음</option>
        <option value="0.92" selected>높음</option>
        <option value="0.97">최고 (용량 큼)</option>
      </select>
    </div>
    <div class="option">
      <label class="option__label" for="img-prefix">파일명 접두어 <span class="option__hint">선택 · 기본 page</span></label>
      <input type="text" id="img-prefix" class="field" placeholder="page" autocomplete="off">
    </div>
  </div>
  <div class="option">
    <span class="option__label">변환 범위</span>
    <div class="segmented" role="radiogroup" aria-label="변환 범위">
      <label><input type="radio" name="img-pages-mode" value="all" class="js-nopersist" checked><span>전체 페이지</span></label>
      <label><input type="radio" name="img-pages-mode" value="custom" class="js-nopersist"><span>특정 페이지</span></label>
    </div>
  </div>
  <div class="option">
    <label class="option__label" for="img-pages">페이지 지정 <span class="option__hint">'특정 페이지' 선택 시 · 예: 1, 3, 5-7</span></label>
    <input type="text" id="img-pages" class="field js-nopersist" placeholder="1, 3, 5-7" inputmode="numeric" autocomplete="off">
  </div>
  <label class="checkbox"><input type="checkbox" id="img-gray"> 흑백(그레이스케일)으로 변환</label>
  <label class="checkbox"><input type="checkbox" id="img-transparent"> 투명 배경 (PNG·WEBP)</label>
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
  <div class="option-row">
    <div class="option">
      <label class="option__label" for="pn-size">글자 크기</label>
      <select id="pn-size" class="field">
        <option value="9">작게</option>
        <option value="11" selected>보통</option>
        <option value="14">크게</option>
        <option value="18">아주 크게</option>
      </select>
    </div>
    <div class="option">
      <label class="option__label" for="pn-color">글자 색</label>
      <select id="pn-color" class="field">
        <option value="1a1a1a" selected>검정</option>
        <option value="888888">회색</option>
        <option value="e5252a">빨강</option>
        <option value="2f6df6">파랑</option>
      </select>
    </div>
    <div class="option">
      <label class="option__label" for="pn-margin">가장자리 여백</label>
      <select id="pn-margin" class="field">
        <option value="18">좁게</option>
        <option value="28" selected>보통</option>
        <option value="40">넓게</option>
      </select>
    </div>
  </div>
  <div class="option-row">
    <div class="option">
      <label class="option__label" for="pn-prefix">앞 글자 <span class="option__hint">예: p.</span></label>
      <input type="text" id="pn-prefix" class="field" placeholder="(없음)" maxlength="8" autocomplete="off">
    </div>
    <div class="option">
      <label class="option__label" for="pn-suffix">뒤 글자 <span class="option__hint">예: - 또는 /</span></label>
      <input type="text" id="pn-suffix" class="field" placeholder="(없음)" maxlength="8" autocomplete="off">
    </div>
  </div>
  <p class="option__hint" style="margin-top:-4px">※ 앞뒤 글자는 영문·숫자·기호만 가능합니다(한글 미지원).</p>
  <label class="checkbox"><input type="checkbox" id="pn-skip"> 표지(첫 페이지)는 번호 제외</label>
  <label class="checkbox"><input type="checkbox" id="pn-box"> 번호 뒤에 반투명 배경 (가독성)</label>
  ${optOutName('페이지번호-추가')}
</div>`;
}

// ───────── 공통 셸 ─────────
function header(rel) {
  const home = rel === '' ? './' : rel;
  const navItems = ['merge', 'split', 'unlock', 'to-image', 'page-numbers']
    .map((s) => `<a href="${home}${s}/">${TOOL_BY[s].nav}</a>`).join('');
  return `<header class="site-header"><div class="container"><div class="site-header__inner">
  <a class="brand" href="${home}"><span class="brand__logo">${LOGO_SVG}</span><span>PDF의 <span class="brand__dot">모든 것</span></span></a>
  <nav class="site-nav" aria-label="주요 도구">${navItems}</nav>
</div></div></header>`;
}
function footer(rel) {
  const home = rel === '' ? './' : rel;
  const toolLinks = TOOLS.map((t) => `<li><a href="${home}${t.slug}/">${t.nav}</a></li>`).join('');
  return `<footer class="site-footer"><div class="container">
  <div class="site-footer__grid">
    <div class="site-footer__col site-footer__brand">
      <a class="brand" href="${home}"><span class="brand__logo">${LOGO_SVG}</span><span>PDF의 <span class="brand__dot">모든 것</span></span></a>
      <p>필요한 PDF 작업을 설치 없이, 파일을 서버에 올리지 않고 무료로. 모든 처리는 내 브라우저 안에서만 이뤄집니다.</p>
    </div>
    <div class="site-footer__col"><h4>도구</h4><ul>${toolLinks}</ul></div>
    <div class="site-footer__col"><h4>정보</h4><ul>
      <li><a href="${home}about/">소개 · 개인정보</a></li>
      <li><a href="${home}contact/">문의 · 제안</a></li>
    </ul></div>
  </div>
  <div class="site-footer__bottom">
    <span>© 2026 ${BRAND} · 이노하이(INNO-HI Inc) · 모든 파일은 내 기기에서만 처리됩니다.</span>
    <span>광고·추적·업로드 없음</span>
  </div>
</div></footer>`;
}

// Consent Mode v2 기본값. AdSense/GA 로더보다 먼저 실행돼 자동광고·측정에 함께 적용된다.
// CMP가 없으므로 비EEA/영국은 granted, EEA·UK·CH는 광고·분석 저장을 denied로 시작한다
// (denied 상태에서도 비개인화 광고는 계속 게재 → 수익 유지 + 프라이버시 준수).
function consentHead() {
  if (!ADSENSE_ENABLED && !GA_ENABLED) return '';
  const eea = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'];
  return `\n  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
    + `gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});`
    + `gtag('consent','default',{region:${JSON.stringify(eea)},ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});</script>`;
}

// Google 애드센스 로더(자동 광고). 실제 게시자 ID가 설정됐을 때만 스크립트를 넣고,
// 플레이스홀더 상태에서는 위치 표시 주석만 남겨 잘못된 광고 요청(콘솔 에러)을 막는다.
function adsenseHead() {
  if (!ADSENSE_ENABLED) {
    return `\n  <!-- Google AdSense: build.mjs의 ADSENSE_CLIENT 상수에 실제 ca-pub ID를 넣으면 여기에 로더가 자동 삽입됩니다. -->`;
  }
  return `\n  <meta name="google-adsense-account" content="${ADSENSE_CLIENT}">`
    + `\n  <style>ins.adsbygoogle[data-ad-status="unfilled"]{display:none!important;}</style>`
    + `\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`;
}

// 제3자(광고·분석) 도메인에 미리 연결 → 스크립트 로드 지연 단축(CWV 개선). 활성 시에만.
function perfHints() {
  const h = [];
  if (ADSENSE_ENABLED) {
    h.push('<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>');
    h.push('<link rel="dns-prefetch" href="https://googleads.g.doubleclick.net">');
    h.push('<link rel="dns-prefetch" href="https://tpc.googlesyndication.com">');
    h.push('<link rel="dns-prefetch" href="https://adservice.google.com">');
  }
  if (GA_ENABLED) {
    h.push('<link rel="preconnect" href="https://www.googletagmanager.com">');
    h.push('<link rel="dns-prefetch" href="https://www.google-analytics.com">');
  }
  return h.length ? '\n  ' + h.join('\n  ') : '';
}

// Google 애널리틱스(GA4) gtag. 실제 측정 ID가 설정됐을 때만 삽입한다.
function gaHead() {
  if (!GA_ENABLED) {
    return `\n  <!-- Google Analytics: build.mjs의 GA_ID 상수에 실제 G- 측정 ID를 넣으면 여기에 gtag가 자동 삽입됩니다. -->`;
  }
  return `\n  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>`
    + `\n  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
}

function page({ title, desc, canonical, ogTitle, rel, jsonld, main, withScripts, headExtra, bodyClass, extraScripts, noChrome, noindex, noFooter, needs }) {
  const ld = jsonld ? `\n  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : '';
  const extra = (extraScripts || []).map((s) => `\n  <script src="${rel}${s}?v=${assetVer(s)}" defer></script>`).join('');
  const toolList = withScripts ? (Array.isArray(withScripts) ? withScripts : [withScripts]) : [];
  // 도구별 필요 라이브러리만 로드(needs). 지정 없으면 안전하게 3종 모두(하위호환).
  // 이미지 형식 변환 계열은 canvas만 쓰므로 pdf-lib·pdf.js(약 845KB)를 싣지 않는다.
  const need = toolList.length ? (needs || ['pdflib', 'pdfjs', 'zip']) : [];
  const vendors = [];
  // pdflib-crypto: 암호화 지원 포크(@cantoo/pdf-lib) — protect 도구 전용(+126KB). 그 외는 원본 pdf-lib.
  if (need.indexOf('pdflib-crypto') >= 0) vendors.push('assets/vendor/pdf-lib-cantoo.min.js');
  else if (need.indexOf('pdflib') >= 0) vendors.push('assets/vendor/pdf-lib.min.js');
  if (need.indexOf('pdfjs') >= 0) vendors.push('assets/vendor/pdf.min.js');
  if (need.indexOf('zip') >= 0) vendors.push('assets/vendor/jszip.min.js');
  const scripts = toolList.length ? `
  <script>window.AAP_BASE='${rel}';</script>
${vendors.map((v) => `  <script src="${rel}${v}" defer fetchpriority="low"></script>`).join('\n')}
  <script src="${rel}assets/js/ui.js?v=${assetVer('assets/js/ui.js')}" defer></script>
  <script src="${rel}assets/js/pdf-engine.js?v=${assetVer('assets/js/pdf-engine.js')}" defer></script>
  <script src="${rel}assets/js/tool-core.js?v=${assetVer('assets/js/tool-core.js')}" defer></script>
${toolList.map((s) => `  <script src="${rel}assets/js/tools/${s}.js?v=${assetVer('assets/js/tools/' + s + '.js')}" defer></script>`).join('\n')}` : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">${perfHints()}${consentHead()}${noindex ? '' : adsenseHead()}${gaHead()}
  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(desc)}">${canonical ? `\n  <link rel="canonical" href="${escAttr(canonical)}">\n  <link rel="alternate" hreflang="ko" href="${escAttr(canonical)}">\n  <link rel="alternate" hreflang="x-default" href="${escAttr(canonical)}">` : ''}
  <meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}">${verifyHead()}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escAttr(BRAND)}">
  <meta property="og:title" content="${escAttr(ogTitle || title)}">
  <meta property="og:description" content="${escAttr(desc)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:image" content="${SITE_URL}/assets/img/og-default.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escAttr(BRAND)} — 무료 한국어 PDF 도구 모음">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escAttr(ogTitle || title)}">
  <meta name="twitter:description" content="${escAttr(desc)}">
  <meta name="twitter:image" content="${SITE_URL}/assets/img/og-default.png">
  <link rel="icon" href="${rel}assets/img/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="${rel}assets/img/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="${rel}assets/img/logo.png">
  <link rel="manifest" href="${rel}site.webmanifest">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0e1016" media="(prefers-color-scheme: dark)">
  <link rel="preload" as="font" type="font/woff2" href="${rel}assets/vendor/fonts/a2z-Regular.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="${rel}assets/vendor/fonts/a2z-ExtraBold.woff2" crossorigin>
  <link rel="stylesheet" href="${rel}assets/css/style.css?v=${assetVer('assets/css/style.css')}">${headExtra || ''}${ld}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
  <a class="skip-link" href="#main">본문 바로가기</a>
${noChrome ? wsTaskbar(rel) : header(rel)}
  <main id="main">
${main}
  </main>
${noFooter ? '' : (noChrome ? wsFooter(rel) : footer(rel))}${scripts}${extra}
</body>
</html>
`;
}

// ───────── 도구 위젯 ─────────
function widget(t, opts) {
  opts = opts || {};
  const extraClass = opts.class ? ' ' + opts.class : '';
  const pc = t.pagecount ? `\n      <p class="pagecount js-pagecount"></p>` : '';
  const ACC = { image: 'image/png,image/jpeg', jpg: 'image/jpeg,.jpg,.jpeg', png: 'image/png,.png', webp: 'image/webp,.webp', gif: 'image/gif,.gif', avif: 'image/avif,.avif', svg: 'image/svg+xml,.svg' };
  const NOUN = { image: '이미지', jpg: 'JPG', png: 'PNG', webp: 'WEBP', gif: 'GIF', avif: 'AVIF', svg: 'SVG' };
  const accept = ACC[t.accept] || 'application/pdf';
  const noun = NOUN[t.accept] || 'PDF';
  const aria = noun + ' 파일 선택 또는 끌어다 놓기';
  const convAttr = t.conv ? ` data-from="${t.conv.from}" data-to="${t.conv.to}"` : '';
  const dropBody = `<div class="dropzone js-drop" tabindex="0" role="button" aria-label="${aria}">
          <input type="file" class="js-file" accept="${accept}" ${t.multiple ? 'multiple ' : ''}hidden>
          <svg class="dropzone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
          <p class="dropzone__title">${t.dropTitle}</p>
          <span class="dropzone__btn">파일 선택</span>
          <p class="dropzone__hint">또는 끌어다 놓기·붙여넣기${t.multiple ? '(여러 개 가능)' : ''} · 파일은 내 브라우저에서만 처리됩니다</p>
        </div>${pc}
        <ul class="filelist js-files"></ul>
        <div class="pagegrid js-pagegrid" hidden></div>`;
  // editor 모드(상세): 드롭 영역을 홈과 동일한 ws-window 카드 + 타이틀바로
  const winbar = `<div class="ws-winbar"><span class="ws-wintitle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg><span class="t">여기에 ${noun}를 놓고 바로 작업</span></span></div>`;
  const left = opts.editor
    ? `<div class="tool__left ws-window">${winbar}<div class="tool__leftbody">${dropBody}</div></div>`
    : `<div class="tool__left">${dropBody}</div>`;
  return `<div class="tool${extraClass}" data-tool="${t.slug}"${convAttr}>
      ${left}
      <div class="tool__right">
        ${t.options}
        <div class="actions"><button class="btn btn--primary btn--lg btn--block js-run" disabled>${t.runLabel}</button></div>
        <div class="progress js-progress" hidden><div class="progress__bar js-bar"></div><span class="progress__text js-ptext"></span></div>
        <div class="result js-result" hidden></div>${opts.nextHtml || ''}
        <noscript><p class="callout callout--warn" style="margin-top:16px"><span class="callout__ic">${ICONS.info}</span><span>이 도구는 자바스크립트가 필요합니다. 브라우저의 자바스크립트를 켜 주세요. 파일은 여전히 서버로 전송되지 않고 내 브라우저에서만 처리됩니다.</span></p></noscript>
      </div>
    </div>`;
}

// ───────── 관련 도구 ─────────
function related(slug, rel) {
  const others = TOOLS.filter((t) => t.slug !== slug);
  const cards = others.map((t) => `<a class="tp-rel" href="${rel}${t.slug}/">
          <div class="tp-rel__body"><span class="tp-rel__ico">${ICONS_PDF[t.slug]}</span><div class="tp-rel__tx"><h3>${esc(dispName(t.slug))}</h3><p>${APP_SHORT[t.slug]}</p></div><span class="tp-rel__arr" aria-hidden="true">→</span></div>
        </a>`).join('\n        ');
  return `    <section class="tp-related" id="related">
      <div class="ws-wrap">
        <div class="ws-sechead" data-reveal>
          <h2><small>다른 도구</small>다른 PDF 도구도 써보세요</h2>
          <span class="hint"><span class="dd"></span>모두 무료 · 설치 없이 바로</span>
        </div>
        <div class="tp-relgrid">
        ${cards}
        </div>
      </div>
    </section>`;
}

// ───────── 하단 중앙 플로팅 도구 선택 바 (카테고리 우선 → 도구 열림) ─────────
function toolDock(slug, rel) {
  // 현재 도구가 속한 카테고리(있으면 강조)
  const curCat = (CATEGORIES.find((c) => c.slugs.includes(slug)) || {}).id || '';
  const panels = CATEGORIES.map((cat) => {
    const items = cat.slugs.map((s) => {
      const o = TOOL_BY[s];
      return `<a class="tp-dock__item${s === slug ? ' is-active' : ''}" href="${rel}${s}/"${s === slug ? ' aria-current="page"' : ''}>${o.icon}<span>${esc(o.nav)}</span></a>`;
    }).join('\n            ');
    return `<div class="tp-dock__panel" data-cat="${cat.id}" role="menu" aria-label="${escAttr(cat.title)} 도구" hidden>
          <div class="tp-dock__panel-head">${esc(cat.title)} <span>${cat.slugs.length}</span></div>
          <div class="tp-dock__grid">
            ${items}
          </div>
        </div>`;
  }).join('\n        ');
  const cats = CATEGORIES.map((cat) => `<button type="button" class="tp-dock__cat${cat.id === curCat ? ' is-current' : ''}" data-cat="${cat.id}" aria-expanded="false" aria-haspopup="menu">
          <span class="tp-dock__cat-name">${esc(cat.title.replace(/^PDF\s*/, ''))}</span>
          <span class="tp-dock__cat-count">${cat.slugs.length}</span>
        </button>`).join('\n        ');
  return `    <nav class="tp-dock" aria-label="PDF 도구 선택">
      <div class="tp-dock__panels">
        ${panels}
      </div>
      <div class="tp-dock__cats" role="group" aria-label="도구 카테고리">
        ${cats}
      </div>
    </nav>`;
}

// ───────── 완료 후 다음 작업 추천(같은 카테고리 우선 + 인기 도구 보강) ─────────
function nextSteps(slug, rel) {
  const cat = CATEGORIES.find((c) => c.slugs.includes(slug));
  const recs = (cat ? cat.slugs.filter((s) => s !== slug) : []).slice();
  ['compress', 'merge', 'to-image', 'split'].forEach((s) => { if (s !== slug && recs.indexOf(s) < 0) recs.push(s); });
  const links = recs.slice(0, 3).map((s) => `<a class="btn btn--ghost btn--sm" href="${rel}${s}/">${esc(TOOL_BY[s].nav)} · ${esc(APP_SHORT[s] || '')} →</a>`).join('\n          ');
  return `<div class="tool__next" hidden style="margin-top:20px;padding-top:18px;border-top:1px solid var(--line)">
        <p style="margin:0 0 10px;font-weight:700;font-size:.92rem;color:var(--ink-soft)">완료됐어요 · 이어서 해보세요</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${links}
        </div>
      </div>`;
}

// ───────── 도구 페이지 ─────────
function buildTool(t) {
  const c = read(t.slug);
  const rel = '../';
  const canonical = `${SITE_URL}/${t.slug}/`;
  // 콘텐츠의 선두 원문자(①②③…)는 OS 스텝퍼 번호(01·02)와 중복되므로 제거
  const steps = c.steps.map((s) => `<li><span class="tx">${esc(s.replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*/, ''))}</span></li>`).join('\n          ');
  const faqs = c.faq.map((f, i) => `<details><summary><span class="q">Q${i + 1}</span><span>${esc(f.q)}</span></summary><div class="a">${esc(f.a)}</div></details>`).join('\n          ');
  const extra = (c.extraSections || []).map((s, i) =>
    `<div class="tp-sec" data-reveal><span class="tp-eyebrow">참고</span><h2 class="tp-h2">${esc(s.heading)}</h2><p>${esc(s.body)}</p></div>`).join('\n        ');
  // 오른쪽 컬럼: 다른 도구 정사각형 카드(홈과 동일 스타일)
  const otherTiles = TOOLS.filter((o) => o.slug !== t.slug).map((o) => `<a class="ws-tile" href="${rel}${o.slug}/" data-reveal>
            <span class="ws-tile__ico">${ICONS_PDF[o.slug]}</span>
            <span class="ws-tile__txt"><span class="ws-tile__name">${o.nav}</span><span class="ws-tile__desc">${esc(o.feature[0])}</span></span>${ARR_SVG}
          </a>`).join('\n          ');

  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'WebApplication',
      name: `${c.h1} - ${BRAND}`, url: canonical,
      applicationCategory: 'UtilitiesApplication', operatingSystem: 'All',
      browserRequirements: 'Requires JavaScript', inLanguage: 'ko',
      isAccessibleForFree: true,
      datePublished: TODAY, dateModified: fileDate(`_workspace/content_${t.slug}.json`),
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
  // HowTo: '사용 방법' 스텝(c.steps)을 구조화 → 구글 '방법(How-to)' 리치결과 대상.
  // 본문 tp-steps에 동일 내용이 실제 노출되어 정책을 충족한다(선두 원문자는 화면과 동일하게 제거).
  if (c.steps && c.steps.length) {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'HowTo',
      name: `${c.h1} 사용 방법`, inLanguage: 'ko',
      step: c.steps.map((s, i) => ({
        '@type': 'HowToStep', position: i + 1, name: `${i + 1}단계`,
        text: s.replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*/, '')
      }))
    });
  }
  // FAQPage: 페이지에 실제로 노출된 FAQ를 구조화 → 구글 FAQ 리치결과 대상
  // (구글 정책상 FAQ 본문이 화면에 보여야 유효 — tp-info 노출과 짝을 이룸)
  if (c.faq && c.faq.length) {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: c.faq.map((f) => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    });
  }

  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><a href="${rel}#tools">도구</a><span class="s" aria-hidden="true">/</span>${(() => { const _c = CATEGORIES.find((k) => k.slugs.includes(t.slug)); return _c ? `<a href="${rel}category/${_c.id}/">${esc(_c.title)}</a><span class="s" aria-hidden="true">/</span>` : ''; })()}<b>${esc(c.h1)}</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS_PDF[t.slug]}</span>
          <div>
            <h1 class="tp-h1">${esc(c.h1)}</h1>
            <p class="tp-sub">${esc(c.subtitle)}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-editor">
      <div class="tp-editorwrap">
        <div class="tp-toolbody">${widget(t, { editor: true, nextHtml: nextSteps(t.slug, rel) })}</div>
      </div>
    </section>

${toolDock(t.slug, rel)}

    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">${esc(c.intro)}</p>

        <div class="tp-sec" data-reveal>
          <span class="tp-eyebrow">사용 방법</span>
          <h2 class="tp-h2">${esc(c.h1)} 사용 방법</h2>
          <ol class="tp-steps">
          ${steps}
          </ol>
        </div>

        <div class="tp-secure" data-reveal>
          <span class="ic">${ICONS.lock}</span>
          <div class="tx"><strong>파일은 서버로 전송되지 않습니다.</strong><span>${esc(c.security)}</span></div>
        </div>

        ${extra}

        <div class="tp-sec" data-reveal>
          <span class="tp-eyebrow">자주 묻는 질문</span>
          <h2 class="tp-h2">자주 묻는 질문</h2>
          <div class="ws-term tp-faqterm">
            <div class="ws-faqlist">
            ${faqs}
            </div>
          </div>
        </div>
        <p class="tp-updated" style="margin-top:28px;font-size:.86rem;color:var(--ink-soft)">마지막 업데이트: <time datetime="${fileDate(`_workspace/content_${t.slug}.json`)}">${fileDate(`_workspace/content_${t.slug}.json`)}</time></p>
      </div>
    </section>

${related(t.slug, rel)}`;

  const html = page({
    title: c.title, desc: c.metaDescription, canonical,
    ogTitle: `${c.h1} 무료 - ${BRAND}`, rel, jsonld, main, noFooter: true,
    withScripts: t.script || t.slug, needs: t.needs, noChrome: true,
    bodyClass: 'ws tp',
    extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  emitPage(join(t.slug, 'index.html'), html, canonical);
  console.log(`✓ /${t.slug}/index.html`);
}

// ───────── 홈 ─────────
function buildHome() {
  const c = read('home');
  const HERO_PUNCH = { ko: '필요한 모든 PDF 작업, 한곳에서', en: 'Every PDF tool, in one place', es: 'Todas tus herramientas PDF en un solo lugar', ja: '必要なPDF作業が、ここにすべて', zh: '你需要的所有 PDF 工具，一站搞定' };
  const rel = '';
  const canonical = SITE_URL + '/';

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE_URL + '/', inLanguage: 'ko', description: c.metaDescription },
    { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, legalName: 'INNO-HI Inc', url: SITE_URL + '/',
      logo: SITE_URL + '/assets/img/logo.png',
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: CONTACT_EMAIL } },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: `${BRAND} 도구 목록`, inLanguage: 'ko', numberOfItems: TOOLS.length,
      itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: dispName(t.slug), url: `${SITE_URL}/${t.slug}/` })) }
  ];

  // 좌측 빠른 작업 탭: 대표 도구 5개만(전체 탐색은 우측 카탈로그가 전담)
  const FEATURED = ['merge', 'split', 'compress', 'to-image', 'unlock'].map((s) => TOOL_BY[s]).filter(Boolean);
  const heroTabs = FEATURED.map((t, i) => `<button class="herotool__tab" type="button" role="tab" data-tab="${t.slug}" aria-selected="${i === 0 ? 'true' : 'false'}">${t.icon}<span>${t.nav}</span></button>`).join('\n              ');
  const heroPanels = FEATURED.map((t, i) => `<div class="herotool__panel${i === 0 ? ' is-active' : ''}" role="tabpanel" data-panel="${t.slug}">
            ${widget(t, { editor: true })}
          </div>`).join('\n          ');

  const tiles = TOOLS.map((t) => `<a class="ws-tile" href="${t.slug}/" data-reveal>
        <span class="ws-tile__ico">${ICONS_PDF[t.slug]}</span>
        <span class="ws-tile__txt"><span class="ws-tile__name">${t.nav}</span><span class="ws-tile__desc">${esc(t.feature[0])}</span></span>${ARR_SVG}
      </a>`).join('\n      ');

  const usps = c.uspCards.map((u, i) => `<div class="ws-usp" data-reveal><span class="n">0${i + 1}</span><div><h4>${esc(u.title)}</h4><p>${esc(u.desc)}</p></div></div>`).join('\n        ');
  const faqs = c.faq.map((f, i) => `<details><summary><span class="q">Q${i + 1}</span><span>${esc(f.q)}</span></summary><div class="a">${esc(f.a)}</div></details>`).join('\n        ');

  const card = (slug, i) => `<a class="ws-card" href="${slug}/" style="--i:${i}" data-keywords="${escAttr(searchKeywords(slug))}">
          <span class="ws-card__ico">${ICONS_PDF[slug]}</span>
          <span class="ws-card__tx"><span class="ws-card__name">${esc(dispName(slug))}</span><span class="ws-card__desc">${esc(APP_DESC[slug] || '')}</span></span>
        </a>`;
  const catRows = CATEGORIES.map((cat, ci) => `        <div class="ws-cat-row${ci === 0 ? ' is-active' : ''}" data-cat="${cat.id}">
          <button class="ws-cattile${ci === 0 ? ' is-active' : ''}" type="button" data-cat="${cat.id}" aria-expanded="${ci === 0 ? 'true' : 'false'}">
            <span class="ws-cattile__count">${cat.slugs.length}</span>
            <span class="ws-cattile__title">${esc(cat.title)}</span>
          </button>
          <div class="ws-cat-tools"><div class="ws-shelf">
          ${cat.slugs.map((s, i) => card(s, i)).join('\n          ')}
          </div></div>
        </div>`).join('\n');
  const catalog = `      <div class="ws-cats" aria-label="도구 카테고리">
${catRows}
      </div>`;

  const searchIco = '<svg class="ws-search__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
  const gridIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>';
  const main = `    <div class="home-frame">
    <section class="ws-home2" id="tools">
      <h1 class="sr-only">${esc(c.metaTitle || 'PDF의 모든 것')} — 설치 없이 무료로 쓰는 한국어 PDF 도구 모음</h1>
      <div class="home-hero2 ws-hero">
        <div class="home-hero2__copy">
          <span class="ws-hero__brand">${esc(BRAND)}</span>
          <p class="ws-hero__title">${esc(HERO_PUNCH[CUR_LANG] || HERO_PUNCH.ko)}</p>
          <p class="ws-hero__sub">${esc(c.heroSubtitle || '')}</p>
          <div class="home-hero2__cta">
            <button class="home-hero2__start" type="button" data-hero-start>무료로 시작하기<span aria-hidden="true">→</span></button>
            <button class="home-hero2__all" type="button" data-drawer-toggle aria-controls="tool-drawer">전체 도구 둘러보기</button>
          </div>
          <ul class="home-hero2__chips" aria-label="특징">
            <li>${IC('<path d="M20 6L9 17l-5-5"/>')}완전 무료</li>
            <li>${IC('<path d="M12 3l7 3v5.2c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6z"/>')}서버 미전송</li>
            <li>${IC('<path d="M13 3L5 13.5h5.2L9.5 21 19 10.5h-5.4z"/>')}설치 불필요</li>
          </ul>
        </div>
        <div class="home-hero2__work">
          <div class="ws-wrap ws-home2--solo">
            <div class="ws-winwrap">
              <div class="ws-window ws-deck" data-ws-window>
                <button class="ws-winclose ws-deck__close" type="button" data-ws-close aria-label="작업 닫고 처음으로">처음으로 ✕</button>
                <div class="herotool">
                  <div class="herotool__tabs" role="tablist" aria-label="PDF 도구 선택">
                  ${heroTabs}
                  </div>
                  <div class="herotool__panels">
              ${heroPanels}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="home-pop" aria-label="인기 도구" data-reveal>
      <div class="ws-wrap">
        <h2 class="home-pop__h">가장 많이 쓰는 도구</h2>
        <div class="home-pop__grid">
          <a class="home-pop__card home-pop__card--feat" href="merge/" data-cat="organize">
            <span class="home-pop__ico">${ICONS_PDF['merge']}</span>
            <span class="home-pop__tx"><b>${esc(dispName('merge'))}</b><span>${esc(APP_SHORT['merge'] || '')}</span></span>
            <span class="home-pop__arr" aria-hidden="true">→</span>
          </a>
          ${['compress', 'to-image', 'image-to-pdf', 'unlock'].map((s) => `<a class="home-pop__card" href="${s}/" data-cat="${(CATEGORIES.find((c) => c.slugs.includes(s)) || {}).id || ''}">
            <span class="home-pop__ico">${ICONS_PDF[s]}</span>
            <span class="home-pop__tx"><b>${esc(dispName(s))}</b><span>${esc(APP_SHORT[s] || '')}</span></span>
            <span class="home-pop__arr" aria-hidden="true">→</span>
          </a>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="home-scenes" aria-label="실제 변환 예시" data-reveal>
      <div class="ws-wrap">
        <h2 class="home-scenes__h">실제 변환 예시</h2>
        <p class="home-scenes__sub">브라우저 안에서 바로, 이렇게 바뀝니다</p>
        <div class="home-scenes__grid">
          <a class="scene" href="merge/">
            <span class="scene__label" data-cat="organize">${esc(dispName('merge'))}</span>
            <div class="scene__flow">
              <span class="scene__stack"><i class="ft ft--pdf">PDF</i><i class="ft ft--pdf">PDF</i><i class="ft ft--pdf">PDF</i></span>
              <span class="scene__arr" aria-hidden="true">→</span>
              <i class="ft ft--pdf ft--lg">PDF</i>
            </div>
          </a>
          <a class="scene" href="compress/">
            <span class="scene__label" data-cat="optimize">${esc(dispName('compress'))}</span>
            <div class="scene__flow">
              <i class="ft ft--pdf ft--lg">PDF</i>
              <span class="scene__arr" aria-hidden="true">→</span>
              <i class="ft ft--pdf ft--sm">PDF</i>
            </div>
          </a>
          <a class="scene" href="image-to-pdf/">
            <span class="scene__label" data-cat="convert">${esc(dispName('image-to-pdf'))}</span>
            <div class="scene__flow">
              <span class="scene__stack"><i class="ft ft--jpg">JPG</i><i class="ft ft--png">PNG</i></span>
              <span class="scene__arr" aria-hidden="true">→</span>
              <i class="ft ft--pdf ft--lg">PDF</i>
            </div>
          </a>
          <a class="scene" href="to-image/">
            <span class="scene__label" data-cat="convert">${esc(dispName('to-image'))}</span>
            <div class="scene__flow">
              <i class="ft ft--pdf ft--lg">PDF</i>
              <span class="scene__arr" aria-hidden="true">→</span>
              <span class="scene__stack"><i class="ft ft--jpg">JPG</i><i class="ft ft--png">PNG</i></span>
            </div>
          </a>
        </div>
      </div>
    </section>

    <section class="home-explain" aria-label="서비스 안내">
      <div class="ws-wrap">
        <ul class="home-trust" data-reveal>
          <li class="home-trust--free"><span class="home-trust__ic">${IC('<path d="M3.7 12.4l7.9-7.9a2 2 0 0 1 1.4-.6H18.8a2 2 0 0 1 2 2v5.8a2 2 0 0 1-.6 1.4l-7.9 7.9a2 2 0 0 1-2.8 0l-5.8-5.8a2 2 0 0 1 0-2.8z"/><circle cx="16" cy="8" r="1.25"/>')}</span><b>완전 무료</b><small>워터마크·가입 없음</small></li>
          <li><span class="home-trust__ic">${IC('<path d="M12 3l7 3v5.2c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6z"/><path d="M9 12l2.1 2.1L15.4 9.8"/>')}</span><b>서버 미전송</b><small>100% 내 브라우저 처리</small></li>
          <li><span class="home-trust__ic">${IC('<path d="M13 3L5 13.5h5.2L9.5 21 19 10.5h-5.4z"/>')}</span><b>설치 불필요</b><small>열면 바로 사용</small></li>
          <li><span class="home-trust__ic">${IC('<rect x="3.6" y="3.6" width="7" height="7" rx="1.7"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.7"/><rect x="3.6" y="13.4" width="7" height="7" rx="1.7"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.7"/>')}</span><b>37개 도구</b><small>합치기부터 변환까지</small></li>
        </ul>
        <div class="home-explain__grid" data-reveal>
          <div class="home-block">
            <h2 class="home-block__h">3단계면 끝나요</h2>
            <ol class="home-steps">
              <li><span class="home-steps__n">1</span><div><b>파일 올리기</b><p>PDF·이미지를 화면에 끌어다 놓거나 [파일 선택]으로 고르세요.</p></div></li>
              <li><span class="home-steps__n">2</span><div><b>옵션 고르고 실행</b><p>순서·범위·화질 등 필요한 옵션을 정하고 실행 버튼을 누르세요.</p></div></li>
              <li><span class="home-steps__n">3</span><div><b>결과 내려받기</b><p>완성된 파일을 바로 저장하세요. 창을 닫으면 흔적도 남지 않습니다.</p></div></li>
            </ol>
          </div>
          <div class="home-block">
            <h2 class="home-block__h">왜 「PDF의 모든 것」인가요?</h2>
            <div class="home-why">
              <div class="home-why__card"><h3>파일이 서버로 가지 않아요</h3><p>합치기·변환·압축 등 모든 처리가 여러분의 기기 안에서만 이뤄집니다. 계약서·신분증 같은 민감한 문서도 안심하고 다루세요.</p></div>
              <div class="home-why__card"><h3>완전 무료, 워터마크 없음</h3><p>회원가입도 결제도 없고, 파일 개수·용량 제한도 없습니다. 결과물에 워터마크가 찍히지 않습니다.</p></div>
              <div class="home-why__card"><h3>한국어에 진심입니다</h3><p>외산 도구의 어색한 기계번역 대신, 자연스러운 한국어 안내와 단계 설명으로 누구나 쉽게 쓸 수 있어요.</p></div>
            </div>
          </div>
        </div>
        <div class="home-block home-faqblock" data-reveal>
          <h2 class="home-block__h">자주 묻는 질문</h2>
          <div class="home-faq">
            <details><summary>정말 무료인가요?</summary><p>네. 모든 도구가 완전 무료이며, 워터마크나 파일 개수·용량 제한이 없습니다.</p></details>
            <details><summary>제 파일이 서버로 업로드되나요?</summary><p>아니요. 모든 작업은 여러분의 웹 브라우저 안에서만 실행되며, 파일은 어떤 서버로도 전송되지 않습니다. 창을 닫으면 메모리에서 사라집니다.</p></details>
            <details><summary>회원가입이나 프로그램 설치가 필요한가요?</summary><p>둘 다 필요 없습니다. 이 페이지를 열면 바로 사용할 수 있습니다.</p></details>
            <details><summary>스마트폰에서도 쓸 수 있나요?</summary><p>네. 스마트폰·태블릿 브라우저에서도 대부분의 도구가 그대로 동작합니다.</p></details>
          </div>
        </div>
      </div>
    </section>
    </div>

    <aside class="ws-drawer" id="tool-drawer" aria-label="전체 도구" aria-hidden="true">
      <div class="ws-drawer__bar">
        <span class="ws-drawer__title">${gridIco}전체 도구 <b>37</b></span>
        <button class="ws-drawer__x" type="button" data-drawer-close aria-label="닫기">✕</button>
      </div>
      <div class="ws-drawer__scroll">
        <div class="ws-search">
          ${searchIco}
          <input type="search" class="js-toolsearch ws-search__input" placeholder="도구 검색 — 예: 압축, 워터마크, jpg" aria-label="도구 검색" autocomplete="off">
        </div>
        <p class="ws-search__empty js-search-empty" hidden>찾는 도구가 없어요. ‘압축’, ‘합치기’, ‘jpg’ 처럼 검색해 보세요.</p>
${catalog}
      </div>
    </aside>
    <div class="ws-drawer-scrim" data-drawer-close></div>`;

  const html = page({
    title: c.metaTitle, desc: c.metaDescription, canonical,
    ogTitle: c.metaTitle, rel, jsonld, main, noChrome: true,
    withScripts: [...new Set(FEATURED.map((t) => t.script || t.slug))],
    bodyClass: 'ws home',
    extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  emitPage('index.html', html, canonical);
  console.log('✓ /index.html (작업실 OS)');
}

// ───────── 소개 페이지 ─────────
function buildAbout() {
  const rel = '../';
  const canonical = `${SITE_URL}/about/`;
  const sec = (eb, h, body) => `        <div class="tp-sec" data-reveal><span class="tp-eyebrow">${eb}</span><h2 class="tp-h2">${h}</h2><p>${body}</p></div>`;
  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><b>소개 · 개인정보</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS.info}</span>
          <div>
            <h1 class="tp-h1">소개 · 개인정보 처리방침</h1>
            <p class="tp-sub">설치와 회원가입 없이 쓰는 무료 PDF 도구 모음. 가장 큰 차이는 파일을 서버에 올리지 않는다는 점입니다.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">「${BRAND}」의 모든 작업은 여러분의 <strong>웹 브라우저 안(내 기기)</strong>에서만 이뤄집니다. 어떤 파일도 서버로 전송되지 않습니다.</p>
${sec('처리 방식', '파일은 어떻게 처리되나요?', '합치기·분할·변환 등 모든 작업은 여러분의 <strong>웹 브라우저 안(내 기기)</strong>에서만 이뤄집니다. PDF 파일은 어떤 서버로도 업로드되지 않으며, 작업이 끝나거나 창을 닫으면 메모리에서 사라집니다. 인터넷 연결이 끊긴 상태에서도 한 번 페이지를 열어두면 대부분의 기능이 동작합니다.')}
${sec('개인정보', '개인정보 수집을 하나요?', `이 사이트는 회원가입을 받지 않고, 파일·이메일 등 어떤 개인정보도 수집·저장하지 않습니다. 파일을 외부로 전송하지 않으므로 업로드된 문서가 외부에 보관될 일이 없습니다.${ADSENSE_ENABLED ? ' 다만 광고 표시를 위해 Google 등 제3자가 쿠키를 사용할 수 있습니다(아래 「광고·쿠키」 참고).' : ''}`)}
${(ADSENSE_ENABLED || GA_ENABLED) ? sec('광고 · 쿠키', '광고와 쿠키는 어떻게 쓰이나요?', `${ADSENSE_ENABLED ? '이 사이트는 무료 운영을 위해 Google 애드센스 광고를 표시합니다. Google을 포함한 제3자 광고 공급자는 <strong>쿠키</strong>를 사용해 이용자의 이전 방문 기록을 바탕으로 광고를 게재할 수 있습니다. 이용자는 <a href="https://www.google.com/settings/ads" rel="noopener" target="_blank">Google 광고 설정</a>에서 맞춤 광고를 끌 수 있고, <a href="https://www.aboutads.info/choices/" rel="noopener" target="_blank">aboutads.info</a>에서 제3자 광고 쿠키를 일괄 거부할 수도 있습니다. ' : ''}${GA_ENABLED ? '또한 방문 통계 파악을 위해 Google 애널리틱스를 사용하며, 이 역시 쿠키로 익명화된 사용 데이터(방문 페이지·체류 시간 등)를 수집합니다. 개인을 식별하는 정보는 수집하지 않습니다. ' : ''}광고·분석과 무관하게 여러분이 올린 <strong>PDF 파일 자체는 여전히 서버로 전송되지 않고 내 브라우저에서만 처리</strong>됩니다.`) : ''}
${sec('이용 요금', '무료인가요?', '네. 완전 무료이며 결과물에 워터마크가 붙지 않고, 파일 개수·용량 제한도 없습니다.')}
${sec('잠금해제 안내', '잠금해제 도구 안내', '잠금해제는 암호를 알아내는 크랙 도구가 아니라, 본인이 알고 있는 비밀번호 또는 인쇄·편집 제한을 제거하는 도구입니다. 권한이 있는 본인의 문서에만 사용해 주세요.')}
      </div>
    </section>

${related('', rel).replace('다른 PDF 도구도 써보세요', '도구 바로가기')}`;
  const html = page({
    title: `소개 · 개인정보 | ${BRAND}`,
    desc: `${BRAND}은 파일을 서버에 올리지 않고 내 브라우저에서만 처리하는 무료 PDF 도구 모음입니다. 개인정보를 수집하지 않습니다.`,
    canonical, ogTitle: `소개 · 개인정보 | ${BRAND}`, rel, jsonld: null, main: enOr('about', rel, main), withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  emitPage(join('about', 'index.html'), html, canonical);
  console.log('✓ /about/index.html');
}

// ───────── 개인정보 처리방침 (전용 페이지) ─────────
// 애드센스 정책상 명확히 접근 가능한 개인정보처리방침이 필요하여 /about/와 분리한 전용 URL을 둔다.
function buildPrivacy() {
  const rel = '../';
  const canonical = `${SITE_URL}/privacy/`;
  const sec = (eb, h, body) => `        <div class="tp-sec" data-reveal><span class="tp-eyebrow">${eb}</span><h2 class="tp-h2">${h}</h2><p>${body}</p></div>`;
  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><b>개인정보 처리방침</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS.info}</span>
          <div>
            <h1 class="tp-h1">개인정보 처리방침</h1>
            <p class="tp-sub">「${BRAND}」은 파일을 서버에 올리지 않고 내 브라우저에서만 처리합니다. 이 문서는 어떤 정보가 어떻게 다뤄지는지 설명합니다.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">시행일: 2026-07-08 · 이 방침은 「${BRAND}」(${SITE_URL})에 적용됩니다.</p>
${sec('핵심 요약', '한 줄 요약', '이 사이트는 회원가입을 받지 않고, 여러분이 올린 파일이나 이메일 같은 <strong>개인정보를 수집·저장·전송하지 않습니다</strong>. 모든 PDF·이미지 작업은 여러분의 브라우저(기기) 안에서만 이뤄집니다.')}
${sec('파일 처리', '업로드한 파일은 어떻게 되나요?', '합치기·분할·변환 등 모든 작업은 <strong>여러분의 웹 브라우저 안에서만</strong> 실행됩니다. 파일은 어떤 서버로도 전송되지 않으며, 작업이 끝나거나 탭을 닫으면 브라우저 메모리에서 사라집니다. 따라서 문서 내용이 외부에 저장되거나 제3자에게 공유될 일이 없습니다.')}
${sec('수집 정보', '수집하는 개인정보', '이 사이트 자체는 이름·이메일·전화번호·파일 내용 등 어떠한 개인정보도 직접 수집하지 않습니다. 로그인이나 사용자 추적을 운영하지 않습니다. 다만 아래의 호스팅·광고 제공자가 기술적 정보를 처리할 수 있습니다.')}
${sec('호스팅 로그', '서버 로그', '이 사이트는 정적 웹 호스팅으로 운영됩니다. 호스팅 제공자는 서비스 제공·보안을 위해 접속 IP·브라우저 종류 등 표준 접속 로그를 일시적으로 처리할 수 있습니다.')}
${ADSENSE_ENABLED ? sec('광고 · 쿠키', 'Google 애드센스와 쿠키', `이 사이트는 무료 운영을 위해 <strong>Google 애드센스</strong> 광고를 게재합니다. Google을 포함한 제3자 광고 공급업체는 <strong>쿠키</strong>를 사용해 이용자의 이 사이트 및 다른 사이트 방문 기록을 바탕으로 광고를 게재할 수 있습니다(DART 쿠키 등). 이용자는 <a href="https://policies.google.com/technologies/ads" rel="noopener" target="_blank">Google 광고 기술</a> 정책을 확인하고, <a href="https://www.google.com/settings/ads" rel="noopener" target="_blank">Google 광고 설정</a>에서 맞춤 광고를 끄거나, <a href="https://www.aboutads.info/choices/" rel="noopener" target="_blank">aboutads.info</a>에서 제3자 광고 쿠키를 일괄 거부할 수 있습니다. 광고와 무관하게 여러분이 올린 <strong>파일 자체는 서버로 전송되지 않고 내 브라우저에서만 처리</strong>됩니다.`) : ''}
${sec('제3자 링크', '외부 링크', '이 사이트에는 외부 사이트로 향하는 링크가 있을 수 있습니다. 외부 사이트의 개인정보 처리에는 이 방침이 적용되지 않으며, 각 사이트의 정책을 확인해 주세요.')}
${sec('아동', '아동의 개인정보', '이 사이트는 만 14세 미만 아동을 대상으로 하지 않으며, 아동으로부터 고의로 개인정보를 수집하지 않습니다.')}
${sec('변경', '방침의 변경', '법령·서비스 변경에 따라 이 방침이 수정될 수 있으며, 변경 시 이 페이지에 갱신된 시행일과 함께 게시합니다.')}
${sec('문의', '개인정보 관련 문의', `개인정보 처리에 대한 문의는 <a href="${rel}contact/">문의 페이지</a>를 통해 접수해 주세요.`)}
      </div>
    </section>`;
  const html = page({
    title: `개인정보 처리방침 | ${BRAND}`,
    desc: `${BRAND}의 개인정보 처리방침. 파일을 서버에 올리지 않고 내 브라우저에서만 처리하며 개인정보를 수집하지 않습니다. Google 애드센스 쿠키 안내 포함.`,
    canonical, ogTitle: `개인정보 처리방침 | ${BRAND}`, rel, jsonld: null, main: enOr('privacy', rel, main), withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  emitPage(join('privacy', 'index.html'), html, canonical);
  console.log('✓ /privacy/index.html');
}

// ───────── 문의 (전용 페이지) ─────────
function buildContact() {
  const rel = '../';
  const canonical = `${SITE_URL}/contact/`;
  const sec = (eb, h, body) => `        <div class="tp-sec" data-reveal><span class="tp-eyebrow">${eb}</span><h2 class="tp-h2">${h}</h2><p>${body}</p></div>`;
  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><b>문의</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS.info}</span>
          <div>
            <h1 class="tp-h1">문의 · 제안</h1>
            <p class="tp-sub">기능 제안, 버그 제보, 제휴·광고 문의를 환영합니다. 아래 채널로 연락해 주세요.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">보내주신 의견은 서비스 개선에 큰 힘이 됩니다. 확인 후 답변드리겠습니다.</p>
${sec('이메일', '이메일 문의', `일반 문의·제휴·광고 관련은 <a href="mailto:${escAttr(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a> 로 보내주세요.`)}
${sec('제안 · 제보', '기능 제안 · 버그 제보', '새로운 기능 아이디어나 버그 제보는 위 이메일로 보내주세요. 보내주신 의견은 빠르게 검토해 반영합니다.')}
      </div>
    </section>`;
  const html = page({
    title: `문의 · 제안 | ${BRAND}`,
    desc: `${BRAND}에 대한 문의·제안·제휴/광고 문의 채널 안내.`,
    canonical, ogTitle: `문의 · 제안 | ${BRAND}`, rel, jsonld: null, main: enOr('contact', rel, main), withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  emitPage(join('contact', 'index.html'), html, canonical);
  console.log('✓ /contact/index.html');
}

// ───────── 404 ─────────
function build404() {
  const rel = `${SITE_URL}/`; // 404는 임의 경로에서 서빙되므로 자산·링크를 절대경로로
  const main = `<section class="tp-hero">
      <div class="tp-col">
        <div class="ws-winwrap" style="max-width:600px;margin:36px auto 0">
          <div class="ws-window">
            <div class="ws-winbar"><span class="ws-lights" aria-hidden="true"><span class="r"></span><span class="y"></span><span class="g"></span></span><span class="ws-wintitle">error — 404.log</span></div>
            <div style="padding:40px 30px;text-align:center">
              <p style="font-family:var(--mono);color:var(--pp);font-weight:700;margin:0 0 16px">$ open ./page<span style="color:var(--ink-soft)"> → </span>not found</p>
              <h1 class="tp-h1" style="font-size:clamp(1.7rem,4vw,2.3rem)">페이지를 찾을 수 없어요</h1>
              <p style="color:var(--ink-soft);margin:12px 0 26px;line-height:1.7">주소가 바뀌었거나 삭제된 페이지일 수 있어요.<br>아래에서 처음으로 돌아가세요.</p>
              <a class="ws-btn primary" href="${SITE_URL}/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>홈으로 돌아가기</a>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  const html = page({
    title: `페이지를 찾을 수 없어요 | ${BRAND}`,
    desc: '요청하신 페이지를 찾을 수 없습니다.',
    canonical: null, noindex: true, ogTitle: '404', rel, jsonld: null, main, withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${SITE_URL}/assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  emitPage('404.html', html, null);
  console.log('✓ /404.html');
}

// ───────── SEO 파일 ─────────
function buildSeoFiles() {
  // 각 페이지 HTML의 git 최종 커밋일(YYYY-MM-DD)을 lastmod로 사용 → 실제 갱신일 반영.
  // git 실패 시 오늘(빌드일)로 폴백. 고정 날짜 박제 문제 해결.
  const gitDate = (relPath) => {
    try {
      const d = execSync(`git log -1 --format=%cs -- "${relPath}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : BUILD_DATE;
    } catch { return BUILD_DATE; }
  };
  const entries = [
    { url: SITE_URL + '/', file: 'index.html', priority: '1.0' },
    ...CATEGORIES.map((cat) => ({ url: `${SITE_URL}/category/${cat.id}/`, file: `category/${cat.id}/index.html`, priority: '0.7' })),
    ...TOOLS.map((t) => ({ url: `${SITE_URL}/${t.slug}/`, file: `${t.slug}/index.html`, priority: '0.8' })),
    { url: SITE_URL + '/about/', file: 'about/index.html', priority: '0.5' },
    { url: SITE_URL + '/terms/', file: 'terms/index.html', priority: '0.3' },
    { url: SITE_URL + '/privacy/', file: 'privacy/index.html', priority: '0.3' },
    { url: SITE_URL + '/contact/', file: 'contact/index.html', priority: '0.3' },
    ...LANGS.filter((l) => l !== 'ko' && I18N[l]).flatMap((l) => [
      { url: `${SITE_URL}/${l}/`, file: `${l}/index.html`, priority: '0.9' },
      ...TOOLS.map((t) => ({ url: `${SITE_URL}/${l}/${t.slug}/`, file: `${l}/${t.slug}/index.html`, priority: '0.7' })),
      { url: `${SITE_URL}/${l}/about/`, file: `${l}/about/index.html`, priority: '0.4' },
      { url: `${SITE_URL}/${l}/privacy/`, file: `${l}/privacy/index.html`, priority: '0.2' },
      { url: `${SITE_URL}/${l}/contact/`, file: `${l}/contact/index.html`, priority: '0.2' }
    ])
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>\n    <loc>${e.url}</loc>\n    <lastmod>${gitDate(e.file)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`).join('\n')}
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
    start_url: './', display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff',
    icons: [
      { src: 'assets/img/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  };
  writeFileSync(join(ROOT, 'site.webmanifest'), JSON.stringify(manifest, null, 2));
  console.log('✓ /site.webmanifest');

  // CNAME: GitHub Pages 커스텀 도메인. 배포 아티팩트(레포 루트)에 포함돼 도메인이 연결된다.
  if (CUSTOM_DOMAIN) {
    writeFileSync(join(ROOT, 'CNAME'), `${CUSTOM_DOMAIN}\n`);
    console.log('✓ /CNAME');
  }

  // ads.txt: 애드센스 게시자 검증용. 실제 게시자 ID가 설정됐을 때만 생성한다.
  // 커스텀 도메인을 쓰면 루트(everything-pdf.site/ads.txt)에서 정상 인식된다.
  if (ADSENSE_ENABLED) {
    const pub = ADSENSE_CLIENT.replace(/^ca-/, ''); // ca-pub-… → pub-…
    writeFileSync(join(ROOT, 'ads.txt'), `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
    console.log('✓ /ads.txt');
  }
}

// ───────── 카테고리 허브 페이지 (/category/<id>/) — 롱테일 카테고리 검색어 대응 ─────────
// 주의: 카테고리 id 'organize'는 도구 slug와 충돌하므로 /category/ 접두어로 격리한다.
function buildCategory(cat) {
  const rel = '../../';
  const canonical = `${SITE_URL}/category/${cat.id}/`;
  const cards = cat.slugs.map((slug) => `<a class="tp-rel" href="${rel}${slug}/">
          <div class="tp-rel__body"><span class="tp-rel__ico">${ICONS_PDF[slug]}</span><div class="tp-rel__tx"><h3>${esc(dispName(slug))}</h3><p>${esc(APP_SHORT[slug] || APP_DESC[slug] || '')}</p></div><span class="tp-rel__arr" aria-hidden="true">→</span></div>
        </a>`).join('\n        ');
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${cat.title} 도구 모음`, url: canonical, inLanguage: 'ko', description: cat.desc,
      isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE_URL + '/' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: `${cat.title} 도구`, item: canonical }
    ] },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: `${cat.title} 도구`, inLanguage: 'ko', numberOfItems: cat.slugs.length,
      itemListElement: cat.slugs.map((slug, i) => ({ '@type': 'ListItem', position: i + 1, name: dispName(slug), url: `${SITE_URL}/${slug}/` })) }
  ];
  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><b>${esc(cat.title)}</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS_PDF[cat.slugs[0]] || ICONS.info}</span>
          <div>
            <h1 class="tp-h1">${esc(cat.title)} 도구 모음</h1>
            <p class="tp-sub">${esc(cat.desc)}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">${esc(cat.title)} 관련 무료 도구 ${cat.slugs.length}가지를 모았어요. 모두 설치·회원가입 없이, 파일을 서버에 올리지 않고 <strong>내 브라우저에서만</strong> 처리됩니다.</p>
        <div class="tp-relgrid" style="margin-top:10px">
        ${cards}
        </div>
      </div>
    </section>

${related('', rel).replace('다른 PDF 도구도 써보세요', '전체 도구 보기')}`;
  const html = page({
    title: `${cat.title} 도구 모음 무료 - ${BRAND}`,
    desc: `${cat.title} 무료 도구 모음 — ${cat.desc}`,
    canonical, ogTitle: `${cat.title} 도구 모음 - ${BRAND}`, rel, jsonld, main, withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  const dir = join(ROOT, 'category', cat.id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`✓ /category/${cat.id}/index.html`);
}

// ───────── 이용약관 · 면책조항 (/terms/) — 민감 도구 다수, 애드센스·법적 신뢰 ─────────
function buildTerms() {
  const rel = '../';
  const canonical = `${SITE_URL}/terms/`;
  const sec = (eb, h, body) => `        <div class="tp-sec" data-reveal><span class="tp-eyebrow">${eb}</span><h2 class="tp-h2">${h}</h2><p>${body}</p></div>`;
  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><b>이용약관</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS.info}</span>
          <div>
            <h1 class="tp-h1">이용약관 · 면책조항</h1>
            <p class="tp-sub">「${BRAND}」 이용 조건과 책임 범위를 안내합니다. 시행일: 2026-07-09</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-info">
      <div class="tp-col">
        <p class="tp-lead">「${BRAND}」(이하 '서비스')은 이노하이(INNO-HI Inc)가 운영하는 무료 PDF 도구입니다. 서비스를 이용함으로써 아래 약관에 동의하는 것으로 봅니다.</p>
${sec('서비스 성격', '무료 · 무보증(as-is)', '서비스는 무료로 "있는 그대로(as-is)" 제공됩니다. 특정 목적에의 적합성·정확성·무중단·무오류를 보증하지 않으며, 브라우저 환경에 따라 결과가 달라질 수 있습니다.')}
${sec('책임의 제한', '손해에 대한 책임', '서비스 이용 또는 이용 불능으로 발생한 직접·간접·부수적 손해(데이터 손실, 문서 손상, 영업 손실 등)에 대해 운영자는 관련 법이 허용하는 한도에서 책임을 지지 않습니다. 중요한 문서는 반드시 원본을 별도로 보관해 주세요.')}
${sec('이용자 준수사항', '본인 권한 있는 문서에만', '이용자는 <strong>본인이 소유하거나 사용 권한이 있는 문서</strong>에만 서비스를 사용해야 합니다. 특히 잠금해제·비밀번호 설정·서명 등은 타인의 권리를 침해하지 않는 범위에서만 사용하며 그 책임은 이용자에게 있습니다. 잠금해제는 암호를 알아내는 크랙 도구가 아니라, 본인이 아는 암호·권한 제한을 다루는 도구입니다.')}
${sec('지식재산', '저작권', '서비스의 이름·디자인·콘텐츠에 대한 권리는 운영자에게 있습니다. 이용자가 처리하는 문서의 저작권은 이용자에게 있으며, 서비스는 그 문서를 저장·전송하지 않습니다.')}
${sec('약관 변경 · 준거법', '변경과 문의', `약관은 필요 시 개정될 수 있으며 개정 시 본 페이지에 게시합니다. 본 약관은 대한민국 법을 준거법으로 합니다. 문의는 <a href="${rel}contact/">문의 페이지</a> 또는 <a href="mailto:${escAttr(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>로 접수해 주세요.`)}
      </div>
    </section>`;
  const html = page({
    title: `이용약관 · 면책조항 | ${BRAND}`,
    desc: `${BRAND} 이용약관·면책조항. 무료·무보증 제공, 책임 제한, 본인 권한 있는 문서에만 사용.`,
    canonical, ogTitle: `이용약관 | ${BRAND}`, rel, jsonld: null, main, withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${assetVer('assets/css/workspace.css')}">`
  });
  const dir = join(ROOT, 'terms');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log('✓ /terms/index.html');
}

// ───────── 실행 ─────────
console.log(`\nPDF의 모든 것 — 빌드 (SITE_URL=${SITE_URL})\n`);
// 언어별 빌드: 한국어(루트) + 영어(/en/). 영어 자산(i18n_en.json)이 없으면 한국어만.
const BUILD_LANGS = LANGS.filter((l) => l === 'ko' || I18N[l]);
for (const lang of BUILD_LANGS) {
  CUR_LANG = lang;
  console.log(`\n── ${lang.toUpperCase()} ${lang === 'ko' ? '(루트)' : '(/en/)'} ──`);
  buildHome();
  TOOLS.forEach(buildTool);
  buildAbout();
  buildPrivacy();
  buildContact();
  build404();
}
// 카테고리 허브·이용약관은 신규(배치2) — 우선 한국어만 생성(영어판은 후속). CUR_LANG='ko' 고정 상태.
CUR_LANG = 'ko';
CATEGORIES.forEach(buildCategory);
buildTerms();
buildSeoFiles();
console.log('\n빌드 완료.\n');
