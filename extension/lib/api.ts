import { getToken, type User } from "./auth"

const BACKEND_URL =
  process.env.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:8585"
const FRONTEND_URL =
  process.env.PLASMO_PUBLIC_FRONTEND_URL || "http://localhost:5173"

// API client with auth header
async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await getToken()

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers
  }

  if (token) {
    ;(headers as Record<string, string>)["Authorization"] = `Bearer ${token}`
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers
  })

  return response
}

// Get current user
export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await fetchWithAuth("/auth/me")

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.user
  } catch {
    return null
  }
}

// Logout
export async function logout(): Promise<void> {
  try {
    await fetchWithAuth("/auth/logout", { method: "POST" })
  } catch {
    // Ignore errors, we'll clear local token anyway
  }
}

// Get login URL
export function getLoginUrl(): string {
  return `${FRONTEND_URL}/login`
}

// Open login page
export function openLoginPage(): void {
  chrome.tabs.create({ url: getLoginUrl() })
}

// ============= Conversations API =============

export interface Conversation {
  id: number
  created_at: string
  updated_at: string
  other_user_id: number
  other_username: string
  other_display_name: string
  other_avatar_url: string
  other_has_account: boolean
  last_message: string | null
  last_message_time: string | null
}

export interface Message {
  id: number
  content: string
  created_at: string
  sender_id: number
  sender_username: string
  sender_display_name: string
  sender_avatar: string
}

export interface OtherUser {
  id: number
  username: string
  display_name: string
  avatar_url: string
  has_account: boolean
}

// Get all conversations for the current user
export async function getConversations(): Promise<Conversation[]> {
  try {
    const response = await fetchWithAuth("/conversations")
    if (!response.ok) return []
    const data = await response.json()
    return data.conversations || []
  } catch {
    return []
  }
}

// Get or create a conversation with a user by username
export async function getOrCreateConversation(username: string): Promise<{
  conversation: { id: number; other_user: OtherUser } | null
  created: boolean
  error?: string
}> {
  try {
    const response = await fetchWithAuth(`/conversations/with/${username}`, {
      method: "POST"
    })

    if (!response.ok) {
      const data = await response.json()
      return { conversation: null, created: false, error: data.error }
    }

    const data = await response.json()
    return {
      conversation: data.conversation,
      created: data.created
    }
  } catch (error) {
    return { conversation: null, created: false, error: "Network error" }
  }
}

// Get messages in a conversation
export async function getMessages(
  conversationId: number,
  before?: number
): Promise<Message[]> {
  try {
    const params = before ? `?before=${before}` : ""
    const response = await fetchWithAuth(
      `/conversations/${conversationId}/messages${params}`
    )
    if (!response.ok) return []
    const data = await response.json()
    return data.messages || []
  } catch {
    return []
  }
}

// Send a message
export async function sendMessage(
  conversationId: number,
  content: string
): Promise<Message | null> {
  try {
    const response = await fetchWithAuth(
      `/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content })
      }
    )

    if (!response.ok) return null
    const data = await response.json()
    return data.message
  } catch {
    return null
  }
}

// WebSocket connection management
const WS_URL = process.env.PLASMO_PUBLIC_WS_URL || "ws://localhost:8586"

let ws: WebSocket | null = null
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null
let wsAuthenticated = false
let currentConversationId: number | null = null
let messageCallback: ((message: Message) => void) | null = null

function connectWebSocket(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve()
      return
    }

    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log("WebSocket connected")
      // Authenticate
      ws?.send(JSON.stringify({ type: "auth", token }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === "authenticated") {
          wsAuthenticated = true
          resolve()
          return
        }

        if (data.type === "error") {
          console.error("WebSocket error:", data.error)
          if (data.error === "Invalid token") {
            wsAuthenticated = false
            reject(new Error(data.error))
          }
          return
        }

        if (data.type === "new_message" && data.message && messageCallback) {
          messageCallback(data.message)
        }
      } catch (e) {
        console.error("WebSocket message parse error:", e)
      }
    }

    ws.onclose = () => {
      console.log("WebSocket disconnected")
      wsAuthenticated = false
      ws = null

      // Reconnect after 3 seconds
      if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout)
      wsReconnectTimeout = setTimeout(async () => {
        const token = await getToken()
        if (token) {
          connectWebSocket(token).catch(console.error)
        }
      }, 3000)
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
    }
  })
}

// Join a conversation for real-time updates
export async function joinConversation(
  conversationId: number,
  onMessage: (message: Message) => void
): Promise<() => void> {
  const token = await getToken()
  if (!token) {
    throw new Error("Not authenticated")
  }

  messageCallback = onMessage
  currentConversationId = conversationId

  // Connect if not connected
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    await connectWebSocket(token)
  }

  // Join the conversation
  ws?.send(JSON.stringify({ type: "join", conversationId }))

  // Return cleanup function
  return () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leave" }))
    }
    messageCallback = null
    currentConversationId = null
  }
}

// Disconnect WebSocket
export function disconnectWebSocket() {
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout)
    wsReconnectTimeout = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
  wsAuthenticated = false
  messageCallback = null
  currentConversationId = null
}
