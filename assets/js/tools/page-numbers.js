/* PDF 페이지 번호 삽입 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="page-numbers"]')) return;
  ToolCore.init({
    tool: 'page-numbers', multiple: false,
    onFiles: async function (files) {
      if (!files.length) return;
      var n = await PDFEngine.getPageCount(files[0]);
      var el = UI.qs('#aap-pagecount');
      if (el) el.textContent = n ? ('총 ' + n + '페이지') : '';
    },
    readOptions: function () {
      var pos = UI.qs('#pn-position');
      var start = UI.qs('#pn-start');
      var skip = UI.qs('#pn-skip');
      var fmt = document.querySelector('input[name="pn-format"]:checked');
      return {
        position: pos ? pos.value : 'bottom-center',
        startAt: start ? (parseInt(start.value, 10) || 1) : 1,
        skipCover: skip ? skip.checked : false,
        format: fmt ? fmt.value : 'n'
      };
    },
    run: async function (files, o, ctx) {
      var blob = await PDFEngine.addPageNumbers(files[0], {
        position: o.position, startAt: o.startAt, skipCover: o.skipCover, format: o.format
      });
      return { type: 'blob', blob: blob, filename: '페이지번호-추가.pdf' };
    }
  });
});
