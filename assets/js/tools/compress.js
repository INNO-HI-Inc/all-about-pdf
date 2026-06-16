/* PDF 압축 — 페이지를 이미지로 재압축해 용량 축소 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="compress"]')) return;
  var Q = { low: { scale: 1.0, quality: 0.4 }, medium: { scale: 1.3, quality: 0.6 }, high: { scale: 1.8, quality: 0.78 } };
  ToolCore.init({
    tool: 'compress', multiple: false, pageCount: true,
    readOptions: function (root) {
      var a = root.querySelector('input[name="cmp-quality"]:checked');
      return { q: a ? a.value : 'medium' };
    },
    run: async function (files, o, ctx) {
      var preset = Q[o.q] || Q.medium;
      try {
        var blob = await PDFEngine.compress(files[0], preset, ctx.onProgress);
        if (files[0].size && blob.size >= files[0].size * 0.98) {
          UI.toast('이 PDF는 더 줄지 않았어요. 글자 위주 문서라면 원본을 쓰는 게 좋아요.', 'info');
        }
        return { type: 'blob', blob: blob, filename: (files[0].name || 'compressed').replace(/\.pdf$/i, '') + '-압축.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 압축해 주세요.');
        throw e;
      }
    }
  });
});
