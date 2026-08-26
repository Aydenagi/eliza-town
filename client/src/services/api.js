const API_BASE = '/api'
const SESSION_KEY = 'eliza-town-session-id'

function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY)
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    localStorage.setItem(SESSION_KEY, sessionId)
  }
  return sessionId
}

export const SESSION_ID = getSessionId()

async function parseError(response) {
  try {
    const body = await response.json()
    return body.error || `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export async function getAgents() {
  const response = await fetch(`${API_BASE}/agents`)
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export async function updateAgent(id, updates) {
  const response = await fetch(`${API_BASE}/agents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export async function getTasks() {
  const response = await fetch(`${API_BASE}/tasks`, {
    headers: { 'X-Session-Id': SESSION_ID },
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export async function createTask({ title, description, priority }, llm) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-Id': SESSION_ID,
  }
  if (llm?.provider && llm?.key) {
    headers['X-LLM-Provider'] = llm.provider
    headers['X-LLM-Key'] = llm.key
    if (llm.model) headers['X-LLM-Model'] = llm.model
  }

  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, description, priority }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json()
}

export function taskFileUrl(taskId, filename) {
  return `${API_BASE}/tasks/${taskId}/files/${encodeURIComponent(filename)}`
}
