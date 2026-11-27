import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignShapes, arrowGeometry, visibleCurve, distributeShapes, flowLabelPlacement, gridPoint, itemsInMarquee, marqueeBox, removeItems, sampleDiagram, shortcutKey, snapEndpoint, withCurve } from './diagram.mjs';
import { centerLabelLines, wrapLabel } from './drawing.mjs';
import { renderWord } from './word.mjs';

const left = { id: 'a', kind: 'entity', x: 0, y: 0, w: 100, h: 50 };
const right = { id: 'b', kind: 'process', x: 200, y: 0, w: 100, h: 100 };
const flow = { id: 'flow', kind: 'flow', from: { node: 'a' }, to: { node: 'b' } };

test('editor shortcuts respect Latin keys and fall back to physical keys for Greek', () => {
  assert.equal(shortcutKey({ key: 'A', code: 'KeyQ' }), 'a');
  assert.equal(shortcutKey({ key: 'π', code: 'KeyP' }), 'p');
  assert.equal(shortcutKey({ key: 'ζ', code: 'KeyZ' }), 'z');
  assert.equal(shortcutKey({ key: 'Unidentified', code: 'KeyP' }), 'unidentified');
});

test('marquee selects enclosed items in any drag direction and can extend a selection', () => {
  const box = marqueeBox({ x: 90, y: 70 }, { x: 15, y: 20 });
  assert.deepEqual(box, { x: 15, y: 20, width: 75, height: 50 });
  const bounds = new Map([
    ['inside', { x: 25, y: 30, width: 65, height: 10 }],
    ['partial', { x: 5, y: 30, width: 30, height: 10 }],
  ]);
  assert.deepEqual(itemsInMarquee(box, bounds, new Set(['existing'])), new Set(['existing', 'inside']));
});

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

test('a curve keeps its fractional position and perpendicular offset when an endpoint moves', () => {
  const item = { ...flow, control: { t: 0.25, offset: -40 } };
  const old = arrowGeometry(item, [left, right], 2);
  const moved = arrowGeometry(item, [left, { ...right, x: 300 }], 2);
  assert.deepEqual(old.control, { x: 75, y: -40 });
  assert.deepEqual(moved.control, { x: 100, y: -40 });
});

test('data flow connects to a data store rail, including when approached from the side', () => {
  const store = { ...right, kind: 'store', h: 50 };
  const g = arrowGeometry(flow, [left, store], 2);
  assert.equal(g.end.y, -25);
  const lower = arrowGeometry({ ...flow, to: { node: 'b', side: 'bottom' } }, [left, store], 2);
  assert.equal(lower.end.y, 25);
});

test('an extreme control point cannot turn a curve into either attached shape', () => {
  const store = { ...right, kind: 'store', h: 50 };
  const curve = { ...flow, control: { t: 0.5, offset: 900 } };
  const g = arrowGeometry(curve, [left, store], 2);
  assert.ok(g.control.x >= g.start.x);
  assert.ok(g.control.y < g.end.y);
});

test('the transparent label gap preserves quadratic segments outside its bounds', () => {
  const curve = { start: { x: 0, y: 0 }, control: { x: 50, y: -100 }, end: { x: 100, y: 0 } };
  const box = { x: 40, y: -55, width: 20, height: 10 };
  const parts = visibleCurve(curve, box);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0].start, curve.start);
  assert.ok(Math.abs(parts[0].end.x - 40) < 1e-7);
  assert.ok(Math.abs(parts[1].start.x - 60) < 1e-7);
  assert.deepEqual(parts[1].end, curve.end);
  assert.ok(parts.every(part => part.control));
  assert.deepEqual(visibleCurve(curve, { x: -1, y: -101, width: 102, height: 102 }), []);
});

test('curved labels keep their full ink box beyond the outside tangent', () => {
  const item = {
    from: { x: 0, y: 0 }, to: { x: 150, y: 100 },
    control: { x: 100, y: -90 }, label: 'Curved label', size: 16,
  };
  const stroke = 4;
  const box = { width: 140, height: 48 };
  const geometry = arrowGeometry(item, [], stroke);
  const label = flowLabelPlacement(item, geometry, stroke, box);
  const length = Math.hypot(100, 150);
  const normal = { x: 100 / length, y: -150 / length };
  const support = normal.x * box.width / 2 - normal.y * box.height / 2;
  const clearance = (label.x - geometry.center.x) * normal.x +
    (label.y - geometry.center.y) * normal.y - support;
  assert.ok(clearance >= 8 - 1e-7);
});

test('moving a label applies an offset from its automatic position', () => {
  const item = { ...flow, control: { x: 120, y: 110 }, label: 'Test', size: 14 };
  const geometry = arrowGeometry(item, [left, right], 2);
  const box = { width: 45, height: 15 };
  const automatic = flowLabelPlacement(item, geometry, 2, box);
  const adjusted = flowLabelPlacement({ ...item, labelOffset: { x: 30, y: -9 } }, geometry, 2, box);
  assert.equal(adjusted.x, automatic.x + 30);
  assert.equal(adjusted.y, automatic.y - 9);
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

test('shape labels wrap at word boundaries and retain explicit paragraph breaks', () => {
  const measure = text => text.length;
  assert.deepEqual(wrapLabel('Νέα παραγγελία πελάτη\n\nΤελική', 12, measure),
    ['Νέα', 'παραγγελία', 'πελάτη', '', 'Τελική']);
  assert.deepEqual(wrapLabel('Α  Β Γ', 4, measure), ['Α  Β', 'Γ']);
});

test('a long word splits without separating Greek combining accents', () => {
  const measure = text => text.normalize('NFC').length;
  assert.deepEqual(wrapLabel('α\u0301βα\u0301β', 2, measure), ['α\u0301β', 'α\u0301β']);
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
