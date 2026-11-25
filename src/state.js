import { plans } from './construction.js';

export const slots = [
  ['hands', 'Hands'], ['axe', 'Stone axe'], ['pick', 'Pickaxe'], ['blueprint', 'Blueprint']
];
export const recipes = {
  axe: { label: 'Stone axe', wood: 3, stone: 2, slot: 1 },
  pick: { label: 'Stone pickaxe', wood: 4, stone: 3, slot: 2 }
};
export const saveKey = 'exodus-survival-v1';
export const fresh = () => ({
  version: 1, x: 0, z: 8, yaw: -.07, pitch: -.06,
  wood: 0, stone: 0, axe: false, pick: false, slot: 0,
  health: 100, hunger: 96, thirst: 92, stamina: 100, nodes: {}, pieces: []
});
const finite = (v, low, high) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
export function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(saveKey));
    if (!s || s.version !== 1 || !finite(s.x, -100, 100) || !finite(s.z, -100, 100)
      || !finite(s.yaw, -1e9, 1e9) || !finite(s.pitch, -1.5, 1.5)
      || !Object.keys(fresh()).every(key => Object.hasOwn(s, key))
      || !['health', 'hunger', 'thirst', 'stamina'].every(key => finite(s[key], 0, 100))
      || !['wood', 'stone', 'slot'].every(key => Number.isInteger(s[key]) && s[key] >= 0)
      || s.slot >= slots.length || typeof s.axe !== 'boolean' || typeof s.pick !== 'boolean'
      || !s.nodes || typeof s.nodes !== 'object' || Array.isArray(s.nodes)
      || !Array.isArray(s.pieces) || s.pieces.length > 20000
      || s.pieces.some(p => !p || !Object.hasOwn(plans, p.type) || !Number.isInteger(p.x) || !Number.isInteger(p.z)
        || !finite(p.x, -33, 33) || !finite(p.z, -33, 33) || !finite(p.y, -10, 10)
        || !Number.isInteger(p.rotation) || !finite(p.rotation, 0, 3)
        || (p.open !== undefined && (p.type !== 'door' || typeof p.open !== 'boolean')))) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(saveKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
