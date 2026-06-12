// Génère les icônes PNG de la PWA à partir de public/carta.svg.
// À relancer si l'icône SVG change : `node scripts/gen-icons.mjs`.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public', 'carta.svg'))

// Fond crème (= --paper) pour un carré plein, joliment arrondi par l'OS.
const BG = '#f7efdd'

// { fichier, taille }
const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

for (const { file, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .png()
    .toFile(join(root, 'public', file))
  console.log('✓', file, `(${size}×${size})`)
}
