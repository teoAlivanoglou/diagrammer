import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowGeometry, sampleDiagram } from './diagram.mjs';
import { decodeFile, diagramFile, instantiateItems, selectionFile } from './diagram-file.mjs';

const roundTrip = value => decodeFile(JSON.stringify(value));

test('the versioned document preserves Greek text, coordinates, and diagram settings', () => {
  const diagram = sampleDiagram();
  diagram.items.find(item => item.id === 'record').labelOffset = { x: 9, y: 12 };
  assert.deepEqual(roundTrip(diagramFile(diagram)).diagram, diagram);
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
  assert.deepEqual(arrow.control, { x: flow.control.x + 4, y: flow.control.y + 8 });
});

test('the decoder rejects duplicate IDs, dangling attachments, and future versions', () => {
  const diagram = sampleDiagram();
  assert.throws(() => roundTrip({ ...diagramFile(diagram), version: 2 }), /version/);
  const file = diagramFile(diagram);
  file.diagram.items[0].id = file.diagram.items[1].id;
  assert.throws(() => roundTrip(file), /duplicate/);
  file.diagram.items.shift();
  assert.throws(() => roundTrip(file), /attachment/);
});
