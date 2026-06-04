/*!
 * PDF의 모든 것 — UI 헬퍼 (다운로드·압축·페이지 파싱·토스트)
 */
(function (global) {
  'use strict';

  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function humanSize(b) {
    if (b == null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  async function zipAndDownload(items, zipName, onProgress) {
    if (!global.JSZip) throw new Error('압축 모듈을 불러오지 못했습니다. 새로고침해 주세요.');
    var zip = new JSZip();
    items.forEach(function (it) { zip.file(it.name, it.blob); });
    var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, function (meta) {
      if (onProgress) onProgress(meta.percent / 100);
    });
    downloadBlob(blob, zipName);
  }

  // "1,3,5-7" → { list:[1,3,5,6,7], ok:true }  (1-based, 정렬·중복제거, max 이하)
  function parsePageList(str, max) {
    var seen = {}, ok = true;
    String(str || '').split(',').forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = +m[1], b = +m[2];
        if (a > b) { var t = a; a = b; b = t; }
        for (var i = a; i <= b; i++) seen[i] = true;
      } else if (/^\d+$/.test(part)) {
        seen[+part] = true;
      } else { ok = false; }
    });
    var list = Object.keys(seen).map(Number)
      .filter(function (n) { return n >= 1 && (!max || n <= max); })
      .sort(function (a, b) { return a - b; });
    return { list: list, ok: ok };
  }

  // "1-3,4-8,9" → { groups:[[1,3],[4,8],[9,9]], ok:true }
  function parseRangeGroups(str) {
    var groups = [], ok = true;
    String(str || '').split(',').forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = +m[1], b = +m[2];
        if (a > b) { var t = a; a = b; b = t; }
        groups.push([a, b]);
      } else if (/^\d+$/.test(part)) {
        groups.push([+part, +part]);
      } else { ok = false; }
    });
    return { groups: groups, ok: ok };
  }

  function toast(msg, type) {
    var wrap = qs('#aap-toast');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'aap-toast';
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('toast--show'); });
    setTimeout(function () {
      el.classList.remove('toast--show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 3400);
  }

  global.UI = {
    qs: qs, qsa: qsa, humanSize: humanSize,
    downloadBlob: downloadBlob, zipAndDownload: zipAndDownload,
    parsePageList: parsePageList, parseRangeGroups: parseRangeGroups,
    toast: toast
  };
})(window);
