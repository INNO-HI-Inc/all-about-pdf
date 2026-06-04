---
name: pdf-toolbox-build
description: "「PDF의 모든 것」(all-about-pdf) 한국 특화 PDF 도구 정적 웹사이트를 5인 에이전트 팀으로 구축·유지보수하는 오케스트레이터. 네이버·구글 SEO 최적화된 기능별 정적 페이지 + 클라이언트사이드 PDF 엔진 + GitHub Pages 오픈소스 배포. 'PDF 사이트 만들어', 'PDF의 모든 것 작업', 'PDF 도구 페이지 추가', 'all-about-pdf' 요청 시 사용."
---

# PDF의 모든 것 — 빌드 오케스트레이터

「PDF의 모든 것」 정적 멀티페이지 PDF 도구 사이트를 구축/확장한다. 작업 디렉토리: `/Users/flareon078/pdf-toolbox/`.

## 실행 모드
**에이전트 팀(기본).** 단, 공유 코드(CSS/엔진/페이지 셸)는 일관성을 위해 리더(오케스트레이터)가 기반을 먼저 만들고, 그 위에서 팀이 병렬로 채운다. 파일 충돌 방지를 위해 **에이전트별 파일 소유권을 명확히 분리**한다.

## 팀 구성 (5인)
1. **frontend-engineer** — 디자인 시스템, PDF 엔진(7기능), UI 헬퍼, 도구 위젯. 소유: `assets/`.
2. **kr-seo-architect** — 메타/JSON-LD/sitemap/robots/manifest, 검색엔진 등록 가이드, CWV. 소유: 각 페이지 `<head>`, 루트 SEO 파일.
3. **kr-content-writer** — 기능별 한국어 콘텐츠(도입·사용법·보안·FAQ·내부링크). 소유: `_workspace/content_*.md` → 페이지 본문.
4. **qa-verifier** (general-purpose) — Playwright 기능 실측 + SEO/구조 감사. 점진적.
5. **repo-ops** — README/CONTRIBUTING/LICENSE/Pages 워크플로/이슈템플릿. 소유: 루트 문서, `.github/`.

## 핵심 설계 원칙 (조사 검증, 절대 준수)
- **네이버 Yeti = JS 미렌더** → 콘텐츠·메타는 정적 HTML. 도구 로직만 JS.
- **기능별 독립 URL**(`/merge/` 등), 프래그먼트 라우팅 금지.
- **100% 브라우저 처리(서버 미전송)** 가 1순위 차별화 메시지(한국 사용자 업로드 거부감 정조준).
- **잠금해제는 크랙 아님** 명시(법적/윤리).
- JSON-LD는 WebApplication+BreadcrumbList만(FAQ/HowTo 스키마는 폐지돼 제외). 가짜 평점 금지.
- vendored 라이브러리만(외부 요청 0).

## 파이프라인
1. **기반(리더)**: 폴더 구조, vendored 라이브러리, 디자인 토큰 CSS, 공유 엔진/UI, 페이지 셸 템플릿.
2. **SEO 설계(kr-seo-architect)**: 페이지별 head 슬롯·JSON-LD 규격, sitemap/robots/manifest, BASE_URL 규칙.
3. **콘텐츠(kr-content-writer, 병렬 7도구)**: `_workspace/content_*.md`.
4. **페이지 조립(frontend + 리더)**: 셸 + 콘텐츠 + 도구 위젯 + head/JSON-LD = 8개 페이지.
5. **레포/배포(repo-ops)**: README/CONTRIBUTING/LICENSE/Actions/이슈템플릿.
6. **QA(qa-verifier, 점진)**: 각 페이지 완성 직후 기능 실측 + 구조 감사 → 결함 회신 → 수정.

## 데이터 전달
- 중간 산출물: `_workspace/{phase}_{agent}_{artifact}`. 최종은 실제 경로.
- 실시간 합의: 메타 슬롯 위치, 섹션 클래스, 경로(subpath) 규칙.

## 에러 핸들링
- 에이전트 실패: 1회 재시도 → 부분 결과로 진행 + 보고서에 누락 명시.
- QA FAIL: 담당 에이전트에 재작업 지시, 통과까지 반복. **FAIL을 통과로 처리 금지.**

## 테스트 시나리오
- 정상: 7도구 각각 실제 PDF로 동작 + 페이지별 메타/JSON-LD/sitemap 검증 통과 + 콘솔에러 0.
- 에러: 손상/암호 PDF 업로드 시 한국어 안내(crash 금지), 잠금해제 폴백 동작, 모바일 뷰 정상.

## 새 도구 추가(유지보수)
폴더 생성 → 페이지 셸 복제 → `assets/js/tools/{tool}.js` 엔진 함수 → head/JSON-LD → 콘텐츠 → sitemap 등록 → QA.
