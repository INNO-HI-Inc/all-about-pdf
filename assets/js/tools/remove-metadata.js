/* PDF 개인정보(메타데이터) 제거 — 제목·작성자·생성 프로그램 등 문서 속성 비우기 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="remove-metadata"]')) return;
  ToolCore.init({
    tool: 'remove-metadata', multiple: false, pageCount: true,
    run: async function (files) {
      try {
        var blob = await PDFEngine.removeMetadata(files[0]);
        return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '-개인정보제거.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
