// Outfits: a character wears the real clothes of another VRoid model.
// Every VRoid model uses the same skeleton (same bone names), so the body and clothes of one model can be attached
// to another model's bones. The wearer keeps their own face and hair and gets the donor's body, clothes and shoes,
// stretched to the wearer's proportions. Colour variants are made by repainting the clothes' textures.
// (To add a new outfit, e.g. a kimono: make any VRoid model wearing it, put the .vrm in models/, and add a line
// to "outfits" in backend/data/shop.json pointing at that file.)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const matName = mesh => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name || '';
const isBodyPart = mesh => /_SKIN|_CLOTH/.test(matName(mesh)) && !/Face_/.test(matName(mesh)); // body skin, clothes, shoes (not face, not hair)

/** tint: optional { hue (degrees), saturate, brightness } to recolour the clothes. Resolves to { remove() }. */
export async function wearModelOutfit(vrm, url, tint = null) {
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const donor = gltf.userData.vrm;
  VRMUtils.rotateVRM0(donor);
  donor.scene.updateMatrixWorld(true);
  vrm.scene.updateMatrixWorld(true);

  const bones = {};
  vrm.scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const holder = new THREE.Group(); // the donor's meshes live here, inside the wearer
  holder.name = 'outfit';
  vrm.scene.add(holder);

  const adopted = [], meshes = [];
  donor.scene.traverse(o => { if (o.isSkinnedMesh && isBodyPart(o)) meshes.push(o); });
  for (const mesh of meshes) {
    // use the wearer's bone of the same name; a bone only the donor has (skirt, coat tails) is moved over with its branch
    const mapped = mesh.skeleton.bones.map(b => {
      if (bones[b.name]) return bones[b.name];
      let top = b;
      while (top.parent && top.parent.isBone && !bones[top.parent.name]) top = top.parent;
      const parent = top.parent && bones[top.parent.name];
      if (parent && top.parent !== parent) { parent.add(top); adopted.push(top); top.traverse(x => { if (x.isBone) bones[x.name] = x; }); }
      return b;
    });
    holder.add(mesh);
    mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix);
    mesh.frustumCulled = false;
    if (tint && /_CLOTH/.test(matName(mesh)) && !/Shoes/.test(matName(mesh))) recolour(mesh, tint);
  }
  const hidden = [];
  vrm.scene.traverse(o => { if (o.isMesh && !meshes.includes(o) && isBodyPart(o) && o.visible) { o.visible = false; hidden.push(o); } });

  return {
    remove() {
      for (const m of hidden) m.visible = true;
      holder.removeFromParent();
      for (const b of adopted) b.removeFromParent();
      VRMUtils.deepDispose(holder);
      VRMUtils.deepDispose(donor.scene);
    },
  };
}

/** Repaints a mesh's textures with a colour shift, to make colour variants of the same clothes. */
function recolour(mesh, { hue = 0, saturate = 1, brightness = 1 }) {
  for (const m of [].concat(mesh.material)) {
    for (const key of ['map', 'shadeMultiplyTexture']) {
      const tex = m[key];
      if (!tex?.image || tex.userData.recoloured) continue;
      const c = document.createElement('canvas'); c.width = tex.image.width; c.height = tex.image.height;
      const g = c.getContext('2d');
      g.filter = `hue-rotate(${hue}deg) saturate(${saturate}) brightness(${brightness})`;
      g.drawImage(tex.image, 0, 0);
      const copy = tex.clone(); copy.image = c; copy.userData.recoloured = true; copy.needsUpdate = true;
      m[key] = copy;
      if (m.uniforms?.[key]) m.uniforms[key].value = copy;
    }
    m.needsUpdate = true;
  }
}

/** The same colour shift as a CSS filter, for the outfit's picture in the dressing room. */
export const tintFilter = o => (o.hue || o.saturate != null || o.brightness != null
  ? `hue-rotate(${o.hue || 0}deg) saturate(${o.saturate ?? 1}) brightness(${o.brightness ?? 1})` : 'none');
