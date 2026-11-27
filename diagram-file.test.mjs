import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowGeometry, sampleDiagram, stateLoop, TYPES } from './diagram.mjs';
import { decodeFile, diagramFile, instantiateItems, selectionFile } from './diagram-file.mjs';

const roundTrip = value => decodeFile(JSON.stringify(value));

test('state symbols and Greek-labeled transitions survive save and selection copy', () => {
  const node = (kind, x) => ({ id: kind, kind, x, y: 0, w: TYPES[kind].w, h: TYPES[kind].h,
    label: kind === 'state' ? 'Σε σύνταξη' : '', font: 'Arial', size: 16 });
  const loop = { id: 'loop', kind: 'flow', notation: 'sfd', ...stateLoop('state'),
    label: 'Διόρθωση / Ενημέρωση', font: 'Arial', size: 14 };
  const diagram = { title: 'Δοκιμή', stroke: 2, items: [node('initial', -150), node('state', 0), node('final', 150), loop] };
  assert.deepEqual(roundTrip(diagramFile(diagram)).diagram, diagram);
  const file = roundTrip(selectionFile(diagram, new Set(['state', 'loop'])));
  let id = 0;
  const [state, transition] = instantiateItems(file.items, { x: 10, y: 20 }, () => String(++id));
  assert.equal(transition.from.node, state.id);
  assert.equal(transition.to.node, state.id);
  assert.equal(transition.notation, 'sfd');
  assert.deepEqual(transition.control, loop.control);
});

test('the versioned document preserves Greek text, coordinates, and diagram settings', () => {
  const diagram = sampleDiagram();
  diagram.items.find(item => item.id === 'record').labelPosition = { t: 0.25, offset: 12 };
  assert.deepEqual(roundTrip(diagramFile(diagram)).diagram, diagram);
});

test('pins survive saving and copying alongside their shape', () => {
  const diagram = sampleDiagram();
  const flow = diagram.items.find(item => item.id === 'dispatch');
  const anchor = { angle: -Math.PI / 2 };
  flow.from.anchor = anchor;
  const document = roundTrip(diagramFile(diagram)).diagram;
  assert.deepEqual(document.items.find(item => item.id === flow.id).from.anchor, anchor);
  const selection = roundTrip(selectionFile(diagram, new Set([flow.from.node, flow.id])));
  let id = 0;
  const copies = instantiateItems(selection.items, { x: 30, y: 10 }, () => 'copy-' + id++);
  assert.deepEqual(copies.find(item => item.kind === 'flow').from, { node: copies[0].id, anchor });
});

test('a selection detaches omitted nodes at the rendered arrow endpoint and remaps included nodes', () => {
  const diagram = sampleDiagram();
  const file = roundTrip(selectionFile(diagram, new Set(['order', 'dispatch'])));
  const flow = file.items.find(item => item.kind === 'flow');
  const original = diagram.items.find(item => item.id === 'dispatch');
  assert.deepEqual(flow.to, arrowGeometry(original, diagram.items, diagram.stroke).end);
  let id = 0;
  const [shape, arrow] = instantiateItems(file.items, { x: 4, y: 8 }, () => 'copy-' + id++);
  assert.equal(arrow.from.node, shape.id);
  assert.deepEqual(arrow.to, { x: flow.to.x + 4, y: flow.to.y + 8 });
  assert.deepEqual(arrow.control, flow.control);
});

test('the decoder rejects duplicate IDs, dangling attachments, and future versions', () => {
  const diagram = sampleDiagram();
  assert.throws(() => roundTrip({ ...diagramFile(diagram), version: 999 }), /version/);
  const file = diagramFile(diagram);
  file.diagram.items[0].id = file.diagram.items[1].id;
  assert.throws(() => roundTrip(file), /duplicate/);
  file.diagram.items.shift();
  assert.throws(() => roundTrip(file), /attachment/);
});

test('legacy absolute controls are upgraded to relative coordinates', () => {
  const sample = sampleDiagram();
  const flow = sample.items.find(item => item.id === 'dispatch');
  flow.control = { x: 140, y: -143 };
  const { diagram } = roundTrip({ ...diagramFile(sample), version: 1 });
  const upgraded = diagram.items.find(item => item.id === flow.id);
  assert.ok(upgraded.control.t >= 0 && upgraded.control.t <= 1);
  assert.ok(Number.isFinite(upgraded.control.offset));
  assert.deepEqual(arrowGeometry(upgraded, diagram.items, 2).control, arrowGeometry(flow, sample.items, 2).control);
});
