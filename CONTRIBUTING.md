# 기여 가이드 (CONTRIBUTING)

「PDF의 모든 것」에 관심 가져 주셔서 고맙습니다. 이 프로젝트는 **누구나 쉽게 참여**할 수 있도록 만들어졌습니다.
오타 수정, 한국어 다듬기, FAQ 보강, 버그 수정, 새 도구 추가 — 무엇이든 환영합니다.

## 🧭 핵심 원칙 (꼭 지켜주세요)

1. **파일을 서버로 보내지 않습니다.** 모든 처리는 브라우저(클라이언트)에서만. 업로드·외부 API 호출 코드를 추가하지 마세요. 이게 이 프로젝트의 정체성입니다.
2. **외부 요청 0.** 라이브러리는 CDN이 아니라 `assets/vendor/`에 동봉합니다. 새 외부 스크립트/폰트/추적기를 넣지 마세요.
3. **빌드리스.** 프레임워크·번들러 없이 순수 HTML/CSS/바닐라 JS. 클론하면 바로 동작해야 합니다.
4. **정적 HTML에 콘텐츠.** 네이버 검색봇은 자바스크립트를 렌더링하지 않습니다. 제목·설명·본문은 정적 HTML에 두고, JS는 도구 동작만 담당합니다.

## 💻 개발 환경

```bash
git clone https://github.com/INNO-HI-Inc/all-about-pdf.git
cd all-about-pdf
python3 -m http.server 8080   # 또는 npx serve .
```

`http://localhost:8080` 접속. `file://`로 열면 pdf.js 워커 제약이 있으니 꼭 HTTP 서버로 여세요.

## ✍️ 콘텐츠(문구) 수정

페이지 문구는 HTML을 직접 고치지 말고 **콘텐츠 원본**을 고친 뒤 다시 생성하세요.

1. `_workspace/content_{도구}.json` 수정 (제목·설명·사용법·FAQ 등)
2. `node build.mjs` 실행 → HTML 재생성
3. 변경된 `*/index.html`과 `content_*.json`을 함께 커밋

## ➕ 새 도구 추가 레시피

예) "PDF 회전" 도구를 추가한다고 가정합니다.

1. **엔진**: `assets/js/pdf-engine.js`에 `rotate(file, opts)` 함수 추가 → `Blob` 반환, `PDFEngine`에 등록
2. **연결**: `assets/js/tools/rotate.js` 생성
   ```js
   document.addEventListener('DOMContentLoaded', function () {
     if (!document.querySelector('[data-tool="rotate"]')) return;
     ToolCore.init({
       tool: 'rotate', multiple: false,
       readOptions: function () { /* 옵션 읽기 */ return {}; },
       run: async function (files, o, ctx) {
         var blob = await PDFEngine.rotate(files[0], o);
         return { type: 'blob', blob: blob, filename: '회전된-PDF.pdf' };
       }
     });
   });
   ```
3. **메타·옵션**: `build.mjs`의 `TOOLS` 배열에 항목 추가(슬러그·이모지·옵션 마크업). 옵션의 `id`/`name`은 `tools/rotate.js`가 읽는 것과 정확히 일치시킵니다.
4. **콘텐츠**: `_workspace/content_rotate.json` 작성(기존 파일 형식 참고: `title, metaDescription, h1, subtitle, intro, steps[], security, faq[], extraSections[]`)
5. **생성**: `node build.mjs` → `/rotate/index.html`과 `sitemap.xml`이 자동 갱신됩니다.
6. **검증**: `node qa/qa.mjs`로 구조/기능 점검(아래 QA 참고).

## 🎨 코드 스타일

- 바닐라 JS(ES5 호환 문법 위주 — 구형 모바일 브라우저 배려). 화살표 함수 대신 `function` 사용 추세를 따라주세요.
- 사용자에게 보이는 문구는 자연스러운 한국어. 과장("최고/1등/100% 안전") 금지, 사실 기반.
- 에러는 한국어로 친절하게(크래시 금지).
- CSS는 `assets/css/style.css`의 디자인 토큰(CSS 변수) 재사용.

## ✅ QA

```bash
# 구조·기능 자동 점검 (로컬 서버가 떠 있어야 함)
NODE_PATH=$(npm root -g) node qa/qa.mjs   # 환경에 맞게 playwright 경로 지정
```

QA는 ① 7개 도구가 실제 PDF로 동작하는지 ② 메타/JSON-LD/sitemap/내부링크/콘솔에러를 점검합니다.

## 🔀 PR 절차

1. 포크 → 브랜치 생성(`feat/회전-도구`, `fix/분할-범위-버그`)
2. 작은 단위로 커밋 (한 PR = 한 주제)
3. PR 템플릿을 채워 제출. 가능하면 스크린샷/GIF 첨부
4. 리뷰 후 머지 → `main` 푸시 시 자동 배포

## 🐛 이슈

버그 제보·기능 제안은 [이슈](https://github.com/INNO-HI-Inc/all-about-pdf/issues)로. `good first issue` 라벨은 처음 기여하기 좋은 작업입니다.

고맙습니다! 🙇
