/* PDF 합치기 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="merge"]')) return;
  ToolCore.init({
    tool: 'merge', multiple: true, reorder: true, fileThumbs: true,
    run: async function (files, opts, ctx) {
      if (files.length < 2) throw new Error('합칠 PDF를 2개 이상 올려 주세요.');
      var blob = await PDFEngine.merge(files, ctx.onProgress);
      return { type: 'blob', blob: blob, filename: '합쳐진-PDF.pdf' };
    }
  });
});
