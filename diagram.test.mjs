import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignShapes, arrowGeometry, distributeShapes, gridPoint, removeItems, sampleDiagram, snapEndpoint, withCurve } from './diagram.mjs';
import { centerLabelLines } from './drawing.mjs';
import { renderWord } from './word.mjs';

const left = { id: 'a', kind: 'entity', x: 0, y: 0, w: 100, h: 50 };
const right = { id: 'b', kind: 'process', x: 200, y: 0, w: 100, h: 100 };
const flow = { id: 'flow', kind: 'flow', from: { node: 'a' }, to: { node: 'b' } };

test('snap rounds to visible grid intersections around the canvas origin', () => {
  assert.deepEqual(gridPoint({ x: -34, y: 12 }), { x: -44, y: 22 });
  assert.deepEqual(gridPoint({ x: -2, y: 32 }), { x: 0, y: 22 });
});

test('align uses the shape edges and keeps attached arrow endpoints connected', () => {
  const items = [left, { ...right, y: 65 }, flow];
  const aligned = alignShapes(items, new Set(['a', 'b', 'flow']), 'y', 'start');
  assert.deepEqual(aligned.slice(0, 2).map(node => node.y - node.h / 2), [-25, -25]);
  assert.strictEqual(aligned[2], flow);
  assert.equal(arrowGeometry(aligned[2], aligned, 2).end.y < 65, true);
});

test('distributing varied shapes equalizes edge gaps and preserves the outside shapes when there is room', () => {
  const middle = { ...left, id: 'middle', x: 72, w: 20 };
  const items = [left, middle, right, flow];
  const spaced = distributeShapes(items, new Set(['a', 'middle', 'b']), 'x');
  assert.deepEqual(spaced.slice(0, 3).map(node => node.x), [0, 100, 200]);
  assert.strictEqual(spaced[3], flow);
});

test('distributing overlaps expands the selection to give every shape clearance', () => {
  const items = [left, { ...left, id: 'middle', x: 10 }, { ...right, x: 20 }];
  const spaced = distributeShapes(items, new Set(['a', 'middle', 'b']), 'x');
  const gap = (a, b) => b.x - b.w / 2 - (a.x + a.w / 2);
  assert.equal(gap(spaced[0], spaced[1]), 12);
  assert.equal(gap(spaced[1], spaced[2]), 12);
  assert.equal(spaced[1].x, 10);
});

test('flows meet the shape borders and track node movement', () => {
  const g = arrowGeometry(flow, [left, right], 2);
  assert.deepEqual(g.start, { x: 50, y: 0 });
  assert.deepEqual(g.end, { x: 150, y: 0 });
  assert.equal(arrowGeometry(flow, [left, { ...right, x: 250 }], 2).end.x, 200);
});

test('curves use one control point, and straightening removes it', () => {
  const items = [left, right];
  const curved = withCurve(flow, true, items);
  assert.ok(curved.control);
  const g = arrowGeometry(curved, items, 2);
  assert.match(g.path, /^M .+ Q /);
  assert.ok(g.center.y < 0);
  assert.equal(withCurve(curved, false, items).control, null);
});

test('deleting a node removes its attached flows but preserves unrelated shapes', () => {
  assert.deepEqual(removeItems([left, right, flow], new Set(['a'])), [right]);
});

test('free endpoints and reversed arrowheads work without nodes', () => {
  const g = arrowGeometry({ from: { x: 100, y: 2 }, to: { x: 0, y: 2 } }, [], 4);
  assert.deepEqual(g.end, { x: 0, y: 2 });
  assert.ok(g.wings.every(wing => wing.x > 0));
});

test('a detached flow snaps near the actual shape and follows it after reattachment', () => {
  const point = { x: 142, y: 0 };
  assert.deepEqual(snapEndpoint(point, [left, right], 6), point);
  const to = snapEndpoint(point, [left, right], 10);
  assert.deepEqual(to, { node: 'b' });
  const reattached = { ...flow, to };
  assert.equal(arrowGeometry(reattached, [left, { ...right, x: 240 }], 2).end.x, 190);
  const corner = { x: 154, y: -46 };
  assert.deepEqual(snapEndpoint(corner, [right], 10), corner);
});

test('snap target selection ignores annotations and prefers the topmost overlapping shape', () => {
  const store = { ...left, id: 'store', kind: 'store' };
  const text = { ...left, id: 'text', kind: 'text' };
  assert.deepEqual(snapEndpoint({ x: 0, y: 0 }, [left, store, text, flow], 10), { node: 'store' });
});

test('label baselines center the visible ink including multiline descenders', () => {
  const lines = [
    { text: 'Α', left: -1, right: 9, ascent: 10, descent: 0 },
    { text: 'γ', left: 0, right: 8, ascent: 7, descent: 4 },
  ];
  const [first, second] = centerLabelLines(lines, 100, 50, 18, 'middle');
  assert.equal(first.x + (-lines[0].left + lines[0].right) / 2, 100);
  assert.equal(second.x + (-lines[1].left + lines[1].right) / 2, 100);
  assert.equal(second.y - first.y, 18);
  assert.equal((first.y - lines[0].ascent + second.y + lines[1].descent) / 2, 50);
});

test('Word exports native shapes, quadratic paths, and editable Greek labels', async () => {
  const sample = sampleDiagram();
  const document = await renderWord(sample, sample.items).text();
  assert.match(document, /<wpg:wgp>/);
  assert.match(document, /<a:prstGeom prst="ellipse">/);
  assert.match(document, /<a:quadBezTo>/);
  assert.match(document, /<wps:txbx>[^]*?Επεξεργασία/);
  assert.doesNotMatch(document, /word\/media\//);
});

test('Word keeps text fields on unlabeled shapes and excludes unselected shapes', async () => {
  const sample = sampleDiagram();
  const item = { ...sample.items[0], label: '' };
  const document = await renderWord(sample, [item]).text();
  assert.match(document, /<wps:txbx>/);
  assert.doesNotMatch(document, /Αποθήκη|<a:quadBezTo>/);
});
