/* PDF 잠금해제 (본인이 아는 비밀번호/제한 제거 — 크랙 아님) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="unlock"]')) return;
  ToolCore.init({
    tool: 'unlock', multiple: false,
    readOptions: function () {
      var pw = UI.qs('#unlock-pw');
      var raster = UI.qs('#unlock-raster');
      return { password: pw ? pw.value : '', raster: raster ? raster.checked : false };
    },
    run: async function (files, o, ctx) {
      var file = files[0], blob;
      try {
        if (o.raster || o.password) {
          blob = await PDFEngine.unlockRaster(file, o.password, 2, ctx.onProgress);
        } else {
          try {
            blob = await PDFEngine.unlock(file);
          } catch (e) {
            // 열람암호가 걸린 경우 → 래스터 폴백(비번 필요할 수 있음)
            blob = await PDFEngine.unlockRaster(file, o.password, 2, ctx.onProgress);
          }
        }
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) {
          throw new Error('비밀번호가 필요하거나 올바르지 않아요. 아는 비밀번호를 입력하고 "이미지로 해제"에 체크해 주세요. (모르는 비밀번호는 풀 수 없습니다)');
        }
        throw e;
      }
      return { type: 'blob', blob: blob, filename: '잠금해제-PDF.pdf' };
    }
  });
});
