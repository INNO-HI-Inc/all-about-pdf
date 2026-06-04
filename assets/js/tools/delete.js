/* PDF 페이지 삭제 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="delete"]')) return;
  ToolCore.init({
    tool: 'delete', multiple: false,
    onFiles: async function (files) {
      if (!files.length) return;
      var n = await PDFEngine.getPageCount(files[0]);
      var el = UI.qs('#aap-pagecount');
      if (el) el.textContent = n ? ('총 ' + n + '페이지') : '';
    },
    readOptions: function () {
      var el = UI.qs('#delete-pages');
      return { pages: el ? el.value : '' };
    },
    validate: function (files, o) {
      if (!o.pages.trim()) return '삭제할 페이지를 입력해 주세요. 예: 2, 4, 6-8';
      var p = UI.parsePageList(o.pages);
      if (!p.ok || !p.list.length) return '페이지 형식을 확인해 주세요. 예: 2, 4, 6-8';
      return null;
    },
    run: async function (files, o, ctx) {
      var p = UI.parsePageList(o.pages);
      var indices = p.list.map(function (n) { return n - 1; });
      var blob = await PDFEngine.deletePages(files[0], indices);
      return { type: 'blob', blob: blob, filename: '페이지-삭제됨.pdf' };
    }
  });
});
