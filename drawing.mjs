import { arrowGeometry, flowLabelPlacement, flowLabelPosition, FONTS, isDiagramShape, isStateMarker, programCoupleGeometry, segmentPath, stateCorner, visibleFlow } from './diagram.mjs';

const SVG = 'http://www.w3.org/2000/svg';
export const INK = '#25324a';

export function svg(tag, attrs = {}, ...children) {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.append(...children);
  return element;
}

let textContext;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function wrapLabel(text, width, measure) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const [, space, word] of paragraph.matchAll(/(\s*)(\S+)/gu)) {
      const candidate = line ? line + space + word : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      if (measure(word) <= width) continue;
      line = '';
      for (const { segment } of graphemes.segment(word)) {
        if (line && measure(line + segment) > width) {
          lines.push(line);
          line = '';
        }
        line += segment;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function labelInkBounds(lines, leading) {
  let top = Infinity;
  let bottom = -Infinity;
  let width = 0;
  for (const [index, line] of lines.entries()) {
    if (!line.text.trim()) continue;
    top = Math.min(top, index * leading - line.ascent);
    bottom = Math.max(bottom, index * leading + line.descent);
    width = Math.max(width, line.left + line.right);
  }
  return { top, bottom, width };
}

export function centerLabelLines(lines, x, y, leading, anchor) {
  const { top, bottom } = labelInkBounds(lines, leading);
  const center = Number.isFinite(top) ? (top + bottom) / 2 : (lines.length - 1) * leading / 2;
  return lines.map((line, index) => ({
    text: line.text,
    x: x + (anchor === 'start' ? line.left : anchor === 'end' ? -line.right : (line.left - line.right) / 2),
    y: y - center + index * leading,
  }));
}

export function measureLabel(item, context, includeWords = false) {
  const font = FONTS[item.font] ?? FONTS.Arial;
  context ??= (textContext ??= globalThis.document?.createElement('canvas').getContext('2d'));
  if (context) context.font = item.size + 'px ' + font;
  const approximateWidth = text => [...text].length * item.size * 0.7;
  const advance = text => context ? context.measureText(text).width : approximateWidth(text);
  const measure = text => {
    if (!context) return { text, left: 0, right: approximateWidth(text), ascent: item.size * 0.8, descent: item.size * 0.2 };
    const measured = context.measureText(text);
    return {
      text, left: measured.actualBoundingBoxLeft, right: measured.actualBoundingBoxRight,
      ascent: measured.actualBoundingBoxAscent, descent: measured.actualBoundingBoxDescent,
      advance: measured.width, fontAscent: measured.fontBoundingBoxAscent, fontDescent: measured.fontBoundingBoxDescent,
    };
  };
  const content = context && isDiagramShape(item)
    ? wrapLabel(item.label, (item.kind === 'process' ? item.w * 0.8 : item.w) - 14, advance)
    : item.label.split('\n');
  return content.map(text => {
    const line = measure(text);
    if (includeWords) {
      line.words = Array.from(text.matchAll(/\S+/gu), match => ({
        ...measure(match[0]), offset: match.index ? advance(text.slice(0, match.index)) : 0,
      })).filter(word => word.left + word.right > 0);
    }
    return line;
  });
}

export function labelInkSize(metrics, size) {
  const { top, bottom, width } = labelInkBounds(metrics, size * 1.22);
  return { width, height: Math.max(0, bottom - top) };
}

export function flowLabelBox({ x, y, anchor }, { width, height }, padding) {
  const left = x - width * (anchor === 'start' ? 0 : anchor === 'end' ? 1 : 0.5);
  return { x: left - padding, y: y - height / 2 - padding, width: width + 2 * padding, height: height + 2 * padding };
}

export function flowLabelWordBoxes({ x, y, anchor }, metrics, size, stroke) {
  const lines = centerLabelLines(metrics, x, y, size * 1.22, anchor);
  const padX = 1.25 + stroke / 2;
  const padY = 0.75 + stroke / 2;
  return metrics.flatMap((ink, index) => ink.words.map(word => ({
    x: lines[index].x + word.offset - word.left - padX,
    y: lines[index].y - word.ascent - padY,
    width: word.left + word.right + padX * 2,
    height: word.ascent + word.descent + padY * 2,
  })));
}

export function flowLabelCenter(item, geometry, stroke) {
  const size = labelInkSize(measureLabel(item), item.size);
  const box = flowLabelBox(flowLabelPlacement(item, geometry, stroke, size), size, 0);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function normalizeFlowLabels(items, stroke) {
  return items.map(item => {
    if (item.kind !== 'flow' || !item.labelOffset || item.labelPosition) return item;
    const geometry = arrowGeometry(item, items, stroke);
    const center = flowLabelCenter(item, geometry, stroke);
    return { ...item, labelOffset: null, labelPosition: flowLabelPosition(geometry, center) };
  });
}

function label(item, x, y, anchor = 'middle', metrics = measureLabel(item)) {
  const lines = centerLabelLines(metrics, x, y, item.size * 1.22, anchor);
  return svg('text', {
    fill: INK, 'font-family': FONTS[item.font] ?? FONTS.Arial,
    'font-size': item.size, 'xml:space': 'preserve',
  }, ...lines.map(line => svg('tspan', { x: line.x, y: line.y }, line.text)));
}

function shape(item, attrs) {
  const { x, y, w, h } = item;
  const left = x - w / 2;
  const top = y - h / 2;
  if (item.kind === 'entity' || item.kind === 'state' || item.kind === 'module') return svg('rect', {
    x: left, y: top, width: w, height: h, rx: item.kind === 'state' ? stateCorner(item) : 0, ...attrs,
  });
  if (item.kind === 'process') return svg('ellipse', { cx: x, cy: y, rx: w / 2, ry: h / 2, ...attrs });
  if (isStateMarker(item)) {
    const dot = svg('circle', { cx: x, cy: y, r: Math.min(w, h) * (item.kind === 'initial' ? 0.29 : 0.23),
      fill: attrs.stroke, 'pointer-events': attrs['pointer-events'] ?? 'none' });
    return item.kind === 'initial' ? dot : svg('g', {}, dot,
      svg('circle', { cx: x, cy: y, r: Math.min(w, h) * 0.43, ...attrs }));
  }
  return svg('path', { d: 'M ' + left + ' ' + top + ' h ' + w + ' M ' + left + ' ' + (top + h) + ' h ' + w, ...attrs });
}

export function programCoupleLabelPlacement({ center, outward }, { width, height }) {
  const normalX = Math.abs(outward.x);
  const normalY = Math.abs(outward.y);
  const gap = 7;
  // Keep the label centered on the arrow's dominant screen axis.
  if (normalX >= normalY) {
    return { x: center.x + (gap + normalY * height / 2) / outward.x, y: center.y,
      anchor: outward.x < 0 ? 'end' : 'start' };
  }
  return { x: center.x, y: center.y + (gap + normalX * width / 2 + normalY * height / 2) / outward.y,
    anchor: 'middle' };
}

function drawProgramCall(group, item, geometry, stroke) {
  group.append(svg('path', { d: geometry.path, ...stroke }));
  if (Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y) < 1) return;
  group.append(svg('polygon', {
    points: [geometry.end, ...geometry.wings].map(point => point.x + ',' + point.y).join(' '), fill: stroke.stroke,
  }));
  const couples = [
    { direction: 'pass', label: item.outgoingData, side: item.outgoingSide || 'left' },
    { direction: 'return', label: item.incomingData, side: item.incomingSide || (item.outgoingData?.trim() ? 'right' : 'left') },
  ];
  const inset = 11 + stroke['stroke-width'] / 2;
  const lanes = { left: inset, right: inset };
  for (const couple of couples) {
    if (!couple.label?.trim()) continue;
    const { side } = couple;
    const { start, end, axis, outward, center, half } = programCoupleGeometry(geometry, couple.direction, side, lanes[side]);
    const radius = Math.min(4, half * 0.36);
    const head = Math.min(8, half * 0.7);
    const startOfShaft = { x: start.x + axis.x * radius, y: start.y + axis.y * radius };
    const headBase = { x: end.x - axis.x * head, y: end.y - axis.y * head };
    const wings = [-0.55, 0.55].map(side => ({
      x: headBase.x + outward.x * side * head, y: headBase.y + outward.y * side * head,
    }));
    group.append(svg('g', { 'data-couple': couple.direction },
      svg('path', { d: segmentPath({ start: startOfShaft, end: headBase }), ...stroke }),
      svg('circle', { cx: start.x, cy: start.y, r: radius, ...stroke }),
      svg('polygon', { points: [end, ...wings].map(point => point.x + ',' + point.y).join(' '), fill: stroke.stroke }),
    ));
    const annotation = { ...item, label: couple.label };
    const metrics = measureLabel(annotation);
    const { width, height } = labelInkSize(metrics, annotation.size);
    const placement = programCoupleLabelPlacement({ center, outward }, { width, height });
    group.append(label(annotation, placement.x, placement.y, placement.anchor, metrics));
    lanes[side] += 18 + Math.abs(outward.x) * width + Math.abs(outward.y) * height;
  }
}

export function drawItem(item, state, selected = false, interactive = false, zoom = 1) {
  const isFlow = item.kind === 'flow';
  const group = svg('g', interactive ? {
    'data-item': item.id, class: 'item', 'aria-label': item.label || item.kind,
  } : {});
  const stroke = {
    stroke: selected ? '#634de1' : INK, 'stroke-width': state.stroke, fill: 'none',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  };
  if (isFlow) {
    const g = arrowGeometry(item, state.items, state.stroke);
    const transition = item.notation === 'sfd';
    if (interactive) group.append(svg('path', {
      d: g.path, stroke: 'transparent', 'stroke-width': Math.max(14 / zoom, state.stroke),
      fill: 'none', 'pointer-events': 'stroke',
    }));
    if (item.notation === 'psd') {
      drawProgramCall(group, item, g, stroke);
      return group;
    }
    let masks;
    let annotation;
    let geometry = transition ? { ...g, wings: [] } : g;
    let transform;
    if (item.label) {
      const metrics = measureLabel(item, undefined, true);
      const size = labelInkSize(metrics, item.size);
      const placement = flowLabelPlacement(item, g, state.stroke, size);
      const { x, y, anchor, angle } = placement;
      if (angle) {
        transform = 'rotate(' + angle + ' ' + x + ' ' + y + ')';
        const rad = angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const local = point => {
          const dx = point.x - x;
          const dy = point.y - y;
          return { x: x + cos * dx + sin * dy, y: y - sin * dx + cos * dy };
        };
        geometry = { start: local(g.start), end: local(g.end), control: g.control && local(g.control), wings: [] };
      }
      const text = label(item, x, y, anchor, metrics);
      masks = flowLabelWordBoxes(placement, metrics, item.size, state.stroke);
      const hit = interactive && size.width
        ? svg('rect', { ...flowLabelBox(placement, size, 4 / zoom), fill: 'transparent' })
        : null;
      annotation = svg('g', { ...(hit && { 'data-flow-label': '' }), ...(transform && { transform }) },
        ...(hit ? [hit, text] : [text]));
    }
    const path = visibleFlow(geometry, masks).map(segmentPath).join(' ');
    if (path) group.append(svg('path', { d: path, ...stroke, ...(transform && { transform }) }));
    if (transition) group.append(svg('polygon', {
      points: [g.end, ...g.wings].map(point => point.x + ',' + point.y).join(' '), fill: stroke.stroke,
    }));
    if (annotation) group.append(annotation);
    return group;
  }
  if (interactive && (item.kind === 'store' || item.kind === 'text')) group.append(svg('rect', {
    x: item.x - item.w / 2, y: item.y - item.h / 2, width: item.w, height: item.h, fill: 'transparent',
  }));
  if (item.kind !== 'text') {
    group.append(shape(item, { ...stroke, ...(interactive && item.kind !== 'store' ? { 'pointer-events': 'all' } : {}) }));
  }
  if (item.label && !isStateMarker(item)) group.append(label(item, item.x, item.y));
  if (selected && item.kind === 'text') {
    group.append(svg('rect', {
      x: item.x - item.w / 2, y: item.y - item.h / 2, width: item.w, height: item.h,
      fill: 'none', stroke: '#634de1', 'stroke-dasharray': '4 4', 'pointer-events': 'none',
    }));
  }
  return group;
}

export function drawItems(layer, state, items, selected = new Set(), interactive = false, zoom = 1) {
  const ordered = [...items.filter(item => item.kind === 'flow'), ...items.filter(item => item.kind !== 'flow')];
  layer.replaceChildren(...ordered.map(item => drawItem(item, state, selected.has(item.id), interactive, zoom)));
}

export function imageBounds(state, items) {
  const stage = svg('svg', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;visibility:hidden;' });
  const layer = svg('g');
  stage.append(layer);
  document.body.append(stage);
  try {
    drawItems(layer, state, items);
    const { x, y, width, height } = layer.getBBox();
    return { x, y, width, height };
  } finally {
    stage.remove();
  }
}

export async function renderPng(state, items) {
  const box = imageBounds(state, items);
  const padding = Math.ceil(12 + state.stroke);
  const width = Math.ceil(box.width) + padding * 2;
  const height = Math.ceil(box.height) + padding * 2;
  const picture = svg('svg', { width, height, viewBox: [box.x - padding, box.y - padding, width, height].join(' ') });
  drawItems(picture, state, items);
  const source = new XMLSerializer().serializeToString(picture);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, 4096 / Math.max(width, height));
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width * scale, height * scale);
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not encode PNG')), 'image/png',
    ));
  } finally {
    URL.revokeObjectURL(url);
  }
}
