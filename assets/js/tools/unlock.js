/* PDF 잠금해제 (본인이 아는 비밀번호/제한 제거 — 크랙 아님) */
document.addEventListener('DOMContentLoaded', function () {
  var rootEl = document.querySelector('[data-tool="unlock"]');
  if (!rootEl) return;

  function baseName(name) {
    return String(name || '잠금해제-PDF').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '');
  }

  ToolCore.init({
    tool: 'unlock', multiple: false,
    onFiles: function (files) {
      if (!files.length || !PDFEngine.probe) return;
      var raster = rootEl.querySelector('#unlock-raster');
      var pw = rootEl.querySelector('#unlock-pw');
      PDFEngine.probe(files[0]).then(function (info) {
        if (info && info.needsPassword) {
          if (raster) raster.checked = true;
          UI.toast('열기 비밀번호가 걸린 PDF예요. 아는 비밀번호를 입력하면 풀 수 있어요.', 'warn');
          if (pw) pw.focus();
        }
      });
    },
    readOptions: function (root) {
      var pw = root.querySelector('#unlock-pw');
      var raster = root.querySelector('#unlock-raster');
      var scale = root.querySelector('#unlock-scale');
      return {
        password: pw ? pw.value : '',
        raster: raster ? raster.checked : false,
        scale: scale ? (parseFloat(scale.value) || 2) : 2
      };
    },
    run: async function (files, o, ctx) {
      var file = files[0], blob, method = 'vector';
      try {
        if (o.raster || o.password) {
          method = 'raster';
          blob = await PDFEngine.unlockRaster(file, o.password, o.scale, ctx.onProgress);
        } else {
          try {
            blob = await PDFEngine.unlock(file);
          } catch (e) {
            method = 'raster';
            blob = await PDFEngine.unlockRaster(file, o.password, o.scale, ctx.onProgress);
          }
        }
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) {
          throw new Error('비밀번호가 필요하거나 올바르지 않아요. 아는 비밀번호를 입력하고 "이미지로 해제"에 체크해 주세요. (모르는 비밀번호는 풀 수 없습니다)');
        }
        throw e;
      }
      UI.toast(method === 'raster' ? '이미지 방식으로 해제했어요 (글자 선택 불가).' : '텍스트를 보존한 채 제한을 해제했어요.', 'success');
      return { type: 'blob', blob: blob, filename: baseName(file.name) + '-잠금해제.pdf' };
    }
  });

  // 비밀번호 표시 토글
  var showpw = rootEl.querySelector('#unlock-showpw');
  var pwInput = rootEl.querySelector('#unlock-pw');
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
