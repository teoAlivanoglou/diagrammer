export const TYPES = {
  entity: { name: 'External entity', shortcut: 'E', w: 156, h: 78 },
  process: { name: 'Process', shortcut: 'P', w: 132, h: 132 },
  store: { name: 'Data store', shortcut: 'D', w: 176, h: 50 },
  flow: { name: 'Data flow', shortcut: 'A' },
  state: { name: 'State', shortcut: 'S', w: 160, h: 65 },
  initial: { name: 'Start state', shortcut: 'I', w: 24, h: 24 },
  final: { name: 'End state', shortcut: 'F', w: 24, h: 24 },
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

export function shortcutKey({ key, code }) {
  if (/^\p{Letter}$/u.test(key) && !/^[a-z]$/i.test(key) && /^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  return key.toLowerCase();
}

export function gridPoint({ x, y }) {
  const snap = value => Math.round(value / GRID_SIZE) * GRID_SIZE || 0;
  return { x: snap(x), y: snap(y) };
}

export const isDiagramShape = item => item.kind !== 'flow' && item.kind !== 'text';
export const isStateMarker = item => item.kind === 'initial' || item.kind === 'final';
export const isStateShape = item => item.kind === 'state' || isStateMarker(item);
export const isStateLoop = item => item.notation === 'sfd' && item.from?.node && item.from.node === item.to.node;
export const stateCorner = item => Math.min(12, item.w / 5, item.h / 5);
const isEllipse = item => item.kind === 'process' || isStateMarker(item);
const radii = item => {
  if (!isStateMarker(item)) return { rx: item.w / 2, ry: item.h / 2 };
  const radius = Math.min(item.w, item.h) * (item.kind === 'initial' ? 0.29 : 0.43);
  return { rx: radius, ry: radius };
};

export function stateLoop(node) {
  return {
    from: { node, anchor: { side: 'top', offset: -0.38 } },
    to: { node, anchor: { side: 'top', offset: 0.38 } },
    control: { t: 0.5, offset: -106 },
  };
}

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

export function snapEndpoint(point, items, tolerance = 0, excludedNode, accept = isDiagramShape) {
  let closest;
  let bestDistance = tolerance;
  for (const item of items) {
    if (item.id === excludedNode || !accept(item)) continue;
    const dx = Math.abs(point.x - item.x);
    const dy = Math.abs(point.y - item.y);
    const { rx, ry } = radii(item);
    const corner = item.kind === 'state' ? stateCorner(item) : 0;
    const distance = isEllipse(item)
      ? Math.hypot(dx, dy) * Math.max(0, 1 - 1 / Math.hypot(dx / rx, dy / ry))
      : Math.max(0, Math.hypot(Math.max(0, dx - rx + corner), Math.max(0, dy - ry + corner)) - corner);
    if (distance <= bestDistance) {
      closest = item.id;
      bestDistance = distance;
    }
  }
  if (!closest) return { x: point.x, y: point.y };
  const node = items.find(item => item.id === closest);
  if (node.kind === 'store' && Math.abs(point.y - node.y) >= node.h / 4) {
    return { node: closest, side: point.y < node.y ? 'top' : 'bottom' };
  }
  return { node: closest };
}

function port(node, toward, side) {
  if (!node.w || isStateMarker(node)) return { point: { x: node.x, y: node.y }, normal: null };
  const { rx, ry } = radii(node);
  const dx = toward.x - node.x || (toward.y === node.y ? 1 : 0);
  const dy = toward.y - node.y;
  if (node.kind === 'store') {
    const vertical = side ? (side === 'top' ? -1 : 1) : (dy > ry ? 1 : -1);
    const x = Math.max(-rx, Math.min(rx, Math.abs(dy) > 1e-7 ? dx * ry / Math.abs(dy) : Math.sign(dx) * rx));
    return { point: { x: node.x + x, y: node.y + vertical * ry }, normal: { x: 0, y: vertical } };
  }
  if (isEllipse(node)) {
    const factor = 1 / Math.hypot(dx / rx, dy / ry);
    const normal = unit({ x: dx / rx ** 2, y: dy / ry ** 2 });
    return { point: { x: node.x + dx * factor, y: node.y + dy * factor }, normal };
  }
  const horizontal = Math.abs(dx) / rx >= Math.abs(dy) / ry;
  const factor = horizontal ? rx / Math.abs(dx) : ry / Math.abs(dy);
  if (node.kind === 'state') {
    const side = horizontal ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
    return pinnedPort(node, { side, offset: horizontal ? dy * factor / ry : dx * factor / rx });
  }
  return { point: { x: node.x + dx * factor, y: node.y + dy * factor },
    normal: horizontal ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) } };
}

const edgeNormals = {
  top: { x: 0, y: -1 }, right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};
const EDGE_SNAP_STEP = 20;
const PROCESS_SNAP_STEP = Math.PI / 12;

function pinnedPort(node, anchor) {
  const { rx, ry } = radii(node);
  if (isEllipse(node)) {
    const x = Math.cos(anchor.angle);
    const y = Math.sin(anchor.angle);
    return { point: { x: node.x + rx * x, y: node.y + ry * y }, normal: unit({ x: x / rx, y: y / ry }) };
  }
  const normal = edgeNormals[anchor.side];
  const radius = normal.x ? ry : rx;
  const slide = anchor.offset * radius;
  const inset = node.kind === 'state' ? radius - stateCorner(node) : radius;
  const offset = Math.max(-inset, Math.min(inset, slide));
  return { point: {
    x: node.x + (normal.x ? rx * normal.x : offset),
    y: node.y + (normal.y ? ry * normal.y : offset),
  }, normal };
}

export function pinAttachment(node, point, magnet = 0) {
  if (isStateMarker(node)) return { node: node.id };
  const { rx, ry } = radii(node);
  let anchor;
  if (isEllipse(node)) {
    const angle = Math.atan2((point.y - node.y) / ry, (point.x - node.x) / rx);
    const snapped = Math.round(angle / PROCESS_SNAP_STEP) * PROCESS_SNAP_STEP || 0;
    const gap = Math.hypot(rx * (Math.cos(angle) - Math.cos(snapped)), ry * (Math.sin(angle) - Math.sin(snapped)));
    anchor = { angle: gap <= magnet && Math.abs(angle - snapped) <= PROCESS_SNAP_STEP / 3 ? snapped : angle };
  } else {
    const dx = point.x - node.x;
    const dy = point.y - node.y;
    const sides = node.kind === 'store' ? ['top', 'bottom'] : Object.keys(edgeNormals);
    let nearest = Infinity;
    for (const side of sides) {
      const horizontal = edgeNormals[side].y !== 0;
      const along = horizontal ? dx : dy;
      const radius = horizontal ? rx : ry;
      const offset = Math.max(-1, Math.min(1, along / radius));
      const candidate = { side, offset };
      const boundary = pinnedPort(node, candidate).point;
      const distance = Math.hypot(point.x - boundary.x, point.y - boundary.y);
      if (distance >= nearest) continue;
      nearest = distance;
      const snapped = Math.round(along / EDGE_SNAP_STEP) * EDGE_SNAP_STEP;
      if (radius - Math.abs(snapped) >= EDGE_SNAP_STEP &&
          Math.abs(along - snapped) <= Math.min(magnet, EDGE_SNAP_STEP / 3)) {
        candidate.offset = snapped / radius || 0;
      }
      anchor = candidate;
    }
  }
  return { node: node.id, anchor };
}

function basePorts(from, to, flow) {
  const loop = isStateLoop(flow) && from.kind === 'state' ? stateLoop(from.id) : null;
  const fromPin = !isStateMarker(from) && (flow.from.anchor ?? loop?.from.anchor);
  const toPin = !isStateMarker(to) && (flow.to.anchor ?? loop?.to.anchor);
  const aPin = fromPin && pinnedPort(from, fromPin);
  const bPin = toPin && pinnedPort(to, toPin);
  let a = aPin || port(from, bPin?.point ?? to, flow.from.side);
  let b = bPin || port(to, aPin?.point ?? from, flow.to.side);
  if (!aPin && !bPin) {
    if (from.kind === 'store' && to.kind !== 'store') b = port(to, a.point, flow.to.side);
    if (to.kind === 'store' && from.kind !== 'store') a = port(from, b.point, flow.from.side);
  }
  return [a, b];
}

const pairedFlows = new WeakMap();

function siblingFlows(flow, items) {
  if (flow.kind !== 'flow' || !flow.from.node || !flow.to.node || !flow.id) return [];
  const pairKey = item => JSON.stringify([item.from.node, item.to.node].sort());
  let pairs = pairedFlows.get(items);
  if (!pairs) {
    pairs = new Map();
    for (const item of items) {
      if (item.kind !== 'flow' || !item.from.node || !item.to.node) continue;
      const key = pairKey(item);
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(item);
    }
    pairedFlows.set(items, pairs);
  }
  return pairs.get(pairKey(flow)) ?? [];
}

function spreadPort(node, attachment, laneAxis, index, count, spacing) {
  if (count < 2) return attachment;
  const { point, normal } = attachment;
  const lane = index - (count - 1) / 2;
  if (isEllipse(node)) {
    const { rx, ry } = radii(node);
    const angle = Math.atan2((point.y - node.y) / ry, (point.x - node.x) / rx);
    const tangent = { x: -rx * Math.sin(angle), y: ry * Math.cos(angle) };
    const sign = dot(tangent, laneAxis) >= 0 ? 1 : -1;
    const step = Math.min(spacing / Math.hypot(tangent.x, tangent.y), Math.PI * 0.78 / (count - 1));
    return port(node, { x: node.x + rx * Math.cos(angle + sign * lane * step),
      y: node.y + ry * Math.sin(angle + sign * lane * step) });
  }
  const axis = normal.x ? 'y' : 'x';
  const radius = (axis === 'x' ? node.w : node.h) / 2;
  const usable = radius - (node.kind === 'state' ? stateCorner(node) : Math.min(2, radius * 0.1));
  const step = Math.min(spacing, 2 * usable / (count - 1));
  const excursion = step * (count - 1) / 2;
  const middle = Math.max(node[axis] - usable + excursion, Math.min(node[axis] + usable - excursion, point[axis]));
  const sign = laneAxis[axis] >= 0 ? 1 : -1;
  return { point: { ...point, [axis]: middle + sign * lane * step }, normal };
}

function separatedPorts(flow, items, from, to, a, b, stroke) {
  const siblings = siblingFlows(flow, items);
  if (from === to || siblings.length < 2 || !siblings.some(item => item.id === flow.id)) return [a, b];
  const forward = flow.from.node < flow.to.node;
  const first = forward ? from : to;
  const second = forward ? to : from;
  const axis = chordFrame(first, second).normal;
  const spacing = Math.max(16, 10 + 2 * stroke);
  const peers = siblings.map(item => {
    const source = item.from.node === flow.from.node ? from : to;
    const target = source === from ? to : from;
    const ports = item.id === flow.id ? [a, b] : basePorts(source, target, item);
    const bend = (item.from.node === first.id ? 1 : -1) * (item.control?.offset ?? 0);
    const peer = item.id === flow.id ? flow : item;
    const ends = [peer.from, peer.to];
    return { id: item.id, bend, ports: source === from ? ports : ports.reverse(),
      ends: source === from ? ends : ends.reverse() };
  }).sort((l, r) => l.bend - r.bend || l.id.localeCompare(r.id));
  return [[from, a], [to, b]].map(([node, attachment], end) => {
    if (isStateMarker(node) || (end === 0 ? flow.from : flow.to).anchor) return attachment;
    const lanes = peers.filter(peer => isEllipse(node) ||
      (peer.ports[end].normal.x === attachment.normal.x && peer.ports[end].normal.y === attachment.normal.y));
    const index = lanes.findIndex(peer => peer.id === flow.id);
    const separated = spreadPort(node, attachment, axis, index, lanes.length, spacing);
    const pinned = lanes.filter(peer => peer.ends[end].anchor).map(peer => peer.ports[end].point);
    if (!pinned.length) return separated;
    const clearance = port => Math.min(...pinned.map(point => Math.hypot(port.point.x - point.x, port.point.y - point.y)));
    if (clearance(separated) >= spacing / 2) return separated;
    let best = separated;
    for (let lane = 0; lane < lanes.length; lane++) {
      if (lane !== index && !lanes[lane].ends[end].anchor) continue;
      const candidate = spreadPort(node, attachment, axis, lane, lanes.length, spacing);
      if (clearance(candidate) > clearance(best)) best = candidate;
    }
    return best;
  });
}

function flowPorts(flow, items, curved = Boolean(flow.control), stroke = 2) {
  const from = endpointPosition(flow.from, items);
  const to = endpointPosition(flow.to, items);
  let [a, b] = basePorts(from, to, flow);
  [a, b] = separatedPorts(flow, items, from, to, a, b, stroke);
  const startMarker = isStateMarker(from) ? from : null;
  const endMarker = isStateMarker(to) ? to : null;
  const startPinned = !startMarker && flow.from.anchor;
  const endPinned = !endMarker && flow.to.anchor;
  let manualPortsAdjusted = false;
  const ports = () => ({ start: a.point, end: b.point, startNormal: a.normal, endNormal: b.normal,
    startMarker, endMarker, manualPortsAdjusted });
  const feasible = limitT => constrainControl(midpoint(a.point, b.point), ports(), limitT);
  if (curved && !feasible(true)) {
    if (startPinned || endPinned) {
      if (feasible(false)) return ports();
      // A free endpoint needs no special handling. An automatic port can turn
      // to face the same way as a pin so the two outward openings intersect.
      if (startPinned && !endPinned && to.w) b = portFacing(to, a.normal);
      if (endPinned && !startPinned && from.w) a = portFacing(from, b.normal);
      if (feasible(false)) return ports();
      manualPortsAdjusted = true;
    }
    // Overlapping shapes can make facing ports incompatible. Use a common
    // outside face so even an overlapping pair has a feasible quadratic.
    const outside = (node, bias) => {
      if (!node.w) return port(node, node);
      if (node.kind === 'store') {
        return { point: { x: node.x + bias * node.w / 4, y: node.y - node.h / 2 }, normal: { x: 0, y: -1 } };
      }
      return port(node, { x: node.x, y: node.y - 1 });
    };
    a = outside(from, from.x <= to.x ? -1 : 1);
    b = outside(to, from.x <= to.x ? 1 : -1);
  }
  return ports();
}

function portFacing(node, normal) {
  if (node.kind === 'store') {
    return pinnedPort(node, { side: normal.y > 0 ? 'bottom' : 'top', offset: 0 });
  }
  return port(node, { x: node.x + normal.x * node.w ** 2, y: node.y + normal.y * node.h ** 2 });
}

const dot = (a, b) => a.x * b.x + a.y * b.y;
const difference = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

function unit(point) {
  const length = Math.hypot(point.x, point.y);
  return length ? { x: point.x / length, y: point.y / length } : { x: 1, y: 0 };
}

function controlPlanes({ start, end, startNormal, endNormal }, limitT = true) {
  const { axis, length } = chordFrame(start, end);
  // Each supporting plane faces outward. The two chord planes keep t in [0, 1].
  const planes = [];
  if (limitT && length > 1e-7) {
    planes.push({ point: start, normal: axis, gap: 0 },
      { point: end, normal: { x: -axis.x, y: -axis.y }, gap: 0 });
  }
  for (const [point, normal] of [[start, startNormal], [end, endNormal]]) {
    if (!normal) continue;
    planes.push({ point, normal, gap: 0.25 });
    // The inward normals of the cone's edges are rotated 30° from its axis.
    for (const side of [-0.5, 0.5]) {
      const along = Math.sqrt(3) / 2;
      planes.push({ point, gap: 0, normal: {
        x: along * normal.x - side * normal.y,
        y: along * normal.y + side * normal.x,
      } });
    }
  }
  return planes;
}

function constrainControl(preferred, ports, limitT = true) {
  const planes = controlPlanes(ports, limitT);
  const missing = ({ point, normal, gap }) => gap - dot(difference(preferred, point), normal);
  const feasible = delta => planes.every(plane => dot(delta, plane.normal) >= missing(plane) - 1e-7);
  if (feasible({ x: 0, y: 0 })) return preferred;

  // The closest point in a convex polygon is on an edge or at a vertex.
  let best = null;
  let bestDistance = Infinity;
  const consider = delta => {
    const distance = Math.hypot(delta.x, delta.y);
    if (distance < bestDistance && feasible(delta)) {
      bestDistance = distance;
      best = { x: preferred.x + delta.x, y: preferred.y + delta.y };
    }
  };
  for (const [i, first] of planes.entries()) {
    const a = first.normal;
    const dx = missing(first);
    consider({ x: a.x * dx, y: a.y * dx });
    for (const second of planes.slice(i + 1)) {
      const b = second.normal;
      const det = a.x * b.y - a.y * b.x;
      if (Math.abs(det) <= 1e-7) continue;
      const dy = missing(second);
      consider({ x: (dx * b.y - a.y * dy) / det, y: (a.x * dy - dx * b.x) / det });
    }
  }
  return best;
}

export function curveControlRegion(flow, items, stroke, { x, y, width, height }) {
  if (!flow.control) return [];
  const ports = flowPorts(flow, items, true, stroke);
  const limitT = Boolean(constrainControl(midpoint(ports.start, ports.end), ports));
  let polygon = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  for (const { point, normal, gap } of controlPlanes(ports, limitT)) {
    const vertices = polygon;
    polygon = [];
    for (const [index, a] of vertices.entries()) {
      const b = vertices[(index + 1) % vertices.length];
      const da = dot(difference(a, point), normal) - gap;
      const db = dot(difference(b, point), normal) - gap;
      if (da >= 0) polygon.push(a);
      if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db);
      polygon.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return polygon;
}

function chordFrame(start, end) {
  const chord = difference(end, start);
  const length = Math.hypot(chord.x, chord.y);
  const axis = length ? { x: chord.x / length, y: chord.y / length } : { x: 1, y: 0 };
  return { length, axis, normal: { x: -axis.y, y: axis.x } };
}

function relativeControl(point, start, end) {
  const { length, axis, normal } = chordFrame(start, end);
  const delta = difference(point, start);
  return { t: length ? Math.max(0, Math.min(1, dot(delta, axis) / length)) : 0.5,
    offset: dot(delta, normal) };
}

export function setCurveControl(flow, items, point, stroke = 2) {
  const { start, end } = flowPorts(flow, items, true, stroke);
  return { ...flow, control: relativeControl(point, start, end) };
}

export function normalizeCurves(items, stroke = 2) {
  return items.map(item => {
    if (item.kind !== 'flow') return item;
    if (isStateLoop(item) && !item.control) return { ...item, ...stateLoop(item.from.node) };
    return item.control && !Number.isFinite(item.control.t) ? setCurveControl(item, items, item.control, stroke) : item;
  });
}

export function reverseFlow(flow, items) {
  const { control } = flow.control && !Number.isFinite(flow.control.t)
    ? setCurveControl(flow, items, flow.control) : flow;
  return { ...flow, from: flow.to, to: flow.from,
    control: control ? { t: 1 - control.t, offset: -control.offset } : null,
    ...(flow.labelPosition && { labelPosition: { t: 1 - flow.labelPosition.t, offset: -flow.labelPosition.offset } }),
  };
}

function markerRim(marker, toward) {
  const dx = toward.x - marker.x;
  const dy = toward.y - marker.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { x: marker.x, y: marker.y };
  const t = Math.min(1, radii(marker).rx / length);
  return { x: marker.x + dx * t, y: marker.y + dy * t };
}

export function arrowGeometry(flow, items, stroke) {
  const ports = flowPorts(flow, items, Boolean(flow.control), stroke);
  let { start, end } = ports;
  let control = null;
  if (flow.control) {
    const { t, offset } = Number.isFinite(flow.control.t)
      ? flow.control : relativeControl(flow.control, start, end);
    const { normal } = chordFrame(start, end);
    control = {
      x: start.x + (end.x - start.x) * t + normal.x * offset,
      y: start.y + (end.y - start.y) * t + normal.y * offset,
    };
    control = constrainControl(control, ports) ?? constrainControl(control, ports, false) ?? control;
  }
  // Resolve the bend from the dot centers, then move only the visible ends to the rims.
  const approach = control ?? (ports.startMarker && ports.endMarker ? midpoint(start, end) : null);
  if (ports.startMarker) start = markerRim(ports.startMarker, approach ?? end);
  if (ports.endMarker) end = markerRim(ports.endMarker, approach ?? start);
  const middle = midpoint(start, end);
  const center = control ? midpoint(middle, control) : middle;
  const tangent = control ?? start;
  const angle = Math.atan2(end.y - tangent.y, end.x - tangent.x);
  const length = 8 + stroke * 1.7;
  const wings = [-0.48, 0.48].map(offset => ({
    x: end.x - length * Math.cos(angle + offset),
    y: end.y - length * Math.sin(angle + offset),
  }));
  const path = segmentPath({ start, end, control });
  return { start, end, control, center, wings, path, manualPortsAdjusted: ports.manualPortsAdjusted };
}

export function segmentPath({ start, control, end }) {
  return 'M ' + start.x + ' ' + start.y + (control
    ? ' Q ' + control.x + ' ' + control.y + ' '
    : ' L ') + end.x + ' ' + end.y;
}

function crossings(start, control, end, edge) {
  const b = control == null ? end - start : 2 * (control - start);
  const a = end - start - b;
  const c = start - edge;
  if (Math.abs(a) < 1e-8) return Math.abs(b) < 1e-8 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  return [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}

export function visibleCurve(segment, boxes = []) {
  if (!boxes.length) return [segment];
  const { start, control, end } = segment;
  const points = control ? [start, control, end] : [start, end];
  const extent = {
    left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)),
    top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)),
  };
  const masks = boxes.map(box => ({ x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height }))
    .filter(box => box.x <= extent.right && box.right >= extent.left && box.y <= extent.bottom && box.bottom >= extent.top);
  if (!masks.length) return [segment];
  const cuts = masks.flatMap(box => [
    ...crossings(start.x, control?.x, end.x, box.x), ...crossings(start.x, control?.x, end.x, box.right),
    ...crossings(start.y, control?.y, end.y, box.y), ...crossings(start.y, control?.y, end.y, box.bottom),
  ]).filter(t => t > 0 && t < 1).sort((a, b) => a - b);
  const at = t => {
    const u = 1 - t;
    return control
      ? { x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y }
      : { x: u * start.x + t * end.x, y: u * start.y + t * end.y };
  };
  // Merge intervals on the same side of the mask so they share one path.
  const intervals = [];
  let from = 0;
  for (const to of [...cuts, 1]) {
    if (to - from < 1e-8) continue;
    const point = at((from + to) / 2);
    if (!masks.some(box => point.x >= box.x && point.x <= box.right && point.y >= box.y && point.y <= box.bottom)) {
      const previous = intervals.at(-1);
      if (previous && previous[1] === from) previous[1] = to;
      else intervals.push([from, to]);
    }
    from = to;
  }
  return intervals.map(([a, b]) => {
    const first = at(a);
    const middle = control && {
      x: first.x + (b - a) * ((1 - a) * (control.x - start.x) + a * (end.x - control.x)),
      y: first.y + (b - a) * ((1 - a) * (control.y - start.y) + a * (end.y - control.y)),
    };
    return { start: first, control: middle, end: at(b) };
  });
}

export function visibleFlow(geometry, boxes) {
  return [
    ...visibleCurve(geometry, boxes),
    ...geometry.wings.flatMap(wing => visibleCurve({ start: wing, end: geometry.end }, boxes)),
  ];
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

function curveParameter(geometry, t, frame) {
  const bend = difference(geometry.control, geometry.start);
  const c = Math.max(0, Math.min(1, dot(bend, frame.axis) / frame.length));
  // Solve for the curve parameter at this chord position.
  return t / (c + Math.sqrt(Math.max(0, c * c + (1 - 2 * c) * t)));
}

function labelFrame(geometry, t, frame) {
  const { start, control } = geometry;
  const { axis, normal, length } = frame;
  const along = t * Math.max(1, length);
  let across = 0;
  if (control && length >= 1 && t > 0 && t < 1) {
    const u = curveParameter(geometry, t, frame);
    across = 2 * u * (1 - u) * dot(difference(control, start), normal);
  }
  return { x: start.x + axis.x * along + normal.x * across, y: start.y + axis.y * along + normal.y * across };
}

export function flowLabelPosition(geometry, point) {
  const frame = chordFrame(geometry.start, geometry.end);
  const t = dot(difference(point, geometry.start), frame.axis) / Math.max(1, frame.length);
  const base = labelFrame(geometry, t, frame);
  return { t, offset: dot(difference(point, base), frame.normal) };
}

function transitionLabelPlacement(item, geometry, stroke, box) {
  const { start, end, center, control } = geometry;
  const frame = chordFrame(start, end);
  const position = item.labelPosition;
  if (position) {
    const { t, offset } = position;
    const base = labelFrame(geometry, t, frame);
    let axis = frame.axis;
    if (control && frame.length >= 1 && t > 0 && t < 1) {
      const u = curveParameter(geometry, t, frame);
      axis = unit({
        x: (1 - u) * (control.x - start.x) + u * (end.x - control.x),
        y: (1 - u) * (control.y - start.y) + u * (end.y - control.y),
      });
    }
    return { x: base.x + frame.normal.x * offset, y: base.y + frame.normal.y * offset,
      anchor: 'middle', angle: uprightAngle(axis) };
  }
  const { normal, axis } = frame;
  const bend = control ? dot(difference(control, midpoint(start, end)), normal) : 0;
  const side = Math.sign(bend) || (normal.y > 0 || (normal.y === 0 && normal.x < 0) ? -1 : 1);
  const gap = box.height / 2 + 6 + stroke / 2;
  return { x: center.x + normal.x * side * gap, y: center.y + normal.y * side * gap,
    anchor: 'middle', angle: uprightAngle(axis) };
}

function uprightAngle(axis) {
  const angle = Math.atan2(axis.y, axis.x) * 180 / Math.PI;
  return angle > 90 ? angle - 180 : angle <= -90 ? angle + 180 : angle;
}

export function flowLabelPlacement(item, geometry, stroke, box) {
  if (item.notation === 'sfd') return transitionLabelPlacement(item, geometry, stroke, box);
  const { start, end, center } = geometry;
  if (item.labelPosition) {
    const { t, offset } = item.labelPosition;
    const frame = chordFrame(start, end);
    const base = labelFrame(geometry, t, frame);
    return { x: base.x + frame.normal.x * offset, y: base.y + frame.normal.y * offset, anchor: 'middle' };
  }
  let placement;
  if (geometry.control && !item.labelOffset && Number.isFinite(item.control?.offset)) {
    const frame = chordFrame(start, end);
    const side = Math.sign(item.control.offset) || -1;
    const outward = { x: frame.normal.x * side, y: frame.normal.y * side };
    const base = labelFrame(geometry, 0.5, frame);
    const clearance = Math.max(0, ...[start, end, center, ...geometry.wings]
      .map(point => dot(difference(point, base), outward)));
    const radius = (Math.abs(outward.x) * box.width + Math.abs(outward.y) * box.height) / 2;
    const gap = radius + clearance + 6 + stroke / 2;
    placement = { x: base.x + outward.x * gap, y: base.y + outward.y * gap, anchor: 'middle' };
  } else if (geometry.control) {
    placement = curvedLabelPosition(geometry.control, geometry, stroke, box);
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

export function withCurve(flow, curved, items, stroke = 2) {
  if (!curved) return isStateLoop(flow) ? flow : { ...flow, control: null };
  if (flow.control) return flow;
  const { start, end } = flowPorts(flow, items, true, stroke);
  const { length } = chordFrame(start, end);
  return { ...flow, control: { t: 0.5, offset: -Math.min(105, Math.max(55, length * 0.38)) } };
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
    items: normalizeCurves([
      label('customer', 'entity', -267, -67, 'Πελάτης'),
      label('order', 'process', 0, -67, '1.0\nΕπεξεργασία\nπαραγγελίας', { w: 152, h: 152 }),
      label('warehouse', 'entity', 267, -67, 'Αποθήκη'),
      label('records', 'store', 0, 151, 'Παραγγελίες', { w: 200 }),
      flow('request', 'customer', 'order', 'Νέα παραγγελία'),
      flow('dispatch', 'order', 'warehouse', 'Εντολή αποστολής', { x: 140, y: -143 }),
      flow('record', 'order', 'records', 'Στοιχεία', { x: -78, y: 58 }),
      flow('status', 'records', 'order', 'Κατάσταση', { x: 84, y: 62 }),
    ]),
  };
}
