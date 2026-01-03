const STORAGE_KEY = "github-chat-token"

export interface User {
  id: number
  github_id: number
  username: string
  display_name: string
  avatar_url: string
  created_at: string
}

// Get stored auth token
export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] || null
}

// Store auth token
export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: token })
}

// Remove auth token
export async function removeToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

// Check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken()
  return token !== null
}
