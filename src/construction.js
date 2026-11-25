import * as T from 'three';
import { LIMIT, box, height } from './world.js';

export const plans = {
  foundation: { label: 'Foundation', cost: 4 },
  wall: { label: 'Wall', cost: 3 },
  frame: { label: 'Doorframe', cost: 3 },
  door: { label: 'Door', cost: 2 },
  roof: { label: 'Roof', cost: 4 }
};
const CELL = 3;
const RIM = CELL / 2;
const level = 2.24;
const wood = new T.MeshStandardMaterial({ color: '#8b6947' });
const brace = new T.MeshStandardMaterial({ color: '#51412d' });
const validMat = new T.MeshBasicMaterial({ color: '#65ef8b', transparent: true, opacity: .43, depthWrite: false });
const badMat = new T.MeshBasicMaterial({ color: '#ff5355', transparent: true, opacity: .45, depthWrite: false });
const cellKey = (x, z) => x + ',' + z;

function edgeKey(p) {
  const r = p.rotation;
  return cellKey(p.x * 2 + [0, 1, 0, -1][r], p.z * 2 + [-1, 0, 1, 0][r]);
}

function shape(type) {
  const group = new T.Group();
  if (type === 'foundation' || type === 'roof') {
    const y = type === 'roof' ? level + .11 : -.14;
    for (let i = 0; i < 6; i++) {
      box(group, wood, .494, .22, CELL, i * .5 - 1.25, y, 0);
    }
    for (const z of [-1.16, 1.16]) box(group, brace, CELL, .17, .19, 0, y - .15, z);
    if (type === 'foundation') {
      for (const x of [-1.21, 1.21]) for (const z of [-1.21, 1.21]) {
        box(group, brace, .31, .91, .31, x, -.54, z);
      }
    }
  } else if (type === 'wall') {
    for (let i = 0; i < 8; i++) {
      box(group, wood, .369, level, .15, i * .375 - 1.3125, level / 2, 0);
    }
    for (const y of [.28, 1.91]) box(group, brace, CELL, .14, .22, 0, y, 0);
  } else if (type === 'frame') {
    for (const x of [-1.12, 1.12]) box(group, wood, .76, level, .2, x, level / 2, 0);
    box(group, brace, CELL, .25, .24, 0, level - .125, 0);
  } else {
    const hinge = new T.Group();
    hinge.position.x = -.735;
    group.add(hinge);
    group.userData.hinge = hinge;
    for (let i = 0; i < 5; i++) box(hinge, wood, .286, 1.9, .12, .154 + i * .292, 1.03, 0);
    for (const y of [.47, 1.57]) box(hinge, brace, 1.43, .12, .16, .735, y, 0);
    box(hinge, brace, .18, .065, .25, 1.31, 1.01, 0);
  }
  return group;
}

export function createConstruction(scene, blockers, saved = []) {
  const pieces = [];
  const floors = new Map(), edges = new Map(), doors = new Map(), roofs = new Map();
  const ray = new T.Raycaster();
  const ghosts = Object.fromEntries(Object.keys(plans).map(type => {
    const group = shape(type);
    group.visible = false;
    scene.add(group);
    return [type, group];
  }));
  let ghost, lastColor, candidate, valid = false;

  function position(mesh, p) {
    mesh.position.set(p.x * CELL, p.y, p.z * CELL);
    const angle = -p.rotation * Math.PI / 2;
    mesh.rotation.y = angle;
    if (['frame', 'wall', 'door'].includes(p.type)) {
      mesh.position.x -= Math.sin(angle) * RIM;
      mesh.position.z -= Math.cos(angle) * RIM;
    }
  }
  function add(p) {
    const mesh = shape(p.type);
    position(mesh, p);
    if (p.open) mesh.userData.hinge.rotation.y = Math.PI * .52;
    scene.add(mesh);
    const piece = { ...p, mesh };
    pieces.push(piece);
    const cell = cellKey(p.x, p.z);
    if (p.type === 'foundation') floors.set(cell, piece);
    else if (p.type === 'roof') roofs.set(cell, piece);
    else if (p.type === 'door') doors.set(edgeKey(p), piece);
    else edges.set(edgeKey(p), piece);
  }
  saved.forEach(add);

  const direction = new T.Vector3();
  function preview(type, rotation, camera, player, woodCount) {
    if (ghost) ghost.visible = false;
    if (!type) {
      candidate = null;
      return null;
    }
    const aim = camera.getWorldDirection(direction);
    let x = player.x + aim.x * 4;
    let z = player.z + aim.z * 4;
    if (aim.y < -.12) {
      for (let distance = 1.75; distance <= 6; distance += .25) {
        const nextX = player.x + aim.x * distance;
        const nextZ = player.z + aim.z * distance;
        if (camera.position.y + aim.y * distance <= surface(nextX, nextZ)) {
          x = nextX;
          z = nextZ;
          break;
        }
      }
    }
    const gx = Math.round(x / CELL), gz = Math.round(z / CELL);
    const cx = gx * CELL, cz = gz * CELL;
    const key = cellKey(gx, gz);
    const floor = floors.get(key);
    candidate = { type, x: gx, z: gz, rotation, y: floor?.y ?? height(cx, cz) + .27 };
    const edge = edgeKey(candidate);
    let reason = '';
    if (Math.abs(cx) + RIM > LIMIT || Math.abs(cz) + RIM > LIMIT) reason = 'Beyond survey boundary';
    else if (type === 'foundation') {
      const adjacent = [[gx - 1, gz], [gx + 1, gz], [gx, gz - 1], [gx, gz + 1]]
        .map(([nx, nz]) => floors.get(cellKey(nx, nz))).filter(Boolean);
      if (adjacent.length) candidate.y = adjacent[0].y;
      const corners = [-RIM, RIM].flatMap(dx => [-RIM, RIM].map(dz => height(cx + dx, cz + dz)));
      if (floor) reason = 'A foundation already occupies this cell';
      else if (corners.some(h => h > candidate.y - .02 || h < candidate.y - .92)) reason = 'Ground is too steep';
      else if (Math.abs(cx - player.x) < 1.84 && Math.abs(cz - player.z) < 1.84) reason = 'Move away from the footprint';
      else if (blockers.some(n => n.remaining !== 0 && Math.hypot(
        Math.max(0, Math.abs(cx - n.x) - RIM), Math.max(0, Math.abs(cz - n.z) - RIM)) < n.radius)) reason = 'Footprint is obstructed';
    } else if (type === 'door') {
      const frame = edges.get(edge);
      if (frame?.type !== 'frame') reason = 'Snap to a doorframe';
      else if (doors.has(edge)) reason = 'Doorframe already occupied';
      else {
        candidate = { ...frame, type: 'door' };
        delete candidate.mesh;
      }
    } else if (!floor) reason = 'Snap to a foundation';
    else if (type === 'roof') {
      if (roofs.has(key)) reason = 'A roof already covers this cell';
      else if (![0, 1, 2, 3].some(r => edges.has(edgeKey({ ...candidate, rotation: r })))) reason = 'Add a wall or doorframe first';
    } else if (edges.has(edge)) reason = 'This edge is occupied';

    if (!reason && woodCount < plans[type].cost) reason = 'Need more wood';
    const previous = ghost;
    ghost = ghosts[type];
    valid = !reason;
    const color = valid ? validMat : badMat;
    if (ghost !== previous || lastColor !== color) {
      ghost.traverse(child => { if (child.isMesh) child.material = color; });
      lastColor = color;
    }
    position(ghost, candidate);
    ghost.visible = true;
    return reason || 'Ready to place';
  }

  function place() {
    if (!valid || !candidate) return false;
    add(candidate);
    valid = false;
    return true;
  }

  function surface(x, z) {
    const floor = floors.get(cellKey(Math.round(x / CELL), Math.round(z / CELL)));
    return Math.max(height(x, z), floor?.y ?? -Infinity);
  }

  function blocks(x, z, foot) {
    const floor = floors.get(cellKey(Math.round(x / CELL), Math.round(z / CELL)));
    if (floor && floor.y - foot > .4) return true;
    for (const p of pieces) {
      if (p.type === 'foundation' || p.type === 'roof' || foot > p.y + level || foot + 1.65 < p.y) continue;
      if (p.type === 'door' && p.open) continue;
      const dx = x - p.mesh.position.x, dz = z - p.mesh.position.z;
      const along = Math.abs(p.rotation % 2 ? dz : dx);
      const across = Math.abs(p.rotation % 2 ? dx : dz);
      if (across < .36 && along < 1.77 && (p.type !== 'frame' || along > .45)) return true;
    }
    return false;
  }

  function ceiling(x, z, foot) {
    const roof = roofs.get(cellKey(Math.round(x / CELL), Math.round(z / CELL)));
    return roof && foot < roof.y + level ? roof.y + level - .15 : Infinity;
  }

  function targetDoor(camera) {
    if (!doors.size) return null;
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    ray.far = 3.4;
    const nearby = [...doors.values()].filter(p => p.mesh.position.distanceTo(camera.position) < 4.6);
    const hit = ray.intersectObjects(nearby.map(p => p.mesh), true)[0];
    if (!hit) return null;
    return nearby.find(p => hit.object.parent.parent === p.mesh);
  }
  function toggle(p, player) {
    if (p.open && Math.hypot(player.x - p.mesh.position.x, player.z - p.mesh.position.z) < .9) return false;
    p.open = !p.open;
    p.mesh.userData.hinge.rotation.y = p.open ? Math.PI * .52 : 0;
    return true;
  }
  const serialize = () => pieces.map(({ mesh, ...p }) => p);
  return { preview, place, surface, blocks, ceiling, targetDoor, toggle, serialize, hasPieces: () => pieces.length > 0 };
}
