import { arrowGeometry, FONTS, isDiagramShape, isStateMarker, normalizeCurves, setCurveControl, TYPES } from './diagram.mjs';

const marker = { format: 'diagrammer', version: 3 };
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const diagramFile = diagram => ({ ...marker, type: 'diagram', diagram });

export function selectionFile(state, ids) {
  const chosen = state.items.filter(item => ids.has(item.id));
  const nodes = new Set(chosen.filter(isDiagramShape).map(item => item.id));
  const items = chosen.map(item => {
    if (item.kind !== 'flow') return item;
    const { start, end, control } = arrowGeometry(item, state.items, state.stroke);
    const detached = {
      ...item,
      from: nodes.has(item.from.node) ? item.from : start,
      to: nodes.has(item.to.node) ? item.to : end,
    };
    return control && (detached.from !== item.from || detached.to !== item.to)
      ? setCurveControl(detached, chosen, control, state.stroke) : detached;
  });
  return { ...marker, type: 'selection', items };
}

const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const isPoint = value => value && between(value.x, -1e7, 1e7) && between(value.y, -1e7, 1e7);
const isEndpoint = value => typeof value?.node === 'string'
  ? (value.side == null || value.side === 'top' || value.side === 'bottom') &&
    (value.auto == null || value.auto === true)
  : isPoint(value);
const isControl = value => value && (Object.hasOwn(value, 't')
  ? between(value.t, 0, 1) && between(value.offset, -5e7, 5e7) : isPoint(value));
const isAnchor = (anchor, node) => anchor == null || (node.kind === 'process' || isStateMarker(node)
  ? between(anchor.angle, -Math.PI, Math.PI)
  : between(anchor.offset, -1, 1) && (anchor.side === 'top' || anchor.side === 'bottom' ||
    (node.kind !== 'store' && (anchor.side === 'left' || anchor.side === 'right'))));

function validateItems(items) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('Invalid diagram elements.');
  const seen = new Set();
  const nodes = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200 ||
      typeof item.kind !== 'string' || !Object.hasOwn(TYPES, item.kind) ||
      typeof item.label !== 'string' || typeof item.font !== 'string' || !Object.hasOwn(FONTS, item.font) ||
      !between(item.size, 8, 72)) throw new Error('Invalid diagram element.');
    if (seen.has(item.id)) throw new Error('Diagram contains a duplicate element ID.');
    seen.add(item.id);
    if (item.kind === 'flow') {
      if (!isEndpoint(item.from) || !isEndpoint(item.to) ||
        (item.notation != null && item.notation !== 'sfd') ||
        (item.control != null && !isControl(item.control)) ||
        (item.labelPosition != null && (!between(item.labelPosition.t, -1e8, 1e8) ||
          !between(item.labelPosition.offset, -5e7, 5e7))) ||
        (item.labelOpposite != null && typeof item.labelOpposite !== 'boolean') ||
        (item.labelUpsideDown != null && typeof item.labelUpsideDown !== 'boolean') ||
        (item.labelOffset != null && !isPoint(item.labelOffset))) throw new Error('Invalid arrow geometry.');
    } else {
      if (!isPoint(item) || !between(item.w, 24, 1600) || !between(item.h, 24, 1600)) {
        throw new Error('Invalid shape geometry.');
      }
      if (isDiagramShape(item)) nodes.set(item.id, item);
    }
  }
  for (const item of items) {
    if (item.kind === 'flow' && [item.from, item.to].some(end => 'node' in end && !nodes.has(end.node))) {
      throw new Error('Diagram contains an invalid arrow attachment.');
    }
    if (item.kind === 'flow' && [item.from, item.to].some(end => end.node && !isAnchor(end.anchor, nodes.get(end.node)))) {
      throw new Error('Diagram contains an invalid anchor position.');
    }
    if (item.kind === 'flow' && item.notation === 'sfd' && item.from.node && item.from.node === item.to.node &&
        nodes.get(item.from.node).kind !== 'state') throw new Error('A self-transition must attach to a state.');
  }
}

export function decodeFile(text) {
  if (text.length > MAX_FILE_BYTES) throw new Error('The diagram file is too large.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (file?.format !== marker.format) throw new Error('Choose a Diagrammer JSON file.');
  if (![1, 2, marker.version].includes(file.version)) throw new Error('This Diagrammer file version is unsupported.');
  if (file.type === 'diagram') {
    const diagram = file.diagram;
    if (typeof diagram?.title !== 'string' || diagram.title.length > 70 ||
      !between(diagram.stroke, 0.5, 8)) throw new Error('Invalid diagram settings.');
    validateItems(diagram.items);
    file.diagram.items = normalizeCurves(diagram.items, diagram.stroke);
  } else if (file.type === 'selection') {
    validateItems(file.items);
    if (!file.items.length) throw new Error('The shape set is empty.');
    file.items = normalizeCurves(file.items);
  } else throw new Error('Unknown Diagrammer file type.');
  return file;
}

export function instantiateItems(items, offset, makeId = () => crypto.randomUUID()) {
  const ids = new Map(items.map(item => [item.id, makeId()]));
  const translate = point => ({ x: point.x + offset.x, y: point.y + offset.y });
  const endpoint = value => value.node ? { ...value, node: ids.get(value.node) } : translate(value);
  return normalizeCurves(items).map(item => {
    const id = ids.get(item.id);
    return item.kind === 'flow'
      ? { ...item, id, from: endpoint(item.from), to: endpoint(item.to) }
      : { ...item, id, ...translate(item) };
  });
}
