// src/nodes.js — curated project markers floating over the GA landscape.
//   Placement is PURE (testable). Rendering takes THREE injected.
//   Frame contract (verified against landscape.js/field.js):
//     world.x = objToWorld(objX), world.y = objToWorld(objY)  (XY plane)
//     world.z = fitnessAt(objX,objY) * Z_SCALE + HOVER         (+Z is UP)
import { fitnessAt, objToWorld, Z_SCALE } from "./landscape.js";

export const HOVER = 0.42; // world units a node floats above the surface
const NODE_COLOR = 0xff6a3d; // thermal — distinct from the cyan particle field

// Deterministic name → objective coordinate (FNV-1a hash → two axes),
// inset to 0.1..0.9 so markers avoid the axis cage / labels at the edges.
export function projectToObjective(project) {
  const name = (project && project.name) || "";
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const x = (h & 0xffff) / 0xffff;
  const y = ((h >>> 16) & 0xffff) / 0xffff;
  return { x: 0.1 + x * 0.8, y: 0.1 + y * 0.8 };
}

// Pure: each project → its world position above the surface (Z = up).
export function nodePlacements(projects) {
  return (projects || []).map((project) => {
    const obj = projectToObjective(project);
    return {
      project,
      obj,
      world: {
        x: objToWorld(obj.x),
        y: objToWorld(obj.y),
        z: fitnessAt(obj.x, obj.y) * Z_SCALE + HOVER,
      },
    };
  });
}

// Build the THREE group. Returns { group, meshes } — meshes carry
// userData.project for the raycaster. A thin stem anchors each marker to the
// surface so it reads as "floating above," not lost in the field.
export function buildProjectNodes(THREE, projects) {
  const group = new THREE.Group();
  const meshes = [];
  const geo = new THREE.IcosahedronGeometry(0.06, 0);
  for (const p of nodePlacements(projects)) {
    const mat = new THREE.MeshBasicMaterial({
      color: NODE_COLOR,
      transparent: true,
      opacity: 0.96,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.world.x, p.world.y, p.world.z);
    mesh.userData.project = p.project;
    mesh.userData.baseScale = 1;
    // wireframe halo so it reads as a "visitable star," not particle dust
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({
        color: NODE_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      }),
    );
    mesh.add(halo);
    // stem drops along -Z (down toward the surface) in world-local frame
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p.world.x, p.world.y, p.world.z),
        new THREE.Vector3(p.world.x, p.world.y, p.world.z - HOVER),
      ]),
      new THREE.LineBasicMaterial({
        color: NODE_COLOR,
        transparent: true,
        opacity: 0.3,
      }),
    );
    group.add(mesh);
    group.add(stem);
    meshes.push(mesh);
  }
  return { group, meshes };
}
