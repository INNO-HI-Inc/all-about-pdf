/* PPTX → PDF — 슬라이드를 브라우저에서 그려 PDF로. 업로드 없음. */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="pptx-to-pdf"]')) return;
  ToolCore.init({
    tool: 'pptx-to-pdf', accept: 'pptx', multiple: false, pageCount: false,
    readOptions: function (root) {
      var q = root.querySelector('#pp-quality');
      return { scale: q ? (parseFloat(q.value) || 2) : 2 };
    },
    run: async function (files, o, ctx) {
      var blob = await PDFEngine.pptxToPdf(files[0], { scale: o.scale }, ctx.onProgress);
      return { type: 'blob', blob: blob, filename: (files[0].name || '슬라이드').replace(/\.pptx?$/i, '') + '.pdf' };
    }
  });
});
