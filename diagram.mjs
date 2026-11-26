export const TYPES = {
  entity: { name: 'External entity', shortcut: 'E', w: 156, h: 78 },
  process: { name: 'Process', shortcut: 'P', w: 132, h: 132 },
  store: { name: 'Data store', shortcut: 'D', w: 176, h: 50 },
  flow: { name: 'Data flow', shortcut: 'A' },
  text: { name: 'Text', shortcut: 'T', w: 140, h: 36 },
};

export const FONTS = {
  Arial: 'Arial, sans-serif',
  Georgia: 'Georgia, serif',
  'Times New Roman': '"Times New Roman", serif',
  'Courier New': '"Courier New", monospace',
};

export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const GRID_SIZE = 22;

export function gridPoint({ x, y }) {
  const snap = value => Math.round(value / GRID_SIZE) * GRID_SIZE || 0;
  return { x: snap(x), y: snap(y) };
}

export const isDiagramShape = item => item.kind !== 'flow' && item.kind !== 'text';

export function marqueeBox(start, end) {
  return {
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
  };
}

export function itemsInMarquee(box, bounds, base) {
  const selected = new Set(base);
  for (const [id, item] of bounds) {
    if (item.x >= box.x && item.y >= box.y &&
      item.x + item.width <= box.x + box.width &&
      item.y + item.height <= box.y + box.height) selected.add(id);
  }
  return selected;
}

function withPositions(items, axis, shapes, centers) {
  const changes = new Map();
  shapes.forEach((item, index) => {
    if (Math.abs(item[axis] - centers[index]) > 1e-7) {
      changes.set(item.id, { ...item, [axis]: centers[index] });
    }
  });
  return changes.size ? items.map(item => changes.get(item.id) ?? item) : items;
}

export function alignShapes(items, selected, axis, anchor) {
  const shapes = items.filter(item => selected.has(item.id) && isDiagramShape(item));
  if (shapes.length < 2) return items;
  const dimension = axis === 'x' ? 'w' : 'h';
  const first = Math.min(...shapes.map(item => item[axis] - item[dimension] / 2));
  const last = Math.max(...shapes.map(item => item[axis] + item[dimension] / 2));
  const centers = shapes.map(item => {
    if (anchor === 'start') return first + item[dimension] / 2;
    if (anchor === 'end') return last - item[dimension] / 2;
    return (first + last) / 2;
  });
  return withPositions(items, axis, shapes, centers);
}

export function distributeShapes(items, selected, axis) {
  const shapes = items.filter(item => selected.has(item.id) && isDiagramShape(item))
    .sort((a, b) => a[axis] - b[axis]);
  if (shapes.length < 3) return items;
  const dimension = axis === 'x' ? 'w' : 'h';
  const first = shapes[0];
  const last = shapes.at(-1);
  const start = first[axis] - first[dimension] / 2;
  const end = last[axis] + last[dimension] / 2;
  const size = shapes.reduce((sum, item) => sum + item[dimension], 0);
  const gap = Math.max(12, (end - start - size) / (shapes.length - 1));
  const span = size + gap * (shapes.length - 1);
  let cursor = (start + end - span) / 2;
  const centers = shapes.map(item => {
    const center = cursor + item[dimension] / 2;
    cursor += item[dimension] + gap;
    return center;
  });
  return withPositions(items, axis, shapes, centers);
}

export function endpointPosition(endpoint, items) {
  return endpoint.node ? items.find(item => item.id === endpoint.node) : endpoint;
}

export function snapEndpoint(point, items, tolerance = 0, excludedNode) {
  let closest;
  let bestDistance = tolerance;
  for (const item of items) {
    if (item.id === excludedNode || !isDiagramShape(item)) continue;
    const dx = Math.abs(point.x - item.x);
    const dy = Math.abs(point.y - item.y);
    const rx = item.w / 2;
    const ry = item.h / 2;
    const distance = item.kind === 'process'
      ? Math.hypot(dx, dy) * Math.max(0, 1 - 1 / Math.hypot(dx / rx, dy / ry))
      : Math.hypot(Math.max(0, dx - rx), Math.max(0, dy - ry));
    if (distance <= bestDistance) {
      closest = item.id;
      bestDistance = distance;
    }
  }
  return closest ? { node: closest } : { x: point.x, y: point.y };
}

function boundary(point, toward) {
  if (!point.w) return { x: point.x, y: point.y };
  const rx = point.w / 2;
  const ry = point.h / 2;
  const dx = toward.x - point.x || (toward.y === point.y ? 1 : 0);
  const dy = toward.y - point.y;
  const factor = point.kind === 'process'
    ? 1 / Math.hypot(dx / rx, dy / ry)
    : 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
  return { x: point.x + dx * factor, y: point.y + dy * factor };
}

export function arrowGeometry(flow, items, stroke) {
  const from = endpointPosition(flow.from, items);
  const to = endpointPosition(flow.to, items);
  const control = flow.control;
  const start = boundary(from, control ?? to);
  const end = boundary(to, control ?? from);
  const middle = midpoint(start, end);
  const center = control ? midpoint(middle, control) : middle;
  const tangent = control ?? start;
  const angle = Math.atan2(end.y - tangent.y, end.x - tangent.x);
  const length = 8 + stroke * 1.7;
  const wings = [-0.48, 0.48].map(offset => ({
    x: end.x - length * Math.cos(angle + offset),
    y: end.y - length * Math.sin(angle + offset),
  }));
  const path = 'M ' + start.x + ' ' + start.y + (control
    ? ' Q ' + control.x + ' ' + control.y + ' '
    : ' L ') + end.x + ' ' + end.y;
  return { start, end, center, wings, path };
}

function curvedLabelPosition(control, geometry, stroke, box) {
  const { start, end, center, wings } = geometry;
  const chord = { x: end.x - start.x, y: end.y - start.y };
  const middle = midpoint(start, end);
  const bulge = { x: control.x - middle.x, y: control.y - middle.y };
  const length = Math.hypot(chord.x, chord.y);
  const normal = length ? { x: -chord.y / length, y: chord.x / length } : bulge;
  const magnitude = Math.hypot(normal.x, normal.y);
  let nx = magnitude ? normal.x / magnitude : 0;
  let ny = magnitude ? normal.y / magnitude : -1;
  const direction = nx * bulge.x + ny * bulge.y;
  if (direction < -1e-7 || (Math.abs(direction) <= 1e-7 && (ny > 0 || (ny === 0 && nx < 0)))) {
    nx = -nx;
    ny = -ny;
  }
  // A quadratic lies on the inner side of its midpoint tangent. Project the
  // label bounds and arrowhead onto the outer normal to clear both.
  const radius = (Math.abs(nx) * box.width + Math.abs(ny) * box.height) / 2;
  const head = Math.max(0, ...wings.map(point => (point.x - center.x) * nx + (point.y - center.y) * ny));
  const gap = 6 + stroke / 2 + radius + head;
  return { x: center.x + nx * gap, y: center.y + ny * gap, anchor: 'middle' };
}

export function flowLabelPlacement(item, geometry, stroke, box) {
  const { start, end, center } = geometry;
  let placement;
  if (item.control) {
    placement = curvedLabelPosition(item.control, geometry, stroke, box);
  } else if (Math.abs(end.y - start.y) > Math.abs(end.x - start.x)) {
    placement = { x: center.x + 10, y: center.y, anchor: 'start' };
  } else {
    const offset = item.label.split('\n').length * item.size * 0.62 + stroke + 4;
    placement = { x: center.x, y: center.y - offset, anchor: 'middle' };
  }
  return {
    x: placement.x + (item.labelOffset?.x ?? 0),
    y: placement.y + (item.labelOffset?.y ?? 0),
    anchor: placement.anchor,
  };
}

export function withCurve(flow, curved, items) {
  if (!curved) return { ...flow, control: null };
  if (flow.control) return flow;
  const from = endpointPosition(flow.from, items);
  const to = endpointPosition(flow.to, items);
  const center = midpoint(from, to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(105, Math.max(55, length * 0.38));
  return {
    ...flow,
    control: { x: center.x + dy / length * bend, y: center.y - dx / length * bend },
  };
}

export function removeItems(items, ids) {
  return items.filter(item => !ids.has(item.id) && (item.kind !== 'flow' ||
    (!ids.has(item.from.node) && !ids.has(item.to.node))));
}

export function sampleDiagram() {
  const label = (id, kind, x, y, text, dimensions = {}) => ({
    id, kind, x, y, label: text, font: 'Arial', size: 16,
    w: TYPES[kind].w, h: TYPES[kind].h, ...dimensions,
  });
  const flow = (id, from, to, text, control = null) => ({
    id, kind: 'flow', from: { node: from }, to: { node: to }, label: text,
    font: 'Arial', size: 14, control,
  });
  return {
    title: 'Order processing',
    stroke: 2,
    items: [
      label('customer', 'entity', -267, -67, 'Πελάτης'),
      label('order', 'process', 0, -67, '1.0\nΕπεξεργασία\nπαραγγελίας', { w: 152, h: 152 }),
      label('warehouse', 'entity', 267, -67, 'Αποθήκη'),
      label('records', 'store', 0, 151, 'Παραγγελίες', { w: 200 }),
      flow('request', 'customer', 'order', 'Νέα παραγγελία'),
      flow('dispatch', 'order', 'warehouse', 'Εντολή αποστολής', { x: 140, y: -143 }),
      flow('record', 'order', 'records', 'Στοιχεία', { x: -78, y: 58 }),
      flow('status', 'records', 'order', 'Κατάσταση', { x: 84, y: 62 }),
    ],
  };
}
