import { getToken, type User } from "./auth"

const BACKEND_URL =
  process.env.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:8585"
const FRONTEND_URL =
  process.env.PLASMO_PUBLIC_FRONTEND_URL || "http://localhost:5173"

// Status icons for messages (duplicated here for direct DOM updates)
const STATUS_ICONS = {
  sent: `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`,
  read: `<svg viewBox="0 0 24 16" width="18" height="12"><path fill="currentColor" d="M11.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L4 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/><path fill="currentColor" d="M19.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0l-1.5-1.5a.751.751 0 0 1 1.06-1.06l.97.97 6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`
}

// Update message status directly in the DOM (for read receipts when chat is open)
function updateMessageStatusInDOM(
  messageIds: string[],
  status: "sent" | "read"
) {
  // Find the chat drawer
  const chatDrawer = document.querySelector(".github-chat-drawer")
  if (!chatDrawer) return // Chat drawer not open

  const messagesContainer = chatDrawer.querySelector(".github-chat-messages")
  if (!messagesContainer) return // Not in conversation view

  messageIds.forEach((id) => {
    const msgEl = messagesContainer.querySelector(`[data-message-id="${id}"]`)
    if (msgEl && msgEl.classList.contains("sent")) {
      const statusEl = msgEl.querySelector(".github-chat-status")
      if (statusEl) {
        statusEl.className = `github-chat-status ${status}`
        statusEl.innerHTML = STATUS_ICONS[status]
      }
    }
  })
}

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
  id: string
  created_at: string
  updated_at: string
  other_user_id: string
  other_username: string
  other_display_name: string
  other_avatar_url: string
  other_has_account: boolean
  last_message: string | null
  last_message_time: string | null
  unread_count: number
}

export interface Message {
  id: string
  content: string
  created_at: string
  read_at: string | null
  sender_id: string
  sender_username: string
  sender_display_name: string
  sender_avatar: string
}

export interface OtherUser {
  id: string
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

// Get total unread message count
export async function getTotalUnreadCount(): Promise<number> {
  try {
    const response = await fetchWithAuth("/conversations/unread-count")
    if (!response.ok) return 0
    const data = await response.json()
    return data.unread_count || 0
  } catch {
    return 0
  }
}

// Get or create a conversation with a user by username
export async function getOrCreateConversation(username: string): Promise<{
  conversation: { id: string; other_user: OtherUser } | null
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

// Get messages in a conversation (with pagination support)
export interface MessagesResponse {
  messages: Message[]
  hasMore: boolean
}

export async function getMessages(
  conversationId: string,
  before?: string,
  limit: number = 50
): Promise<MessagesResponse> {
  try {
    const params = new URLSearchParams()
    if (before) params.set("before", before)
    params.set("limit", String(limit))
    const queryString = params.toString() ? `?${params.toString()}` : ""
    const response = await fetchWithAuth(
      `/conversations/${conversationId}/messages${queryString}`
    )
    if (!response.ok) return { messages: [], hasMore: false }
    const data = await response.json()
    return { messages: data.messages || [], hasMore: data.hasMore || false }
  } catch {
    return { messages: [], hasMore: false }
  }
}

// Send a message
export async function sendMessage(
  conversationId: string,
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

// Mark a conversation as read
export async function markConversationAsRead(
  conversationId: string
): Promise<void> {
  try {
    await fetchWithAuth(`/conversations/${conversationId}/read`, {
      method: "POST"
    })
  } catch {
    // Silently fail - not critical
  }
}

// WebSocket connection management
const WS_URL = process.env.PLASMO_PUBLIC_WS_URL || "ws://localhost:8586"

let ws: WebSocket | null = null
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null
let wsAuthenticated = false
let currentConversationId: string | null = null
let messageCallback: ((message: Message) => void) | null = null
let typingCallback: ((userId: string, username: string) => void) | null = null
let stopTypingCallback: ((userId: string) => void) | null = null
let messagesReadCallback: ((messageIds: string[]) => void) | null = null

// Global callback for any new message (used to update conversation list)
let globalMessageCallback:
  | ((conversationId: string, message: Message) => void)
  | null = null

// Set a global message listener for updating the conversation list
export function setGlobalMessageListener(
  callback: ((conversationId: string, message: Message) => void) | null
): void {
  globalMessageCallback = callback
}

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
        console.log("WebSocket received:", data.type, data)

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

        if (data.type === "new_message" && data.message) {
          // Call the conversation-specific callback if set
          if (messageCallback) {
            messageCallback(data.message)
          }
          // Also call the global callback for list updates
          if (globalMessageCallback && data.conversationId) {
            globalMessageCallback(data.conversationId, data.message)
          }
        }

        if (data.type === "typing" && typingCallback) {
          typingCallback(data.userId, data.username)
        }

        if (data.type === "stop_typing" && stopTypingCallback) {
          stopTypingCallback(data.userId)
        }

        if (data.type === "messages_read") {
          console.log("Received messages_read:", data)
          console.log("messagesReadCallback exists:", !!messagesReadCallback)
          console.log("Current conversation:", currentConversationId)

          // Always try to update the DOM directly for read receipts
          // This handles the case where the chat is open but callbacks aren't set
          const messageIds = data.messageIds as string[]
          if (messageIds && messageIds.length > 0) {
            updateMessageStatusInDOM(messageIds, "read")
          }

          // Also call the callback if it exists and conversation matches
          if (messagesReadCallback) {
            if (
              !data.conversationId ||
              data.conversationId === currentConversationId
            ) {
              console.log("Calling messagesReadCallback with:", data.messageIds)
              messagesReadCallback(data.messageIds)
            } else {
              console.log("Ignoring callback - different conversation")
            }
          }
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

export interface ConversationCallbacks {
  onMessage: (message: Message) => void
  onTyping?: (userId: string, username: string) => void
  onStopTyping?: (userId: string) => void
  onMessagesRead?: (messageIds: string[]) => void
}

// Join a conversation for real-time updates
export async function joinConversation(
  conversationId: string,
  callbacks: ConversationCallbacks
): Promise<() => void> {
  const token = await getToken()
  if (!token) {
    throw new Error("Not authenticated")
  }

  messageCallback = callbacks.onMessage
  typingCallback = callbacks.onTyping || null
  stopTypingCallback = callbacks.onStopTyping || null
  messagesReadCallback = callbacks.onMessagesRead || null
  currentConversationId = conversationId

  // Connect if not connected
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    await connectWebSocket(token)
  }

  // Join the conversation and wait for confirmation
  return new Promise((resolve) => {
    const originalOnMessage = ws!.onmessage

    ws!.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "joined" && data.conversationId === conversationId) {
          console.log("Joined conversation:", conversationId)
          // Restore original handler and resolve
          ws!.onmessage = originalOnMessage

          // Return cleanup function
          resolve(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "leave" }))
            }
            messageCallback = null
            typingCallback = null
            stopTypingCallback = null
            messagesReadCallback = null
            currentConversationId = null
          })
          return
        }
      } catch (e) {
        // ignore
      }
      // Pass through to original handler
      if (originalOnMessage) {
        originalOnMessage.call(ws, event)
      }
    }

    ws?.send(JSON.stringify({ type: "join", conversationId }))
  })
}

// Send typing indicator
export function sendTypingIndicator() {
  if (ws && ws.readyState === WebSocket.OPEN && currentConversationId) {
    ws.send(JSON.stringify({ type: "typing" }))
  }
}

// Stop typing indicator
export function sendStopTyping() {
  if (ws && ws.readyState === WebSocket.OPEN && currentConversationId) {
    ws.send(JSON.stringify({ type: "stop_typing" }))
  }
}

// Mark messages as read
export function markMessagesAsRead(messageIds: string[]) {
  console.log("markMessagesAsRead called:", messageIds)
  console.log(
    "ws exists:",
    !!ws,
    "readyState:",
    ws?.readyState,
    "currentConversationId:",
    currentConversationId
  )
  if (ws && ws.readyState === WebSocket.OPEN && currentConversationId) {
    console.log("Sending mark_read via WebSocket")
    ws.send(JSON.stringify({ type: "mark_read", messageIds }))
  } else {
    console.log("NOT sending mark_read - conditions not met")
  }
}

// Ensure WebSocket is connected for global events (read receipts, etc.)
export async function ensureWebSocketConnected(): Promise<void> {
  console.log("ensureWebSocketConnected called")
  const token = await getToken()
  console.log("Token available:", !!token)
  if (!token) return

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log("Connecting WebSocket...")
    await connectWebSocket(token)
    console.log("WebSocket connected and authenticated")
  } else {
    console.log("WebSocket already connected")
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
  typingCallback = null
  stopTypingCallback = null
  messagesReadCallback = null
  currentConversationId = null
}
