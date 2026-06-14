/* 이미지(JPG·PNG) → PDF */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="image-to-pdf"]')) return;
  ToolCore.init({
    tool: 'image-to-pdf', multiple: true, reorder: true, accept: 'image', imageThumbs: true, fileThumbs: true,
    readOptions: function (root) {
      var s = root.querySelector('input[name="itp-size"]:checked');
      return { pageSize: s ? s.value : 'image' };
    },
    run: async function (files, o, ctx) {
      var blob = await PDFEngine.imagesToPdf(files, { pageSize: o.pageSize }, ctx.onProgress);
      if (blob._skipped && blob._skipped.length) {
        UI.toast(blob._skipped.length + '개 파일은 변환할 수 없어 건너뛰었어요(JPG·PNG만 지원).', 'warn');
      }
      return { type: 'blob', blob: blob, filename: '이미지-PDF.pdf' };
    }
  });
});
