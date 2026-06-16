/* PDF 텍스트 추출 — 글자를 .txt 파일로 (OCR 아님) */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="extract-text"]')) return;
  ToolCore.init({
    tool: 'extract-text', multiple: false, pageCount: true,
    run: async function (files, o, ctx) {
      var text;
      try {
        text = await PDFEngine.extractText(files[0], ctx.onProgress);
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
      if (!text || !text.replace(/\s/g, '').length) {
        throw new Error('이 PDF에서 글자를 찾지 못했어요. 사진처럼 스캔된 PDF는 글자 정보가 없어 추출되지 않아요(OCR 아님).');
      }
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      return { type: 'blob', blob: blob, filename: (files[0].name || '문서').replace(/\.pdf$/i, '') + '.txt' };
    }
  });
});
