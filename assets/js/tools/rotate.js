/* PDF 회전 — 전체 또는 선택한 페이지만 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="rotate"]')) return;
  ToolCore.init({
    tool: 'rotate', multiple: false, pageCount: true, pageGrid: true, gridInput: '#rot-pages',
    selCountLabel: function (n) { return n ? (n + '개 페이지만 회전') : '회전할 페이지를 선택하세요'; },
    onGridChange: function (hasSel, root) {
      var all = root.querySelector('input[name="rot-mode"][value="all"]');
      var pages = root.querySelector('input[name="rot-mode"][value="pages"]');
      if (hasSel) { if (pages) pages.checked = true; } else if (all) { all.checked = true; }
    },
    readOptions: function (root) {
      var a = root.querySelector('input[name="rot-angle"]:checked');
      var m = root.querySelector('input[name="rot-mode"]:checked');
      var pages = root.querySelector('#rot-pages');
      return { angle: a ? parseInt(a.value, 10) : 90, mode: m ? m.value : 'all', pages: pages ? pages.value : '' };
    },
    validate: function (files, o) {
      if (o.mode === 'pages' && !o.pages.trim()) return '회전할 페이지를 입력하거나 썸네일에서 골라 주세요. 예: 1, 3, 5-7';
      return null;
    },
    run: async function (files, o, ctx) {
      var base = (files[0].name || 'rotated').replace(/\.pdf$/i, '');
      try {
        if (o.mode === 'pages') {
          // 선택 페이지만 회전 = 전체 페이지 순서 유지 + 선택 페이지에만 회전을 얹어 organize로 실행
          var p = UI.parsePageList(o.pages);
          if (!p.ok || !p.list.length) throw new Error('페이지 형식을 확인해 주세요. 예: 1, 3, 5-7');
          var total = await PDFEngine.getPageCount(files[0]);
          if (!total) throw new Error('페이지 수를 확인하지 못했어요.');
          var sel = {}; p.list.forEach(function (n) { if (n >= 1 && n <= total) sel[n] = true; });
          if (!Object.keys(sel).length) throw new Error('입력한 페이지가 모두 총 ' + total + '페이지를 벗어났어요.');
          var order = [];
          for (var n = 1; n <= total; n++) order.push({ page: n, rot: sel[n] ? o.angle : 0 });
          var blob = await PDFEngine.organize(files[0], order, ctx.onProgress);
          return { type: 'blob', blob: blob, filename: base + '-회전.pdf' };
        }
        var blob2 = await PDFEngine.rotate(files[0], o.angle);
        return { type: 'blob', blob: blob2, filename: base + '-회전.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 회전해 주세요.');
        throw e;
      }
    }
  });
});
