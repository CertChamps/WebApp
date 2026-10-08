import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const parse = path => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let found;
  ts.forEachChild(node, child => { if (!found) found = find(child, predicate); });
  return found;
}
function evaluate(code, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}
const zoom = parse('src/components/questions/ZoomableQuestionImage.tsx');
const touchMove = find(zoom, node => ts.isVariableDeclaration(node) && node.name.getText(zoom) === 'onTouchMove').initializer.getText(zoom);
const helperNames = ['touchPoint', 'getDistance', 'getCenter', 'clampScale'];
const helpers = zoom.statements.filter(node => ts.isFunctionDeclaration(node) && helperNames.includes(node.name.text)).map(node => node.getText(zoom)).join('\n');
const scroll = { scrollTop: 40 };
const globals = { enabledRef: { current: true }, scrollStartRef: { current: { y: 100, scrollTop: 40 } }, pinchingRef: { current: false }, pinchStartRef: { current: null }, tapStartRef: { current: { x: 100, y: 100 } }, movedRef: { current: false }, transformRef: { current: { scale: 1, panX: 0, panY: 0 } }, setIsPinching() {}, setTransform() {}, getScroller: () => scroll };
const context = evaluate(`const TAP_MOVE_THRESHOLD_PX = 8, MIN_SCALE = 1, MAX_SCALE = 5;\n${helpers}\nconst move = ${touchMove};`, globals);
let prevented = false;
context.event = { touches: [{ clientX: 100, clientY: 60 }], preventDefault: () => { prevented = true; } };
vm.runInContext('move(event)', context);
assert.equal(scroll.scrollTop, 40);
assert.equal(prevented, false);
assert.equal(globals.movedRef.current, true);
context.event = { touches: [{ clientX: 100, clientY: 60 }, { clientX: 200, clientY: 60 }], preventDefault: () => { prevented = true; } };
vm.runInContext('move(event)', context);
assert.equal(prevented, true);
assert.equal(globals.pinchingRef.current, true);

const popout = parse('src/components/discover/FloatingDiscoverResource.tsx');
const fit = find(popout, node => ts.isFunctionDeclaration(node) && node.name.text === 'fit').getText(popout);
const popoutContext = evaluate(fit, { window: { innerWidth: 1024, innerHeight: 768 } });
const frame = popoutContext.fit({ x: 2000, y: -100, width: 1600, height: 1000 });
assert.equal(frame.x, 8);
assert.equal(frame.y, 8);
assert.equal(frame.width, 1008);
assert.equal(frame.height, 752);
popoutContext.window.innerWidth = 320;
popoutContext.window.innerHeight = 480;
const small = popoutContext.fit({ x: 60, y: 80, width: 520, height: 380 });
assert.ok(small.x + small.width <= 312);
assert.ok(small.y + small.height <= 472);
assert.equal(small.width, 304);
console.log('Scroll and popout checks passed: native single-finger scroll preserved, pinch still intercepted, popout movement/resize clamped to desktop and phone viewports.');
