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
        var base = (files[0].name || 'compressed').replace(/\.pdf$/i, '');
        // 결과가 원본보다 크면(=압축 실패) 래스터화로 커진 파일을 강요하지 않고 원본을 그대로 반환.
        // 원본은 글자 선택도 보존되므로 사용자에게 유리.
        if (files[0].size && blob.size >= files[0].size) {
          UI.toast('압축해도 용량이 줄지 않아 원본을 그대로 드려요. (글자 선택도 보존돼요)', 'info');
          return { type: 'blob', blob: files[0], filename: base + '.pdf' };
        }
        if (files[0].size && blob.size >= files[0].size * 0.9) {
          UI.toast('용량이 많이 줄지는 않았어요. 글자 위주 문서는 원래 압축 효과가 작아요.', 'info');
        }
        return { type: 'blob', blob: blob, filename: base + '-압축.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 압축해 주세요.');
        throw e;
      }
    }
  });
});
