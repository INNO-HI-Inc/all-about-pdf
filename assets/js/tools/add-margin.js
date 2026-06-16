/* PDF 여백 추가 — 모든 페이지 둘레에 흰 여백 더하기 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="add-margin"]')) return;
  var MAP = { small: 22, medium: 40, large: 64 };
  ToolCore.init({
    tool: 'add-margin', multiple: false, pageCount: true,
    readOptions: function (root) { var a = root.querySelector('input[name="mg-amt"]:checked'); return { amt: a ? a.value : 'medium' }; },
    run: async function (files, o) {
      try {
        var blob = await PDFEngine.addMargin(files[0], MAP[o.amt] != null ? MAP[o.amt] : 40);
        return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '-여백추가.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
