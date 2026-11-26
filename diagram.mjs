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

export function endpointPosition(endpoint, items) {
  return endpoint.node ? items.find(item => item.id === endpoint.node) : endpoint;
}

export function snapEndpoint(point, items, tolerance = 0, excludedNode) {
  let closest;
  let bestDistance = tolerance;
  for (const item of items) {
    if (item.id === excludedNode || item.kind === 'flow' || item.kind === 'text') continue;
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

export function flowLabelPlacement(item, geometry, stroke) {
  const { start, end, center } = geometry;
  if (Math.abs(end.y - start.y) > Math.abs(end.x - start.x)) {
    const left = center.x < midpoint(start, end).x;
    return { x: center.x + (left ? -10 : 10), y: center.y, anchor: left ? 'end' : 'start' };
  }
  const offset = item.label.split('\n').length * item.size * 0.62 + stroke + 4;
  return { x: center.x, y: center.y - offset, anchor: 'middle' };
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
