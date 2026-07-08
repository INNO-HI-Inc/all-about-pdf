/* PDF 비밀번호 설정(암호화) — 열기 비밀번호·인쇄/복사 제한을 걸어 저장 (브라우저 내 처리, 서버 전송 없음) */
document.addEventListener('DOMContentLoaded', function () {
  var rootEl = document.querySelector('[data-tool="protect"]');
  if (!rootEl) return;

  function baseName(name) {
    return String(name || '비밀번호-PDF').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '');
  }

  ToolCore.init({
    tool: 'protect', multiple: false, pageCount: true,
    readOptions: function (root) {
      var pw = root.querySelector('#protect-pw');
      var ap = root.querySelector('#protect-allow-print');
      var ac = root.querySelector('#protect-allow-copy');
      return {
        userPassword: pw ? pw.value : '',
        allowPrint: ap ? ap.checked : true,
        allowCopy: ac ? ac.checked : true
      };
    },
    validate: function (files, o) {
      if (!o.userPassword || !o.userPassword.trim()) return '설정할 비밀번호를 입력해 주세요.';
      return null;
    },
    run: async function (files, o, ctx) {
      try {
        var blob = await PDFEngine.protect(files[0], {
          userPassword: o.userPassword, allowPrint: o.allowPrint, allowCopy: o.allowCopy
        });
        UI.toast('비밀번호를 걸었어요. 열 때 이 비밀번호가 필요해요.', 'success');
        return { type: 'blob', blob: blob, filename: baseName(files[0].name) + '-비밀번호.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('이미 비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 다시 설정해 주세요.');
        throw e;
      }
    }
  });

  // 비밀번호 표시 토글
  var showpw = rootEl.querySelector('#protect-showpw');
  var pwInput = rootEl.querySelector('#protect-pw');
  if (showpw && pwInput) {
    showpw.addEventListener('change', function () { pwInput.type = showpw.checked ? 'text' : 'password'; });
  }
  // 비밀번호 입력 후 Enter로 실행
  if (pwInput) {
    pwInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var run = rootEl.querySelector('.js-run'); if (run && !run.disabled) run.click(); }
    });
  }
});
