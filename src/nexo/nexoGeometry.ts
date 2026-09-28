// Geometria do Nexo em float, nas coordenadas do modelo (pivô no centro da caixa).
// O GLB vem quantizado (KHR_mesh_quantization) com a escala na matriz do nó; assar a
// matriz na geometria simplifica o decal do rosto e a calibração do tamanho.

import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, type Mesh } from 'three';

/**
 * Converte a malha (atributos quantizados, com a matriz do nó) para geometria em
 * float nas coordenadas do modelo: `toModel` leva do espaço local da malha ao
 * espaço do modelo (pivô no centro da caixa).
 */
export function bakeGeometry(mesh: Mesh, toModel: Matrix4): BufferGeometry {
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const uv = src.attributes.uv;
  if (!pos || !nor || !uv) throw new Error('nexoGeometry: malha sem position/normal/uv');
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const no = new Float32Array(n * 3);
  const v = new Vector3();
  const normalMatrix = new Matrix4().copy(toModel).invert().transpose();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toModel);
    p.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(nor, i).applyMatrix4(normalMatrix).normalize();
    no.set([v.x, v.y, v.z], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new Float32BufferAttribute(no, 3));
  g.setAttribute('uv', uv);
  if (src.index) g.setIndex(src.index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
