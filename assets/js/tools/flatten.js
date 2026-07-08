/* PDF 양식 평탄화 — 입력값을 페이지에 고정해 편집 불가·어디서나 동일하게 보이도록 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="flatten"]')) return;
  ToolCore.init({
    tool: 'flatten', multiple: false, pageCount: true,
    run: async function (files, o, ctx) {
      try {
        var blob = await PDFEngine.flattenForm(files[0]);
        return { type: 'blob', blob: blob, filename: (files[0].name || '양식').replace(/\.pdf$/i, '') + '-평탄화.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
