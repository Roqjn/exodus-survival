import { MathUtils } from 'three';

export function createInput(surface, stick, { active, action, freeLook, touch }) {
  const held = new Set();
  const axes = { x: 0, z: 0, yaw: 0, pitch: 0, sprint: false };
  const nub = stick.firstElementChild;
  let moveId, lookId, lastX, lastY, mouseX, mouseY;
  const bindings = {
    Space: 'jump', KeyE: 'use', KeyC: 'inventory', KeyI: 'pack', KeyB: 'build',
    BracketLeft: 'previous-plan', BracketRight: 'next-plan', KeyR: 'rotate', KeyF: 'supplies', Escape: 'escape',
    Digit1: 'slot-0', Digit2: 'slot-1', Digit3: 'slot-2', Digit4: 'slot-3'
  };
  addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      if (!event.repeat) action('escape');
      return;
    }
    if (!active()) return;
    if (event.target instanceof HTMLButtonElement && ['Enter', 'Space'].includes(event.code)) {
      event.target.blur();
    }
    held.add(event.code);
    const command = bindings[event.code];
    if (command) {
      event.preventDefault();
      if (!event.repeat) action(command);
    }
  });
  addEventListener('keyup', event => held.delete(event.code));
  function clear() {
    held.clear();
    axes.x = axes.z = 0;
    moveId = lookId = undefined;
    mouseX = mouseY = undefined;
    nub.style.transform = '';
  }
  addEventListener('blur', clear);
  function look(dx, dy, amount) {
    axes.yaw -= dx * amount;
    axes.pitch = MathUtils.clamp(axes.pitch - dy * amount, -1.5, 1.5);
  }
  document.addEventListener('mousemove', ev => {
    if (!active()) return;
    if (document.pointerLockElement === surface) look(ev.movementX, ev.movementY, .0025);
    else if (freeLook() && ev.target === surface) {
      if (mouseX !== undefined) look(ev.clientX - mouseX, ev.clientY - mouseY, .0034);
      mouseX = ev.clientX;
      mouseY = ev.clientY;
    } else mouseX = mouseY = undefined;
  });
  surface.addEventListener('pointerdown', ev => {
    if (!active()) return;
    if (ev.pointerType === 'mouse') {
      if (ev.button === 0) {
        if (document.pointerLockElement === surface || freeLook()) action('use');
        else action('lock');
      }
      return;
    }
    touch();
    if (lookId !== undefined) return;
    surface.setPointerCapture(ev.pointerId);
    lookId = ev.pointerId;
    lastX = ev.clientX;
    lastY = ev.clientY;
  });
  surface.addEventListener('pointermove', ev => {
    if (ev.pointerId !== lookId || !active()) return;
    look(ev.clientX - lastX, ev.clientY - lastY, .0044);
    lastX = ev.clientX;
    lastY = ev.clientY;
  });
  const releaseLook = ev => { if (ev.pointerId === lookId) lookId = undefined; };
  surface.addEventListener('lostpointercapture', releaseLook);
  surface.addEventListener('wheel', ev => {
    if (!active() || !ev.deltaY) return;
    if (action(ev.deltaY > 0 ? 'next-plan' : 'previous-plan')) ev.preventDefault();
  }, { passive: false });
  surface.addEventListener('contextmenu', ev => ev.preventDefault());
  function stickMove(ev) {
    const rect = stick.getBoundingClientRect();
    const x = ev.clientX - rect.left - rect.width / 2;
    const y = ev.clientY - rect.top - rect.height / 2;
    const range = rect.width * .37;
    const factor = Math.max(range, Math.hypot(x, y));
    axes.x = x / factor;
    axes.z = y / factor;
    nub.style.transform = 'translate(' + axes.x * range + 'px,' + axes.z * range + 'px)';
  }
  stick.addEventListener('pointerdown', ev => {
    if (moveId !== undefined || !active()) return;
    moveId = ev.pointerId;
    stick.setPointerCapture(moveId);
    stickMove(ev);
  });
  stick.addEventListener('pointermove', ev => { if (ev.pointerId === moveId) stickMove(ev); });
  stick.addEventListener('lostpointercapture', ev => {
    if (ev.pointerId !== moveId) return;
    moveId = undefined;
    axes.x = axes.z = 0;
    nub.style.transform = '';
  });
  function motion() {
    const x = axes.x + Number(held.has('KeyD')) - Number(held.has('KeyA'));
    const z = axes.z + Number(held.has('KeyS')) - Number(held.has('KeyW'));
    const length = Math.max(1, Math.hypot(x, z));
    return { x: x / length, z: z / length, sprint: axes.sprint || held.has('ShiftLeft') || held.has('ShiftRight') };
  }
  return { axes, motion, clear };
}
