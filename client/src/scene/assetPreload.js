import { useGLTF } from '@react-three/drei'
import { CLOUD_PATHS } from './assets'

export function preloadWorldAssets(world) {
  const tilePaths = new Set(world.tiles.map((t) => `/assets/town/tiles/${t.type}.gltf`))
  for (const path of tilePaths) useGLTF.preload(path)

  const propPaths = new Set(world.props.map((p) => `/assets/town/${p.category}/${p.name}.gltf`))
  for (const path of propPaths) useGLTF.preload(path)

  for (const path of CLOUD_PATHS) useGLTF.preload(path)
}
