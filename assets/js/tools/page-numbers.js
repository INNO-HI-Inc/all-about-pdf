/* PDF 페이지 번호 삽입 */
document.addEventListener('DOMContentLoaded', function () {
  var host = document.querySelector('[data-tool="page-numbers"]');
  if (!host) return;

  // 한글은 기본 글꼴로 인코딩할 수 없어 저장 시 빠진다. 실행 후 토스트로만 알리면 이미 다 입력한
  // 뒤라 늦으므로, 입력하는 중에 바로 알려 준다.
  (function () {
    var ids = ['#pn-prefix', '#pn-suffix'];
    var suf = host.querySelector('#pn-suffix');
    if (!suf || !suf.parentNode) return;
    var note = document.createElement('p');
    note.className = 'option__hint js-pn-note';
    note.style.cssText = 'margin:6px 0 0;color:var(--red);font-weight:600';
    note.hidden = true;
    note.textContent = '한글은 넣을 수 없어 저장할 때 빠집니다. 영문·숫자·기호만 사용해 주세요.';
    suf.parentNode.appendChild(note);
    function check() {
      note.hidden = !ids.some(function (id) {
        var el = host.querySelector(id);
        return el && /[^\x20-\x7E\xA0-\xFF]/.test(el.value || '');
      });
    }
    ids.forEach(function (id) { var el = host.querySelector(id); if (el) el.addEventListener('input', check); });
    check();
  })();

  ToolCore.init({
    tool: 'page-numbers', multiple: false, pageCount: true, numberPreview: true,
    readOptions: function (root) {
      var pos = root.querySelector('#pn-position');
      var start = root.querySelector('#pn-start');
      var skip = root.querySelector('#pn-skip');
      var fmt = root.querySelector('input[name="pn-format"]:checked');
      var size = root.querySelector('#pn-size');
      var color = root.querySelector('#pn-color');
      var margin = root.querySelector('#pn-margin');
      var prefix = root.querySelector('#pn-prefix');
      var suffix = root.querySelector('#pn-suffix');
      var box = root.querySelector('#pn-box');
      return {
        position: pos ? pos.value : 'bottom-center',
        startAt: start ? (parseInt(start.value, 10) || 1) : 1,
        skipCover: skip ? skip.checked : false,
        format: fmt ? fmt.value : 'n',
        fontSize: size ? (parseInt(size.value, 10) || 11) : 11,
        color: color ? color.value : '1a1a1a',
        margin: margin ? (parseInt(margin.value, 10) || 28) : 28,
        prefix: prefix ? prefix.value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '') : '',
        suffix: suffix ? suffix.value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '') : '',
        box: box ? box.checked : false
      };
    },
    run: async function (files, o, ctx) {
      // 한글·특수문자 접두/접미는 기본 글꼴(Helvetica)로 인코딩 불가 → 조용히 삭제되던 것을 명확히 안내
      var rawPre = (ctx.root.querySelector('#pn-prefix') || {}).value || '';
      var rawSuf = (ctx.root.querySelector('#pn-suffix') || {}).value || '';
      if (/[^\x20-\x7E\xA0-\xFF]/.test(rawPre + rawSuf)) {
        UI.toast('앞·뒤 글자의 한글은 아직 넣을 수 없어 제외했어요. (영문·숫자·기호만 지원)', 'warn');
      }
      var blob = await PDFEngine.addPageNumbers(files[0], {
        position: o.position, startAt: o.startAt, skipCover: o.skipCover, format: o.format,
        fontSize: o.fontSize, color: o.color, margin: o.margin,
        prefix: o.prefix, suffix: o.suffix, box: o.box
      });
      return { type: 'blob', blob: blob, filename: '페이지번호-추가.pdf' };
    }
  });
});
