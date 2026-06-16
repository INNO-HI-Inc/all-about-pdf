/* PDF 빈 페이지 제거 — 거의 흰 페이지를 자동으로 찾아 제거 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="remove-blank"]')) return;
  ToolCore.init({
    tool: 'remove-blank', multiple: false, pageCount: true,
    run: async function (files, o, ctx) {
      try {
        var blob = await PDFEngine.removeBlank(files[0], ctx.onProgress);
        var removed = blob._removed || 0;
        UI.toast(removed > 0 ? (removed + '개 빈 페이지를 제거했어요.') : '제거할 빈 페이지가 없었어요.', 'info');
        return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '-빈페이지제거.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
