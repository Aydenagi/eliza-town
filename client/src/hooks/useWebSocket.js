import { useEffect, useRef, useCallback } from 'react'
import { useGameStore, useBubbleStore } from '../stores/gameStore'

const PING_INTERVAL_MS = 30000
const MAX_RECONNECT_DELAY_MS = 10000

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const retryCountRef = useRef(0)
  const isConnectingRef = useRef(false)
  const connectRef = useRef(null)

  const handleMessage = useCallback((event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    const store = useGameStore.getState()
    const { data } = message

    switch (message.type) {
      case 'connected':
      case 'pong':
        break

      case 'state_update':
        store.mergeStateUpdate(data)
        break

      case 'agent_move':
        store.startMove(data.agentId, { from: data.from, to: data.to, travelMs: data.travelMs })
        store.patchAgent(data.agentId, { status: 'traveling' })
        break

      case 'agent_arrived':
        store.clearMove(data.agentId)
        store.patchAgent(data.agentId, { status: 'idle', current_hub: data.hub })
        break

      case 'agent_status':
        store.patchAgent(data.agentId, { status: data.status, doing: data.doing })
        break

      case 'agent_speak': {
        const duration = 3000 + (data.text?.length || 0) * 50
        useBubbleStore.getState().showBubble(data.agentId, data.text, data.type, duration)
        store.addMessage({
          id: `${data.agentId}-${message.timestamp}`,
          agentId: data.agentId,
          agentName: data.agentName,
          type: data.type,
          content: data.text,
          taskId: data.taskId ?? null,
          createdAt: new Date(message.timestamp).toISOString(),
        })
        break
      }

      case 'task_created':
      case 'task_update':
      case 'task_complete':
      case 'task_failed':
        store.upsertTask(data.task)
        break

      case 'file_created':
        store.addTaskFile(data.taskId, data.file)
        break

      default:
        break
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || isConnectingRef.current) return

    isConnectingRef.current = true
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      useGameStore.getState().setConnected(true)
      retryCountRef.current = 0
      isConnectingRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    ws.onclose = () => {
      isConnectingRef.current = false
      wsRef.current = null
      useGameStore.getState().setConnected(false)

      const delay = Math.min(1000 * 1.5 ** retryCountRef.current, MAX_RECONNECT_DELAY_MS)
      retryCountRef.current++
      reconnectTimeoutRef.current = setTimeout(() => connectRef.current?.(), delay)
    }

    ws.onerror = () => {
      isConnectingRef.current = false
    }

    ws.onmessage = handleMessage
  }, [handleMessage])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    const initialDelay = setTimeout(connect, 100)
    return () => {
      clearTimeout(initialDelay)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  useEffect(() => {
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, PING_INTERVAL_MS)
    return () => clearInterval(ping)
  }, [])
}
