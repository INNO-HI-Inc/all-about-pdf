/* PDF → DOCX(워드) — 브라우저에서 OOXML(ZIP+XML)을 직접 만들어 저장. 업로드 없음. */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="pdf-to-docx"]')) return;
  ToolCore.init({
    tool: 'pdf-to-docx', multiple: false, pageCount: true,
    run: async function (files, o, ctx) {
      var blocks;
      try {
        blocks = await PDFEngine.extractBlocks(files[0], ctx.onProgress);
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
      if (!blocks.length) {
        throw new Error('이 PDF에서 글자를 찾지 못했어요. 사진처럼 스캔된 PDF는 글자 정보가 없어 변환되지 않아요(OCR 아님).');
      }
      var base = (files[0].name || '문서').replace(/\.pdf$/i, '');
      var blob = await PDFEngine.buildDocx(blocks, base);
      return { type: 'blob', blob: blob, filename: base + '.docx' };
    }
  });
});
