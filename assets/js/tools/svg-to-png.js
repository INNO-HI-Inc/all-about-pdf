/* SVG → PNG 변환 (100% 브라우저 내 처리 · 외부 전송 없음) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="svg-to-png"]')) return;

  function readText(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result || '')); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했어요.')); };
      r.readAsText(file);
    });
  }

  // SVG 본문에서 기본 픽셀 크기 추정 (width/height → 없으면 viewBox)
  function parseDims(text) {
    var m = text.match(/<svg[\s\S]*?>/i);
    if (!m) return { w: 0, h: 0 };
    var tag = m[0];
    var pick = function (re) { var x = tag.match(re); return x ? parseFloat(x[1]) : 0; };
    var w = pick(/\bwidth\s*=\s*["']?\s*([\d.]+)/i);
    var h = pick(/\bheight\s*=\s*["']?\s*([\d.]+)/i);
    if (!w || !h) {
      var vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
      if (vb) { if (!w) w = parseFloat(vb[1]); if (!h) h = parseFloat(vb[2]); }
    }
    return { w: w || 0, h: h || 0 };
  }

  var MAX_PX = 16000000; // 캔버스 최대 ~16MP (메모리 보호)

  function convert(file, scale, white) {
    return new Promise(function (resolve, reject) {
      readText(file).then(function (text) {
        var dims = parseDims(text);
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var bw = dims.w || img.naturalWidth || img.width || 1024;
          var bh = dims.h || img.naturalHeight || img.height || bw;
          var cw = Math.max(1, Math.round(bw * scale));
          var ch = Math.max(1, Math.round(bh * scale));
          if (cw * ch > MAX_PX) { var k = Math.sqrt(MAX_PX / (cw * ch)); cw = Math.max(1, Math.round(cw * k)); ch = Math.max(1, Math.round(ch * k)); }
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          if (white) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); }
          try { ctx.drawImage(img, 0, 0, cw, ch); }
          catch (e) { URL.revokeObjectURL(url); reject(new Error('이 SVG는 변환할 수 없어요(외부 리소스 포함).')); return; }
          URL.revokeObjectURL(url);
          canvas.toBlob(function (b) {
            if (b) resolve(b); else reject(new Error('PNG 생성에 실패했어요.'));
            canvas.width = canvas.height = 0;
          }, 'image/png');
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('SVG를 불러올 수 없어요. 외부 글꼴·이미지를 참조하는 SVG는 지원되지 않아요.')); };
        img.src = url;
      }).catch(reject);
    });
  }

  ToolCore.init({
    tool: 'svg-to-png', accept: 'svg', multiple: true, reorder: true, imageThumbs: true, fileThumbs: true,
    readOptions: function (root) {
      var s = root.querySelector('#svg-scale');
      var bg = root.querySelector('input[name="svg-bg"]:checked');
      var prefix = root.querySelector('.js-outname');
      return {
        scale: s ? (parseFloat(s.value) || 2) : 2,
        white: bg ? bg.value === 'white' : false,
        prefix: prefix ? prefix.value.trim() : ''
      };
    },
    run: async function (files, o, ctx) {
      var items = [];
      for (var i = 0; i < files.length; i++) {
        if (ctx.onProgress) ctx.onProgress(i / files.length);
        var blob = await convert(files[i], o.scale, o.white);
        var base = (files[i].name || ('image-' + (i + 1))).replace(/\.svg$/i, '') || ('image-' + (i + 1));
        items.push({ name: base + '.png', blob: blob });
      }
      if (ctx.onProgress) ctx.onProgress(1);
      if (items.length === 1) return { type: 'blob', blob: items[0].blob, filename: items[0].name };
      return { type: 'zip', items: items, zipName: (o.prefix ? o.prefix.replace(/[\\/:*?"<>|]/g, '') : 'PNG-변환') + '.zip' };
    }
  });
});
