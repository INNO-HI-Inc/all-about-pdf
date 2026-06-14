/* PDF 페이지 번호 삽입 */
document.addEventListener('DOMContentLoaded', function () {
  if (!document.querySelector('[data-tool="page-numbers"]')) return;
  ToolCore.init({
    tool: 'page-numbers', multiple: false, pageCount: true, numberPreview: true,
    readOptions: function (root) {
      var pos = root.querySelector('#pn-position');
      var start = root.querySelector('#pn-start');
      var skip = root.querySelector('#pn-skip');
      var fmt = root.querySelector('input[name="pn-format"]:checked');
      var size = root.querySelector('#pn-size');
      var color = root.querySelector('#pn-color');
      var margin = root.querySelector('#pn-margin');
      var prefix = root.querySelector('#pn-prefix');
      var suffix = root.querySelector('#pn-suffix');
      var box = root.querySelector('#pn-box');
      return {
        position: pos ? pos.value : 'bottom-center',
        startAt: start ? (parseInt(start.value, 10) || 1) : 1,
        skipCover: skip ? skip.checked : false,
        format: fmt ? fmt.value : 'n',
        fontSize: size ? (parseInt(size.value, 10) || 11) : 11,
        color: color ? color.value : '1a1a1a',
        margin: margin ? (parseInt(margin.value, 10) || 28) : 28,
        prefix: prefix ? prefix.value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '') : '',
        suffix: suffix ? suffix.value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '') : '',
        box: box ? box.checked : false
      };
    },
    run: async function (files, o, ctx) {
      var blob = await PDFEngine.addPageNumbers(files[0], {
        position: o.position, startAt: o.startAt, skipCover: o.skipCover, format: o.format,
        fontSize: o.fontSize, color: o.color, margin: o.margin,
        prefix: o.prefix, suffix: o.suffix, box: o.box
      });
      return { type: 'blob', blob: blob, filename: '페이지번호-추가.pdf' };
    }
  });
});
