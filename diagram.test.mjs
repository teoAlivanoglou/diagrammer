import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignShapes, arrowGeometry, curveControlRegion, visibleCurve, distributeShapes, flowLabelPlacement, flowLabelPosition, gridPoint, itemsInMarquee, marqueeBox, pinAttachment, removeItems, reverseFlow, sampleDiagram, shortcutKey, snapEndpoint, stateLoop, withCurve } from './diagram.mjs';
import { centerLabelLines, flowLabelWordBoxes, measureLabel, wrapLabel } from './drawing.mjs';

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

test('an SFD self-transition attaches at two distinct points and bends outside the state', () => {
  const state = { ...left, kind: 'state' };
  const loop = { kind: 'flow', notation: 'sfd', ...stateLoop(state.id) };
  const geometry = arrowGeometry(loop, [state, loop], 2);
  assert.ok(geometry.start.x < geometry.end.x);
  assert.equal(geometry.start.y, -25);
  assert.equal(geometry.end.y, -25);
  assert.ok(geometry.control.y < -25);
  assert.equal(geometry.manualPortsAdjusted, false);
  assert.deepEqual(withCurve(loop, false, [state, loop]), loop);
  const reversed = arrowGeometry(reverseFlow(loop, [state, loop]), [state, loop], 2);
  assert.deepEqual(reversed.start, geometry.end);
  assert.deepEqual(reversed.control, geometry.control);
});

test('SFD labels stay parallel to the arrow and sit on the outside normal at the curve midpoint', () => {
  const transition = { notation: 'sfd', from: { x: 10, y: 15 }, to: { x: 110, y: 115 } };
  const box = { width: 60, height: 12 };
  const straight = arrowGeometry(transition, [], 2);
  assert.equal(flowLabelPlacement(transition, straight, 2, box).angle, 45);
  const curved = { ...transition, control: { t: 0.2, offset: 70 } };
  const geometry = arrowGeometry(curved, [], 2);
  const label = flowLabelPlacement(curved, geometry, 2, box);
  assert.equal(label.angle, 45);
  assert.ok(Math.abs(label.x - geometry.center.x + (label.y - geometry.center.y)) < 1e-7);
  assert.ok(label.y > geometry.center.y);
  const reversed = reverseFlow(curved, []);
  const flipped = flowLabelPlacement(reversed, arrowGeometry(reversed, [], 2), 2, box);
  assert.equal(flipped.angle, label.angle);
  assert.ok(Math.hypot(flipped.x - label.x, flipped.y - label.y) < 1e-7);
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

test('attached curve tangents and the debug region share a 120-degree opening', () => {
  const items = [left, right];
  const curve = { ...flow, control: { t: 0.5, offset: -900 } };
  const { start, end, control } = arrowGeometry(curve, items, 2);
  const region = curveControlRegion(curve, items, 2, { x: -100, y: -100, width: 400, height: 200 });
  const maxSlope = Math.sqrt(3);
  assert.ok(Math.abs(Math.abs(control.y) / (control.x - start.x) - maxSlope) < 1e-7);
  assert.equal(region.length, 6);
  for (const { x, y } of region) {
    assert.ok(Math.abs(y) <= maxSlope * Math.min(x - start.x, end.x - x) + 1e-7);
  }
  const free = { ...curve, to: { x: 200, y: 0 } };
  const freeRegion = curveControlRegion(free, [left], 2, { x: 196, y: 90, width: 4, height: 10 });
  assert.equal(freeRegion.length, 4);
});

test('opposite flows use separate attachment points on the same store rail and process', () => {
  const sample = sampleDiagram();
  const flows = sample.items.filter(item => ['record', 'status'].includes(item.id));
  const [outbound, inbound] = flows.map(item => arrowGeometry(item, sample.items, 2));
  assert.equal(outbound.end.y, inbound.start.y);
  assert.ok(Math.abs(outbound.end.x - inbound.start.x) >= 15);
  assert.ok(Math.hypot(outbound.start.x - inbound.end.x, outbound.start.y - inbound.end.y) >= 15);
  const [thickOut, thickIn] = flows.map(item => arrowGeometry(item, sample.items, 8));
  assert.ok(Math.abs(thickOut.end.x - thickIn.start.x) > Math.abs(outbound.end.x - inbound.start.x));
});

test('the transparent label gap preserves quadratic segments outside its bounds', () => {
  const curve = { start: { x: 0, y: 0 }, control: { x: 50, y: -100 }, end: { x: 100, y: 0 } };
  const box = { x: 40, y: -55, width: 20, height: 10 };
  const parts = visibleCurve(curve, [box]);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0].start, curve.start);
  assert.ok(Math.abs(parts[0].end.x - 40) < 1e-7);
  assert.ok(Math.abs(parts[1].start.x - 60) < 1e-7);
  assert.deepEqual(parts[1].end, curve.end);
  assert.ok(parts.every(part => part.control));
  assert.deepEqual(visibleCurve(curve, [{ x: -1, y: -101, width: 102, height: 102 }]), []);
});

test('only the long line interrupts an arrow outside the shorter lines', () => {
  const lines = measureLabel({ kind: 'flow', label: 'AAA\nhello, world, how are you\nfoo\nbar', size: 14 }, testFont, true);
  const boxes = flowLabelWordBoxes({ x: 0, y: 0, anchor: 'middle' }, lines, 14, 2);
  assert.equal(boxes.length, 8);
  const parts = visibleCurve({ start: { x: 47, y: -50 }, end: { x: 47, y: 50 } }, boxes);
  assert.equal(parts.length, 2);
  assert.ok(Math.abs(parts[0].end.y - boxes[1].y) < 1e-7);
  assert.ok(Math.abs(parts[1].start.y - boxes[1].y - boxes[1].height) < 1e-7);
});

const testFont = {
  measureText(text) {
    return { width: text.length * 5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 5,
      actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 };
  },
};

test('word cutouts keep the stroke visible in spaces and between Greek label lines', () => {
  const lines = measureLabel({ kind: 'flow', label: 'ΜΚΩ,\nστοιχεία αιτούντος', size: 14 }, testFont, true);
  const boxes = flowLabelWordBoxes({ x: 0, y: 0, anchor: 'middle' }, lines, 14, 2);
  assert.equal(boxes.length, 3);
  assert.ok(boxes[0].y + boxes[0].height < boxes[1].y);
  assert.ok(boxes[1].x + boxes[1].width < boxes[2].x);
  const segment = { start: { x: -2.5, y: -40 }, end: { x: -2.5, y: 40 } };
  const parts = visibleCurve(segment, boxes);
  assert.equal(parts.length, 2);
  assert.ok(Math.abs(parts[1].start.y - boxes[0].y - boxes[0].height) < 1e-7);
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

test('a dragged label keeps its position along the curve and its perpendicular offset after a rotation', () => {
  const item = { id: 'arrow', from: { x: 0, y: 0 }, to: { x: 100, y: 0 },
    control: { t: 0.5, offset: -40 }, label: 'Test', size: 14 };
  const geometry = arrowGeometry(item, [], 2);
  const labelPosition = flowLabelPosition(geometry, { x: 25, y: -5 });
  assert.deepEqual(labelPosition, { t: 0.25, offset: 10 });
  const moved = { ...item, labelPosition, to: { x: 0, y: 200 } };
  const placement = flowLabelPlacement(moved, arrowGeometry(moved, [], 2), 2, { width: 50, height: 10 });
  assert.deepEqual(placement, { x: 5, y: 50, anchor: 'middle' });
  const reversed = reverseFlow(moved, []);
  assert.deepEqual(flowLabelPlacement(reversed, arrowGeometry(reversed, [], 2), 2, { width: 50, height: 10 }), placement);
});

test('automatic labels stay over the same part of the chord when the bend slides', () => {
  const item = { from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, label: 'Test', size: 14 };
  for (const t of [0.2, 0.8]) {
    const curved = { ...item, control: { t, offset: -80 } };
    const placement = flowLabelPlacement(curved, arrowGeometry(curved, [], 2), 2, { width: 40, height: 12 });
    assert.equal(placement.x, 100);
  }
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

test('pinned endpoints use shape-relative positions and snap near the edge midpoints', () => {
  const from = pinAttachment(left, { x: 52, y: 15 }, 8);
  assert.deepEqual(from.anchor, { side: 'right', offset: 0.6 });
  const items = [{ ...left, x: 20, y: 10, h: 100 }, right];
  assert.deepEqual(arrowGeometry({ ...flow, from }, items, 2).start, { x: 70, y: 40 });
  assert.deepEqual(pinAttachment(left, { x: 52, y: 5 }, 8).anchor, { side: 'right', offset: 0 });
  const store = { ...left, kind: 'store' };
  assert.deepEqual(pinAttachment(store, { x: 52, y: 8 }, 8).anchor, { side: 'bottom', offset: 1 });
  assert.deepEqual(pinAttachment(right, { x: 198, y: -50 }, 8).anchor, { angle: -Math.PI / 2 });
});

test('attachment magnets use 15-degree intervals and keep straight-edge magnets clear of corners', () => {
  const step = Math.PI / 12;
  const onCircle = degrees => ({ x: right.x + 50 * Math.cos(degrees * Math.PI / 180),
    y: right.y + 50 * Math.sin(degrees * Math.PI / 180) });
  assert.equal(pinAttachment(right, onCircle(31), 9).anchor.angle, 2 * step);
  assert.equal(pinAttachment(right, onCircle(-46), 9).anchor.angle, -3 * step);
  assert.ok(Math.abs(pinAttachment(right, onCircle(37.5), 9).anchor.angle - 2.5 * step) < 1e-7);

  const offset = (node, x) => pinAttachment(node, { x, y: -node.h / 2 }, 9).anchor.offset;
  const store = { ...left, kind: 'store' };
  assert.equal(offset(left, 22), 0.4);
  assert.equal(offset(store, -22), -0.4);
  assert.equal(offset(left, 39), 0.78);
  assert.equal(offset(left, 30), 0.6);
  assert.equal(offset({ ...left, w: 30 }, 2), 2 / 15);
  assert.equal(offset({ ...left, w: 80 }, 22), 0.5);
});

test('manual pins take priority over automatic spreading and incompatible pins are identified', () => {
  const from = pinAttachment(left, { x: 50, y: 0 });
  const to = pinAttachment(right, { x: 150, y: 0 });
  const pinned = { ...flow, from, to, control: { t: 0.5, offset: -15 } };
  const sibling = { ...flow, id: 'sibling' };
  const items = [left, right, pinned, sibling];
  const geometry = arrowGeometry(pinned, items, 2);
  assert.deepEqual(geometry.start, { x: 50, y: 0 });
  assert.ok(Math.hypot(arrowGeometry(sibling, items, 2).start.y) >= 8);
  assert.equal(geometry.manualPortsAdjusted, false);
  const opposite = { ...pinned, from: pinAttachment(left, { x: -50, y: 0 }),
    to: pinAttachment(right, { x: 250, y: 0 }) };
  assert.equal(arrowGeometry(opposite, items, 2).manualPortsAdjusted, true);
  const single = { ...opposite, to: flow.to };
  const onePin = arrowGeometry(single, items, 2);
  assert.equal(onePin.manualPortsAdjusted, false);
  assert.deepEqual(onePin.start, { x: -50, y: 0 });
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
