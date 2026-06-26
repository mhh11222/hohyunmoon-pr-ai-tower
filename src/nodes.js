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

// Build the THREE group. Returns { group, meshes } — `meshes` are the (invisible,
// generous) raycast hit spheres; each carries userData.project and userData.node
// (the visual group) so the caller can scale on hover. A thin stem anchors each
// marker to the surface so it reads as "floating above," not lost in the field.
export function buildProjectNodes(THREE, projects) {
  const group = new THREE.Group();
  const meshes = [];
  const coreGeo = new THREE.IcosahedronGeometry(0.08, 0);
  const haloGeo = new THREE.IcosahedronGeometry(0.14, 0);
  const hitGeo = new THREE.SphereGeometry(0.22, 10, 10); // generous click target
  for (const p of nodePlacements(projects)) {
    const node = new THREE.Group();
    node.position.set(p.world.x, p.world.y, p.world.z);
    node.userData.project = p.project;

    const core = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({ color: NODE_COLOR, transparent: true, opacity: 0.97 }),
    );
    // wireframe halo so it reads as a "visitable star," not particle dust
    const halo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({ color: NODE_COLOR, wireframe: true, transparent: true, opacity: 0.45 }),
    );
    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.project = p.project;
    hit.userData.node = node; // hover scales the whole visual group
    node.add(core);
    node.add(halo);
    node.add(hit);

    // stem drops along -Z (down toward the surface) in node-local frame
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -HOVER),
      ]),
      new THREE.LineBasicMaterial({ color: NODE_COLOR, transparent: true, opacity: 0.32 }),
    );
    node.add(stem);

    group.add(node);
    meshes.push(hit);
  }
  return { group, meshes };
}
