/*!
 * PDF의 모든 것 (all-about-pdf) — PDF 엔진
 * 100% 클라이언트사이드. 파일은 절대 서버로 전송되지 않습니다.
 * 의존: pdf-lib(PDFLib), pdf.js(pdfjsLib), JSZip(JSZip) — 모두 로컬 동봉(assets/vendor).
 */
(function (global) {
  'use strict';

  var BASE = global.AAP_BASE || '';

  // pdf.js worker 경로 설정 (없으면 이미지 변환/암호 PDF 기능만 제한)
  if (global.pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'assets/vendor/pdf.worker.min.js';
  }

  function hasLib() { return !!global.PDFLib; }
  function L() {
    if (!hasLib()) throw new Error('PDF 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    return global.PDFLib;
  }

  function toBlob(bytes) {
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function readArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      r.readAsArrayBuffer(file);
    });
  }

  // pdf-lib 로드 (암호화 무시 옵션 — 권한제한 PDF 처리용)
  async function loadDoc(file) {
    var ab = await readArrayBuffer(file);
    try {
      return await L().PDFDocument.load(ab, { ignoreEncryption: true });
    } catch (e) {
      throw new Error('이 PDF를 열 수 없습니다. 손상되었거나 비밀번호가 걸린 파일일 수 있어요.');
    }
  }

  // pdf.js 로드 (이미지 렌더링/암호 복호화용). password 지원.
  async function loadPdfjs(file, password) {
    if (!global.pdfjsLib) throw new Error('이미지 처리 모듈을 불러오지 못했습니다. 새로고침해 주세요.');
    var ab = await readArrayBuffer(file);
    var task = pdfjsLib.getDocument({ data: new Uint8Array(ab.slice(0)), password: password || undefined });
    return await task.promise; // 비번 필요 시 PasswordException(name) 발생
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (res) {
      if (canvas.toBlob) canvas.toBlob(function (b) { res(b); }, type, quality);
      else {
        var dataURL = canvas.toDataURL(type, quality);
        var bin = atob(dataURL.split(',')[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res(new Blob([arr], { type: type }));
      }
    });
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  // ── 1. 합치기 ─────────────────────────────────────────────
  async function merge(files, onProgress) {
    var PDFDocument = L().PDFDocument;
    var out = await PDFDocument.create();
    for (var i = 0; i < files.length; i++) {
      var src = await loadDoc(files[i]);
      var pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(function (p) { out.addPage(p); });
      if (onProgress) onProgress((i + 1) / files.length);
    }
    if (out.getPageCount() === 0) throw new Error('합칠 페이지가 없습니다.');
    return toBlob(await out.save());
  }

  // ── 2. 분할 ───────────────────────────────────────────────
  // 낱장: 각 페이지를 개별 PDF로
  async function splitEach(file, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var width = String(n).length;
    var items = [];
    for (var i = 0; i < n; i++) {
      var doc = await PDFDocument.create();
      var pg = await doc.copyPages(src, [i]);
      doc.addPage(pg[0]);
      items.push({ name: 'page-' + pad(i + 1, width) + '.pdf', blob: toBlob(await doc.save()) });
      if (onProgress) onProgress((i + 1) / n);
    }
    return items;
  }
  // 범위: [[start,end],...] (1-based inclusive) → 범위별 PDF
  async function splitRanges(file, groups, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var items = [];
    for (var g = 0; g < groups.length; g++) {
      var s = groups[g][0], e = groups[g][1];
      var idx = [];
      for (var p = s; p <= e && p <= n; p++) idx.push(p - 1);
      if (!idx.length) continue;
      var doc = await PDFDocument.create();
      var pgs = await doc.copyPages(src, idx);
      pgs.forEach(function (pg) { doc.addPage(pg); });
      items.push({ name: 'pages-' + s + '-' + Math.min(e, n) + '.pdf', blob: toBlob(await doc.save()) });
      if (onProgress) onProgress((g + 1) / groups.length);
    }
    if (!items.length) throw new Error('유효한 페이지 범위가 없습니다.');
    return items;
  }

  // ── 3. 페이지 추출 ────────────────────────────────────────
  // indices: 0-based 배열 (입력 순서 유지)
  async function extract(file, indices) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var valid = indices.filter(function (i) { return i >= 0 && i < n; });
    if (!valid.length) throw new Error('추출할 유효한 페이지가 없습니다.');
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, valid);
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }

  // ── 4. 페이지 삭제 ────────────────────────────────────────
  // delIndices: 0-based 삭제 대상
  async function deletePages(file, delIndices) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var del = {};
    delIndices.forEach(function (i) { del[i] = true; });
    var keep = [];
    for (var i = 0; i < n; i++) if (!del[i]) keep.push(i);
    if (!keep.length) throw new Error('모든 페이지를 삭제할 수는 없습니다. 최소 1페이지는 남겨야 해요.');
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, keep);
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }

  // ── 5. 이미지 변환 (PNG/JPG) ─────────────────────────────
  // opts: { scale, format:'png'|'jpg', quality, pageIndices?, password? }
  async function toImages(file, opts, onProgress) {
    opts = opts || {};
    var scale = opts.scale || 2;
    var format = opts.format === 'jpg' ? 'jpg' : 'png';
    var mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    var quality = opts.quality || 0.92;
    var pdf = await loadPdfjs(file, opts.password);
    var total = pdf.numPages;
    var list = opts.pageIndices && opts.pageIndices.length
      ? opts.pageIndices.filter(function (i) { return i >= 0 && i < total; }).map(function (i) { return i + 1; })
      : Array.apply(null, { length: total }).map(function (_, i) { return i + 1; });
    var width = String(total).length;
    var items = [];
    for (var k = 0; k < list.length; k++) {
      var pageNum = list[k];
      var page = await pdf.getPage(pageNum);
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      var ctx = canvas.getContext('2d');
      if (format === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var blob = await canvasToBlob(canvas, mime, quality);
      items.push({ name: 'page-' + pad(pageNum, width) + '.' + format, blob: blob });
      canvas.width = canvas.height = 0; // 메모리 해제
      if (onProgress) onProgress((k + 1) / list.length);
    }
    return items;
  }

  // ── 6. 페이지 번호 ────────────────────────────────────────
  // opts: { position, startAt, skipCover, format, fontSize, margin }
  async function addPageNumbers(file, opts) {
    opts = opts || {};
    var LL = L();
    var doc = await loadDoc(file);
    var font = await doc.embedFont(LL.StandardFonts.Helvetica);
    var pages = doc.getPages();
    var total = pages.length;
    var position = opts.position || 'bottom-center';
    var startAt = (opts.startAt != null) ? opts.startAt : 1;
    var skip = opts.skipCover ? 1 : 0;
    var fmt = opts.format || 'n';
    var fontSize = opts.fontSize || 11;
    var margin = opts.margin != null ? opts.margin : 28;
    var numberedTotal = total - skip;
    var isTop = position.indexOf('top') === 0;
    for (var i = skip; i < total; i++) {
      var page = pages[i];
      var num = startAt + (i - skip);
      var text;
      if (fmt === 'n/total') text = num + ' / ' + numberedTotal;
      else if (fmt === 'dash') text = '- ' + num + ' -';
      else text = String(num);
      var size = page.getSize();
      var tw = font.widthOfTextAtSize(text, fontSize);
      var x, y;
      y = isTop ? (size.height - margin - fontSize) : margin;
      if (position.indexOf('left') >= 0) x = margin;
      else if (position.indexOf('right') >= 0) x = size.width - margin - tw;
      else x = size.width / 2 - tw / 2;
      page.drawText(text, { x: x, y: y, size: fontSize, font: font, color: LL.rgb(0.1, 0.1, 0.1) });
    }
    return toBlob(await doc.save());
  }

  // ── 7. 잠금해제 ───────────────────────────────────────────
  // (a) 벡터: 권한제한(소유자암호) PDF 재저장 — 텍스트/벡터 보존
  async function unlock(file) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }
  // (b) 래스터 폴백: 열람암호 PDF — 비번 입력해 복호화 후 이미지로 재구성(항상 열림, 텍스트선택 불가)
  async function unlockRaster(file, password, scale, onProgress) {
    var PDFDocument = L().PDFDocument;
    var pdf = await loadPdfjs(file, password);
    var out = await PDFDocument.create();
    var s = scale || 2;
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var vp = page.getViewport({ scale: s });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      var blob = await canvasToBlob(canvas, 'image/png');
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var img = await out.embedPng(bytes);
      var vp1 = page.getViewport({ scale: 1 });
      var p = out.addPage([vp1.width, vp1.height]);
      p.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(i / pdf.numPages);
    }
    return toBlob(await out.save());
  }

  // 페이지 썸네일 렌더링 (시각적 선택용)
  async function renderThumbs(file, opts, onProgress) {
    opts = opts || {};
    var scale = opts.scale || 0.34;
    var max = opts.max || 60;
    var pdf = await loadPdfjs(file, opts.password);
    var total = pdf.numPages;
    var n = Math.min(total, max);
    var out = [];
    for (var i = 1; i <= n; i++) {
      var page = await pdf.getPage(i);
      var vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push({ page: i, url: canvas.toDataURL('image/jpeg', 0.7) });
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(i / n);
    }
    return { thumbs: out, total: total, shown: n };
  }

  // 페이지 수 (범위 검증용)
  async function getPageCount(file) {
    try {
      var doc = await loadDoc(file);
      return doc.getPageCount();
    } catch (e) {
      try { var pdf = await loadPdfjs(file); return pdf.numPages; } catch (e2) { return null; }
    }
  }

  // PasswordException 판별 헬퍼
  function isPasswordError(err) {
    return err && (err.name === 'PasswordException' ||
      (err.message && /password|encrypt/i.test(err.message)));
  }

  global.PDFEngine = {
    merge: merge,
    splitEach: splitEach,
    splitRanges: splitRanges,
    extract: extract,
    deletePages: deletePages,
    toImages: toImages,
    addPageNumbers: addPageNumbers,
    unlock: unlock,
    unlockRaster: unlockRaster,
    renderThumbs: renderThumbs,
    getPageCount: getPageCount,
    isPasswordError: isPasswordError
  };
})(window);
