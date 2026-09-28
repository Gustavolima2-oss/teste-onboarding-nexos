// Material e ajuste de render do Nexo. Todos os valores finais ficam aqui, como
// constantes nomeadas, calibradas contra o PNG do Figma com a tecla D.

import {
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  NoColorSpace,
  SRGBColorSpace,
  type Texture,
} from 'three';

// Valores calibrados em 3 rodadas contra o PNG do Figma (variante "H").
// Limite conhecido: a geometria dos braços do GLB não é a do PNG (ver README).

/** Pose e enquadramento (ordem de ajuste 1). */
export const NEXO_POSE = {
  /** Rotação em Y (graus): 3/4 virado para a esquerda (lado do tooltip); o anel esquerdo quase some, como no PNG. */
  yawDeg: -38,
  /** Inclinação da câmera (graus acima do horizonte): mostra o topo da cabeça como no PNG. */
  pitchDeg: 12,
  /** Rolagem leve do corpo em Z (graus). */
  rollDeg: 0,
};

/** Câmera (FOV baixo: volume sem distorção). */
export const NEXO_CAMERA = {
  fovDeg: 22,
  distance: 10,
};

/**
 * Tamanho (ordem de ajuste 2): altura do CORPO (a esfera com a tela, sem os braços)
 * fixa em px, em qualquer viewport. Medida no PNG do Figma (scripts/png-bbox.json →
 * body.h). Os braços deste GLB são mais compridos que no PNG; escalar pelo corpo
 * deixa o Nexo do tamanho certo visualmente. Fase 2: 96,5 px (PNG em 385×215;
 * na fase 1 eram 110,1 px com o PNG em 439×245).
 */
export const NEXO_BODY_HEIGHT_PX = 96.5;

/**
 * Vértices do corpo, em coordenadas do modelo (pivô no centro da caixa, antes da pose):
 * a esfera vai de y ≈ −0,30 a +0,83 com |x| < 0,56; ombros e braços ficam em |x| ≥ 0,56
 * e os antebraços descem abaixo de y = −0,30.
 */
export const NEXO_BODY_BOX = { maxAbsX: 0.5, minY: -0.32 };

export type NexoToneMapping = 'aces' | 'agx' | 'neutral';

/** Luz (ordem de ajuste 3). */
export const NEXO_LIGHTS = {
  /** Curva de tone mapping (ver exposure). */
  toneMapping: 'aces' as NexoToneMapping,
  /**
   * Exposição. Comparado em DPR 2: ACES 1,1 dá o branco mais limpo (p95 de luminância
   * do casco 236 vs 242 no Figma, 0,07% de pixels ≥ 250). AgX deixou o casco cinza
   * (p95 213–220) e Neutral puxou para o rosa.
   */
  exposure: 1.1,
  /** Intensidade do ambiente (RoomEnvironment via PMREM). */
  environmentIntensity: 0.7,
  /** Luz principal suave de cima-esquerda. */
  keyIntensity: 1.5,
  keyColor: 0xffffff,
  keyPosition: [-3, 4, 3] as const,
  /** Luz de recorte quente, atrás: separa o contorno do fundo escurecido. */
  rimIntensity: 5,
  rimColor: 0xffd2b0,
  rimPosition: [2.5, 1.5, -3] as const,
};

/** Material (ordem de ajuste 4). */
export const NEXO_MATERIAL = {
  /** Rugosidade do plástico branco perolado. */
  roughness: 0.35,
  /** Rugosidade da tela escura (vidro com reflexo). */
  screenRoughness: 0.08,
  clearcoat: 1,
  clearcoatRoughness: 0.15,
  sheen: 0.3,
  sheenRoughness: 0.5,
  /** Sheen levemente rosado: reflexo perolado das bordas. */
  sheenColor: 0xffd9ee,
  /** Iridescência leve: variação de cor do branco perolado. */
  iridescence: 0.4,
  iridescenceIOR: 1.3,
  /** Multiplicador da textura base: puxa o branco para o rosado do PNG. */
  baseTint: 0xfff0f3,
  /** Intensidade do brilho próprio dos pixels laranja (anéis, linha, rosto). */
  emissiveIntensity: 1.6,
  /**
   * Cor do brilho próprio. O laranja da textura é pálido (pêssego); o emissivo usa
   * esta cor saturada, modulada pela máscara e pela luminância do pixel original.
   */
  emissiveColor: 0xff5a14,
  /**
   * Albedo dos pixels laranja. A textura tem um laranja pálido; o shader mistura
   * esta cor pela máscara laranja (ganho abaixo), senão o ACES leva tudo ao branco.
   */
  orangeAlbedo: 0xff6a1f,
  orangeMaskGain: 1.6,
};

/** Amostragem da textura e faces. */
export const NEXO_TEXTURE = {
  /**
   * Mipmaps + anisotropia máxima. Com as ilhas de UV dilatadas no pipeline
   * (scripts/glb-tools.mjs dilate) as costuras não "racham" mais em DPR 2.
   */
  mipmaps: true,
  /** Face única: com as normais suavizadas não há furos nas bordas finas. */
  doubleSided: false,
};

/** Faixa de cor considerada "laranja" na textura base (HSV). */
export const ORANGE_MASK = {
  hueMin: 5,
  hueMax: 45,
  /** Saturação e valor mínimos, com rampa suave até `soft` acima do mínimo. */
  satMin: 0.45,
  valMin: 0.35,
  soft: 0.15,
};

/** Pixels com valor (HSV) abaixo disto contam como tela escura. */
export const SCREEN_DARK_MAX_VALUE = 0.22;

/** Resolução usada para gerar as máscaras em runtime (a textura base é 2048). */
const MASK_SIZE = 1024;

export type NexoMaps = {
  emissiveMap: CanvasTexture;
  roughnessMap: CanvasTexture;
  /** true se o texel em (u, v) é da tela escura do rosto (para posicionar o decal). */
  isScreen: (u: number, v: number) => boolean;
};

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Gera em runtime, a partir da textura base:
 * - emissiveMap: máscara dos pixels laranja (anéis, linha do corpo, rosto) × luminância, preto no resto;
 * - roughnessMap (canal G): proporção da rugosidade (1 no plástico, screen/plástico na tela),
 *   multiplicada por material.roughness, o que permite ajustar a rugosidade ao vivo.
 */
export function buildMaps(base: Texture): NexoMaps {
  const image = base.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MASK_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('nexoMaterial: canvas 2D indisponível');
  ctx.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE);
  const src = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE);
  const emissive = ctx.createImageData(MASK_SIZE, MASK_SIZE);
  const rough = ctx.createImageData(MASK_SIZE, MASK_SIZE);
  const d = src.data;
  const { hueMin, hueMax, satMin, valMin, soft } = ORANGE_MASK;
  const screenMask = new Uint8Array(MASK_SIZE * MASK_SIZE);
  const plastic = 255;
  const screen = Math.round((NEXO_MATERIAL.screenRoughness / NEXO_MATERIAL.roughness) * 255);

  for (let i = 0; i < d.length; i += 4) {
    const R = d[i] ?? 0;
    const G = d[i + 1] ?? 0;
    const B = d[i + 2] ?? 0;
    const r = R / 255;
    const g = G / 255;
    const b = B / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const s = max === 0 ? 0 : delta / max;
    let h = 0;
    if (delta > 0) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
      if (h < 0) h += 360;
    }
    const inHue = h >= hueMin && h <= hueMax ? 1 : 0;
    const m = inHue * smoothstep(satMin, satMin + soft, s) * smoothstep(valMin, valMin + soft, max);
    // Máscara em escala de cinza (luminância × máscara); a cor vem de material.emissive.
    const lum = Math.round((0.2126 * R + 0.7152 * G + 0.0722 * B) * m);
    emissive.data[i] = lum;
    emissive.data[i + 1] = lum;
    emissive.data[i + 2] = lum;
    emissive.data[i + 3] = 255;

    const isScreen = max < SCREEN_DARK_MAX_VALUE && m < 0.5 ? 1 : 0;
    screenMask[i / 4] = isScreen;
    const v = isScreen ? screen : plastic;
    rough.data[i] = v;
    rough.data[i + 1] = v;
    rough.data[i + 2] = v;
    rough.data[i + 3] = 255;
  }

  const toTexture = (data: ImageData, srgb: boolean): CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = c.height = MASK_SIZE;
    c.getContext('2d')?.putImageData(data, 0, 0);
    const t = new CanvasTexture(c);
    t.flipY = base.flipY;
    t.wrapS = base.wrapS;
    t.wrapT = base.wrapT;
    t.channel = base.channel;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = base.anisotropy;
    return t;
  };

  const isScreen = (u: number, v: number): boolean => {
    const x = Math.min(MASK_SIZE - 1, Math.max(0, Math.floor(u * MASK_SIZE)));
    const y = Math.min(MASK_SIZE - 1, Math.max(0, Math.floor(v * MASK_SIZE)));
    return screenMask[y * MASK_SIZE + x] === 1;
  };
  return {
    emissiveMap: toTexture(emissive, false),
    roughnessMap: toTexture(rough, false),
    isScreen,
  };
}

/**
 * Configura a amostragem: mipmaps com filtro trilinear e anisotropia máxima, ou
 * (NEXO_TEXTURE.mipmaps = false) filtro linear sem mipmaps. A opção sem mipmaps
 * existe porque o atlas deste GLB é muito fragmentado: se as costuras voltarem a
 * aparecer num modelo novo, desligar os mipmaps é o paliativo.
 */
export function configureSampling(
  anisotropy: number,
  ...textures: (Texture | null | undefined)[]
): void {
  for (const t of textures) {
    if (!t) continue;
    t.generateMipmaps = NEXO_TEXTURE.mipmaps;
    t.minFilter = NEXO_TEXTURE.mipmaps ? LinearMipmapLinearFilter : LinearFilter;
    t.anisotropy = NEXO_TEXTURE.mipmaps ? anisotropy : 1;
    t.needsUpdate = true;
  }
}

/** Uniforms do tingimento laranja (ajustáveis ao vivo). */
export type OrangeUniforms = {
  nexoOrangeAlbedo: { value: Color };
  nexoOrangeGain: { value: number };
};

export function createNexoMaterial(
  map: Texture,
  maps: NexoMaps,
  anisotropy: number,
): MeshPhysicalMaterial & { userData: { orange: OrangeUniforms } } {
  configureSampling(anisotropy, map, maps.emissiveMap, maps.roughnessMap);
  const orange: OrangeUniforms = {
    nexoOrangeAlbedo: { value: new Color(NEXO_MATERIAL.orangeAlbedo) },
    nexoOrangeGain: { value: NEXO_MATERIAL.orangeMaskGain },
  };
  const material = new MeshPhysicalMaterial({
    side: NEXO_TEXTURE.doubleSided ? DoubleSide : FrontSide,
    // Sempre transparent: o fade de aparição/saída muda só a opacidade, sem recompilar
    // o shader. Com um único objeto e opacidade 1 o resultado é igual ao opaco.
    transparent: true,
    map,
    color: new Color(NEXO_MATERIAL.baseTint),
    roughness: NEXO_MATERIAL.roughness,
    roughnessMap: maps.roughnessMap,
    metalness: 0,
    clearcoat: NEXO_MATERIAL.clearcoat,
    clearcoatRoughness: NEXO_MATERIAL.clearcoatRoughness,
    sheen: NEXO_MATERIAL.sheen,
    sheenRoughness: NEXO_MATERIAL.sheenRoughness,
    sheenColor: new Color(NEXO_MATERIAL.sheenColor),
    iridescence: NEXO_MATERIAL.iridescence,
    iridescenceIOR: NEXO_MATERIAL.iridescenceIOR,
    emissive: new Color(NEXO_MATERIAL.emissiveColor),
    emissiveMap: maps.emissiveMap,
    emissiveIntensity: NEXO_MATERIAL.emissiveIntensity,
  });
  // Mistura o albedo laranja saturado nos pixels da máscara (anéis, linha, rosto).
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, orange);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 nexoOrangeAlbedo;\nuniform float nexoOrangeGain;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#ifdef USE_EMISSIVEMAP
  float nexoMask = clamp(texture2D(emissiveMap, vEmissiveMapUv).r * nexoOrangeGain, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, nexoOrangeAlbedo, nexoMask);
#endif`,
      );
  };
  material.userData.orange = orange;
  return material as MeshPhysicalMaterial & { userData: { orange: OrangeUniforms } };
}
