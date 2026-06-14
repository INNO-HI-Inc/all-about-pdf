/* PDF 페이지 삭제 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="delete"]')) return;
  ToolCore.init({
    tool: 'delete', multiple: false, pageCount: true, pageGrid: true, gridInput: '#delete-pages',
    selCountLabel: function (n, total) {
      if (!n) return '삭제할 페이지를 선택하세요';
      return n + '개 삭제 → ' + Math.max(0, total - n) + '쪽 남음';
    },
    readOptions: function (root) {
      var el = root.querySelector('#delete-pages');
      return { pages: el ? el.value : '' };
    },
    validate: function (files, o) {
      if (!o.pages.trim()) return '삭제할 페이지를 입력하거나 썸네일에서 골라 주세요. 예: 2, 4, 6-8';
      var p = UI.parsePageList(o.pages);
      if (!p.ok || !p.list.length) return '페이지 형식을 확인해 주세요. 예: 2, 4, 6-8';
      return null;
    },
    run: async function (files, o, ctx) {
      var p = UI.parsePageList(o.pages);
      var total = await PDFEngine.getPageCount(files[0]);
      if (total) {
        var within = p.list.filter(function (n) { return n <= total; });
        if (!within.length) throw new Error('입력한 페이지가 모두 총 ' + total + '페이지를 벗어났어요.');
        if (within.length >= total) throw new Error('모든 페이지를 삭제할 수는 없어요. 최소 1페이지는 남겨야 합니다.');
      }
      var indices = p.list.map(function (n) { return n - 1; });
      var blob = await PDFEngine.deletePages(files[0], indices);
      return { type: 'blob', blob: blob, filename: '페이지-삭제됨.pdf' };
    }
  });
});
