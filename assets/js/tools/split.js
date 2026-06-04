/* PDF 분할 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="split"]')) return;
  ToolCore.init({
    tool: 'split', multiple: false, pageCount: true,
    readOptions: function (root) {
      var m = root.querySelector('input[name="split-mode"]:checked');
      var ranges = root.querySelector('#split-ranges');
      return { mode: m ? m.value : 'each', ranges: ranges ? ranges.value : '' };
    },
    validate: function (files, o) {
      if (o.mode === 'ranges' && !o.ranges.trim()) return '나눌 범위를 입력해 주세요. 예: 1-3, 4-8';
      return null;
    },
    run: async function (files, o, ctx) {
      var items;
      if (o.mode === 'ranges') {
        var pg = UI.parseRangeGroups(o.ranges);
        if (!pg.ok || !pg.groups.length) throw new Error('범위 형식을 확인해 주세요. 예: 1-3, 4-8, 9');
        items = await PDFEngine.splitRanges(files[0], pg.groups, ctx.onProgress);
      } else {
        items = await PDFEngine.splitEach(files[0], ctx.onProgress);
      }
      return { type: 'zip', items: items, zipName: '분할된-PDF.zip' };
    }
  });
});
