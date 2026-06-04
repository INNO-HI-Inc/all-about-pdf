/* PDF → JPG/PNG 이미지 변환 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="to-image"]')) return;
  ToolCore.init({
    tool: 'to-image', multiple: false, pageCount: true,
    readOptions: function (root) {
      var fmt = root.querySelector('input[name="img-format"]:checked');
      var scale = root.querySelector('#img-scale');
      var mode = root.querySelector('input[name="img-pages-mode"]:checked');
      var pages = root.querySelector('#img-pages');
      return {
        format: fmt ? fmt.value : 'png',
        scale: scale ? parseInt(scale.value, 10) || 2 : 2,
        mode: mode ? mode.value : 'all',
        pages: pages ? pages.value : ''
      };
    },
    validate: function (files, o) {
      if (o.mode === 'custom' && !o.pages.trim()) return '변환할 페이지를 입력해 주세요. 예: 1, 3, 5-7';
      return null;
    },
    run: async function (files, o, ctx) {
      var pageIndices;
      if (o.mode === 'custom') {
        var p = UI.parsePageList(o.pages);
        if (!p.ok || !p.list.length) throw new Error('페이지 형식을 확인해 주세요. 예: 1, 3, 5-7');
        pageIndices = p.list.map(function (n) { return n - 1; });
      }
      var items;
      try {
        items = await PDFEngine.toImages(files[0], { format: o.format, scale: o.scale, pageIndices: pageIndices }, ctx.onProgress);
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 변환해 주세요.');
        throw e;
      }
      if (items.length === 1) return { type: 'blob', blob: items[0].blob, filename: items[0].name };
      return { type: 'zip', items: items, zipName: 'PDF-이미지.zip' };
    }
  });
});
