#!/usr/bin/env bash
# Otimiza o modelo do Nexo para web:
#   weld → dilate (UV) → simplify → smooth (normais, crease 60°) → weld → resize → webp → meshopt
# Uso: npm run optimize:glb [origem.glb]
# Variáveis: RATIO (0.12), ANGLE (60), NORMAL_BITS (12), ERROR (0.002), QUALITY (85), MESHOPT_LEVEL (medium), LOSSLESS (0; 1 = WebP sem perda, ~2,8 MB, acima do limite), DILATE_PX (64).
# Meta: ≤ 1,5 MB. Com ratio 0,12 (~87 mil triângulos) e normais de 12 bits, a textura
# vai para WebP q85 para caber (1,47 MB): a silhueta redonda importa mais que a textura.
#
# Obs.:
# - dilate roda na malha original (todas as ilhas de UV) antes do simplify.
# - smooth roda depois do simplify: normais por posição com ângulo de suavização (60°):
#   casco liso, quinas da tela definidas; a saída é desindexada e o weld reindexa.
# - normais em 12 bits no meshopt (--level medium): no nível "high" (padrão) o
#   gltf-transform força as normais para 8 bits (filtro octaédrico), e o reflexo do
#   clearcoat mostra facetas mesmo com a malha lisa.
# - webp roda antes de meshopt. Na ordem inversa, o webp decodifica o
#   EXT_meshopt_compression e o arquivo final sai sem compressão de malha.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# O original (~23 MB) não vai para o repositório: coloque-o em assets-src/nexo-3d.glb.
SRC="${1:-$ROOT/assets-src/nexo-3d.glb}"
if [[ ! -f "$SRC" ]]; then
  echo "GLB original não encontrado em $SRC (ver README, 'Otimizar o GLB')." >&2
  exit 1
fi
OUT="$ROOT/public/models/nexo.glb"
RATIO="${RATIO:-0.12}"
ANGLE="${ANGLE:-60}"
NORMAL_BITS="${NORMAL_BITS:-12}"
ERROR="${ERROR:-0.002}"
QUALITY="${QUALITY:-85}"
DILATE_PX="${DILATE_PX:-64}"
LOSSLESS="${LOSSLESS:-0}"
WEBP_ARGS=(--quality "$QUALITY")
[[ "$LOSSLESS" == "1" ]] && WEBP_ARGS=(--lossless true)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$ROOT"
npx gltf-transform weld     "$SRC"          "$TMP/n1.glb"
node scripts/glb-tools.mjs  dilate "$TMP/n1.glb" "$TMP/n2.glb" --px "$DILATE_PX"
npx gltf-transform simplify "$TMP/n2.glb"   "$TMP/n3.glb" --ratio "$RATIO" --error "$ERROR"
node scripts/glb-tools.mjs  smooth "$TMP/n3.glb" "$TMP/n4a.glb" --angle "$ANGLE"
npx gltf-transform weld     "$TMP/n4a.glb"  "$TMP/n4.glb"
npx gltf-transform resize   "$TMP/n4.glb"   "$TMP/n5.glb" --width 2048 --height 2048
npx gltf-transform webp     "$TMP/n5.glb"   "$TMP/n6.glb" "${WEBP_ARGS[@]}"
npx gltf-transform meshopt  "$TMP/n6.glb"   "$OUT" --level "${MESHOPT_LEVEL:-medium}" --quantize-normal "$NORMAL_BITS"

echo "---"
ls -lh "$OUT" | awk '{print "Tamanho:", $5}'
npx gltf-transform inspect "$OUT" --format md 2>/dev/null | grep -E "TRIANGLES|image/" | head -3
