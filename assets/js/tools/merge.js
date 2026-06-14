/* PDF 합치기 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="merge"]')) return;
  ToolCore.init({
    tool: 'merge', multiple: true, reorder: true, fileThumbs: true, showPages: true,
    readOptions: function (root) {
      var b = root.querySelector('#merge-blank');
      return { blankBetween: b ? b.checked : false };
    },
    run: async function (files, opts, ctx) {
      if (files.length < 2) throw new Error('합칠 PDF를 2개 이상 올려 주세요.');
      var blob = await PDFEngine.merge(files, { blankBetween: opts.blankBetween }, ctx.onProgress);
      if (blob._skipped && blob._skipped.length) {
        UI.toast(blob._skipped.length + '개 파일은 열 수 없어 건너뛰었어요: ' + blob._skipped.join(', '), 'warn');
      }
      return { type: 'blob', blob: blob, filename: '합쳐진-PDF.pdf' };
    }
  });
});
