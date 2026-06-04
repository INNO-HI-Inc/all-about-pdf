<div align="center">

# 📄 PDF의 모든 것 (all-about-pdf)

**파일을 서버에 올리지 않는, 무료 한국어 PDF 도구 모음**

합치기 · 분할 · 잠금해제 · 페이지 추출 · 페이지 삭제 · 이미지 변환 · 페이지 번호

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![No Upload](https://img.shields.io/badge/파일-서버에_올리지_않음-success)
![No Build](https://img.shields.io/badge/build-필요없음-lightgrey)

🔗 **데모:** https://inno-hi-inc.github.io/all-about-pdf/ <sub>(배포 후 주소)</sub>

</div>

---

## ✨ 무엇이 다른가요?

대부분의 온라인 PDF 도구(iLovePDF·Smallpdf·PDF24 등)는 **파일을 서버에 업로드**한 뒤 "일정 시간 후 삭제"하는 방식입니다. 「PDF의 모든 것」은 **애초에 업로드하지 않습니다.**

- 🔒 **100% 브라우저 처리** — 모든 작업이 내 기기 안에서만. 파일이 서버로 전송되지 않습니다. (계약서·사내문서도 안심)
- 💸 **완전 무료 · 무제한** — 워터마크 없음, 파일 개수/용량 제한 없음, 결제·가입 유도 없음
- ⚡ **설치·회원가입 불필요** — 페이지만 열면 끝
- 🇰🇷 **자연스러운 한국어** — 외산 도구의 어색한 기계번역 없이
- 🧩 **오픈소스** — 누구나 보고, 고치고, 새 도구를 더할 수 있어요

## 🧰 기능

| 도구 | 설명 | 경로 |
|------|------|------|
| 🔗 PDF 합치기 | 여러 PDF를 순서대로 한 파일로 | [`/merge/`](merge/) |
| ✂️ PDF 분할 | 낱장 분리 또는 범위 지정 분할(ZIP) | [`/split/`](split/) |
| 🔓 PDF 잠금해제 | 인쇄·편집 제한 / 아는 비밀번호 제거 | [`/unlock/`](unlock/) |
| 📑 PDF 페이지 추출 | 원하는 페이지만 모아 저장 | [`/extract/`](extract/) |
| 🗑️ PDF 페이지 삭제 | 특정 페이지를 뺀 새 PDF | [`/delete/`](delete/) |
| 🖼️ PDF 이미지 변환 | PNG·JPG로, 화질(배율) 선택 | [`/to-image/`](to-image/) |
| 🔢 PDF 페이지 번호 | 위치·형식·시작번호·표지 제외 | [`/page-numbers/`](page-numbers/) |

## 🚀 로컬에서 실행

빌드가 필요 없습니다. 정적 파일이라 간단한 HTTP 서버만 있으면 됩니다.
(pdf.js의 워커 때문에 `file://`로 직접 열면 일부 기능이 제한되니 **HTTP 서버**로 여세요.)

```bash
git clone https://github.com/INNO-HI-Inc/all-about-pdf.git
cd all-about-pdf

# 아무 정적 서버나 OK
python3 -m http.server 8080
#  또는  npx serve .
#  또는  VS Code "Live Server" 확장
```

브라우저에서 `http://localhost:8080` 접속.

## 🏗 프로젝트 구조

```
all-about-pdf/
├── index.html              # 홈(허브)
├── merge/ split/ unlock/ …  # 기능별 정적 페이지(키워드별 1페이지)
├── about/                  # 소개·개인정보
├── assets/
│   ├── css/style.css       # 디자인 시스템(외부 폰트 요청 없음)
│   ├── js/
│   │   ├── pdf-engine.js    # PDF 처리 엔진(7기능)
│   │   ├── ui.js            # 다운로드·압축·페이지 파싱·토스트
│   │   ├── tool-core.js     # 도구 위젯 공통 컨트롤러
│   │   └── tools/*.js       # 도구별 연결(엔진↔UI)
│   ├── vendor/             # pdf-lib · pdf.js · JSZip (로컬 동봉 = 외부요청 0)
│   └── img/                # 파비콘·OG 이미지
├── _workspace/content_*.json  # 페이지 콘텐츠(집필 원본)
├── build.mjs               # 콘텐츠 JSON → 정적 HTML 생성기
├── sitemap.xml robots.txt site.webmanifest 404.html
└── .github/workflows/      # GitHub Pages 자동 배포
```

> **콘텐츠를 고쳤다면?** `_workspace/content_*.json`을 수정하고 `node build.mjs`를 실행하면 HTML이 다시 생성됩니다. (URL이 바뀌면 `build.mjs` 상단의 `SITE_URL`만 고치세요.)

## ➕ 새 도구 추가하기

1. `assets/js/pdf-engine.js`에 처리 함수 추가
2. `assets/js/tools/{이름}.js`에 `ToolCore.init({...})` 작성
3. `build.mjs`의 `TOOLS` 배열에 메타·옵션 마크업 추가
4. `_workspace/content_{이름}.json`에 콘텐츠 작성(다른 파일 참고)
5. `node build.mjs` 실행 → 페이지·sitemap 자동 생성

자세한 절차는 [CONTRIBUTING.md](CONTRIBUTING.md) 참고.

## 🔍 검색엔진 등록(SEO)

이 사이트는 네이버·구글 노출을 고려해 만들어졌습니다(기능별 정적 페이지, 메타·OG·JSON-LD, sitemap).
배포 후 아래를 진행하세요. 자세한 절차는 [`docs/검색엔진-등록-가이드.md`](docs/검색엔진-등록-가이드.md).

1. `build.mjs`의 `SITE_URL`을 실제 배포 주소로 변경 → `node build.mjs`
2. **네이버 서치어드바이저**: 사이트 등록 → 메타태그 소유확인 → 사이트맵 제출 → '웹 페이지 수집 요청'
3. **구글 서치콘솔**: 속성 추가 → 소유확인 → Sitemaps에 `sitemap.xml` 제출
4. 각 페이지 `<head>`의 `naver-site-verification` / `google-site-verification` 주석을 해제하고 값 입력

## 🌐 배포 (GitHub Pages)

`main`에 푸시하면 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)가 자동 배포합니다.
저장소 **Settings → Pages → Source: GitHub Actions** 한 번만 켜 주세요.

## 🛠 기술 스택

- 순수 **HTML · CSS · 바닐라 JS** (프레임워크·빌드 도구 없음)
- [pdf-lib](https://github.com/Hopding/pdf-lib) · [pdf.js](https://github.com/mozilla/pdf.js) · [JSZip](https://github.com/Stuk/jszip) — 모두 로컬 동봉(외부 CDN 요청 0)

## 🤝 기여

이 프로젝트는 **함께 성장**하는 것을 목표로 합니다. 작은 오타 수정부터 새 도구 추가까지 환영합니다.
[CONTRIBUTING.md](CONTRIBUTING.md)를 읽고 이슈/PR을 남겨 주세요. 🙌

## 📄 라이선스

[MIT](LICENSE) — 자유롭게 쓰고, 고치고, 배포하세요.
