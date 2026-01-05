// GitHub profile detection utilities

// Check if we're on a GitHub profile page
export function isProfilePage(): boolean {
  const path = window.location.pathname
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0 || segments.length > 2) return false

  const profileHeader =
    document.querySelector('[itemtype="http://schema.org/Person"]') ||
    document.querySelector(".js-profile-editable-replace") ||
    document.querySelector('[data-hovercard-type="user"]')

  const nonProfilePaths = [
    "settings",
    "notifications",
    "explore",
    "marketplace",
    "pulls",
    "issues",
    "codespaces",
    "sponsors",
    "login",
    "signup",
    "organizations",
    "orgs",
    "new",
    "features"
  ]

  if (nonProfilePaths.includes(segments[0])) return false

  return (
    profileHeader !== null || document.querySelector(".vcard-names") !== null
  )
}

// Get username from the profile page
export function getProfileUsername(): string | null {
  // Most reliable: get from URL path
  const pathSegments = window.location.pathname.split("/").filter(Boolean)
  if (pathSegments.length >= 1 && !pathSegments[0].includes("/")) {
    return pathSegments[0]
  }

  // Fallback: try to extract from vcard
  const vcardUsername = document.querySelector(".vcard-username")
  if (vcardUsername) {
    // Get only the direct text content, clean it up
    const textNodes = Array.from(vcardUsername.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)

    // Remove @ and any special characters like ·
    const rawText = textNodes[0] || ""
    const username = rawText.replace("@", "").replace("·", "").trim()
    if (username) return username
  }

  return null
}

// Get user avatar from the profile page
export function getProfileAvatar(): string {
  const avatar =
    document.querySelector(".avatar-user") ||
    document.querySelector("img.avatar")
  return avatar instanceof HTMLImageElement
    ? avatar.src
    : "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
}

// Get display name from the profile page
export function getProfileDisplayName(): string {
  const displayName =
    document.querySelector(".vcard-fullname") ||
    document.querySelector('[itemprop="name"]')
  return displayName?.textContent?.trim() || getProfileUsername() || "User"
}
