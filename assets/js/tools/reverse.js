/* PDF 페이지 역순 — 순서를 거꾸로 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="reverse"]')) return;
  ToolCore.init({
    tool: 'reverse', multiple: false, pageCount: true,
    run: async function (files) {
      try {
        var blob = await PDFEngine.reverse(files[0]);
        return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '-역순.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
