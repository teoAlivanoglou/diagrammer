import { arrowGeometry, FONTS, flowLabelPlacement, TYPES, visibleFlow } from './diagram.mjs';
import { flowLabelBox, INK, labelInkBounds, labelInkSize, measureLabel } from './drawing.mjs';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WORD_DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const OFFICE_WORD = 'http://schemas.microsoft.com/office/word/2010/';
const GROUP = OFFICE_WORD + 'wordprocessingGroup';
const RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006/';
const COLOR = INK.slice(1).toUpperCase();
const EMU_PER_PIXEL = 9525;
const EMU_PER_TWIP = 635;
const PAGE = { width: 11906, height: 16838, margin: 1080 };
const toEmu = value => Math.round(value * EMU_PER_PIXEL);
const toExtent = value => Math.max(1, toEmu(value));

const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function escaped(value) {
  return String(value)
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[&<>"']/g, character => XML_ENTITIES[character]);
}

function centeredBox(x, y, width, height) {
  return { x: x - width / 2, y: y - height / 2, width, height };
}

function labelBox(item, anchor, metrics) {
  const lines = item.label.split('\n');
  if (metrics) metrics.font = item.size + 'px ' + (FONTS[item.font] ?? FONTS.Arial);
  const width = Math.max(1, ...lines.map(line => metrics
    ? metrics.measureText(line).width
    : [...line].length * item.size * 0.7)) + item.size;
  const height = (lines.length * 1.22 + 0.4) * item.size;
  const box = centeredBox(anchor.x, anchor.y, width, height);
  if (anchor.anchor === 'start') box.x = anchor.x;
  if (anchor.anchor === 'end') box.x = anchor.x - width;
  return box;
}

function bounds(boxes, padding = 0) {
  const left = Math.min(...boxes.map(box => box.x)) - padding;
  const top = Math.min(...boxes.map(box => box.y)) - padding;
  const right = Math.max(...boxes.map(box => box.x + (box.width ?? 0))) + padding;
  const bottom = Math.max(...boxes.map(box => box.y + (box.height ?? 0))) + padding;
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

const point = (x, y) => ({ x, y });
const move = (...points) => ({ tag: 'moveTo', points });
const line = (...points) => ({ tag: 'lnTo', points });
const preset = name => '<a:prstGeom prst="' + name + '"><a:avLst/></a:prstGeom>';

function customGeometry(box, commands) {
  const path = commands.map(({ tag, points }) => '<a:' + tag + '>' + points.map(p =>
    '<a:pt x="' + toEmu(p.x - box.x) + '" y="' + toEmu(p.y - box.y) + '"/>',
  ).join('') + '</a:' + tag + '>').join('');
  return '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>' +
    '<a:rect l="l" t="t" r="r" b="b"/><a:pathLst>' +
    '<a:path w="' + toExtent(box.width) + '" h="' + toExtent(box.height) +
    '" fill="none" extrusionOk="0">' + path + '</a:path></a:pathLst></a:custGeom>';
}

function textGeometry(item, alignment, scale, metrics) {
  const font = escaped(Object.hasOwn(FONTS, item.font) ? item.font : 'Arial');
  const size = Math.max(2, Math.round(item.size * scale * 1.5)); // Word font sizes are half-points.
  const lineHeight = item.size * 1.22;
  const leading = Math.max(1, Math.round(lineHeight * scale * 15)); // Twips.
  const content = item.label.split('\n');
  const lines = metrics && item.label ? measureLabel(item, metrics) : [];
  const { top, bottom } = labelInkBounds(lines, lineHeight);
  const fontLine = lines.find(line => line.text.trim());
  const opticalY = fontLine && Number.isFinite(fontLine.fontAscent) && Number.isFinite(fontLine.fontDescent)
    ? (fontLine.fontAscent - fontLine.fontDescent + top + bottom - (lines.length - 1) * lineHeight) / 2 : 0;
  const rise = Math.round(Math.max(-item.size / 4, Math.min(item.size / 4, opticalY)) * scale * 1.5);
  const formatting = '<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:cs="' + font + '"/>' +
    '<w:color w:val="' + COLOR + '"/><w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>';
  const paragraphs = content.map((text, index) => {
    const line = lines.length === content.length ? lines[index] : null;
    const twips = value => Math.round(Math.max(-item.size / 2, Math.min(item.size / 2, value)) * scale * 15);
    const left = line?.text === text ? twips(alignment === 'center'
      ? line.advance + line.left - line.right : alignment === 'left' ? line.left : 0) : 0;
    const right = line?.text === text && alignment === 'right' ? twips(line.right - line.advance) : 0;
    return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="' +
      leading + '" w:lineRule="exact"/>' + (left || right ? '<w:ind w:left="' + left + '" w:right="' + right + '"/>' : '') +
      '<w:jc w:val="' + alignment + '"/><w:rPr>' + formatting +
      '</w:rPr></w:pPr><w:r><w:rPr>' + (rise ? '<w:position w:val="' + rise + '"/>' : '') + formatting +
      '</w:rPr><w:t xml:space="preserve">' + escaped(text) + '</w:t></w:r></w:p>';
  });
  return '<wps:txbx><w:txbxContent>' + paragraphs.join('') + '</w:txbxContent></wps:txbx>';
}

function wordShape(drawing, id, canvas, scale, stroke, metrics) {
  const { box, name, geometry, item, alignment = 'center', textBox = false } = drawing;
  const outline = textBox ? '<a:ln><a:noFill/></a:ln>' :
    '<a:ln w="' + Math.min(20116800, toExtent(stroke * scale)) + '" cap="rnd">' +
    '<a:solidFill><a:srgbClr val="' + COLOR + '"/></a:solidFill><a:round/></a:ln>';
  const offset = '<a:off x="' + toEmu((box.x - canvas.x) * scale) +
    '" y="' + toEmu((box.y - canvas.y) * scale) + '"/>';
  const extent = '<a:ext cx="' + toExtent(box.width * scale) +
    '" cy="' + toExtent(box.height * scale) + '"/>';
  return '<wps:wsp><wps:cNvPr id="' + id + '" name="' + escaped(name) + '"/>' +
    '<wps:cNvSpPr' + (textBox ? ' txBox="1"' : '') + '/><wps:spPr>' +
    '<a:xfrm>' + offset + extent + '</a:xfrm>' + geometry + '<a:noFill/>' + outline +
    '</wps:spPr>' + (item ? textGeometry(item, alignment, scale, metrics) : '') +
    '<wps:bodyPr wrap="square" anchor="ctr" lIns="0" tIns="0" rIns="0" bIns="0">' +
    '<a:noAutofit/></wps:bodyPr></wps:wsp>';
}

function flowDrawing(item, state, metrics) {
  const geometry = arrowGeometry(item, state.items, state.stroke);
  const { start, end, control, wings } = geometry;
  const box = bounds([start, end, ...wings, ...(control ? [control] : [])]);
  const drawing = [];
  let mask;
  if (item.label) {
    const size = metrics ? labelInkSize(measureLabel(item, metrics), item.size) : labelBox(item, { x: 0, y: 0 }, metrics);
    const placement = flowLabelPlacement(item, geometry, state.stroke, size);
    if (size.width && item.label.trim()) mask = flowLabelBox(placement, size, 4 + state.stroke / 2);
    drawing.push({
      box: labelBox(item, placement, metrics),
      name: 'Data flow label', geometry: preset('rect'), item, textBox: true,
      alignment: { start: 'left', middle: 'center', end: 'right' }[placement.anchor],
    });
  }
  const path = visibleFlow(geometry, mask).flatMap(part => [move(part.start),
    part.control ? { tag: 'quadBezTo', points: [part.control, part.end] } : line(part.end)]);
  if (path.length) drawing.unshift({ box, name: TYPES.flow.name, geometry: customGeometry(box, path) });
  return drawing;
}

function nodeDrawing(item, metrics) {
  const name = TYPES[item.kind].name;
  const box = centeredBox(item.x, item.y, item.w, item.h);
  switch (item.kind) {
    case 'entity': return { box, name, geometry: preset('rect'), item };
    case 'process': return { box, name, geometry: preset('ellipse'), item };
    case 'store': {
      const right = box.x + box.width;
      const bottom = box.y + box.height;
      const path = [
        move(point(box.x, box.y)), line(point(right, box.y)),
        move(point(box.x, bottom)), line(point(right, bottom)),
      ];
      return { box, name, geometry: customGeometry(box, path), item };
    }
    default:
      return { box: labelBox(item, item, metrics), name, geometry: preset('rect'), item, textBox: true };
  }
}

function mainDocument(state, items, landscape) {
  const metrics = globalThis.document?.createElement('canvas').getContext('2d');
  const drawings = [
    ...items.filter(item => item.kind === 'flow').flatMap(item => flowDrawing(item, state, metrics)),
    ...items.filter(item => item.kind !== 'flow' && (item.kind !== 'text' || item.label))
      .map(item => nodeDrawing(item, metrics)),
  ];
  const boxes = drawings.map(drawing => drawing.box);
  const canvas = boxes.length ? bounds(boxes, 4 + state.stroke / 2) : bounds([point(0, 0)]);
  const pageWidth = landscape ? PAGE.height : PAGE.width;
  const pageHeight = landscape ? PAGE.width : PAGE.height;
  const availableWidth = (pageWidth - 2 * PAGE.margin) * EMU_PER_TWIP;
  const availableHeight = (pageHeight - 2 * PAGE.margin - 160) * EMU_PER_TWIP;
  const scale = Math.min(1, availableWidth / toExtent(canvas.width), availableHeight / toExtent(canvas.height));
  const cx = toExtent(canvas.width * scale);
  const cy = toExtent(canvas.height * scale);
  const shapes = drawings.map((drawing, index) => wordShape(drawing, index + 2, canvas, scale, state.stroke, metrics));
  const title = escaped(state.title?.trim() || 'Diagram');
  const drawing = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>' +
    '<w:r><mc:AlternateContent><mc:Choice Requires="wpg"><w:drawing>' +
    '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" ' +
    'behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>' +
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:wrapTopAndBottom/><wp:docPr id="1" name="' + title + '"/><wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="' + GROUP + '"><wpg:wgp><wpg:cNvGrpSpPr/>' +
    '<wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="' + cx + '" cy="' + cy + '"/></a:xfrm></wpg:grpSpPr>' +
    shapes.join('') + '</wpg:wgp></a:graphicData></a:graphic>' +
    '</wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r></w:p>';
  const margin = PAGE.margin;
  return XML +
    '<w:document xmlns:w="' + MAIN + '" xmlns:a="' + DRAWING + '" xmlns:wp="' + WORD_DRAWING + '"' +
    ' xmlns:wpg="' + GROUP + '" xmlns:wps="' + OFFICE_WORD + 'wordprocessingShape"' +
    ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="wpg wps">' +
    '<w:body>' + (drawings.length ? drawing : '<w:p/>') + '<w:sectPr>' +
    '<w:pgSz w:w="' + pageWidth + '" w:h="' + pageHeight + '"' +
    (landscape ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="' + margin +
    '" w:right="' + margin + '" w:bottom="' + margin + '" w:left="' + margin +
    '" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return value;
});

function crc32(bytes) {
  let result = 0xffffffff;
  for (const byte of bytes) result = crcTable[(result ^ byte) & 0xff] ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
}

function zipHeader(length, signature) {
  const header = new DataView(new ArrayBuffer(length));
  header.setUint32(0, signature, true);
  return header;
}

// These small XML parts use ZIP's store method, so the browser needs no ZIP library.
function zip(parts) {
  const blocks = [];
  const directory = [];
  const encoder = new TextEncoder();
  let offset = 0;
  let directorySize = 0;
  for (const [path, source] of parts) {
    const name = encoder.encode(path);
    const bytes = encoder.encode(source);
    const crc = crc32(bytes);
    const local = zipHeader(30, 0x04034b50);
    local.setUint16(4, 20, true); // ZIP version 2.0.
    local.setUint16(12, 33, true); // DOS date 1980-01-01.
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    blocks.push(local.buffer, name, bytes);

    const record = zipHeader(46, 0x02014b50);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(14, 33, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, bytes.length, true);
    record.setUint32(24, bytes.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    directory.push(record.buffer, name);
    directorySize += record.byteLength + name.length;
    offset += local.byteLength + name.length + bytes.length;
  }

  const end = zipHeader(22, 0x06054b50);
  end.setUint16(8, parts.length, true);
  end.setUint16(10, parts.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...blocks, ...directory, end.buffer], { type: DOCX });
}

function relationship(type, target) {
  return XML + '<Relationships xmlns="' + PACKAGE + 'relationships">' +
    '<Relationship Id="rId1" Type="' + RELATIONSHIP + '/' + type +
    '" Target="' + target + '"/></Relationships>';
}

export function renderWord(state, items, { landscape = false } = {}) {
  return zip([
    ['[Content_Types].xml', XML + '<Types xmlns="' + PACKAGE + 'content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="' + DOCX + '.main+xml"/>' +
      '<Override PartName="/word/settings.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>'],
    ['_rels/.rels', relationship('officeDocument', 'word/document.xml')],
    ['word/document.xml', mainDocument(state, items, landscape)],
    ['word/_rels/document.xml.rels', relationship('settings', 'settings.xml')],
    ['word/settings.xml', XML + '<w:settings xmlns:w="' + MAIN + '"><w:compat>' +
      '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
      '</w:compat></w:settings>'],
  ]);
}
