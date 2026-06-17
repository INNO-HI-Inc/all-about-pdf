/* PDF 모아찍기 — 2·4쪽을 한 장에 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="nup"]')) return;
  ToolCore.init({
    tool: 'nup', multiple: false, pageCount: true,
    readOptions: function (root) { var a = root.querySelector('input[name="nup-per"]:checked'); return { per: a ? parseInt(a.value, 10) : 2 }; },
    run: async function (files, o, ctx) {
      try {
        var blob = await PDFEngine.nup(files[0], o.per === 4 ? 4 : 2, ctx.onProgress);
        return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '-모아찍기.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
