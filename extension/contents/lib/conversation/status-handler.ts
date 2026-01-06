// User status handling - online/offline indicators

import { getUserStatus, setUserStatusListener } from "~lib/api"

import { getChatContainer } from "../state"
import { formatRelativeTime } from "../utils"

// Current other user ID being tracked
let currentOtherUserId: string | null = null

// Update the status indicator in the UI
export function updateStatusUI(
  container: HTMLElement,
  online: boolean,
  lastSeenAt: string | null
): void {
  const indicator = container.querySelector(
    "#github-chat-status-indicator"
  ) as HTMLElement
  const statusText = container.querySelector(
    "#github-chat-user-status"
  ) as HTMLElement

  if (indicator) {
    indicator.dataset.status = online ? "online" : "offline"
  }

  if (statusText) {
    if (online) {
      statusText.textContent = "Online"
      statusText.className = "github-chat-user-status online"
    } else if (lastSeenAt) {
      const lastSeenTime = new Date(lastSeenAt).getTime()
      statusText.textContent = `Last seen ${formatRelativeTime(lastSeenTime)}`
      statusText.className = "github-chat-user-status"
    } else {
      statusText.textContent = ""
      statusText.className = "github-chat-user-status"
    }
  }
}

// Fetch and display user status
export async function fetchAndDisplayStatus(
  container: HTMLElement,
  otherUserId: string
): Promise<void> {
  currentOtherUserId = otherUserId

  // Set up WebSocket listener for status updates
  setUserStatusListener((userId, _username, online, lastSeenAt) => {
    if (userId === currentOtherUserId) {
      const chatContainer = getChatContainer()
      if (chatContainer) {
        updateStatusUI(chatContainer, online, lastSeenAt)
      }
    }
  })

  try {
    const status = await getUserStatus(otherUserId)
    if (status) {
      updateStatusUI(container, status.online, status.lastSeenAt)
    }
  } catch (error) {
    console.error("Failed to fetch user status:", error)
  }
}

// Clean up status listener
export function cleanupStatusListener(): void {
  currentOtherUserId = null
  setUserStatusListener(null)
}

// Start polling for status updates (fallback for when not using WebSocket)
let statusPollingInterval: ReturnType<typeof setInterval> | null = null

export function startStatusPolling(
  container: HTMLElement,
  otherUserId: string,
  intervalMs: number = 30000
): void {
  stopStatusPolling()
  statusPollingInterval = setInterval(() => {
    fetchAndDisplayStatus(container, otherUserId)
  }, intervalMs)
}

export function stopStatusPolling(): void {
  if (statusPollingInterval) {
    clearInterval(statusPollingInterval)
    statusPollingInterval = null
  }
}
