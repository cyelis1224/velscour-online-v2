import assert from 'assert';
import { input, initInput } from '../../src/core/input.js';
import { G } from '../../src/state.js';

console.log('Testing touch joystick drag-to-start and tap pass-through...');

// Mock DOM elements and document
class MockElement {
  constructor(id) {
    this.id = id;
    this.style = {};
    this.classList = {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    };
  }
}

const mockBase = new MockElement('joy-base');
const mockKnob = new MockElement('joy-knob');

const listeners = {};
const mockCanvas = {
  addEventListener(event, fn) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(fn);
  },
  setPointerCapture() {}
};

globalThis.document = {
  getElementById(id) {
    if (id === 'joy-base') return mockBase;
    if (id === 'joy-knob') return mockKnob;
    return null;
  },
  addEventListener() {}
};

globalThis.window = {
  innerWidth: 400,
  innerHeight: 800,
  addEventListener() {}
};

G.W = 400;
G.H = 800;
G.mode = 'game';

initInput(mockCanvas);

const fireEvent = (event, data) => {
  if (listeners[event]) {
    for (const fn of listeners[event]) {
      fn({
        preventDefault() {},
        ...data
      });
    }
  }
};

// -------------------------------------------------------------
// Test 1: Portrait mode - Tap on lower half (clientY = 600 >= 400)
// -------------------------------------------------------------
input.reset();
// Touch down at (200, 600)
fireEvent('pointerdown', { pointerType: 'touch', pointerId: 10, clientX: 200, clientY: 600 });
assert.strictEqual(input.joy.active, false, 'Joystick should not immediately activate on pointerdown');
assert.strictEqual(input.worldTouch, null, 'worldTouch should be deferred until tap or drag is determined');
assert.ok(input.pendingJoy, 'pendingJoy should be registered');
assert.strictEqual(input.pendingJoy.ox, 200);
assert.strictEqual(input.pendingJoy.oy, 600);

// Tiny jitter move (2px)
fireEvent('pointermove', { pointerType: 'touch', pointerId: 10, clientX: 201, clientY: 601 });
assert.strictEqual(input.joy.active, false, 'Joystick should remain inactive on sub-threshold movement');
assert.ok(input.pendingJoy, 'pendingJoy still active');

// Pointer up (tap completed)
fireEvent('pointerup', { pointerType: 'touch', pointerId: 10, clientX: 201, clientY: 601 });
assert.strictEqual(input.joy.active, false, 'Joystick never activated on tap');
assert.strictEqual(input.pendingJoy, null, 'pendingJoy should be cleared');
assert.ok(input.worldTouch, 'worldTouch should now be emitted for the tap!');
assert.strictEqual(input.worldTouch.x, 200);
assert.strictEqual(input.worldTouch.y, 600);
assert.strictEqual(input.worldTouch.pressed, true);
assert.strictEqual(input.worldTouch.tapOnly, true);

// Next frame endFrame() cleanup
input.endFrame();
assert.strictEqual(input.worldTouch, null, 'tapOnly worldTouch should be cleared after endFrame');

// -------------------------------------------------------------
// Test 2: Portrait mode - Drag on lower half (joystick activation)
// -------------------------------------------------------------
input.reset();
fireEvent('pointerdown', { pointerType: 'touch', pointerId: 11, clientX: 150, clientY: 650 });
assert.strictEqual(input.joy.active, false);

// Drag by 25px (>= 10px) to the right
fireEvent('pointermove', { pointerType: 'touch', pointerId: 11, clientX: 175, clientY: 650 });
assert.strictEqual(input.joy.active, true, 'Joystick MUST activate once drag exceeds threshold');
assert.strictEqual(input.joy.ox, 150, 'Joystick origin must be initial touch point');
assert.strictEqual(input.joy.oy, 650);
assert.ok(input.joy.vx > 0, 'vx should be positive for rightward drag');
assert.strictEqual(mockBase.classList.contains('on'), true, 'joy-base should have "on" class');
assert.strictEqual(input.pendingJoy, null);
assert.strictEqual(input.worldTouch, null, 'worldTouch should NOT be created on joystick drag');

// Release joystick
fireEvent('pointerup', { pointerType: 'touch', pointerId: 11, clientX: 175, clientY: 650 });
assert.strictEqual(input.joy.active, false, 'Joystick ends on pointerup');
assert.strictEqual(mockBase.classList.contains('on'), false, 'joy-base "on" removed');
assert.strictEqual(input.worldTouch, null, 'No worldTouch emitted after joystick release');

// -------------------------------------------------------------
// Test 3: Landscape mode - Tap on left half (clientX = 200 < G.W * 0.5)
// -------------------------------------------------------------
G.W = 800;
G.H = 400;
window.innerWidth = 800;
window.innerHeight = 400;

input.reset();
// Touch down at (200, 200) - left half of screen
fireEvent('pointerdown', { pointerType: 'touch', pointerId: 12, clientX: 200, clientY: 200 });
assert.strictEqual(input.joy.active, false);
assert.ok(input.pendingJoy);

// Pointer up (tap)
fireEvent('pointerup', { pointerType: 'touch', pointerId: 12, clientX: 200, clientY: 200 });
assert.strictEqual(input.joy.active, false);
assert.ok(input.worldTouch, 'Tap on left half in landscape emits worldTouch!');
assert.strictEqual(input.worldTouch.x, 200);
assert.strictEqual(input.worldTouch.y, 200);
assert.strictEqual(input.worldTouch.tapOnly, true);
input.endFrame();
assert.strictEqual(input.worldTouch, null);

// -------------------------------------------------------------
// Test 4: Landscape mode - Drag on left half
// -------------------------------------------------------------
input.reset();
fireEvent('pointerdown', { pointerType: 'touch', pointerId: 13, clientX: 250, clientY: 250 });
fireEvent('pointermove', { pointerType: 'touch', pointerId: 13, clientX: 250, clientY: 280 }); // 30px down
assert.strictEqual(input.joy.active, true);
assert.ok(input.joy.vy > 0);
fireEvent('pointerup', { pointerType: 'touch', pointerId: 13, clientX: 250, clientY: 280 });
assert.strictEqual(input.joy.active, false);
assert.strictEqual(input.worldTouch, null);

// -------------------------------------------------------------
// Test 5: Outside joystick zone (e.g. clientX = 600 on right half in landscape)
// -------------------------------------------------------------
input.reset();
fireEvent('pointerdown', { pointerType: 'touch', pointerId: 14, clientX: 600, clientY: 200 });
assert.strictEqual(input.joy.active, false);
assert.strictEqual(input.pendingJoy, null);
assert.ok(input.worldTouch, 'Direct world touch on right half');
assert.strictEqual(input.worldTouch.x, 600);
assert.strictEqual(input.worldTouch.y, 200);
assert.strictEqual(input.worldTouch.pressed, true);
assert.strictEqual(input.worldTouch.tapOnly, undefined);

console.log('ALL TOUCH JOYSTICK TESTS PASSED!');
