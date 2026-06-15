/* PDF 페이지 정리 — 순서변경 + 회전 + 삭제 (한 화면에서) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="organize"]')) return;
  ToolCore.init({
    tool: 'organize', multiple: false, pageCount: true, organizeGrid: true,
    readOptions: function () { return {}; },
    run: async function (files, o, ctx) {
      var order = (ctx.organize || []).filter(function (it) { return it && it.page; });
      if (!order.length) throw new Error('정리할 페이지가 없어요. 페이지를 최소 1장 남겨 주세요.');
      var blob = await PDFEngine.organize(files[0], order, ctx.onProgress);
      return { type: 'blob', blob: blob, filename: '정리된-PDF.pdf' };
    }
  });
});
