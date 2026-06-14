/* PDF 분할 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="split"]')) return;
  ToolCore.init({
    tool: 'split', multiple: false, pageCount: true, splitGrid: true, gridInput: '#split-ranges',
    readOptions: function (root) {
      var m = root.querySelector('input[name="split-mode"]:checked');
      var ranges = root.querySelector('#split-ranges');
      var every = root.querySelector('#split-every');
      var zip = root.querySelector('#split-zipname');
      return {
        mode: m ? m.value : 'each',
        ranges: ranges ? ranges.value : '',
        every: every ? (parseInt(every.value, 10) || 1) : 2,
        zipName: zip ? zip.value.trim() : ''
      };
    },
    validate: function (files, o) {
      if (o.mode === 'ranges' && !o.ranges.trim()) return '나눌 범위를 입력해 주세요. 예: 1-3, 4-8';
      if (o.mode === 'every' && o.every < 1) return 'N은 1 이상이어야 해요.';
      return null;
    },
    run: async function (files, o, ctx) {
      var items;
      if (o.mode === 'ranges') {
        var pg = UI.parseRangeGroups(o.ranges);
        if (!pg.ok || !pg.groups.length) throw new Error('범위 형식을 확인해 주세요. 예: 1-3, 4-8, 9');
        var total = await PDFEngine.getPageCount(files[0]);
        if (total && pg.groups.every(function (g) { return g[0] > total; })) {
          throw new Error('입력한 범위가 모두 총 ' + total + '페이지를 벗어났어요.');
        }
        items = await PDFEngine.splitRanges(files[0], pg.groups, ctx.onProgress);
      } else if (o.mode === 'every') {
        items = await PDFEngine.splitEvery(files[0], o.every, ctx.onProgress);
      } else if (o.mode === 'oddeven') {
        items = await PDFEngine.splitOddEven(files[0], ctx.onProgress);
      } else {
        items = await PDFEngine.splitEach(files[0], ctx.onProgress);
      }
      var base = (o.zipName || '분할된-PDF').replace(/[\\/:*?"<>|]/g, '').replace(/\.(zip|pdf)$/i, '') || '분할된-PDF';
      // 결과가 1개면 ZIP 대신 단일 PDF로
      if (items.length === 1) return { type: 'blob', blob: items[0].blob, filename: base + '.pdf' };
      return { type: 'zip', items: items, zipName: base + '.zip' };
    }
  });
});
