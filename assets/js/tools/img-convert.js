/* 이미지 형식 변환 (JPG/PNG/WEBP/SVG → PNG/JPG/WEBP) — 공유 컨트롤러.
   각 변환 도구 위젯의 [data-tool][data-from][data-to] 를 찾아 초기화. 100% 브라우저 처리. */
(function () {
  function start() {
    if (!window.ToolCore || !window.PDFEngine) return;
    var roots = document.querySelectorAll('[data-tool][data-to][data-from]');
    Array.prototype.forEach.call(roots, function (root) {
      if (root.__convInit) return; root.__convInit = true;
      var slug = root.getAttribute('data-tool');
      var to = root.getAttribute('data-to');
      var from = root.getAttribute('data-from');
      var svgIn = from === 'svg';
      ToolCore.init({
        tool: slug, root: root, accept: from, multiple: true, reorder: true, imageThumbs: true, fileThumbs: true,
        readOptions: function (rt) {
          var q = rt.querySelector('#conv-quality');
          var sc = rt.querySelector('#conv-scale');
          var prefix = rt.querySelector('.js-outname');
          return {
            quality: q ? (parseFloat(q.value) || 0.92) : 0.92,
            scale: sc ? (parseFloat(sc.value) || 1) : 1,
            prefix: prefix ? prefix.value.trim() : ''
          };
        },
        run: async function (files, o, ctx) {
          var items = await PDFEngine.convertImages(files, { to: to, quality: o.quality, scale: svgIn ? o.scale : 1 }, ctx.onProgress);
          if (items.length === 1) return { type: 'blob', blob: items[0].blob, filename: items[0].name };
          var zipName = (o.prefix ? o.prefix.replace(/[\\/:*?"<>|]/g, '') : (to.toUpperCase() + '-변환')) + '.zip';
          return { type: 'zip', items: items, zipName: zipName };
        }
      });
    });
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
