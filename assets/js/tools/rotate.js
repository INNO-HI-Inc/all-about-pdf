/* PDF 회전 — 모든 페이지를 한 방향으로 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="rotate"]')) return;
  ToolCore.init({
    tool: 'rotate', multiple: false, pageCount: true,
    readOptions: function (root) {
      var a = root.querySelector('input[name="rot-angle"]:checked');
      return { angle: a ? parseInt(a.value, 10) : 90 };
    },
    run: async function (files, o) {
      try {
        var blob = await PDFEngine.rotate(files[0], o.angle);
        return { type: 'blob', blob: blob, filename: (files[0].name || 'rotated').replace(/\.pdf$/i, '') + '-회전.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 회전해 주세요.');
        throw e;
      }
    }
  });
});
