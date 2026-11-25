import * as T from 'three';

export const LIMIT = 100;
export const spawn = { x: 0, z: 8 };
export function height(x, z) {
  const fade = T.MathUtils.smoothstep(Math.hypot(x, z), 7, 25);
  return fade * (2.2 * Math.sin(x * .072) * Math.cos(z * .07)
    + 1.35 * Math.sin(z * .16 + x * .053) + .42 * Math.cos(x * .29 - z * .21));
}

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const material = (color, extra) => new T.MeshStandardMaterial({ color, flatShading: true, ...extra });
export function box(parent, mat, w, h, d, x, y, z) {
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function createWorld(scene) {
  const rng = random(825703);
  scene.background = new T.Color('#a5bbc4');
  scene.fog = new T.FogExp2('#a5bbc4', .014);
  scene.add(new T.HemisphereLight('#e6f6ff', '#747659', 2.15));
  const sun = new T.DirectionalLight('#ffdeb1', 2.6);
  sun.position.set(-38, 34, -50);
  scene.add(sun);

  const geometry = new T.PlaneGeometry(200, 200, 100, 100);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  const ground = geometry.toNonIndexed();
  geometry.dispose();
  ground.computeVertexNormals();
  const colors = [];
  const palette = ['#566949', '#607547', '#687c4d', '#536745', '#727f4e'];
  const gp = ground.attributes.position;
  for (let i = 0; i < gp.count; i += 3) {
    const x = gp.getX(i), z = gp.getZ(i);
    const clearing = Math.hypot(x * 1.08, z * .72) < 8 + rng() * 2;
    const track = z > -2 && z < 22 && Math.abs(x + .8 * Math.sin(z * .3)) < 1 + rng();
    const color = new T.Color(clearing || track ? '#80795c' : palette[Math.floor(rng() * palette.length)]);
    color.multiplyScalar(.91 + rng() * .17);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  }
  ground.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  scene.add(new T.Mesh(ground, material('#ffffff', { vertexColors: true })));

  const entries = [];
  const add = (type, x, z, size) => entries.push({
    id: entries.length, type, x, z, y: height(x, z), size,
    radius: type === 'tree' ? size * .25 : size * .62,
    hits: type === 'tree' ? 4 : 3, remaining: type === 'tree' ? 4 : 3,
    turn: rng() * Math.PI * 2
  });
  add('tree', -3, 3.8, 1.05);
  add('stone', 3.3, 4.5, .95);
  add('tree', -6.2, .4, 1.3);
  add('stone', -4.7, 7.5, .75);
  add('tree', 6.5, 1, 1.1);
  for (let i = 0; i < 545; i++) {
    const x = (rng() - .5) * 196, z = (rng() - .5) * 196;
    if (Math.hypot(x, z) < 10) continue;
    const type = rng() < .83 ? 'tree' : 'stone';
    add(type, x, z, type === 'tree' ? .66 + rng() * .89 : .47 + rng() * 1.24);
  }
  const trees = entries.filter(n => n.type === 'tree');
  const stones = entries.filter(n => n.type === 'stone');
  const dummy = new T.Object3D();
  const layers = [
    [new T.CylinderGeometry(.11, .24, 3.8, 6), '#66533d', 1.9, trees],
    [new T.ConeGeometry(1.22, 2.6, 7), '#365b4b', 2.65, trees],
    [new T.ConeGeometry(1.03, 2.7, 7), '#476a50', 3.6, trees],
    [new T.ConeGeometry(.76, 2.45, 7), '#597857', 4.55, trees],
    [new T.DodecahedronGeometry(.8), '#737d7a', .36, stones]
  ];
  for (const [shape, color, lift, nodes] of layers) {
    const batch = new T.InstancedMesh(shape, material(color), nodes.length);
    batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
    nodes.forEach((node, i) => {
      dummy.position.set(node.x, node.y + lift * node.size, node.z);
      dummy.rotation.set(0, node.turn, 0);
      dummy.scale.set(node.size, node.size * (node.type === 'stone' ? .63 : 1), node.size);
      dummy.updateMatrix();
      batch.setMatrixAt(i, dummy.matrix);
      (node.instances ??= []).push([batch, i]);
      batch.setColorAt(i, new T.Color().setScalar(.76 + rng() * .29));
    });
    scene.add(batch);
  }

  const grassVerts = [];
  for (let i = 0; i < 11600; i++) {
    const range = i < 4300 ? 58 : 198;
    const x = (rng() - .5) * range, z = (rng() - .5) * range;
    if (Math.hypot(x * 1.08, z * .72) < 8 + rng() * 2 && rng() < .92) continue;
    for (let blade = 0; blade < 3; blade++) {
      const bx = x + (rng() - .5) * .6, bz = z + (rng() - .5) * .6;
      const y = height(bx, bz) - .07, angle = rng() * 6.28;
      const dx = Math.sin(angle) * .095, dz = Math.cos(angle) * .095;
      grassVerts.push(bx - dx, y, bz - dz, bx + dx, y, bz + dz,
        bx + dz * 1.6, y + .19 + rng() * .35, bz - dx * 1.6);
    }
  }
  const grass = new T.BufferGeometry();
  grass.setAttribute('position', new T.Float32BufferAttribute(grassVerts, 3));
  const grassMaterial = new T.MeshBasicMaterial({ color: '#72884f', side: T.DoubleSide });
  scene.add(new T.Mesh(grass, grassMaterial));

  const pod = new T.Group();
  pod.position.set(-.7, .73, -1.8);
  pod.rotation.set(.035, -.35, -.13);
  const shell = material('#8eaaa2', { metalness: .5, roughness: .47 });
  const dark = material('#26373a');
  const orange = material('#bd602f');
  const light = material('#6cf5dc', { emissive: '#2fbfac', emissiveIntensity: 2 });
  const body = new T.Mesh(new T.CylinderGeometry(1.25, 1.4, 3.8, 8), shell);
  body.rotation.x = Math.PI / 2;
  pod.add(body);
  for (const z of [-1.7, 1.35]) {
    const band = new T.Mesh(new T.CylinderGeometry(1.34, 1.38, .24, 8), dark);
    band.rotation.x = Math.PI / 2;
    band.position.z = z;
    pod.add(band);
  }
  box(pod, dark, 1.65, .82, .14, 0, .13, 1.94);
  box(pod, light, 1.37, .18, .1, 0, .31, 2.03);
  box(pod, orange, .32, .38, .14, .51, -.16, 2.05);
  for (const x of [-1.15, 1.15]) {
    box(pod, orange, .55, .44, 3.9, x, -.52, -.01);
    box(pod, dark, .57, .23, 4.25, x, -.76, .12);
    box(pod, light, .06, .09, 2.3, x * 1.18, .15, .08);
  }
  const decal = document.createElement('canvas');
  decal.width = 512;
  decal.height = 128;
  const ink = decal.getContext('2d');
  ink.fillStyle = '#162c2b';
  ink.font = 'bold 58px monospace';
  ink.textAlign = 'center';
  ink.fillText('EX–07', 256, 77);
  const badge = new T.Mesh(new T.PlaneGeometry(1.42, .355), new T.MeshBasicMaterial({
    map: new T.CanvasTexture(decal), transparent: true, depthWrite: false
  }));
  badge.position.set(-.16, -.16, 2.024);
  pod.add(badge);
  scene.add(pod);

  function remove(node) {
    node.remaining = 0;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (const [batch, index] of node.instances) {
      batch.setMatrixAt(index, dummy.matrix);
      batch.instanceMatrix.needsUpdate = true;
    }
  }
  return { entries, remove, pod: { x: -.7, z: -1.8, radius: 2.25, type: 'pod' } };
}
