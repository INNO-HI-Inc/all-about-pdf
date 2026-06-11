/* PDF 페이지 추출 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="extract"]')) return;
  ToolCore.init({
    tool: 'extract', multiple: false, pageCount: true, pageGrid: true, gridInput: '#extract-pages',
    readOptions: function (root) {
      var el = root.querySelector('#extract-pages');
      return { pages: el ? el.value : '' };
    },
    validate: function (files, o) {
      if (!o.pages.trim()) return '추출할 페이지를 입력해 주세요. 예: 1, 3, 5-7';
      var p = UI.parsePageList(o.pages);
      if (!p.ok || !p.list.length) return '페이지 형식을 확인해 주세요. 예: 1, 3, 5-7';
      return null;
    },
    run: async function (files, o, ctx) {
      var p = UI.parsePageList(o.pages);
      var indices = p.list.map(function (n) { return n - 1; });
      var blob = await PDFEngine.extract(files[0], indices);
      return { type: 'blob', blob: blob, filename: '추출된-페이지.pdf' };
    }
  });
});
