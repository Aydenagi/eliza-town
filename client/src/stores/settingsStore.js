import { create } from 'zustand'
import { resolveInitialWorldId, persistWorldId } from '../worlds/index'

const LLM_KEY = 'eliza-town-llm'

function loadLlmSettings() {
  try {
    const raw = window.localStorage.getItem(LLM_KEY)
    if (!raw) return { provider: '', key: '', model: '' }
    const parsed = JSON.parse(raw)
    return { provider: parsed.provider || '', key: parsed.key || '', model: parsed.model || '' }
  } catch {
    return { provider: '', key: '', model: '' }
  }
}

function saveLlmSettings(settings) {
  try {
    window.localStorage.setItem(LLM_KEY, JSON.stringify(settings))
  } catch {
    // localStorage unavailable
  }
}

export const useSettingsStore = create((set) => ({
  worldId: resolveInitialWorldId(),
  llm: loadLlmSettings(),

  setWorldId: (worldId) => {
    persistWorldId(worldId)
    set({ worldId })
  },

  setLlm: (llm) => set(() => {
    saveLlmSettings(llm)
    return { llm }
  }),

  clearLlm: () => set(() => {
    const empty = { provider: '', key: '', model: '' }
    saveLlmSettings(empty)
    return { llm: empty }
  }),
}))
