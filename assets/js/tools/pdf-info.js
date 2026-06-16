/* PDF 정보 보기 — 페이지 수·용량·크기·메타데이터·잠김 여부 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="pdf-info"]')) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sizeLabel(sz) {
    if (!sz) return '';
    var w = sz.w, h = sz.h, near = function (a, b) { return Math.abs(a - b) <= 4; };
    var lw = Math.min(w, h), lh = Math.max(w, h), name = '';
    if (near(lw, 595) && near(lh, 842)) name = 'A4';
    else if (near(lw, 420) && near(lh, 595)) name = 'A5';
    else if (near(lw, 842) && near(lh, 1191)) name = 'A3';
    else if (near(lw, 612) && near(lh, 792)) name = 'Letter';
    var mm = Math.round(w * 0.3528) + ' × ' + Math.round(h * 0.3528) + ' mm';
    var orient = w > h ? '가로' : '세로';
    return w + ' × ' + h + ' pt' + (name ? ' (' + name + ')' : '') + ' · ' + mm + ' · ' + orient;
  }
  ToolCore.init({
    tool: 'pdf-info', multiple: false,
    run: async function (files) {
      var f = files[0];
      var info = await PDFEngine.getInfo(f);
      var rows = [['파일 이름', esc(info.fileName)], ['파일 용량', UI.humanSize(info.fileSize)]];
      if (info.encrypted) {
        rows.push(['상태', '비밀번호로 잠겨 있어요']);
        rows.push(['안내', '내용을 보려면 먼저 [PDF 잠금해제] 도구로 푸세요']);
      } else {
        rows.push(['페이지 수', (info.pages || 0) + '쪽']);
        if (info.size) rows.push(['페이지 크기', esc(sizeLabel(info.size))]);
        if (info.title) rows.push(['제목', esc(info.title)]);
        if (info.author) rows.push(['작성자', esc(info.author)]);
        if (info.producer) rows.push(['만든 프로그램', esc(info.producer)]);
        rows.push(['상태', '잠금 없음']);
      }
      var html = '<div class="infocard"><h3 class="infocard__h">PDF 정보</h3><table class="infotable"><tbody>' +
        rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
      return { type: 'message', html: html };
    }
  });
});
