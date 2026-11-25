import * as T from 'three';
import { createWorld, LIMIT, spawn } from './world.js';
import { createConstruction, plans } from './construction.js';
import { createInput } from './input.js';
import { fresh, readSave, recipes, saveState, slots } from './state.js';
import { addWorkbench, createEquipment } from './equipment.js';
import './style.css';

const $ = id => document.getElementById(id);
const touchClass = () => document.documentElement.classList.add('touch');
if (matchMedia('(pointer: coarse)').matches) touchClass();
const isTouch = () => document.documentElement.classList.contains('touch');
const clamp = T.MathUtils.clamp;
const set = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const meters = Object.fromEntries(['health', 'hunger', 'thirst', 'stamina'].map(name => [name, $(name)]));
const size = () => [innerWidth, innerHeight];
const planKeys = Object.keys(plans);
const VITAL_DRAIN = .7;
const targetDirection = new T.Vector3();
let scene, world, bench, equipment, construction, player, state, started = false, paused = true;
let panel = null, blueprint = null, rotation = 0, noticeUntil = 0, fallback = false;
let grounded = true, autoSave = 0;
let renderer;

try {
  renderer = new T.WebGLRenderer({ antialias: !isTouch(), powerPreference: 'low-power' });
} catch {
  $('start').disabled = true;
  set($('intro'), 'EXODUS needs a browser with WebGL 2 enabled.');
}
if (renderer) launch();

function launch() {
  const camera = new T.PerspectiveCamera(69, 1, .07, 155);
  camera.rotation.order = 'YXZ';
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'First-person view of the EXODUS forest');
  $('viewport').append(canvas);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  function resize() {
    const [width, height] = size();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch() ? 1.2 : 1.5,
      Math.sqrt(2200000 / (width * height))));
    renderer.setSize(width, height);
  }
  addEventListener('resize', resize);
  resize();

  const input = createInput(canvas, $('stick'), { active, action, freeLook: () => fallback, touch: touchClass });
  function active() { return started && !paused && !panel && state.health > 0; }
  function notify(message) {
    set($('notice'), message);
    noticeUntil = performance.now() + 2500;
  }
  function unlock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    input.clear();
  }
  function useLock() {
    if (isTouch() || fallback || document.pointerLockElement === canvas) return;
    if (!canvas.requestPointerLock) {
      pointerFallback();
      return;
    }
    try { canvas.requestPointerLock()?.catch(pointerFallback); } catch { pointerFallback(); }
  }
  function pointerFallback() {
    if (fallback) return;
    fallback = true;
    notify('Move the mouse over the game to look');
  }
  document.addEventListener('pointerlockerror', pointerFallback);
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && active() && !fallback && !isTouch()) {
      input.clear();
      $('pause').focus({ preventScroll: true });
    }
  });

  function reset(saved) {
    if (scene) {
      const geometries = new Set(), materials = new Set();
      scene.traverse(obj => {
        if (!obj.isMesh) return;
        geometries.add(obj.geometry);
        materials.add(obj.material);
        if (obj.isInstancedMesh) obj.dispose();
      });
      geometries.forEach(g => g.dispose());
      // Construction materials are shared between sessions.
      materials.forEach(m => { m.map?.dispose(); m.dispose(); });
      camera.clear();
    }
    state = saved ?? fresh();
    scene = new T.Scene();
    world = createWorld(scene);
    bench = addWorkbench(scene);
    equipment = createEquipment(scene, camera);
    for (const node of world.entries) {
      const remaining = state.nodes[node.id];
      if (remaining === 0) world.remove(node);
      else if (Number.isInteger(remaining) && remaining > 0 && remaining < node.hits) node.remaining = remaining;
    }
    construction = createConstruction(scene, [...world.entries, world.pod, bench], state.pieces);
    grounded = true;
    player = { x: state.x, z: state.z, y: construction.surface(state.x, state.z), velocity: 0 };
    input.axes.yaw = state.yaw;
    input.axes.pitch = state.pitch;
    input.axes.sprint = false;
    input.clear();
    blueprint = state.slot === 3 ? planKeys[0] : null;
    rotation = 0;
    panel = null;
    $('panel').hidden = true;
    autoSave = 0;
    orient();
    refreshKit();
  }

  function save() {
    return saveState({
      ...state, x: player.x, z: player.z, yaw: input.axes.yaw, pitch: input.axes.pitch,
      pieces: construction.serialize()
    });
  }

  function menu(mode) {
    paused = true;
    unlock();
    $('menu').hidden = false;
    $('hud').hidden = true;
    $('pause-actions').hidden = mode !== 'pause';
    $('resume').hidden = mode === 'pause' || !readSave();
    set($('start'), mode === 'pause' ? 'Resume survival' : mode === 'down' ? 'Return to escape pod' : 'Begin survival');
    set($('intro'), mode === 'pause'
      ? 'Field terminal suspended. Your progress is stored on this browser.'
      : mode === 'down' ? 'Your vitals failed. Return to the pod to recover.'
      : 'Your escape pod is down. Harvest the forest, craft tools, and build shelter in a 200 × 200 meter survey zone.');
    set($('menu-status'), '');
  }
  function play(saved) {
    if (saved || !started) reset(saved);
    if (state.health <= 0) {
      state.health = 100;
      state.hunger = 75;
      state.thirst = 75;
      state.stamina = 100;
      player.x = spawn.x;
      player.z = spawn.z;
      player.y = construction.surface(player.x, player.z);
      player.velocity = 0;
      grounded = true;
      input.axes.yaw = fresh().yaw;
      input.axes.pitch = fresh().pitch;
      save();
    }
    started = true;
    paused = false;
    $('menu').hidden = true;
    $('hud').hidden = false;
    useLock();
  }
  $('start').onclick = () => play();
  $('resume').onclick = $('load').onclick = () => {
    const saved = readSave();
    if (saved) play(saved);
    else set($('menu-status'), 'No saved survival data on this browser.');
  };
  $('save').onclick = () => set($('menu-status'), save() ? 'Survival data saved.' : 'Browser storage is unavailable.');
  $('pause').onclick = () => menu('pause');
  addEventListener('pagehide', () => { if (started) save(); });

  const hotbar = $('hotbar');
  const buttons = slots.map(([key, label], i) => {
    const button = document.createElement('button');
    const index = document.createElement('span');
    index.textContent = i + 1;
    button.append(index, label);
    button.onclick = () => action('slot-' + i);
    button.setAttribute('aria-label', label);
    hotbar.append(button);
    return button;
  });
  function refreshKit() {
    buttons.forEach((button, i) => {
      button.disabled = (i === 1 || i === 2) && !state[slots[i][0]];
      button.setAttribute('aria-pressed', String(state.slot === i));
    });
    set($('stock'), 'WOOD ' + state.wood + '  ·  STONE ' + state.stone);
    $('touch-sprint').setAttribute('aria-pressed', String(input.axes.sprint));
  }
  function nearBench() {
    return Math.hypot(player.x - bench.x, player.z - bench.z) <= 3.05 && Math.abs(player.y - bench.y) < 1.5;
  }
  function cyclePlan(offset) {
    if (!blueprint) return false;
    const index = planKeys.indexOf(blueprint);
    blueprint = planKeys[(index + offset + planKeys.length) % planKeys.length];
    refreshKit();
    return true;
  }
  function choose(item) {
    if (item === 3) open('build');
    else select(item);
  }
  function select(slot) {
    if ((slot === 1 || slot === 2) && !state[slots[slot][0]]) return;
    state.slot = slot;
    if (slot !== 3) blueprint = null;
    refreshKit();
  }
  function closePanel(lock = true) {
    panel = null;
    $('panel').hidden = true;
    if (lock) useLock();
  }
  $('close-panel').onclick = () => closePanel();
  function open(kind) {
    panel = kind;
    unlock();
    $('panel').hidden = false;
    set($('panel-title'), kind === 'build' ? 'Blueprint watch' : kind === 'craft' ? 'Workbench crafting' : 'Inventory');
    const items = $('panel-items');
    items.replaceChildren();
    const summary = document.createElement('p');
    summary.textContent = kind === 'build'
      ? 'Choose a plan to equip it. Cycle equipped plans with [ and ], the mouse wheel, or the watch arrows. Use R or Rotate to turn the piece.'
      : 'Wood ' + state.wood + ' · Stone ' + state.stone;
    items.append(summary);
    function option(label, detail, disabled, selectOption) {
      const button = document.createElement('button');
      button.className = 'choice';
      const description = document.createElement('span');
      description.textContent = detail;
      button.append(label, description);
      button.disabled = disabled;
      button.onclick = selectOption;
      items.append(button);
    }
    if (kind === 'build') {
      for (const [key, plan] of Object.entries(plans)) {
        option(plan.label, plan.cost + ' wood', false, () => {
          blueprint = key;
          select(3);
          closePanel();
        });
      }
    } else {
      if (kind !== 'craft') {
        const tip = document.createElement('p');
        tip.textContent = 'Visit the workbench beside the crash clearing to craft tools.';
        items.append(tip);
      }
      const availableRecipes = kind === 'craft' ? Object.entries(recipes) : [];
      for (const [key, recipe] of availableRecipes) {
        option(recipe.label, state[key] ? 'Crafted' : recipe.wood + ' wood · ' + recipe.stone + ' stone',
          state[key] || state.wood < recipe.wood || state.stone < recipe.stone,
          () => {
            state.wood -= recipe.wood;
            state.stone -= recipe.stone;
            state[key] = true;
            select(recipe.slot);
            closePanel();
            notify(recipe.label + ' crafted and equipped');
          });
      }
      option('Pod supplies', 'Restore hunger, thirst and health at the pod', false, () => {
        closePanel();
        supplies();
      });
    }
    $('close-panel').focus({ preventScroll: true });
  }

  function orient() {
    camera.position.set(player.x, player.y + 1.65, player.z);
    camera.rotation.set(input.axes.pitch, input.axes.yaw, 0);
    camera.updateMatrixWorld();
  }

  function supplies() {
    if (Math.hypot(player.x - world.pod.x, player.z - world.pod.z) > 4.5) {
      notify('Move within 4.5 m of the escape pod');
      return;
    }
    state.hunger = 100;
    state.thirst = 100;
    state.health = Math.min(100, state.health + 30);
    notify('Pod supplies restored your vitals');
  }

  function aim() {
    const d = camera.getWorldDirection(targetDirection);
    const door = construction.targetDoor(camera);
    let best = null, bestT = Infinity;
    for (const node of [...world.entries, world.pod, bench]) {
      if (node.remaining === 0 || (node.type === 'bench' && !nearBench())) continue;
      const x = node.x - player.x, z = node.z - player.z;
      const horizontal = Math.hypot(x, z);
      if (horizontal > 4.35 || horizontal < .01) continue;
      const dot = x * d.x + z * d.z;
      if (dot < .15) continue;
      const distance = Math.abs(z * d.x - x * d.z) / Math.max(.01, Math.hypot(d.x, d.z));
      const y = camera.position.y + horizontal * d.y / Math.max(.01, Math.hypot(d.x, d.z));
      const bottom = node.y ?? 0;
      const high = node.type === 'tree' ? 3.8 * node.size : node.type === 'stone' ? .91 * node.size : 2;
      if (distance > node.radius + .14 || y < bottom - .22 || y > bottom + high + .22) continue;
      if (horizontal < bestT) {
        best = node;
        bestT = horizontal;
      }
    }
    if (door && door.mesh.position.distanceTo(camera.position) < bestT + .8) return { door };
    return best;
  }

  function use() {
    orient();
    if (blueprint) {
      const reason = construction.preview(blueprint, rotation, camera, player, state.wood);
      if (!construction.place()) return notify(reason);
      state.wood -= plans[blueprint].cost;
      notify(plans[blueprint].label + ' placed');
      refreshKit();
      return;
    }
    const node = aim();
    if (!node) return notify('Aim at a resource or door within reach');
    if (node.door) {
      if (construction.toggle(node.door, player)) notify(node.door.open ? 'Door opened' : 'Door closed');
      else notify('Step clear of the doorway');
      return;
    }
    if (node.type === 'pod') return supplies();
    if (node.type === 'bench') return open('craft');
    equipment.strike();
    const tree = node.type === 'tree';
    const tool = state.slot === (tree ? 1 : 2);
    const resource = tree ? 'wood' : 'stone';
    const amount = Math.min(node.remaining, tool ? 2 : 1);
    node.remaining -= amount;
    state[resource] += amount * (tree ? 3 : 2);
    state.nodes[node.id] = node.remaining;
    if (!node.remaining) world.remove(node);
    notify('+' + amount * (tree ? 3 : 2) + ' ' + resource + (!node.remaining ? (tree ? ' · Tree felled' : ' · Deposit depleted') : ''));
    refreshKit();
  }

  function action(command) {
    if (command === 'escape') {
      if (panel) closePanel(false);
      else if (active()) menu('pause');
      return;
    }
    if (!active()) return;
    if (command.startsWith('slot-')) choose(Number(command.at(-1)));
    else if (command === 'lock') useLock();
    else if (command === 'inventory') open(nearBench() ? 'craft' : 'inventory');
    else if (command === 'pack') open('inventory');
    else if (command === 'build') open('build');
    else if (command === 'previous-plan' || command === 'next-plan') {
      return cyclePlan(command === 'next-plan' ? 1 : -1);
    }
    else if (command === 'use') use();
    else if (command === 'supplies') supplies();
    else if (command === 'rotate' && blueprint) rotation = (rotation + 1) % 4;
    else if (command === 'jump' && grounded && state.stamina >= 7) {
      grounded = false;
      player.velocity = 5.35;
      state.stamina -= 7;
    } else if (command === 'sprint') {
      input.axes.sprint = !input.axes.sprint;
      refreshKit();
    }
  }
  document.querySelectorAll('[data-action]').forEach(button => {
    button.onclick = () => action(button.dataset.action);
  });

  function blocked(x, z) {
    if (Math.abs(x) >= LIMIT - .35 || Math.abs(z) >= LIMIT - .35) return true;
    if (construction.blocks(x, z, player.y)) return true;
    if (player.y < bench.y + .95 && Math.hypot(x - bench.x, z - bench.z) < bench.radius + .22) return true;
    if (Math.hypot(x - world.pod.x, z - world.pod.z) < world.pod.radius + .28) return true;
    return world.entries.some(n => n.remaining && player.y < n.y + (n.type === 'tree' ? 3.8 * n.size : .83 * n.size)
      && Math.hypot(x - n.x, z - n.z) < n.radius + .28);
  }
  function movement(dt) {
    const motion = input.motion();
    const moving = Math.abs(motion.x) + Math.abs(motion.z) > .04;
    const sprint = moving && motion.sprint && state.stamina > 1;
    const speed = (sprint ? 7.25 : 4.15) * dt;
    const sin = Math.sin(input.axes.yaw), cos = Math.cos(input.axes.yaw);
    const nextX = player.x + (motion.x * cos + motion.z * sin) * speed;
    const nextZ = player.z + (motion.z * cos - motion.x * sin) * speed;
    if (moving && !blocked(nextX, player.z)) player.x = nextX;
    if (moving && !blocked(player.x, nextZ)) player.z = nextZ;
    const floor = construction.surface(player.x, player.z);
    player.velocity -= 15 * dt;
    player.y += player.velocity * dt;
    if (player.velocity > 0) {
      const ceiling = construction.ceiling(player.x, player.z, player.y);
      if (player.y + 1.67 > ceiling) {
        player.y = ceiling - 1.67;
        player.velocity = 0;
      }
    }
    if (player.y <= floor) {
      player.y = floor;
      grounded = true;
      player.velocity = 0;
    } else grounded = false;
    state.stamina = clamp(state.stamina + (sprint ? -20 : 13) * dt, 0, 100);
    state.hunger = Math.max(0, state.hunger - (sprint ? .28 : .13) * VITAL_DRAIN * dt);
    state.thirst = Math.max(0, state.thirst - (sprint ? .39 : .19) * VITAL_DRAIN * dt);
    if (!state.hunger || !state.thirst) state.health = Math.max(0, state.health - 2.2 * dt);
    if (!state.health) {
      save();
      menu('down');
    }
  }

  function updateHud(now) {
    const angle = ((Math.round(-input.axes.yaw * 180 / Math.PI) % 360) + 360) % 360;
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    set($('heading'), compass[Math.round(angle / 45) % 8] + ' · ' + String(angle).padStart(3, '0') + '°');
    set($('coords'), Math.round(player.x) + ' E / ' + Math.round(-player.z) + ' N');
    for (const [key, meter] of Object.entries(meters)) meter.value = state[key];
    if (now > noticeUntil) set($('notice'), '');
    if (blueprint) {
      const reason = construction.preview(blueprint, rotation, camera, player, state.wood);
      set($('prompt'), plans[blueprint].label + ' / ' + reason);
      set($('touch-use'), 'PLACE');
    } else {
      construction.preview(null);
      const node = active() ? aim() : null;
      const key = isTouch() ? '' : '[E] ';
      let label = '';
      if (node?.door) label = node.door.open ? 'Close door' : 'Open door';
      else if (node?.type === 'bench') label = 'Use workbench';
      else if (node?.type === 'pod') label = 'Recover pod supplies';
      else if (node) label = (node.type === 'tree' ? 'Chop timber' : 'Gather stone') + ' · ' + node.remaining + '/' + node.hits;
      set($('prompt'), label ? key + label : '');
      set($('touch-use'), node?.door || node?.type === 'pod' || node?.type === 'bench' ? 'USE' : 'GATHER');
    }
    $('touch-rotate').hidden = !blueprint;
    $('watch-hud').hidden = !blueprint;
    if (blueprint) {
      set($('watch-name'), plans[blueprint].label);
      set($('watch-cost'), plans[blueprint].cost + ' WOOD · ' + (planKeys.indexOf(blueprint) + 1) + '/' + planKeys.length);
    }
    $('craft-tip').hidden = !active() || !!blueprint || !nearBench() || (state.axe && state.pick);
    set($('craft-tip'), isTouch() ? 'WORKBENCH NEARBY · TAP CRAFT' : 'WORKBENCH NEARBY · PRESS C TO CRAFT');
    if (state.pieces.length || construction.hasPieces()) {
      set($('objective'), 'Extend your shelter');
      set($('guide'), 'Snap walls, doorframes and a roof to a foundation.');
    } else if (state.axe || state.pick) {
      set($('objective'), 'Build a shelter');
      set($('guide'), 'Open blueprints and place a foundation on clear ground.');
    } else if (state.wood || state.stone) {
      set($('objective'), 'Craft a stone tool');
      set($('guide'), 'Harvest wood and stone. Craft tools at the workbench near the pod.');
    } else {
      set($('objective'), 'Salvage the crash site');
      set($('guide'), 'Gather wood and stone, then craft tools at the workbench.');
    }
  }
  reset(readSave() ?? undefined);
  menu('intro');

  let last = performance.now(), uiAt = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (active()) {
      movement(dt);
      orient();
      autoSave += dt;
      if (autoSave > 20) {
        save();
        autoSave = 0;
      }
    }
    if (started && now > uiAt) {
      updateHud(now);
      uiAt = now + 70;
    }
    const motion = input.motion();
    equipment.update(player, input.axes.yaw, input.axes.pitch, state.slot, dt, started && !paused,
      active() ? Math.hypot(motion.x, motion.z) : 0, isTouch(), plans[blueprint]);
    renderer.render(scene, camera);
  });
}
