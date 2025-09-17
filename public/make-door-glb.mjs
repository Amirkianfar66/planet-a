#!/usr/bin/env node
// make-door-glb.mjs
// Build a sci-fi sliding door GLB from an image. No Blender required.

import fs from 'fs';
import path from 'path';
import { Document, NodeIO } from '@gltf-transform/core';

// ---- CLI ----
const [, , IMG_PATH = 'assets/door.png', OUT_PATH = 'scifi_slanted_door.glb'] = process.argv;

// ---- Params (meters) ----
const PANEL_W = 1.2;    // each panel width -> opening is 2.4m
const PANEL_H = 2.1;
const PANEL_T = 0.3;    // thickness requested
const TILT_DEG = 10;    // looks like "/"
const OPEN_TIME = 1.0;  // seconds, clip duration

// ---- Helpers ----
const toRad = d => (d * Math.PI) / 180;
const quatAroundZ = (deg) => {
  const h = toRad(deg) * 0.5;
  return [0, 0, Math.sin(h), Math.cos(h)]; // [x,y,z,w]
};

// Simple box primitive with UVs/normals centered at origin (Y-up).
function createBoxPrimitive(doc, w, h, d) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  // 6 faces * 4 verts
  const P = [
    // +X
    hw, -hh, -hd,  hw, -hh,  hd,  hw,  hh,  hd,  hw,  hh, -hd,
    // -X
   -hw, -hh,  hd, -hw, -hh, -hd, -hw,  hh, -hd, -hw,  hh,  hd,
    // +Y
   -hw,  hh, -hd,  hw,  hh, -hd,  hw,  hh,  hd, -hw,  hh,  hd,
    // -Y
   -hw, -hh,  hd,  hw, -hh,  hd,  hw, -hh, -hd, -hw, -hh, -hd,
    // +Z
    hw, -hh,  hd, -hw, -hh,  hd, -hw,  hh,  hd,  hw,  hh,  hd,
    // -Z
   -hw, -hh, -hd,  hw, -hh, -hd,  hw,  hh, -hd, -hw,  hh, -hd,
  ];
  const N = [
    // +X
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    // -X
   -1,0,0,-1,0,0,-1,0,0,-1,0,0,
    // +Y
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    // -Y
    0,-1,0,0,-1,0,0,-1,0,0,-1,0,
    // +Z
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    // -Z
    0,0,-1,0,0,-1,0,0,-1,0,0,-1,
  ];
  const UV = [
    // each face
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
  ];
  const I = [];
  for (let f = 0; f < 6; f++) {
    const o = f * 4;
    I.push(o, o+1, o+2, o, o+2, o+3);
  }

  const buf = doc.createBuffer('buffer');
  const pos = doc.createAccessor('POSITION').setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf);
  const nor = doc.createAccessor('NORMAL').setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf);
  const uv  = doc.createAccessor('TEXCOORD_0').setType('VEC2').setArray(new Float32Array(UV)).setBuffer(buf);
  const idx = doc.createAccessor('indices').setType('SCALAR').setArray(new Uint16Array(I)).setBuffer(buf);

  const prim = doc.createPrimitive().setMode(4) // TRIANGLES
    .setAttribute('POSITION', pos)
    .setAttribute('NORMAL', nor)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(idx);
  return prim;
}

// ---- Build GLB ----
const doc = new Document();
const scene = doc.createScene('Scene');

const imageBytes = fs.readFileSync(IMG_PATH);
const tex = doc.createTexture('panelTex')
  .setImage(imageBytes)
  .setMimeType('image/png');

const mat = doc.createMaterial('DoorPanelMat')
  .setBaseColorTexture(tex)
  .setMetallicFactor(0.2)
  .setRoughnessFactor(0.7);

const boxPrim = createBoxPrimitive(doc, PANEL_W, PANEL_H, PANEL_T);
boxPrim.setMaterial(mat);

const makePanel = (name) => {
  const mesh = doc.createMesh(name).addPrimitive(boxPrim);
  const node = doc.createNode(name)
    .setMesh(mesh)
    .setTranslation([0, PANEL_H/2, 0])   // sit on floor (Y up)
    .setRotation(quatAroundZ(TILT_DEG)); // tilt like "/"
  return node;
};

const root = doc.createNode('DoorRoot');
const left = makePanel('Panel_L');
const right = makePanel('Panel_R');
root.addChild(left).addChild(right);
scene.addChild(root);

// ---- Animation "Open" (closed -> open in 1s) ----
const times = doc.createAccessor('times')
  .setType('SCALAR')
  .setArray(new Float32Array([0, OPEN_TIME]));
const makeTrans = (arr) => doc.createAccessor().setType('VEC3').setArray(new Float32Array(arr));

const leftTrans = makeTrans([
  0,           PANEL_H/2, 0,   // t=0
 -PANEL_W,     PANEL_H/2, 0    // t=1
]);
const rightTrans = makeTrans([
  0,           PANEL_H/2, 0,   // t=0
  PANEL_W,     PANEL_H/2, 0    // t=1
]);

const anim = doc.createAnimation('Open');

const sampL = doc.createAnimationSampler().setInput(times).setOutput(leftTrans).setInterpolation('LINEAR');
anim.createChannel().setTargetNode(left).setTargetPath('translation').setSampler(sampL);

const sampR = doc.createAnimationSampler().setInput(times).setOutput(rightTrans).setInterpolation('LINEAR');
anim.createChannel().setTargetNode(right).setTargetPath('translation').setSampler(sampR);

// ---- Write GLB ----
const io = new NodeIO();
await io.write(OUT_PATH, doc);
console.log('Wrote:', path.resolve(OUT_PATH));
