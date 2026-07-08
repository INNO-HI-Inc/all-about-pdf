/* PDF 워터마크 — 문구(한글 지원)·이미지 워터마크를 모든 페이지에 (브라우저 내 처리) */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.querySelector('[data-tool="watermark"]');
  if (!root) return;

  // 이미지 워터마크 dataURL 보관(파일은 서버로 전송하지 않음)
  var wmImageData = null;
  var imgInput = root.querySelector('.js-wm-img');
  var imgName = root.querySelector('.js-wm-imgname');
  if (imgInput) imgInput.addEventListener('change', function () {
    var f = imgInput.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { UI.toast('이미지 파일(PNG·JPG)만 올릴 수 있어요.', 'error'); return; }
    var r = new FileReader();
    r.onload = function () { wmImageData = r.result; if (imgName) imgName.textContent = f.name; };
    r.readAsDataURL(f);
  });

  // 종류 탭(문구/이미지)에 따라 관련 옵션만 노출
  function syncType() {
    var t = (root.querySelector('input[name="wm-type"]:checked') || {}).value || 'text';
    var textBox = root.querySelector('.js-wm-textbox');
    var imgBox = root.querySelector('.js-wm-imgbox');
    if (textBox) textBox.hidden = (t !== 'text');
    if (imgBox) imgBox.hidden = (t !== 'image');
  }
  root.querySelectorAll('input[name="wm-type"]').forEach(function (r) { r.addEventListener('change', syncType); });
  syncType();

  var SIZE = { small: 0.32, medium: 0.5, large: 0.72 };
  var TSIZE = { small: 0.16, medium: 0.26, large: 0.36 };
  var OPA = { light: 0.15, medium: 0.28, strong: 0.45 };

  ToolCore.init({
    tool: 'watermark', multiple: false, pageCount: true,
    readOptions: function (rt) {
      var type = (rt.querySelector('input[name="wm-type"]:checked') || {}).value || 'text';
      var text = (rt.querySelector('#wm-text') || {}).value || '';
      var color = (rt.querySelector('#wm-color') || {}).value || '888888';
      var mode = (rt.querySelector('input[name="wm-mode"]:checked') || {}).value || 'center';
      var angle = parseInt((rt.querySelector('input[name="wm-angle"]:checked') || {}).value || '45', 10);
      var size = (rt.querySelector('#wm-size') || {}).value || 'medium';
      var opa = (rt.querySelector('#wm-opacity') || {}).value || 'medium';
      var sizePct = (mode === 'tile' ? TSIZE : SIZE)[size] || (mode === 'tile' ? 0.26 : 0.5);
      return {
        type: type, text: text, color: '#' + String(color).replace('#', ''),
        mode: mode, angle: angle, opacity: OPA[opa] || 0.28, sizePct: sizePct
      };
    },
    validate: function (files, o) {
      if (o.type === 'text' && !o.text.trim()) return '워터마크에 넣을 문구를 입력해 주세요. 예: 대외비';
      if (o.type === 'image' && !wmImageData) return '워터마크로 쓸 이미지(PNG·JPG)를 올려 주세요.';
      return null;
    },
    run: async function (files, o, ctx) {
      try {
        var blob = await PDFEngine.addWatermark(files[0], {
          type: o.type, text: o.text, color: o.color, imageDataUrl: wmImageData,
          opacity: o.opacity, angle: o.angle, mode: o.mode, sizePct: o.sizePct
        }, ctx.onProgress);
        return { type: 'blob', blob: blob, filename: (files[0].name || '워터마크').replace(/\.pdf$/i, '') + '-워터마크.pdf' };
      } catch (e) {
        if (PDFEngine.isPasswordError(e)) throw new Error('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        throw e;
      }
    }
  });
});
