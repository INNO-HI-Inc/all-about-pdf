/* PDF 자르기(여백 제거) — 사방 여백을 비율로 잘라냄 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="crop"]')) return;
  var MAP = { small: 0.05, medium: 0.1, large: 0.15 };
  ToolCore.init({
    tool: 'crop', multiple: false, pageCount: true,
    readOptions: function (root) {
      var a = root.querySelector('input[name="crop-amt"]:checked');
      return { amt: a ? a.value : 'medium' };
    },
    run: async function (files, o) {
      try {
        var ratio = MAP[o.amt] != null ? MAP[o.amt] : 0.1;
        var blob = await PDFEngine.crop(files[0], ratio);
        return { type: 'blob', blob: blob, filename: (files[0].name || 'cropped').replace(/\.pdf$/i, '') + '-자르기.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
