/* PDF 흑백 변환 — 컬러를 그레이스케일로 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="grayscale"]')) return;
  ToolCore.init({
    tool: 'grayscale', multiple: false, pageCount: true,
    run: async function (files, o, ctx) {
      try {
        var blob = await PDFEngine.grayscale(files[0], {}, ctx.onProgress);
        return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '-흑백.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
