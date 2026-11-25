import * as T from 'three';
import { box, height } from './world.js';

const standard = color => new T.MeshStandardMaterial({ color, flatShading: true });
const suit = standard('#647450');
const armor = standard('#354441');
const glove = standard('#242e2c');
const straps = standard('#a78049');
const timber = standard('#866343');
const rock = standard('#889599');

function limb(parent, side) {
  const hand = new T.Group();
  parent.add(hand);
  box(hand, suit, .145, .15, .39, 0, -.025, .14);
  box(hand, armor, .16, .16, .13, 0, -.013, .045);
  box(hand, glove, .128, .115, .145, 0, 0, -.073);
  for (let i = 0; i < 4; i++) {
    box(hand, armor, .027, .072, .06, (i - 1.5) * .032, .012, -.144);
  }
  box(hand, glove, .065, .063, .113, side * -.072, -.014, -.047).rotation.z = side * .32;
  return hand;
}

function tool(parent, axe) {
  const group = new T.Group();
  parent.add(group);
  group.position.set(.014, .12, -.084);
  group.rotation.set(-.2, -.13, -.32);
  box(group, timber, .048, .57, .055, 0, .041, 0);
  for (const y of [.225, .255, .285]) box(group, straps, .078, .023, .08, 0, y, 0);
  if (axe) {
    const shape = new T.Shape();
    shape.moveTo(-.03, .045);
    shape.lineTo(.191, .133);
    shape.lineTo(.212, -.025);
    shape.lineTo(.15, -.117);
    shape.lineTo(-.03, -.042);
    const blade = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: .038, bevelEnabled: true,
      bevelThickness: .012, bevelSize: .014, bevelSegments: 1, steps: 1 }), rock);
    blade.position.set(0, .29, -.022);
    group.add(blade);
  } else {
    box(group, rock, .24, .06, .063, 0, .3, 0);
    for (const side of [-1, 1]) {
      const point = new T.Mesh(new T.ConeGeometry(.047, .17, 4), rock);
      point.rotation.z = -side * 1.96;
      point.position.set(side * .167, .269, 0);
      group.add(point);
    }
  }
  return group;
}

export function createEquipment(scene, camera) {
  const rig = new T.Group();
  camera.add(rig);
  scene.add(camera);
  const left = limb(rig, -1), right = limb(rig, 1);
  const axe = tool(right, true), pick = tool(right, false);
  const watch = box(left, armor, .175, .065, .154, 0, .075, .04);
  const dial = document.createElement('canvas');
  dial.width = 256;
  dial.height = 192;
  const ink = dial.getContext('2d');
  const texture = new T.CanvasTexture(dial);
  texture.colorSpace = T.SRGBColorSpace;
  const screen = new T.Mesh(new T.PlaneGeometry(.145, .124), new T.MeshBasicMaterial({ map: texture }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, .109, .04);
  left.add(screen);
  const body = new T.Group();
  box(body, suit, .42, .58, .26, 0, 1.12, .17);
  box(body, armor, .43, .13, .27, 0, .86, .11);
  const legs = [-1, 1].map(side => {
    const leg = new T.Group();
    leg.position.set(side * .123, .83, .105);
    body.add(leg);
    box(leg, suit, .19, .71, .19, 0, -.37, 0);
    box(leg, armor, .198, .2, .2, 0, -.39, -.02);
    box(leg, glove, .194, .151, .31, 0, -.752, -.091);
    return leg;
  });
  scene.add(body);
  let swing = 0, phase = 0, speed = 0, lastPlan;
  return {
    strike() { swing = .28; },
    update(player, yaw, pitch, slot, dt, active, motion, narrow, plan) {
      phase += dt * 10;
      speed = T.MathUtils.damp(speed, motion, 12, dt);
      const bob = Math.sin(phase) * speed * .025;
      swing = Math.max(0, swing - dt);
      const hit = Math.sin(Math.PI * swing / .28);
      rig.visible = active;
      body.visible = active && pitch < -.42;
      body.position.set(player.x, player.y, player.z);
      body.rotation.y = yaw;
      legs.forEach((leg, i) => { leg.rotation.x = Math.sin(phase + i * Math.PI) * speed * .36; });
      const watching = slot === 3;
      const reach = watching ? .17 : .29;
      left.position.set(-reach, watching ? -.23 + bob : -.34 - bob, -.57);
      left.rotation.set(watching ? -.83 : -.30, watching ? -.31 : .19, watching ? -.25 : -.15);
      right.position.set(narrow ? .24 : .33, -.32 + bob + hit * .27, -.62 - hit * .39);
      right.rotation.set(-.32 - hit * 1.05, -.23 - hit * .18, .13 - hit * .3);
      right.visible = !watching;
      axe.visible = slot === 1;
      pick.visible = slot === 2;
      watch.visible = screen.visible = watching;
      if (plan && plan !== lastPlan) {
        lastPlan = plan;
        ink.fillStyle = '#0c251c';
        ink.fillRect(0, 0, 256, 192);
        ink.strokeStyle = '#8cebad';
        ink.lineWidth = 6;
        ink.strokeRect(9, 9, 238, 174);
        ink.fillStyle = '#8cebad';
        ink.textAlign = 'center';
        ink.font = 'bold 27px monospace';
        ink.fillText('BLUEPRINT', 128, 67);
        ink.font = 'bold 33px monospace';
        ink.fillText(plan.label.toUpperCase(), 128, 118, 215);
        ink.font = '23px monospace';
        ink.fillText(String(plan.cost) + ' WOOD', 128, 155);
        texture.needsUpdate = true;
      }
    }
  };
}

export function addWorkbench(scene) {
  const x = 2.25, z = 6.15, y = height(x, z);
  const bench = new T.Group();
  bench.position.set(x, y, z);
  const surface = standard('#b99160');
  for (const legX of [-.57, .57]) for (const legZ of [-.29, .29]) {
    box(bench, timber, .11, .88, .11, legX, .42, legZ);
  }
  box(bench, surface, 1.43, .11, .8, 0, .89, 0);
  box(bench, timber, 1.26, .085, .54, 0, .29, 0);
  box(bench, armor, .29, .07, .27, -.37, .98, -.08);
  box(bench, rock, .31, .1, .09, -.37, 1.04, -.17);
  box(bench, straps, .28, .042, .07, .33, .968, .16).rotation.y = .4;
  const sign = document.createElement('canvas');
  sign.width = 512;
  sign.height = 100;
  const ctx = sign.getContext('2d');
  ctx.fillStyle = '#172722';
  ctx.fillRect(0, 0, 512, 100);
  ctx.fillStyle = '#b6f398';
  ctx.font = 'bold 53px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WORKBENCH', 256, 70);
  const board = new T.Mesh(new T.PlaneGeometry(1.22, .24),
    new T.MeshBasicMaterial({ map: new T.CanvasTexture(sign), side: T.DoubleSide }));
  board.position.set(0, 1.17, -.33);
  bench.add(board);
  scene.add(bench);
  return { x, y, z, radius: .75, type: 'bench' };
}
