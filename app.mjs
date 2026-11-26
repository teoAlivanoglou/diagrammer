import {
  TYPES, FONTS, GRID_SIZE, sampleDiagram, arrowGeometry, snapEndpoint, withCurve, removeItems,
  alignShapes, distributeShapes, gridPoint, isDiagramShape, itemsInMarquee, marqueeBox,
} from './diagram.mjs';
import { icon } from './icons.mjs';
import { svg, drawItem, drawItems, imageBounds, renderPng } from './drawing.mjs';
import { renderWord } from './word.mjs';
import { decodeFile, diagramFile, instantiateItems, MAX_FILE_BYTES, selectionFile } from './diagram-file.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const drawing = $('drawing');
const overlays = $('overlays');
const surface = $('surface');
const storageKey = 'diagrammer-document-v1';
const tools = { select: { name: 'Select', shortcut: 'V' }, ...TYPES };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let state = load();
let selected = new Set();
let activeTool = 'select';
let pending = null;
let pendingInsert = null;
let drag = null;
let lastClick = null;
let past = [];
let future = [];
let editingField = null;
let spaceDown = false;
let toastTimer;
let zoom = 1;
let center = { x: 0, y: 0 };
let followFit = true;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.items) && Number.isFinite(saved.stroke)) return saved;
  } catch { /* Use the example when local storage is unavailable. */ }
  return sampleDiagram();
}

function save() {
  const indicator = $('save-status');
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    indicator.textContent = 'Saved locally';
    indicator.parentElement.classList.remove('unavailable');
  } catch {
    indicator.textContent = 'Local save unavailable';
    indicator.parentElement.classList.add('unavailable');
  }
}

for (const slot of document.querySelectorAll('[data-icon]')) slot.innerHTML = icon(slot.dataset.icon);
for (const slot of document.querySelectorAll('[data-icon-prefix]')) {
  slot.insertAdjacentHTML('afterbegin', icon(slot.dataset.iconPrefix));
}
for (const [kind, details] of Object.entries(tools)) {
  const button = document.createElement('button');
  button.className = 'tool';
  button.dataset.tool = kind;
  button.title = details.name + ' (' + details.shortcut + ')';
  button.setAttribute('aria-label', details.name);
  button.innerHTML = icon(kind) + '<span>' + details.name + '</span><kbd>' + details.shortcut + '</kbd>';
  button.addEventListener('click', () => setTool(kind));
  $(kind === 'select' ? 'select-tool' : kind === 'text' ? 'text-tool' : 'shape-tools').append(button);
}
for (const font of Object.keys(FONTS)) $('font').add(new Option(font));

function itemById(id) {
  return state.items.find(item => item.id === id);
}

function onlySelected() {
  return selected.size === 1 ? itemById(selected.values().next().value) : null;
}

function remember(previous) {
  past.push(previous);
  if (past.length > 80) past.shift();
  future.length = 0;
}

function update(next, field = null) {
  if (field === null || editingField !== field) remember(state);
  editingField = field;
  state = next;
  save();
  paint();
}

function updateItem(item, change, field = null) {
  if (!item) return;
  const edited = typeof change === 'function' ? change(item) : { ...item, ...change };
  if (edited === item || Object.keys(edited).every(key => edited[key] === item[key])) return;
  update({ ...state, items: state.items.map(entry => entry.id === item.id ? edited : entry) }, field);
}

function history(source, destination) {
  if (!source.length || drag) return;
  destination.push(state);
  state = source.pop();
  selected = new Set([...selected].filter(itemById));
  editingField = null;
  pending = null;
  pendingInsert = null;
  save();
  paint();
}

function setTool(kind) {
  activeTool = kind;
  pending = null;
  pendingInsert = null;
  editingField = null;
  paint();
}

function keepValue(id, value) {
  if (document.activeElement !== $(id)) $(id).value = value;
}

function paint() {
  paintCanvas();
  keepValue('title', state.title);
  $('thickness').value = state.stroke;
  $('thickness-value').value = state.stroke + ' px';
  $('stroke-preview').style.height = state.stroke + 'px';

  const flows = state.items.filter(item => item.kind === 'flow').length;
  const shapes = state.items.length - flows;
  $('counts').textContent = shapes + (shapes === 1 ? ' object' : ' objects') + ' · ' +
    flows + (flows === 1 ? ' flow' : ' flows');
  $('empty').hidden = state.items.length > 0 || activeTool !== 'select';
  $('copy').disabled = $('download').disabled = $('word').disabled = !exportItems().length;
  $('save-selection').disabled = !selected.size;
  $('copy').querySelector('span').textContent = selected.size ? 'Copy selection' : 'Copy diagram';
  $('undo').disabled = past.length === 0;
  $('redo').disabled = future.length === 0;
  $('fit').disabled = state.items.length === 0;
  surface.classList.toggle('placing', activeTool !== 'select' || Boolean(pendingInsert));
  for (const button of document.querySelectorAll('[data-tool]')) {
    const active = button.dataset.tool === activeTool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  }
  paintTip();
  paintSelection();
}

function paintTip() {
  const item = onlySelected();
  let tip = 'Drag empty canvas to select multiple elements';
  if (activeTool === 'flow') tip = pending ? 'Click where the arrow should end.' : 'Click where the arrow should start.';
  else if (activeTool !== 'select') tip = 'Click the canvas to place ' + tools[activeTool].name.toLowerCase() + '.';
  else if (item?.kind === 'flow') tip = item.control
    ? 'Drag the label to move it, the square to bend, or a round handle to reconnect.'
    : 'Drag the label to move it or a round handle to reconnect.';
  else if (!state.items.length) tip = 'Pick a tool to begin.';
  else if (item && isDiagramShape(item)) tip = 'Shift-click to select more shapes · Double-click to edit a label';
  if (pendingInsert) tip = 'Click the canvas to place the imported elements.';
  if (activeTool !== 'select' || pendingInsert) tip += ' <kbd>Esc</kbd> to cancel';
  $('tip').innerHTML = tip;
}

function paintSelection() {
  const item = onlySelected();
  const shapeCount = state.items.filter(entry => selected.has(entry.id) && isDiagramShape(entry)).length;
  $('selection-fields').hidden = !selected.size;
  $('selection-empty').hidden = Boolean(selected.size);
  $('single-fields').hidden = !item;
  $('arrange').hidden = shapeCount < 2;
  $('distribute').hidden = shapeCount < 3;
  if (!selected.size) return;
  $('selection-name').textContent = item ? TYPES[item.kind].name : selected.size + ' objects selected';
  $('selection-icon').innerHTML = icon(item?.kind ?? 'shapes');
  if (!item) return;
  keepValue('label', item.label);
  $('font').value = item.font;
  keepValue('font-size', item.size);
  $('dimensions').hidden = item.kind === 'flow' || item.kind === 'text';
  $('flow-fields').hidden = item.kind !== 'flow';
  if (item.kind === 'flow') {
    $('reset-label').hidden = !item.label || !item.labelOffset;
    for (const [id, active] of [['straight', !item.control], ['curve', Boolean(item.control)]]) {
      $(id).classList.toggle('active', active);
      $(id).setAttribute('aria-pressed', active);
    }
  } else if (item.kind !== 'text') {
    keepValue('width', Math.round(item.w));
    keepValue('height', Math.round(item.h));
  }
}

function paintCanvas() {
  drawItems(drawing, state, state.items, selected, true, zoom);
  overlays.replaceChildren();
  const item = onlySelected();
  if (drag?.type === 'marquee' && drag.box) {
    overlays.append(svg('rect', {
      ...drag.box, class: 'marquee', 'stroke-width': 1 / zoom, 'pointer-events': 'none',
    }));
  } else if (activeTool === 'select' && item?.kind === 'flow') {
    if (drag?.moved && drag.type === 'handle' && drag.handle !== 'control') {
      const target = item[drag.handle].node;
      if (target) drawing.querySelector('[data-item="' + CSS.escape(target) + '"]')?.classList.add('snap-target');
    }
    const g = arrowGeometry(item, state.items, state.stroke);
    if (item.control) {
      overlays.append(svg('path', {
        d: 'M ' + g.start.x + ' ' + g.start.y + ' L ' + item.control.x + ' ' + item.control.y + ' L ' + g.end.x + ' ' + g.end.y,
        fill: 'none', stroke: '#967fe8', 'stroke-width': 1 / zoom,
        'stroke-dasharray': 4 / zoom + ' ' + 4 / zoom, 'pointer-events': 'none',
      }));
      overlays.append(svg('rect', {
        x: item.control.x - 5 / zoom, y: item.control.y - 5 / zoom,
        width: 10 / zoom, height: 10 / zoom, rx: 2 / zoom,
        fill: '#7057e5', stroke: 'white', 'stroke-width': 1.5 / zoom, 'data-handle': 'control',
      }, svg('title', {}, 'Drag to bend the arrow')));
    }
    for (const [key, point] of [['from', g.start], ['to', g.end]]) {
      const attached = Boolean(item[key].node);
      overlays.append(svg('g', { 'data-handle': key, 'data-attached': attached },
        svg('title', {}, 'Drag the arrow ' + (key === 'from' ? 'start' : 'end') + ' to attach or detach it'),
        svg('circle', { cx: point.x, cy: point.y, r: 10 / zoom, fill: 'transparent' }),
        svg('circle', {
          cx: point.x, cy: point.y, r: 5 / zoom, fill: attached ? '#7057e5' : 'white',
          stroke: '#7057e5', 'stroke-width': 1.5 / zoom,
        }),
      ));
    }
  }
  if (pending) {
    const preview = drawItem({ kind: 'flow', from: pending.from, to: pending.to, label: '' }, state, true);
    preview.setAttribute('opacity', '0.6');
    preview.setAttribute('pointer-events', 'none');
    overlays.append(preview);
  }
}

function setViewport() {
  const w = surface.clientWidth / zoom;
  const h = surface.clientHeight / zoom;
  if (!w || !h) return;
  canvas.setAttribute('viewBox', [center.x - w / 2, center.y - h / 2, w, h].join(' '));
  const gap = GRID_SIZE * zoom;
  surface.style.backgroundSize = gap + 'px ' + gap + 'px';
  surface.style.backgroundPosition = (surface.clientWidth / 2 - center.x * zoom - gap / 2) + 'px ' +
    (surface.clientHeight / 2 - center.y * zoom - gap / 2) + 'px';
  $('zoom-reset').textContent = Math.round(zoom * 100) + '%';
  $('zoom-out').disabled = zoom <= 0.2;
  $('zoom-in').disabled = zoom >= 3;
}

function zoomTo(factor, anchor = null, keepFit = false) {
  followFit = keepFit;
  const next = clamp(factor, 0.2, 3);
  if (anchor) {
    center = {
      x: anchor.x + (center.x - anchor.x) * zoom / next,
      y: anchor.y + (center.y - anchor.y) * zoom / next,
    };
  }
  zoom = next;
  setViewport();
  paintCanvas();
}

function fitDiagram() {
  const visible = state.items.filter(item => item.kind !== 'text' || item.label);
  if (!visible.length) {
    center = { x: 0, y: 0 };
    zoomTo(1, null, true);
    return;
  }
  const box = imageBounds(state, visible);
  const margin = surface.clientWidth < 600 ? 34 : 100;
  center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  zoomTo(Math.min((surface.clientWidth - margin) / Math.max(box.width, 1),
    (surface.clientHeight - margin) / Math.max(box.height, 1), 1.25), null, true);
}

function location(event) {
  const matrix = canvas.getScreenCTM();
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}

function sameEndpoint(a, b) {
  return a.node || b.node ? a.node === b.node : Math.hypot(a.x - b.x, a.y - b.y) < 8 / zoom;
}

function snapDraggedEndpoint(point, flow, handle) {
  const other = handle === 'from' ? flow.to : flow.from;
  return snapEndpoint(point, state.items, 14 / zoom, other.node);
}

function appendItem(kind, props) {
  const item = { id: crypto.randomUUID(), kind, label: '', font: 'Arial', size: 16, ...props };
  selected = new Set([item.id]);
  activeTool = 'select';
  pending = null;
  update({ ...state, items: [...state.items, item] });
  if (kind === 'text') focusLabel();
}

function insertItems(items, offset) {
  const copies = instantiateItems(items, offset);
  selected = new Set(copies.map(item => item.id));
  pendingInsert = null;
  activeTool = 'select';
  update({ ...state, items: [...state.items, ...copies] });
}

function focusLabel() {
  $('label').focus();
  $('label').select();
}

function beginDrag(event, type, extra = {}) {
  drag = {
    type, snapshot: state, moved: false, pointerId: event.pointerId,
    screenX: event.clientX, screenY: event.clientY, center: { ...center }, ...extra,
  };
  canvas.setPointerCapture(event.pointerId);
}

canvas.addEventListener('pointerdown', event => {
  if (drag || (event.button !== 0 && event.button !== 1)) return;
  canvas.focus({ preventScroll: true });
  event.preventDefault();
  editingField = null;
  const point = location(event);
  if (spaceDown || event.button === 1 || event.altKey) {
    lastClick = null;
    beginDrag(event, 'pan');
    return;
  }
  if (pendingInsert) {
    const target = $('snap-to-grid').checked ? gridPoint(point) : point;
    const { items, anchor } = pendingInsert;
    insertItems(items, { x: target.x - anchor.x, y: target.y - anchor.y });
    return;
  }
  const item = itemById(event.target.closest('[data-item]')?.dataset.item);
  const handle = event.target.closest('[data-handle]')?.dataset.handle;
  if (activeTool === 'flow') {
    const target = snapEndpoint(point, state.items);
    if (!pending) {
      pending = { from: target, to: target };
      paint();
    } else if (!sameEndpoint(pending.from, target)) {
      appendItem('flow', { from: pending.from, to: target, control: null, size: 14 });
    }
    return;
  }
  if (activeTool !== 'select') {
    const dimensions = TYPES[activeTool];
    const position = $('snap-to-grid').checked ? gridPoint(point) : { x: point.x, y: point.y };
    appendItem(activeTool, { ...position, w: dimensions.w, h: dimensions.h });
    return;
  }
  if (handle && onlySelected()) {
    lastClick = null;
    beginDrag(event, 'handle', { handle, id: onlySelected().id });
    return;
  }
  if (!item) {
    lastClick = null;
    const bounds = new Map([...drawing.children].map(element => [element.dataset.item, element.getBBox()]));
    beginDrag(event, 'marquee', { start: point, bounds, previousSelection: selected, extend: event.shiftKey });
    return;
  }
  if (event.shiftKey) {
    if (selected.has(item.id)) selected.delete(item.id);
    else selected.add(item.id);
  } else if (!selected.has(item.id)) selected = new Set([item.id]);
  const click = { id: item.id, time: event.timeStamp, x: event.clientX, y: event.clientY };
  const doubleClick = !event.shiftKey && lastClick?.id === click.id &&
    click.time - lastClick.time < 480 && Math.hypot(click.x - lastClick.x, click.y - lastClick.y) < 7;
  if (doubleClick) {
    lastClick = null;
    selected = new Set([item.id]);
    paint();
    focusLabel();
    return;
  }
  lastClick = event.shiftKey ? null : click;
  if (!event.shiftKey && event.target.closest('[data-flow-label]')) {
    beginDrag(event, 'label', { id: item.id });
  } else if (!event.shiftKey && (item.kind !== 'flow' || (!item.from.node && !item.to.node))) {
    beginDrag(event, 'move', { anchor: item.kind === 'flow' ? null : item });
  }
  paint();
});

canvas.addEventListener('pointermove', event => {
  if (drag && drag.pointerId !== event.pointerId) return;
  const point = location(event);
  if (!drag) {
    if (pending) {
      pending.to = snapEndpoint(point, state.items);
      paintCanvas();
    }
    return;
  }
  const dx = event.clientX - drag.screenX;
  const dy = event.clientY - drag.screenY;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  drag.moved = true;
  lastClick = null;
  if (drag.type === 'pan') {
    followFit = false;
    center = { x: drag.center.x - dx / zoom, y: drag.center.y - dy / zoom };
    setViewport();
    return;
  }
  if (drag.type === 'marquee') {
    drag.box = marqueeBox(drag.start, point);
    selected = itemsInMarquee(drag.box, drag.bounds, drag.extend ? drag.previousSelection : []);
    paint();
    return;
  }
  let offsetX = dx / zoom;
  let offsetY = dy / zoom;
  if (drag.anchor && $('snap-to-grid').checked) {
    const { x, y } = drag.anchor;
    const snapped = gridPoint({ x: x + offsetX, y: y + offsetY });
    offsetX = snapped.x - x;
    offsetY = snapped.y - y;
    if (!offsetX && !offsetY) {
      state = drag.snapshot;
      paintCanvas();
      return;
    }
  }
  const move = p => ({ x: p.x + offsetX, y: p.y + offsetY });
  const items = drag.snapshot.items.map(item => {
    if (drag.type === 'label') {
      return item.id === drag.id ? { ...item, labelOffset: move(item.labelOffset ?? { x: 0, y: 0 }) } : item;
    }
    if (drag.type === 'handle') {
      if (item.id !== drag.id) return item;
      const value = drag.handle === 'control' ? move(item.control) : snapDraggedEndpoint(point, item, drag.handle);
      return { ...item, [drag.handle]: value };
    }
    if (!selected.has(item.id)) return item;
    if (item.kind !== 'flow') return { ...item, ...move(item) };
    if (item.from.node || item.to.node) {
      if (item.control && selected.has(item.from.node) && selected.has(item.to.node)) {
        return { ...item, control: move(item.control) };
      }
      return item;
    }
    return { ...item, from: move(item.from), to: move(item.to), control: item.control ? move(item.control) : null };
  });
  state = { ...drag.snapshot, items };
  paintCanvas();
});

function finishDrag(event, canceled = false) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const { moved, snapshot, type, handle, id, previousSelection, extend, start, bounds } = drag;
  drag = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (type === 'marquee') {
    if (canceled) selected = previousSelection;
    else if (moved) selected = itemsInMarquee(marqueeBox(start, location(event)), bounds, extend ? previousSelection : []);
    else if (!extend) selected = new Set();
  } else if (moved && type !== 'pan') {
    if (canceled) state = snapshot;
    else {
      if (type === 'handle' && handle !== 'control') {
        const item = itemById(id);
        const original = snapshot.items.find(entry => entry.id === id)[handle];
        const other = handle === 'from' ? item.to : item.from;
        const point = location(event);
        const target = snapDraggedEndpoint(point, item, handle);
        if (sameEndpoint(target, other) || sameEndpoint(snapEndpoint(point, state.items), other) ||
          (target.node && target.node === original.node)) state = snapshot;
        else state = { ...state, items: state.items.map(entry => entry === item ? { ...item, [handle]: target } : entry) };
      }
      if (state !== snapshot) {
        remember(snapshot);
        save();
      }
    }
  }
  paint();
}

canvas.addEventListener('pointerup', event => finishDrag(event));
canvas.addEventListener('pointercancel', event => finishDrag(event, true));
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (drag) return;
  if (event.ctrlKey || event.metaKey) zoomTo(zoom * Math.exp(-event.deltaY / 180), location(event));
  else {
    followFit = false;
    const scale = [1, 16, surface.clientHeight][event.deltaMode] ?? 1;
    center = { x: center.x + event.deltaX * scale / zoom, y: center.y + event.deltaY * scale / zoom };
    setViewport();
  }
}, { passive: false });

function deleteSelected() {
  if (!selected.size) return;
  const items = removeItems(state.items, selected);
  selected = new Set();
  update({ ...state, items });
}

$('new').addEventListener('click', () => {
  selected = new Set();
  activeTool = 'select';
  pending = null;
  pendingInsert = null;
  center = { x: 0, y: 0 };
  zoom = 1;
  followFit = true;
  setViewport();
  update({ title: '', stroke: state.stroke, items: [] });
  $('title').focus();
});
$('undo').addEventListener('click', () => history(past, future));
$('redo').addEventListener('click', () => history(future, past));
$('zoom-in').addEventListener('click', () => zoomTo(zoom * 1.2));
$('zoom-out').addEventListener('click', () => zoomTo(zoom / 1.2));
$('zoom-reset').addEventListener('click', () => { center = { x: 0, y: 0 }; zoomTo(1); });
$('fit').addEventListener('click', fitDiagram);
$('remove').addEventListener('click', deleteSelected);
$('snap-to-grid').addEventListener('change', event => surface.classList.toggle('snapping', event.target.checked));
$('align').addEventListener('change', event => {
  const [axis, anchor] = event.target.value.split(':');
  const items = alignShapes(state.items, selected, axis, anchor);
  event.target.selectedIndex = 0;
  if (items !== state.items) update({ ...state, items });
});
for (const button of document.querySelectorAll('[data-space]')) {
  button.addEventListener('click', () => {
    const items = distributeShapes(state.items, selected, button.dataset.space);
    if (items !== state.items) update({ ...state, items });
  });
}
$('straight').addEventListener('click', () => updateItem(onlySelected(), item => withCurve(item, false, state.items)));
$('curve').addEventListener('click', () => updateItem(onlySelected(), item => withCurve(item, true, state.items)));
$('reverse').addEventListener('click', () => updateItem(onlySelected(), item => ({ ...item, from: item.to, to: item.from })));
$('reset-label').addEventListener('click', () => updateItem(onlySelected(), { labelOffset: null }));
$('font').addEventListener('change', event => updateItem(onlySelected(), { font: event.target.value }));

for (const [id, prop] of [['title', 'title'], ['thickness', 'stroke'], ['label', 'label']]) {
  $(id).addEventListener('input', event => {
    const value = id === 'thickness' ? event.target.valueAsNumber : event.target.value;
    if (id === 'label') updateItem(onlySelected(), { label: value }, id);
    else if (state[prop] !== value) update({ ...state, [prop]: value }, id);
  });
  $(id).addEventListener('blur', () => { editingField = null; });
}
$('thickness').addEventListener('change', () => { editingField = null; });

for (const [id, prop] of [['font-size', 'size'], ['width', 'w'], ['height', 'h']]) {
  $(id).addEventListener('change', event => {
    const item = onlySelected();
    if (!item) return;
    const input = event.target;
    const numeric = input.valueAsNumber;
    const value = Number.isFinite(numeric) ? clamp(numeric, Number(input.min), Number(input.max)) : item[prop];
    input.value = value;
    updateItem(item, { [prop]: value });
  });
}

function toast(message, success = false) {
  clearTimeout(toastTimer);
  $('toast').replaceChildren();
  if (success) $('toast').innerHTML = icon('check');
  $('toast').append(document.createTextNode(message));
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600);
}

function exportItems() {
  return state.items.filter(item => (!selected.size || selected.has(item.id)) &&
    (item.kind !== 'text' || item.label.trim()));
}

function downloadFile(blob, extension, suffix = '') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const name = state.title.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'diagram';
  link.download = name + suffix + '.' + extension;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadJson(selection) {
  if (selection && !selected.size) return;
  const file = selection ? selectionFile(state, selected) : diagramFile(state);
  downloadFile(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), 'json', selection ? '-selection' : '');
  $('files').open = false;
}

function chooseJson(mode) {
  const input = $('json-file');
  input.dataset.mode = mode;
  input.value = '';
  $('files').open = false;
  input.click();
}

$('save-json').addEventListener('click', () => downloadJson(false));
$('save-selection').addEventListener('click', () => downloadJson(true));
$('open-json').addEventListener('click', () => chooseJson('open'));
$('insert-json').addEventListener('click', () => chooseJson('insert'));
$('json-file').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files[0];
  const mode = input.dataset.mode;
  if (!file) return;
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error('The diagram file is too large.');
    const decoded = decodeFile(await file.text());
    if (mode === 'open') {
      if (decoded.type !== 'diagram') throw new Error('Use Import and place for a shape set.');
      selected = new Set();
      setTool('select');
      update(decoded.diagram);
      fitDiagram();
    } else {
      const items = decoded.diagram?.items ?? decoded.items;
      if (!items.length) throw new Error('The file has no elements to place.');
      const bounds = imageBounds({ ...state, items }, items);
      setTool('select');
      pendingInsert = { items, anchor: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } };
      paint();
    }
    canvas.focus({ preventScroll: true });
  } catch (error) {
    toast(error.message);
  }
});

async function copyImage() {
  const items = exportItems();
  if (!items.length) {
    toast('Add a shape or label to copy.');
    return;
  }
  if (!navigator.clipboard?.write || !globalThis.ClipboardItem) {
    toast('Clipboard unavailable. Use PNG to download.');
    return;
  }
  try {
    // Keep the write in the click or key activation, including in Safari.
    const png = renderPng(state, items);
    await Promise.all([navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]), png]);
    toast(selected.size ? 'Selection copied. Paste it into Word.' : 'Diagram copied. Paste it into Word.', true);
  } catch {
    toast('Clipboard write failed. Use PNG to download.');
  }
}

async function downloadDiagram(format) {
  const items = exportItems();
  if (!items.length) return;
  const word = format === 'docx';
  try {
    const blob = word ? await renderWord(state, items) : await renderPng(state, items);
    downloadFile(blob, format);
    toast(word ? 'Editable Word document downloaded.' : 'PNG downloaded.', true);
  } catch {
    toast(word ? 'Could not create the Word document.' : 'Could not create the PNG.');
  }
}

$('copy').addEventListener('click', copyImage);
$('download').addEventListener('click', () => downloadDiagram('png'));
$('word').addEventListener('click', () => downloadDiagram('docx'));

document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    if (drag) finishDrag({ pointerId: drag.pointerId }, true);
    selected = new Set();
    setTool('select');
    canvas.focus();
    return;
  }
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && key === 'c' && !document.getSelection()?.toString()) {
    event.preventDefault();
    copyImage();
  } else if (modifier && (key === 'z' || key === 'y')) {
    event.preventDefault();
    if (key === 'y' || event.shiftKey) history(future, past);
    else history(past, future);
  } else if (modifier && key === 'a') {
    event.preventDefault();
    selected = new Set(state.items.map(item => item.id));
    setTool('select');
  } else if (!modifier && !event.altKey) {
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      deleteSelected();
    } else if (key === 'enter' && onlySelected() && document.activeElement === canvas) {
      event.preventDefault();
      focusLabel();
    } else if (key === ' ' && document.activeElement === canvas) {
      event.preventDefault();
      spaceDown = true;
    } else {
      const tool = Object.keys(tools).find(kind => tools[kind].shortcut.toLowerCase() === key);
      if (tool) setTool(tool);
    }
  }
});

document.addEventListener('keyup', event => { if (event.code === 'Space') spaceDown = false; });
window.addEventListener('blur', () => { spaceDown = false; });

new ResizeObserver(() => {
  if (followFit && state.items.length && surface.clientWidth && surface.clientHeight) fitDiagram();
  else setViewport();
}).observe(surface);

save();
paint();
