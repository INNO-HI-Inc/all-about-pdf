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
  // merge(files, opts?, onProgress?) — opts:{ blankBetween }. 손상/암호 파일은 건너뛰고 blob._skipped에 기록.
  async function merge(files, opts, onProgress) {
    if (typeof opts === 'function') { onProgress = opts; opts = {}; }
    opts = opts || {};
    var PDFDocument = L().PDFDocument;
    var out = await PDFDocument.create();
    var skipped = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var src = await loadDoc(files[i]);
        var pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { out.addPage(p); });
        if (opts.blankBetween && i < files.length - 1) {
          var last = out.getPage(out.getPageCount() - 1).getSize();
          out.addPage([last.width, last.height]);
        }
      } catch (e) { skipped.push(files[i].name); }
      if (onProgress) onProgress((i + 1) / files.length);
    }
    if (out.getPageCount() === 0) throw new Error('합칠 수 있는 PDF가 없습니다. 파일이 손상되었거나 비밀번호가 걸려 있을 수 있어요.');
    var blob = toBlob(await out.save());
    try { blob._skipped = skipped; } catch (e) {}
    return blob;
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
  // N페이지마다 분할
  async function splitEvery(file, size, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    size = Math.max(1, size | 0);
    var groups = [];
    for (var s = 1; s <= n; s += size) groups.push([s, Math.min(s + size - 1, n)]);
    var width = String(groups.length).length;
    var items = [];
    for (var g = 0; g < groups.length; g++) {
      var idx = []; for (var p = groups[g][0]; p <= groups[g][1]; p++) idx.push(p - 1);
      var doc = await PDFDocument.create();
      var pgs = await doc.copyPages(src, idx);
      pgs.forEach(function (pg) { doc.addPage(pg); });
      items.push({ name: 'part-' + pad(g + 1, width) + '.pdf', blob: toBlob(await doc.save()) });
      if (onProgress) onProgress((g + 1) / groups.length);
    }
    return items;
  }
  // 홀수/짝수 페이지 분리 → 두 PDF
  async function splitOddEven(file, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var odd = [], even = [];
    for (var i = 0; i < n; i++) ((i % 2 === 0) ? odd : even).push(i);
    var items = [];
    async function build(name, idx) {
      if (!idx.length) return;
      var doc = await PDFDocument.create();
      var pgs = await doc.copyPages(src, idx);
      pgs.forEach(function (pg) { doc.addPage(pg); });
      items.push({ name: name, blob: toBlob(await doc.save()) });
    }
    await build('홀수페이지.pdf', odd); if (onProgress) onProgress(0.5);
    await build('짝수페이지.pdf', even); if (onProgress) onProgress(1);
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
  // opts: { scale, format:'png'|'jpg', quality(0~1), grayscale, transparent(png), prefix, pageIndices?, password? }
  async function toImages(file, opts, onProgress) {
    opts = opts || {};
    var scale = opts.scale || 2;
    var format = opts.format === 'jpg' ? 'jpg' : (opts.format === 'webp' ? 'webp' : 'png');
    var mime = format === 'jpg' ? 'image/jpeg' : (format === 'webp' ? 'image/webp' : 'image/png');
    var quality = opts.quality != null ? opts.quality : 0.92;
    var prefix = opts.prefix ? String(opts.prefix).replace(/[\\/:*?"<>|]/g, '') : 'page';
    // PNG·WEBP는 투명 배경 지원(JPG는 불가)
    var transparent = (format === 'png' || format === 'webp') && !!opts.transparent;
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
      if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      if (opts.grayscale) {
        try {
          var im = ctx.getImageData(0, 0, canvas.width, canvas.height), dt = im.data;
          for (var pi = 0; pi < dt.length; pi += 4) {
            var g = (dt[pi] * 0.299 + dt[pi + 1] * 0.587 + dt[pi + 2] * 0.114) | 0;
            dt[pi] = dt[pi + 1] = dt[pi + 2] = g;
          }
          ctx.putImageData(im, 0, 0);
        } catch (e) {}
      }
      var blob = await canvasToBlob(canvas, mime, quality);
      items.push({ name: prefix + '-' + pad(pageNum, width) + '.' + format, blob: blob });
      canvas.width = canvas.height = 0; // 메모리 해제
      if (onProgress) onProgress((k + 1) / list.length);
    }
    return items;
  }

  // ── 5-b. 이미지 → PDF ─────────────────────────────────────
  // files: JPG/PNG 이미지. opts:{ pageSize:'image'|'a4', margin }. 이미지 1장 = 1페이지.
  async function imagesToPdf(files, opts, onProgress) {
    opts = opts || {};
    var PDFDocument = L().PDFDocument;
    var out = await PDFDocument.create();
    var pageSize = opts.pageSize === 'a4' ? 'a4' : 'image';
    var margin = opts.margin != null ? opts.margin : 0;
    var A4W = 595.28, A4H = 841.89;
    var skipped = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var bytes = new Uint8Array(await readArrayBuffer(f));
        var isPng = /^image\/png$/i.test(f.type) || /\.png$/i.test(f.name);
        var img;
        if (isPng) img = await out.embedPng(bytes);
        else { try { img = await out.embedJpg(bytes); } catch (e) { img = await out.embedPng(bytes); } }
        var iw = img.width, ih = img.height;
        if (pageSize === 'a4') {
          var landscape = iw > ih;
          var pw = landscape ? A4H : A4W, ph = landscape ? A4W : A4H;
          var page = out.addPage([pw, ph]);
          var availW = pw - margin * 2, availH = ph - margin * 2;
          var sc = Math.min(availW / iw, availH / ih);
          var w = iw * sc, h = ih * sc;
          page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        } else {
          var pg = out.addPage([iw + margin * 2, ih + margin * 2]);
          pg.drawImage(img, { x: margin, y: margin, width: iw, height: ih });
        }
      } catch (e) { skipped.push(f.name); }
      if (onProgress) onProgress((i + 1) / files.length);
    }
    if (out.getPageCount() === 0) throw new Error('PDF로 만들 수 있는 이미지가 없어요. JPG·PNG 파일인지 확인해 주세요.');
    var blob = toBlob(await out.save());
    try { blob._skipped = skipped; } catch (e) {}
    return blob;
  }

  // ── 6. 페이지 번호 ────────────────────────────────────────
  // opts: { position, startAt, skipCover, format, fontSize, margin, color(hex), prefix, suffix, box }
  function hexToRgb(hex, LL) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return LL.rgb(0.1, 0.1, 0.1);
    var n = parseInt(m[1], 16);
    return LL.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  // 기본 폰트(Helvetica/WinAnsi)는 한글을 인코딩 못 함 → 안전 문자만 남겨 크래시 방지
  function winAnsiSafe(s) { return String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, ''); }
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
    var color = hexToRgb(opts.color, LL);
    var prefix = winAnsiSafe(opts.prefix);
    var suffix = winAnsiSafe(opts.suffix);
    var numberedTotal = total - skip;
    var isTop = position.indexOf('top') === 0;
    for (var i = skip; i < total; i++) {
      var page = pages[i];
      var num = startAt + (i - skip);
      var core;
      if (fmt === 'n/total') core = num + ' / ' + numberedTotal;
      else if (fmt === 'dash') core = '- ' + num + ' -';
      else core = String(num);
      var text = prefix + core + suffix;
      var size = page.getSize();
      var tw = font.widthOfTextAtSize(text, fontSize);
      var x, y;
      y = isTop ? (size.height - margin - fontSize) : margin;
      if (position.indexOf('left') >= 0) x = margin;
      else if (position.indexOf('right') >= 0) x = size.width - margin - tw;
      else x = size.width / 2 - tw / 2;
      if (opts.box) {
        var padX = fontSize * 0.5, padY = fontSize * 0.32;
        page.drawRectangle({
          x: x - padX, y: y - padY, width: tw + padX * 2, height: fontSize + padY * 2,
          color: LL.rgb(1, 1, 1), opacity: 0.72
        });
      }
      page.drawText(text, { x: x, y: y, size: fontSize, font: font, color: color });
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

  // ── 페이지 정리: 순서변경 + 회전 + 삭제 (한 번에) ───────────
  // organize(file, order, onProgress) — order: [{ page:<1-based 원본쪽>, rot:0|90|180|270 }, ...]
  // order에 담긴 페이지만, 담긴 순서대로, 각자 회전을 더해 새 PDF로 만든다(원본 회전에 가산).
  async function organize(file, order, onProgress) {
    if (!order || !order.length) throw new Error('남길 페이지가 없습니다. 최소 1페이지는 유지해 주세요.');
    var LL = L();
    var PDFDocument = LL.PDFDocument, degrees = LL.degrees;
    var src = await loadDoc(file);
    var srcCount = src.getPageCount();
    var valid = order.filter(function (o) { return o && o.page >= 1 && o.page <= srcCount; });
    if (!valid.length) throw new Error('유효한 페이지가 없습니다.');
    var out = await PDFDocument.create();
    var indices = valid.map(function (o) { return o.page - 1; });
    var copied = await out.copyPages(src, indices);
    for (var i = 0; i < copied.length; i++) {
      var pg = copied[i];
      var add = (((valid[i].rot || 0) % 360) + 360) % 360;
      if (add) {
        var cur = 0;
        try { cur = pg.getRotation().angle || 0; } catch (e) {}
        pg.setRotation(degrees((cur + add) % 360));
      }
      out.addPage(pg);
      if (onProgress) onProgress((i + 1) / copied.length);
    }
    return toBlob(await out.save());
  }

  // ── 회전 ──────────────────────────────────────────────────
  // rotate(file, angle) — 모든 페이지를 angle(±90/180)만큼 회전. 글자/화질 보존.
  async function rotate(file, angle) {
    var PDFLib = L();
    var doc = await loadDoc(file);
    var add = (((angle || 0) % 360) + 360) % 360;
    doc.getPages().forEach(function (p) {
      var cur = (p.getRotation() && p.getRotation().angle) || 0;
      p.setRotation(PDFLib.degrees(((cur + add) % 360 + 360) % 360));
    });
    return toBlob(await doc.save());
  }

  // ── 자르기(여백 제거) ─────────────────────────────────────
  // crop(file, ratio) — 각 변에서 ratio(0~0.45) 비율만큼 CropBox 축소. 내용/화질 보존.
  async function crop(file, ratio) {
    var doc = await loadDoc(file);
    var r = Math.max(0, Math.min(0.45, ratio || 0));
    doc.getPages().forEach(function (p) {
      var s = p.getSize();
      var mx = s.width * r, my = s.height * r;
      if (p.setCropBox) p.setCropBox(mx, my, s.width - 2 * mx, s.height - 2 * my);
    });
    return toBlob(await doc.save());
  }

  // ── 압축(래스터화 재압축) ─────────────────────────────────
  // compress(file, {scale, quality}, onProgress) — 각 페이지를 렌더→JPEG 재압축→같은 크기 페이지로 재구성.
  async function compress(file, opts, onProgress) {
    opts = opts || {};
    var PDFDocument = L().PDFDocument;
    var scale = opts.scale || 1.3;
    var quality = opts.quality != null ? opts.quality : 0.6;
    var pdf = await loadPdfjs(file);
    var total = pdf.numPages;
    var out = await PDFDocument.create();
    for (var n = 1; n <= total; n++) {
      var page = await pdf.getPage(n);
      var vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      var blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var img = await out.embedJpg(bytes);
      var base = page.getViewport({ scale: 1 });
      var pg = out.addPage([base.width, base.height]);
      pg.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(n / total);
    }
    return toBlob(await out.save());
  }

  // ── 정보 보기 ─────────────────────────────────────────────
  // getInfo(file) — 페이지 수·용량·크기·메타데이터·잠김 여부. 파일 변경 없음.
  async function getInfo(file) {
    var info = { fileName: file.name || '', fileSize: file.size || 0, pages: 0, size: null, title: '', author: '', producer: '', encrypted: false };
    try { var pr = await probe(file); if (pr && pr.needsPassword) { info.encrypted = true; return info; } } catch (e) {}
    try {
      var pdf = await loadPdfjs(file);
      info.pages = pdf.numPages;
      try { var md = await pdf.getMetadata(); if (md && md.info) { info.title = md.info.Title || ''; info.author = md.info.Author || ''; info.producer = md.info.Producer || ''; } } catch (e) {}
      var first = await pdf.getPage(1);
      var vp = first.getViewport({ scale: 1 });
      info.size = { w: Math.round(vp.width), h: Math.round(vp.height) };
    } catch (e) {
      try { var doc = await loadDoc(file); info.pages = doc.getPageCount(); var s = doc.getPage(0).getSize(); info.size = { w: Math.round(s.width), h: Math.round(s.height) }; } catch (e2) {}
    }
    return info;
  }

  // ── 이미지 형식 변환 (래스터/SVG → PNG/JPG/WEBP) ─────────────
  function parseSvgDims(text) {
    var m = text.match(/<svg[\s\S]*?>/i); if (!m) return { w: 0, h: 0 };
    var tag = m[0];
    var pick = function (re) { var x = tag.match(re); return x ? parseFloat(x[1]) : 0; };
    var w = pick(/\bwidth\s*=\s*["']?\s*([\d.]+)/i), h = pick(/\bheight\s*=\s*["']?\s*([\d.]+)/i);
    if (!w || !h) { var vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i); if (vb) { if (!w) w = parseFloat(vb[1]); if (!h) h = parseFloat(vb[2]); } }
    return { w: w || 0, h: h || 0 };
  }
  function readTextFile(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result || '')); }; r.onerror = function () { rej(new Error('파일을 읽지 못했어요.')); }; r.readAsText(file); }); }
  function rasterizeImage(file, o) {
    o = o || {};
    return new Promise(function (resolve, reject) {
      var isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
      function draw(dims) {
        var url = global.URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var bw = (dims && dims.w) || img.naturalWidth || img.width || 1024;
          var bh = (dims && dims.h) || img.naturalHeight || img.height || bw;
          var sc = o.scale || 1;
          var w = Math.max(1, Math.round(bw * sc)), h = Math.max(1, Math.round(bh * sc));
          var MAX = 16000000; if (w * h > MAX) { var k = Math.sqrt(MAX / (w * h)); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); }
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          if (o.white) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
          try { ctx.drawImage(img, 0, 0, w, h); } catch (e) { global.URL.revokeObjectURL(url); reject(new Error('이 파일은 변환할 수 없어요.')); return; }
          global.URL.revokeObjectURL(url);
          c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('변환에 실패했어요. 브라우저가 이 형식을 지원하지 않을 수 있어요.')); c.width = c.height = 0; }, o.mime, o.quality);
        };
        img.onerror = function () { global.URL.revokeObjectURL(url); reject(new Error('파일을 불러올 수 없어요. 형식이 맞는지 확인해 주세요.')); };
        img.src = url;
      }
      if (isSvg) { readTextFile(file).then(function (t) { draw(parseSvgDims(t)); }).catch(function () { draw(null); }); }
      else draw(null);
    });
  }
  // convertImages(files, {to:'png'|'jpg'|'webp', quality, scale}, onProgress) → items[{name,blob}]
  async function convertImages(files, opts, onProgress) {
    opts = opts || {};
    var to = (opts.to || 'png').toLowerCase();
    var mime = (to === 'jpg' || to === 'jpeg') ? 'image/jpeg' : to === 'webp' ? 'image/webp' : 'image/png';
    var ext = to === 'jpeg' ? 'jpg' : to;
    var quality = opts.quality != null ? opts.quality : 0.92;
    var white = mime === 'image/jpeg' || !!opts.white;
    var items = [];
    for (var i = 0; i < files.length; i++) {
      var blob = await rasterizeImage(files[i], { scale: opts.scale || 1, mime: mime, quality: quality, white: white });
      var base = (files[i].name || ('image-' + (i + 1))).replace(/\.[a-z0-9]+$/i, '') || ('image-' + (i + 1));
      items.push({ name: base + '.' + ext, blob: blob });
      if (onProgress) onProgress((i + 1) / files.length);
    }
    return items;
  }

  // ── 개인정보(메타데이터) 제거 ──────────────────────────────
  async function removeMetadata(file) {
    var doc = await loadDoc(file);
    var lib = L(), PDFName = lib.PDFName, PDFDocument = lib.PDFDocument;
    try {
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]);
      doc.setProducer(''); doc.setCreator('');
    } catch (e) {}
    // Info 딕셔너리의 식별·날짜 키를 통째로 제거
    try {
      var info = doc.getInfoDict();
      ['Producer', 'Creator', 'Title', 'Author', 'Subject', 'Keywords', 'CreationDate', 'ModDate']
        .forEach(function (k) { try { info.delete(PDFName.of(k)); } catch (e) {} });
    } catch (e) {}
    // XMP 메타데이터 스트림 제거
    try { doc.catalog.delete(PDFName.of('Metadata')); } catch (e) {}
    // ⚠ pdf-lib는 save() 때 updateInfoDict()로 Producer="pdf-lib..."와 ModDate를 강제 재주입한다.
    //    저장 동안만 무력화해 진짜로 비운 상태를 유지한다.
    var orig = PDFDocument && PDFDocument.prototype && PDFDocument.prototype.updateInfoDict;
    try { if (orig) PDFDocument.prototype.updateInfoDict = function () {}; } catch (e) {}
    var bytes;
    try { bytes = await doc.save(); }
    finally { try { if (orig) PDFDocument.prototype.updateInfoDict = orig; } catch (e) {} }
    return toBlob(bytes);
  }

  // ── 빈 페이지 제거 ─────────────────────────────────────────
  async function removeBlank(file, onProgress) {
    var PDFDocument = L().PDFDocument;
    var pdfjs = await loadPdfjs(file);
    var src = await loadDoc(file);
    var total = pdfjs.numPages;
    var keep = [];
    for (var n = 1; n <= total; n++) {
      var page = await pdfjs.getPage(n);
      var vp = page.getViewport({ scale: 0.35 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      var blank = true;
      try {
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        var nonWhite = 0, totalPx = canvas.width * canvas.height;
        for (var i = 0; i < data.length; i += 4) {
          if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite++;
        }
        blank = (nonWhite / totalPx) < 0.003;
      } catch (e) { blank = false; }
      if (!blank) keep.push(n - 1);
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(n / total);
    }
    if (!keep.length) throw new Error('모든 페이지가 빈 페이지로 판단됐어요. 원본을 확인해 주세요.');
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, keep);
    pages.forEach(function (p) { out.addPage(p); });
    var blob = toBlob(await out.save());
    try { blob._removed = total - keep.length; } catch (e) {}
    return blob;
  }

  // ── 여백 추가 ──────────────────────────────────────────────
  async function addMargin(file, margin) {
    var doc = await loadDoc(file);
    var m = margin || 40;
    doc.getPages().forEach(function (p) {
      var s = p.getSize();
      p.setMediaBox(-m, -m, s.width + 2 * m, s.height + 2 * m);
      if (p.setCropBox) p.setCropBox(-m, -m, s.width + 2 * m, s.height + 2 * m);
    });
    return toBlob(await doc.save());
  }

  // ── 텍스트 추출 (.txt) ─────────────────────────────────────
  async function extractText(file, onProgress) {
    var pdfjs = await loadPdfjs(file);
    var total = pdfjs.numPages;
    var pages = [];
    for (var n = 1; n <= total; n++) {
      var page = await pdfjs.getPage(n);
      var tc = await page.getTextContent();
      var lines = [], cur = '';
      tc.items.forEach(function (it) { cur += (it.str || ''); if (it.hasEOL) { lines.push(cur); cur = ''; } });
      if (cur) lines.push(cur);
      pages.push(lines.join('\n'));
      if (onProgress) onProgress(n / total);
    }
    return pages.join('\n\n');
  }

  // ── 페이지 역순 ────────────────────────────────────────────
  async function reverse(file) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var idx = [];
    for (var i = n - 1; i >= 0; i--) idx.push(i);
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, idx);
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }

  // ── 흑백(그레이스케일) 변환 ────────────────────────────────
  async function grayscale(file, opts, onProgress) {
    opts = opts || {};
    var PDFDocument = L().PDFDocument;
    var scale = opts.scale || 1.5;
    var quality = opts.quality != null ? opts.quality : 0.78;
    var pdf = await loadPdfjs(file);
    var total = pdf.numPages;
    var out = await PDFDocument.create();
    for (var n = 1; n <= total; n++) {
      var page = await pdf.getPage(n);
      var vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      try {
        var im = ctx.getImageData(0, 0, canvas.width, canvas.height), d = im.data;
        for (var i = 0; i < d.length; i += 4) { var g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = g; }
        ctx.putImageData(im, 0, 0);
      } catch (e) {}
      var blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var img = await out.embedJpg(bytes);
      var base = page.getViewport({ scale: 1 });
      var pg = out.addPage([base.width, base.height]);
      pg.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(n / total);
    }
    return toBlob(await out.save());
  }

  // ── 모아찍기 (N-up: 2쪽/4쪽을 한 장에) ─────────────────────
  async function nup(file, per, onProgress) {
    var PDFDocument = L().PDFDocument;
    var srcBytes = await readArrayBuffer(file);
    var src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    var out = await PDFDocument.create();
    var embeds = await out.embedPdf(srcBytes, src.getPageIndices());
    var p = per === 4 ? 4 : 2;
    var cols = p === 4 ? 2 : 1, rows = 2;
    var first = src.getPage(0).getSize();
    var sheetW = first.width, sheetH = first.height;
    var cellW = sheetW / cols, cellH = sheetH / rows, pad = 10;
    var sheet = null;
    for (var i = 0; i < embeds.length; i++) {
      var slot = i % p;
      if (slot === 0) sheet = out.addPage([sheetW, sheetH]);
      var col = slot % cols, row = Math.floor(slot / cols);
      var e = embeds[i], ew = e.width, eh = e.height;
      var sc = Math.min((cellW - 2 * pad) / ew, (cellH - 2 * pad) / eh);
      var dw = ew * sc, dh = eh * sc;
      var cx = col * cellW + (cellW - dw) / 2;
      var cy = sheetH - (row + 1) * cellH + (cellH - dh) / 2;
      sheet.drawPage(e, { x: cx, y: cy, width: dw, height: dh });
      if (onProgress) onProgress((i + 1) / embeds.length);
    }
    return toBlob(await out.save());
  }

  // 페이지 썸네일 렌더링 (시각적 선택용)
  async function renderThumbs(file, opts, onProgress) {
    opts = opts || {};
    var scale = opts.scale || 0.5;
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

  // 잠금 상태 사전 진단: { needsPassword, pages }
  async function probe(file) {
    try {
      var pdf = await loadPdfjs(file);
      return { needsPassword: false, pages: pdf.numPages };
    } catch (e) {
      if (isPasswordError(e)) return { needsPassword: true, pages: null };
      return { needsPassword: false, pages: null };
    }
  }

  // ── 서명/도장 배치 ───────────────────────────────────────
  // placements: [{ page:0기준, dataUrl, x, y, w, h }] — x,y,w,h는 이미 PDF 좌표(pt, 좌하단 기준).
  // 화면→PDF 좌표 변환은 sign.js가 pdf.js viewport.convertToPdfPoint로 처리해 회전까지 정확.
  async function placeSignatures(file, placements, onProgress) {
    if (!placements || !placements.length) throw new Error('추가된 서명이 없어요. 서명을 만들어 페이지에 올려 주세요.');
    var src = await loadDoc(file);
    var total = placements.length;
    var cache = {};
    for (var i = 0; i < placements.length; i++) {
      var pl = placements[i];
      var page = src.getPage(pl.page);
      var img = cache[pl.dataUrl];
      if (!img) {
        var c = pl.dataUrl.indexOf(',');
        var meta = pl.dataUrl.substring(0, c);
        var bin = atob(pl.dataUrl.substring(c + 1));
        var bytes = new Uint8Array(bin.length);
        for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        img = /image\/png/i.test(meta) ? await src.embedPng(bytes) : await src.embedJpg(bytes);
        cache[pl.dataUrl] = img;
      }
      page.drawImage(img, { x: pl.x, y: pl.y, width: pl.w, height: pl.h });
      if (onProgress) onProgress((i + 1) / total);
    }
    return toBlob(await src.save());
  }

  // ── 워터마크(텍스트·이미지) ───────────────────────────────
  // 한글 지원을 위해 문구를 캔버스에 렌더(사전 회전)→투명 PNG→embedPng→각 페이지 drawImage.
  // opts: { type:'text'|'image', text, color(hex), imageDataUrl, opacity(0~1),
  //         angle(0/45/90), mode:'center'|'tile', sizePct(0.08~1, 페이지폭 대비) }
  function loadImageEl(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('워터마크 이미지를 불러오지 못했어요.')); };
      im.src = src;
    });
  }
  async function addWatermark(file, opts, onProgress) {
    opts = opts || {};
    var doc = await loadDoc(file);
    var pages = doc.getPages();
    var total = pages.length;
    var opacity = opts.opacity != null ? Math.max(0.03, Math.min(1, opts.opacity)) : 0.25;
    var angle = (((opts.angle || 0) % 360) + 360) % 360;
    var mode = opts.mode === 'tile' ? 'tile' : 'center';
    var sizePct = opts.sizePct != null ? Math.max(0.08, Math.min(1, opts.sizePct)) : (mode === 'tile' ? 0.26 : 0.5);

    // 워터마크 소스 준비(텍스트 메트릭 또는 이미지 엘리먼트) — 회전은 페이지별로 적용
    var srcImg = null, srcW = 0, srcH = 0, wmText = '', fontStr = '', textW = 0, textH = 0;
    if (opts.type === 'image' && opts.imageDataUrl) {
      var img = await loadImageEl(opts.imageDataUrl);
      var iw = img.naturalWidth || img.width || 300, ih = img.naturalHeight || img.height || 300;
      // 폭·높이 모두 상한을 둬 세로로 매우 긴 이미지의 메모리 폭증 방지
      var MAX = 1400;
      if (iw > MAX) { ih = ih * MAX / iw; iw = MAX; }
      if (ih > MAX) { iw = iw * MAX / ih; ih = MAX; }
      srcImg = img; srcW = iw; srcH = ih;
    } else {
      wmText = String(opts.text == null ? '' : opts.text).trim();
      if (!wmText) throw new Error('워터마크에 넣을 문구를 입력해 주세요.');
      var fontPx = 180; // 3배 스케일(60pt×3) — 인쇄까지 또렷
      fontStr = '700 ' + fontPx + 'px "Apple SD Gothic Neo","Malgun Gothic","AtoZ",sans-serif';
      var mctx = document.createElement('canvas').getContext('2d');
      mctx.font = fontStr;
      textW = Math.ceil(mctx.measureText(wmText).width) + fontPx * 0.5;
      textH = Math.ceil(fontPx * 1.4);
    }

    // 특정 회전각(netAngle)으로 사전 회전된 워터마크 캔버스를 만들어 embedPng.
    // 페이지 /Rotate가 걸린 문서에서도 뷰어 기준으로 바르게 보이도록 회전각을 페이지별로 계산하고,
    // 같은 회전각은 캐시해 재사용(대부분 문서는 회전이 균일 → 임베드 1회).
    var embedCache = {};
    async function embedForAngle(deg) {
      if (embedCache[deg]) return embedCache[deg];
      var rad = deg * Math.PI / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
      var cv;
      if (srcImg) {
        var cw = Math.max(1, Math.ceil(srcW * c + srcH * s)), ch = Math.max(1, Math.ceil(srcW * s + srcH * c));
        cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        var ic = cv.getContext('2d'); ic.translate(cw / 2, ch / 2); ic.rotate(rad);
        ic.drawImage(srcImg, -srcW / 2, -srcH / 2, srcW, srcH);
      } else {
        var cw2 = Math.max(1, Math.ceil(textW * c + textH * s)), ch2 = Math.max(1, Math.ceil(textW * s + textH * c));
        cv = document.createElement('canvas'); cv.width = cw2; cv.height = ch2;
        var tc = cv.getContext('2d'); tc.translate(cw2 / 2, ch2 / 2); tc.rotate(rad);
        tc.font = fontStr; tc.fillStyle = opts.color || '#888888';
        tc.textAlign = 'center'; tc.textBaseline = 'middle';
        tc.fillText(wmText, 0, 0);
      }
      var blob = await canvasToBlob(cv, 'image/png');
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var rec = { img: await doc.embedPng(bytes), aspect: cv.height / cv.width };
      embedCache[deg] = rec; return rec;
    }

    for (var i = 0; i < total; i++) {
      var page = pages[i];
      var s = page.getSize(); // MediaBox 원본 폭/높이(회전 미반영)
      var pr = 0; try { pr = (((page.getRotation().angle || 0) % 360) + 360) % 360; } catch (e) {}
      var swap = (pr === 90 || pr === 270);
      // 뷰어에 보이는 폭/높이
      var vw = swap ? s.height : s.width, vh = swap ? s.width : s.height;
      // 캔버스에 새길 회전각 = 원하는 각 - 페이지회전(뷰어가 pr을 더해 다시 angle이 됨)
      var netAngle = (((angle - pr) % 360) + 360) % 360;
      var rec = await embedForAngle(netAngle);
      // MediaBox 중심 = 뷰어 중심(회전축) → 중앙 배치는 회전과 무관하게 중심 정렬로 OK
      if (mode === 'center') {
        var w = vw * sizePct, h = w * rec.aspect;
        if (h > vh * 0.92) { h = vh * 0.92; w = h / rec.aspect; } // 페이지 높이 초과 시 축소(잘림 방지)
        // 90/270 회전 페이지는 그리는 축이 뒤바뀌므로 MediaBox 기준 폭/높이를 교환
        var dw = swap ? h : w, dh = swap ? w : h;
        page.drawImage(rec.img, { x: (s.width - dw) / 2, y: (s.height - dh) / 2, width: dw, height: dh, opacity: opacity });
      } else {
        var tw2 = vw * sizePct, th2 = tw2 * rec.aspect;
        var dw2 = swap ? th2 : tw2, dh2 = swap ? tw2 : th2;
        var gx = dw2 * 0.35, gy = dh2 * 0.7; // 페이지 전반을 촘촘히 덮도록(반복 워터마크 취지)
        for (var y = -dh2; y < s.height + dh2; y += dh2 + gy)
          for (var x = -dw2; x < s.width + dw2; x += dw2 + gx)
            page.drawImage(rec.img, { x: x, y: y, width: dw2, height: dh2, opacity: opacity });
      }
      if (onProgress) onProgress((i + 1) / total);
    }
    return toBlob(await doc.save());
  }

  // ── 양식(Form) 평탄화 ─────────────────────────────────────
  // 입력값을 페이지에 '구워' 편집 불가·어디서나 동일하게 보이도록. 글자 보존(래스터화 아님).
  async function flattenForm(file) {
    var doc = await loadDoc(file);
    var form;
    try { form = doc.getForm(); } catch (e) { form = null; }
    if (!form || !form.getFields().length) {
      throw new Error('이 PDF에는 입력 양식(폼 필드)이 없어요. 평탄화할 대상이 없습니다.');
    }
    try { form.flatten(); }
    catch (e) { throw new Error('양식을 평탄화하지 못했어요. 일부 특수 양식은 지원되지 않을 수 있어요.'); }
    return toBlob(await doc.save());
  }

  global.PDFEngine = {
    merge: merge,
    addWatermark: addWatermark,
    flattenForm: flattenForm,
    splitEach: splitEach,
    splitRanges: splitRanges,
    splitEvery: splitEvery,
    splitOddEven: splitOddEven,
    extract: extract,
    deletePages: deletePages,
    toImages: toImages,
    imagesToPdf: imagesToPdf,
    addPageNumbers: addPageNumbers,
    unlock: unlock,
    unlockRaster: unlockRaster,
    organize: organize,
    rotate: rotate,
    crop: crop,
    compress: compress,
    getInfo: getInfo,
    convertImages: convertImages,
    removeMetadata: removeMetadata,
    removeBlank: removeBlank,
    addMargin: addMargin,
    extractText: extractText,
    reverse: reverse,
    grayscale: grayscale,
    nup: nup,
    placeSignatures: placeSignatures,
    loadPdfjs: loadPdfjs,
    renderThumbs: renderThumbs,
    getPageCount: getPageCount,
    isPasswordError: isPasswordError,
    probe: probe
  };
})(window);
