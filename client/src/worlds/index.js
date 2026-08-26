import town from './town'
import harbor from './harbor'
import city from './city'
import sky from './sky'

export const WORLDS = { town, harbor, city, sky }
export const DEFAULT_WORLD = 'town'
export const WORLD_IDS = Object.keys(WORLDS)

const STORAGE_KEY = 'eliza-town-world'

export function getWorld(id) {
  return WORLDS[id] || WORLDS[DEFAULT_WORLD]
}

export function resolveInitialWorldId() {
  if (typeof window === 'undefined') return DEFAULT_WORLD

  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('world')
  if (fromUrl && WORLDS[fromUrl]) return fromUrl

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && WORLDS[stored]) return stored
  } catch {
    // localStorage unavailable (private browsing, disabled storage)
  }

  return DEFAULT_WORLD
}

export function persistWorldId(id) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  url.searchParams.set('world', id)
  window.history.replaceState(null, '', url)

  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // localStorage unavailable
  }
}
