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
const ASSET_VER = Date.now(); // CSS/JS 캐시버스팅(빌드마다 갱신)

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
};

// ───────── 유틸 ─────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const read = (slug) => JSON.parse(readFileSync(join(WS, `content_${slug}.json`), 'utf8'));

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
    accept: 'image', imageThumbs: true, fileThumbs: true,
    runLabel: 'PDF로 만들기', dropTitle: '이미지(JPG·PNG)를 끌어다 놓으세요', pagecount: false,
    feature: ['JPG·PNG → PDF', '여러 장 한 파일로', '순서 변경'], options: optImagesToPdf() },
  { slug: 'svg-to-png', icon: ICONS.image, nav: 'SVG→PNG', multiple: true, reorder: true,
    accept: 'svg', imageThumbs: true, fileThumbs: true,
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
];
const TOOL_BY = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));

// ───────── 카테고리(카탈로그) ─────────
const CATEGORIES = [
  { id: 'organize', title: 'PDF 구성', desc: '여러 PDF를 합치고, 나누고, 페이지를 자유롭게 정리하세요.', slugs: ['merge', 'split', 'organize', 'extract', 'delete', 'page-numbers'] },
  { id: 'convert', title: 'PDF 변환', desc: 'PDF와 이미지를 서로 바꾸세요. 모두 내 브라우저에서 처리됩니다.', slugs: ['to-image', 'image-to-pdf', 'svg-to-png'] },
  { id: 'security', title: 'PDF 보안', desc: '비밀번호·편집 제한을 풀어 자유롭게 사용하세요.', slugs: ['unlock'] },
  { id: 'optimize', title: 'PDF 최적화', desc: '용량을 줄여 가볍게. 메일·제출 용량 제한에 맞추세요.', slugs: ['compress'] },
  { id: 'edit', title: 'PDF 편집', desc: '방향을 바로잡고 여백을 정리해 문서를 다듬으세요.', slugs: ['rotate', 'crop'] },
  { id: 'analyze', title: 'PDF 분석', desc: '페이지 수·용량·메타데이터 등 문서 정보를 확인하세요.', slugs: ['pdf-info'] },
];

// 작업실 OS 공용 자원 (홈 + 도구 상세 공통)
const CHIP = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
const APP_FILE = { merge: 'merge.app', split: 'split.app', unlock: 'unlock.app', extract: 'extract.app', delete: 'delete.app', organize: 'organize.app', 'to-image': 'to-image.app', 'page-numbers': 'page-num.app', 'image-to-pdf': 'img-to-pdf.app', 'svg-to-png': 'svg-to-png.app', rotate: 'rotate.app', crop: 'crop.app', compress: 'compress.app', 'pdf-info': 'pdf-info.app' };
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
};
const APP_SHORT = {
  merge: '여러 PDF를 하나로', split: '한 파일을 여러 개로', unlock: '비밀번호·제한 해제',
  extract: '원하는 페이지만 추출', delete: '불필요한 페이지 삭제', organize: '순서·회전·삭제 한 번에', 'to-image': 'JPG·PNG로 변환', 'page-numbers': '페이지 번호 넣기',
  'image-to-pdf': 'JPG·PNG를 PDF로', 'svg-to-png': 'SVG를 PNG로',
  rotate: '페이지 회전', crop: '여백 제거', compress: '용량 줄이기', 'pdf-info': '문서 정보 보기',
};
// 태블릿 대시보드 타일 색(도구별 컬러 구분)
const TILE_COLOR = {
  merge: '#e5252a', split: '#2f6df6', unlock: '#f59e0b', extract: '#10b981',
  delete: '#f43f5e', organize: '#7c3aed', 'to-image': '#8b5cf6', 'page-numbers': '#0ea5e9', 'image-to-pdf': '#0ea5e9', 'svg-to-png': '#8b5cf6',
};

// ───────── 이미지 변환 도구 자동 생성 (JPG/PNG/WEBP/SVG 상호변환) ─────────
const UP = { jpg: 'JPG', png: 'PNG', webp: 'WEBP', svg: 'SVG' };
const CONVERTS = [
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
const ARR_SVG = '<svg class="arr" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// 작업실 OS 태스크바 / 푸터 (rel: 홈은 '', 하위는 '../')
function wsTaskbar(rel) {
  const home = rel === '' ? './' : rel;
  return `    <header class="ws-taskbar">
      <a href="${home}" class="ws-logo"><span class="chip" aria-hidden="true"><img src="${rel}assets/img/logo.png" alt="" width="30" height="30" decoding="async"></span><span class="ko">PDF의 모든 것</span><b class="sep" aria-hidden="true">/</b><span class="wk">workspace</span></a>
      <nav class="ws-nav"><a href="${home}">도구</a><a href="${home}about/">소개</a><a class="gh" href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">오픈소스 ↗</a></nav>
    </header>`;
}
function wsFooter(rel) {
  const home = rel === '' ? './' : rel;
  const t1 = TOOLS.slice(0, 4).map((t) => `<a href="${home}${t.slug}/">${read(t.slug).h1}</a>`).join('');
  const t2 = TOOLS.slice(4).map((t) => `<a href="${home}${t.slug}/">${read(t.slug).h1}</a>`).join('');
  return `    <footer class="ws-foot">
      <div class="ws-wrap">
        <div class="ws-footgrid">
          <div class="ws-footbrand"><span class="fb"><span class="chip" aria-hidden="true"><img src="${rel}assets/img/logo.png" alt="" width="30" height="30" decoding="async"></span>PDF의 모든 것</span><p>설치도 회원가입도 없이, 파일을 서버에 올리지 않고 내 브라우저에서 바로 처리하는 한국어 무료 PDF 도구 모음입니다.</p></div>
          <div class="ws-footcols">
            <div class="ws-footcol"><h5>도구</h5>${t1}</div>
            <div class="ws-footcol"><h5>더보기</h5>${t2}</div>
            <div class="ws-footcol"><h5>정보</h5><a href="${home}about/">서비스 소개</a><a href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">오픈소스 (GitHub) ↗</a></div>
          </div>
        </div>
        <div class="ws-footbottom"><span>© 2026 PDF의 모든 것 — made in Korea, runs on your device.</span><span>오픈소스 · MIT License</span></div>
      </div>
    </footer>`;
}

// ───────── 옵션 마크업 (tools/*.js의 ID와 일치) ─────────
// 공통: 저장 파일명(선택). 비우면 도구 기본 이름. class js-outname을 ToolCore가 읽음.
function optOutName(ph) {
  return `<div class="option">
    <label class="option__label" for="out-name">저장 파일명 <span class="option__hint">선택 · 비우면 기본 이름</span></label>
    <input type="text" id="out-name" class="field js-outname" placeholder="${ph}" autocomplete="off">
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
      <label><input type="radio" name="split-mode" value="each" checked><span>낱장으로</span></label>
      <label><input type="radio" name="split-mode" value="every"><span>N매마다</span></label>
      <label><input type="radio" name="split-mode" value="oddeven"><span>홀/짝 분리</span></label>
      <label><input type="radio" name="split-mode" value="ranges"><span>범위 지정</span></label>
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
    <input type="text" id="${id}" class="field" placeholder="${ph}" inputmode="numeric" autocomplete="off">
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
      <label class="option__label" for="img-quality">JPG 품질 <span class="option__hint">JPG일 때</span></label>
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
      <label><input type="radio" name="img-pages-mode" value="all" checked><span>전체 페이지</span></label>
      <label><input type="radio" name="img-pages-mode" value="custom"><span>특정 페이지</span></label>
    </div>
  </div>
  <div class="option">
    <label class="option__label" for="img-pages">페이지 지정 <span class="option__hint">'특정 페이지' 선택 시 · 예: 1, 3, 5-7</span></label>
    <input type="text" id="img-pages" class="field" placeholder="1, 3, 5-7" inputmode="numeric" autocomplete="off">
  </div>
  <label class="checkbox"><input type="checkbox" id="img-gray"> 흑백(그레이스케일)으로 변환</label>
  <label class="checkbox"><input type="checkbox" id="img-transparent"> 투명 배경 (PNG만 적용)</label>
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
  <nav class="site-nav" aria-label="주요 도구">${navItems}<a href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">GitHub</a></nav>
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

function page({ title, desc, canonical, ogTitle, rel, jsonld, main, withScripts, headExtra, bodyClass, extraScripts, noChrome, noindex, noFooter }) {
  const ld = jsonld ? `\n  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : '';
  const extra = (extraScripts || []).map((s) => `\n  <script src="${rel}${s}?v=${ASSET_VER}" defer></script>`).join('');
  const toolList = withScripts ? (Array.isArray(withScripts) ? withScripts : [withScripts]) : [];
  const scripts = toolList.length ? `
  <script>window.AAP_BASE='${rel}';</script>
  <script src="${rel}assets/vendor/pdf-lib.min.js" defer></script>
  <script src="${rel}assets/vendor/pdf.min.js" defer></script>
  <script src="${rel}assets/vendor/jszip.min.js" defer></script>
  <script src="${rel}assets/js/ui.js?v=${ASSET_VER}" defer></script>
  <script src="${rel}assets/js/pdf-engine.js?v=${ASSET_VER}" defer></script>
  <script src="${rel}assets/js/tool-core.js?v=${ASSET_VER}" defer></script>
${toolList.map((s) => `  <script src="${rel}assets/js/tools/${s}.js?v=${ASSET_VER}" defer></script>`).join('\n')}` : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(desc)}">${canonical ? `\n  <link rel="canonical" href="${escAttr(canonical)}">` : ''}
  <meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow'}">
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
  <link rel="icon" href="${rel}assets/img/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="${rel}assets/img/logo.png">
  <link rel="manifest" href="${rel}site.webmanifest">
  <meta name="theme-color" content="#ffffff">
  <link rel="stylesheet" href="${rel}assets/css/style.css?v=${ASSET_VER}">${headExtra || ''}${ld}
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
  const ACC = { image: 'image/png,image/jpeg', jpg: 'image/jpeg,.jpg,.jpeg', png: 'image/png,.png', webp: 'image/webp,.webp', svg: 'image/svg+xml,.svg' };
  const NOUN = { image: '이미지', jpg: 'JPG', png: 'PNG', webp: 'WEBP', svg: 'SVG' };
  const accept = ACC[t.accept] || 'application/pdf';
  const noun = NOUN[t.accept] || 'PDF';
  const aria = noun + ' 파일 선택 또는 끌어다 놓기';
  const convAttr = t.conv ? ` data-from="${t.conv.from}" data-to="${t.conv.to}"` : '';
  const dropBody = `<div class="dropzone js-drop" tabindex="0" role="button" aria-label="${aria}">
          <input type="file" class="js-file" accept="${accept}" ${t.multiple ? 'multiple ' : ''}hidden>
          <svg class="dropzone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
          <p class="dropzone__title">${t.dropTitle}</p>
          <span class="dropzone__btn">파일 선택</span>
          <p class="dropzone__hint">또는 끌어다 놓기 · 파일은 내 브라우저에서만 처리됩니다</p>
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
        <div class="result js-result" hidden></div>
        <noscript><p class="callout callout--warn" style="margin-top:16px"><span class="callout__ic">${ICONS.info}</span><span>이 도구는 자바스크립트가 필요합니다. 브라우저의 자바스크립트를 켜 주세요. 파일은 여전히 서버로 전송되지 않고 내 브라우저에서만 처리됩니다.</span></p></noscript>
      </div>
    </div>`;
}

// ───────── 관련 도구 ─────────
function related(slug, rel) {
  const others = TOOLS.filter((t) => t.slug !== slug);
  const cards = others.map((t) => `<a class="tp-rel" href="${rel}${t.slug}/">
          <div class="tp-rel__body"><span class="tp-rel__ico">${ICONS_PDF[t.slug]}</span><div class="tp-rel__tx"><h3>${read(t.slug).h1}</h3><p>${APP_SHORT[t.slug]}</p></div><span class="tp-rel__arr" aria-hidden="true">→</span></div>
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

// ───────── 하단 중앙 플로팅 도구 선택 바 ─────────
function toolDock(slug, rel) {
  const items = TOOLS.map((o) => `<a class="tp-dock__item${o.slug === slug ? ' is-active' : ''}" href="${rel}${o.slug}/"${o.slug === slug ? ' aria-current="page"' : ''}>${o.icon}<span>${o.nav}</span></a>`).join('\n        ');
  return `    <nav class="tp-dock" aria-label="PDF 도구 선택">
      <div class="tp-dock__inner">
        ${items}
      </div>
    </nav>`;
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

  const main = `<section class="tp-hero">
      <div class="tp-col">
        <nav class="tp-path" aria-label="위치"><a href="${rel}">홈</a><span class="s" aria-hidden="true">/</span><a href="${rel}#tools">도구</a><span class="s" aria-hidden="true">/</span><b>${esc(c.h1)}</b></nav>
        <div class="tp-head">
          <span class="tp-ico">${ICONS_PDF[t.slug]}</span>
          <div>
            <h1 class="tp-h1">${esc(c.h1)}</h1>
            <p class="tp-sub">${esc(c.subtitle)}</p>
          </div>
        </div>
        <ul class="tp-chips">
          <li><span class="dot" aria-hidden="true"></span>서버 미전송 · 내 기기 처리</li>
          <li><span class="dot" aria-hidden="true"></span>완전 무료 · 워터마크 없음</li>
          <li><span class="dot" aria-hidden="true"></span>설치 · 회원가입 불필요</li>
        </ul>
      </div>
    </section>

    <section class="tp-editor">
      <div class="tp-editorwrap">
        <div class="tp-toolbody">${widget(t, { editor: true })}</div>
      </div>
    </section>

${toolDock(t.slug, rel)}

    <section class="tp-info sr-only">
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
      </div>
    </section>`;

  const html = page({
    title: c.title, desc: c.metaDescription, canonical,
    ogTitle: `${c.h1} 무료 - ${BRAND}`, rel, jsonld, main, noFooter: true,
    withScripts: t.script || t.slug, noChrome: true,
    bodyClass: 'ws tp',
    extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${ASSET_VER}">`
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

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE_URL + '/', inLanguage: 'ko', description: c.metaDescription },
    { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: SITE_URL + '/', sameAs: [GITHUB_URL] }
  ];

  const heroTabs = TOOLS.map((t, i) => `<button class="herotool__tab" type="button" role="tab" data-tab="${t.slug}" aria-selected="${i === 0 ? 'true' : 'false'}">${t.icon}<span>${t.nav}</span></button>`).join('\n              ');
  const heroPanels = TOOLS.map((t, i) => `<div class="herotool__panel${i === 0 ? ' is-active' : ''}" role="tabpanel" data-panel="${t.slug}">
            ${widget(t)}
          </div>`).join('\n          ');

  const tiles = TOOLS.map((t) => `<a class="ws-tile" href="${t.slug}/" data-reveal>
        <span class="ws-tile__ico">${ICONS_PDF[t.slug]}</span>
        <span class="ws-tile__txt"><span class="ws-tile__name">${t.nav}</span><span class="ws-tile__desc">${esc(t.feature[0])}</span></span>${ARR_SVG}
      </a>`).join('\n      ');

  const usps = c.uspCards.map((u, i) => `<div class="ws-usp" data-reveal><span class="n">0${i + 1}</span><div><h4>${esc(u.title)}</h4><p>${esc(u.desc)}</p></div></div>`).join('\n        ');
  const faqs = c.faq.map((f, i) => `<details><summary><span class="q">Q${i + 1}</span><span>${esc(f.q)}</span></summary><div class="a">${esc(f.a)}</div></details>`).join('\n        ');

  const card = (slug, i) => `<a class="ws-card" href="${slug}/" style="--i:${i}">
          <span class="ws-card__ico">${ICONS_PDF[slug]}</span>
          <span class="ws-card__tx"><span class="ws-card__name">${esc(read(slug).h1)}</span><span class="ws-card__desc">${esc(APP_DESC[slug] || '')}</span></span>
        </a>`;
  const chev = '<svg class="ws-cat__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const catalog = CATEGORIES.map((cat, ci) => `      <div class="ws-cat${ci === 0 ? ' is-open' : ''}" id="cat-${cat.id}">
        <button class="ws-cat__btn" type="button" aria-expanded="${ci === 0 ? 'true' : 'false'}" aria-controls="catp-${cat.id}">
          <span class="ws-cat__meta"><span class="ws-cat__title">${esc(cat.title)}</span><span class="ws-cat__desc">${esc(cat.desc)}</span></span>
          <span class="ws-cat__count">${cat.slugs.length}</span>${chev}
        </button>
        <div class="ws-cat__panel" id="catp-${cat.id}"><div class="ws-cat__inner"><div class="ws-shelf">
          ${cat.slugs.map((s, i) => card(s, i)).join('\n          ')}
        </div></div></div>
      </div>`).join('\n');

  const main = `    <section class="ws-home2" id="tools">
      <h1 class="sr-only">${esc(c.metaTitle || 'PDF의 모든 것')} — 설치 없이 무료로 쓰는 한국어 PDF 도구 모음</h1>
      <div class="ws-wrap ws-home2grid">
        <div class="ws-home2left">
          <div class="ws-winwrap">
            <div class="ws-window" data-ws-window>
              <div class="ws-winbar"><span class="ws-wintitle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg><span class="t">여기에 PDF를 놓고 바로 작업</span></span><button class="ws-winclose" type="button" data-ws-close aria-label="작업 닫고 처음으로">처음으로 ✕</button></div>
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
        <div class="ws-home2right">
${catalog}
        </div>
      </div>
    </section>`;

  const html = page({
    title: c.metaTitle, desc: c.metaDescription, canonical,
    ogTitle: c.metaTitle, rel, jsonld, main, noChrome: true, noFooter: true,
    withScripts: [...new Set(TOOLS.map((t) => t.script || t.slug))],
    bodyClass: 'ws home',
    extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="assets/css/workspace.css?v=${ASSET_VER}">`
  });
  writeFileSync(join(ROOT, 'index.html'), html);
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
${sec('개인정보', '개인정보 수집을 하나요?', '이 사이트는 회원가입을 받지 않고, 파일·이메일 등 어떤 개인정보도 수집·저장하지 않습니다. 파일을 외부로 전송하지 않으므로 업로드된 문서가 외부에 보관될 일이 없습니다.')}
${sec('이용 요금', '무료인가요?', '네. 완전 무료이며 결과물에 워터마크가 붙지 않고, 파일 개수·용량 제한도 없습니다.')}
${sec('오픈소스', '오픈소스입니다', `「${BRAND}」은 누구나 코드를 보고 함께 개선할 수 있는 오픈소스 프로젝트입니다. 기능 제안·버그 제보·기여를 환영합니다. <a href="${escAttr(GITHUB_URL)}" rel="noopener" target="_blank">GitHub 저장소</a>에서 참여하실 수 있습니다.`)}
${sec('잠금해제 안내', '잠금해제 도구 안내', '잠금해제는 암호를 알아내는 크랙 도구가 아니라, 본인이 알고 있는 비밀번호 또는 인쇄·편집 제한을 제거하는 도구입니다. 권한이 있는 본인의 문서에만 사용해 주세요.')}
      </div>
    </section>

${related('', rel).replace('다른 PDF 도구도 써보세요', '도구 바로가기')}`;
  const html = page({
    title: `소개 · 개인정보 | ${BRAND}`,
    desc: `${BRAND}은 파일을 서버에 올리지 않고 내 브라우저에서만 처리하는 무료 오픈소스 PDF 도구 모음입니다. 개인정보를 수집하지 않습니다.`,
    canonical, ogTitle: `소개 · 개인정보 | ${BRAND}`, rel, jsonld: null, main, withScripts: null,
    noChrome: true, bodyClass: 'ws tp', extraScripts: ['assets/js/workspace.js'],
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${rel}assets/css/workspace.css?v=${ASSET_VER}">`
  });
  const dir = join(ROOT, 'about');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log('✓ /about/index.html');
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
    headExtra: `\n  <script>document.documentElement.className+=" js";</script>\n  <link rel="stylesheet" href="${SITE_URL}/assets/css/workspace.css?v=${ASSET_VER}">`
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
    start_url: './', display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff',
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
