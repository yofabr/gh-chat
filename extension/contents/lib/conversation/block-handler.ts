// Block/unblock user handling

import { blockUser, getBlockStatus, unblockUser } from "~lib/api"

// Current other user ID being tracked
let currentBlockedUserId: string | null = null
let currentBlockStatus: "none" | "blocked_by_me" | "blocked_by_them" = "none"

// Setup menu toggle and block handlers
export function setupBlockHandlers(
  container: HTMLElement,
  otherUserId: string
): void {
  currentBlockedUserId = otherUserId

  const menuBtn = container.querySelector("#github-chat-menu-btn")
  const menu = container.querySelector(
    "#github-chat-header-menu"
  ) as HTMLElement

  if (!menuBtn || !menu) return

  // Toggle menu on click
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    const isVisible = menu.style.display !== "none"
    menu.style.display = isVisible ? "none" : "block"
  })

  // Close menu when clicking outside
  document.addEventListener("click", () => {
    menu.style.display = "none"
  })

  // Block/unblock button handler
  const blockBtn = menu.querySelector("#github-chat-menu-block")
  blockBtn?.addEventListener("click", async (e) => {
    e.stopPropagation()
    menu.style.display = "none"

    if (currentBlockStatus === "blocked_by_me") {
      await handleUnblock(container, otherUserId)
    } else {
      await handleBlock(container, otherUserId)
    }
  })

  // Fetch and display initial block status
  fetchAndDisplayBlockStatus(container, otherUserId)
}

// Fetch and display block status
async function fetchAndDisplayBlockStatus(
  container: HTMLElement,
  otherUserId: string
): Promise<void> {
  const status = await getBlockStatus(otherUserId)
  if (status) {
    currentBlockStatus = status.status
    updateBlockUI(container, status.status)
  }
}

// Update UI based on block status
function updateBlockUI(
  container: HTMLElement,
  status: "none" | "blocked_by_me" | "blocked_by_them"
): void {
  const blockBtn = container.querySelector(
    "#github-chat-menu-block"
  ) as HTMLElement
  const inputArea = container.querySelector(
    ".github-chat-input-area"
  ) as HTMLElement
  const header = container.querySelector(".github-chat-header") as HTMLElement

  // Update menu button text
  if (blockBtn) {
    const label = blockBtn.querySelector(".github-chat-menu-label")
    const icon = blockBtn.querySelector(".github-chat-menu-icon")
    if (status === "blocked_by_me") {
      if (label) label.textContent = "Unblock user"
      if (icon) icon.textContent = "✓"
      blockBtn.classList.remove("github-chat-menu-block")
      blockBtn.classList.add("github-chat-menu-unblock")
    } else {
      if (label) label.textContent = "Block user"
      if (icon) icon.textContent = "🚫"
      blockBtn.classList.remove("github-chat-menu-unblock")
      blockBtn.classList.add("github-chat-menu-block")
    }
  }

  // Remove existing banner
  const existingBanner = container.querySelector(".github-chat-blocked-banner")
  existingBanner?.remove()

  // Show/hide blocked banner and disable input
  if (status === "blocked_by_me") {
    showBlockedBanner(container, "You blocked this user", true)
    if (inputArea) inputArea.style.display = "none"
  } else if (status === "blocked_by_them") {
    showBlockedBanner(container, "You can't reply to this conversation", false)
    if (inputArea) inputArea.style.display = "none"
  } else {
    if (inputArea) inputArea.style.display = ""
  }
}

// Show blocked banner
function showBlockedBanner(
  container: HTMLElement,
  message: string,
  showUnblockBtn: boolean
): void {
  const header = container.querySelector(".github-chat-header")
  if (!header) return

  const banner = document.createElement("div")
  banner.className = "github-chat-blocked-banner"
  banner.innerHTML = `
    <span>${message}</span>
    ${showUnblockBtn ? '<button id="github-chat-banner-unblock">Unblock</button>' : ""}
  `

  header.insertAdjacentElement("afterend", banner)

  // Unblock button in banner
  const unblockBtn = banner.querySelector("#github-chat-banner-unblock")
  unblockBtn?.addEventListener("click", () => {
    if (currentBlockedUserId) {
      handleUnblock(container, currentBlockedUserId)
    }
  })
}

// Handle blocking a user
async function handleBlock(
  container: HTMLElement,
  otherUserId: string
): Promise<void> {
  const confirmed = confirm(
    "Are you sure you want to block this user? You won't be able to send or receive messages from them."
  )
  if (!confirmed) return

  const success = await blockUser(otherUserId)
  if (success) {
    currentBlockStatus = "blocked_by_me"
    updateBlockUI(container, "blocked_by_me")
  }
}

// Handle unblocking a user
async function handleUnblock(
  container: HTMLElement,
  otherUserId: string
): Promise<void> {
  const success = await unblockUser(otherUserId)
  if (success) {
    currentBlockStatus = "none"
    updateBlockUI(container, "none")
  }
}

// Cleanup
export function cleanupBlockHandler(): void {
  currentBlockedUserId = null
  currentBlockStatus = "none"
}
