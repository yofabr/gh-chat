// GitHub Chat Extension - Content Script

(function () {
  "use strict";

  let currentUsername = null;
  let chatDrawer = null;
  let chatOverlay = null;
  let isShowingChatList = false;

  // Check if we're on a GitHub profile page
  function isProfilePage() {
    const path = window.location.pathname;
    // Profile pages are /{username} with no additional path segments (except maybe a tab)
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0 || segments.length > 2) return false;

    // Check if it's a user profile by looking for profile-specific elements
    const profileHeader =
      document.querySelector('[itemtype="http://schema.org/Person"]') ||
      document.querySelector(".js-profile-editable-replace") ||
      document.querySelector('[data-hovercard-type="user"]');

    // Also check for common non-profile paths
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
      "features",
    ];

    if (nonProfilePaths.includes(segments[0])) return false;

    return (
      profileHeader !== null || document.querySelector(".vcard-names") !== null
    );
  }

  // Get username from the profile page
  function getProfileUsername() {
    // Try multiple selectors to find the username
    const vcardUsername = document.querySelector(".vcard-username");
    if (vcardUsername) return vcardUsername.textContent.trim();

    const pathSegments = window.location.pathname.split("/").filter(Boolean);
    if (pathSegments.length >= 1) {
      return pathSegments[0];
    }

    return null;
  }

  // Get user avatar from the profile page
  function getProfileAvatar() {
    const avatar =
      document.querySelector(".avatar-user") ||
      document.querySelector("img.avatar");
    return avatar
      ? avatar.src
      : "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";
  }

  // Get display name from the profile page
  function getProfileDisplayName() {
    const displayName =
      document.querySelector(".vcard-fullname") ||
      document.querySelector('[itemprop="name"]');
    return displayName ? displayName.textContent.trim() : getProfileUsername();
  }

  // Create the chat button (full button with icon and text)
  function createChatButton() {
    const button = document.createElement("button");
    button.className = "github-chat-btn-profile btn btn-block";
    button.type = "button";
    button.innerHTML = `
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" class="octicon">
        <path fill-rule="evenodd" d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"/>
      </svg>
      <span>Chat</span>
    `;

    button.addEventListener("click", () => {
      openChatDrawer(
        getProfileUsername(),
        getProfileDisplayName(),
        getProfileAvatar(),
      );
    });

    return button;
  }

  // Create the header nav chat button
  function createHeaderChatButton() {
    const button = document.createElement("button");
    button.className =
      "github-chat-header-btn Button Button--iconOnly Button--secondary Button--medium AppHeader-button color-fg-muted";
    button.title = "My Chats";
    button.type = "button";
    button.setAttribute("aria-label", "My Chats");
    button.innerHTML = `
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-comment-discussion">
        <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z"></path>
      </svg>
    `;

    button.addEventListener("click", () => {
      openChatList();
    });

    return button;
  }

  // Inject header chat button into the navigation bar
  function injectHeaderChatButton() {
    // Remove existing if present
    const existing = document.querySelector(".github-chat-header-btn");
    if (existing) return; // Already injected

    // Target the AppHeader-actions div which contains the icon buttons
    // Based on the HTML structure: issues, PRs, repos icons are here
    let targetContainer = document.querySelector(".AppHeader-actions");

    if (targetContainer) {
      const chatBtn = createHeaderChatButton();
      // Insert at the beginning of the actions
      targetContainer.insertBefore(chatBtn, targetContainer.firstChild);
      return;
    }

    // Fallback: Try to find the area before notification-indicator
    const notificationIndicator = document.querySelector(
      "notification-indicator",
    );
    if (notificationIndicator) {
      const chatBtn = createHeaderChatButton();
      notificationIndicator.parentElement.insertBefore(
        chatBtn,
        notificationIndicator,
      );
      return;
    }

    // Another fallback: find the globalbar end section
    const globalBarEnd = document.querySelector(".AppHeader-globalBar-end");
    if (globalBarEnd) {
      // Find the actions area within it
      const actionsDiv = globalBarEnd.querySelector(".AppHeader-actions");
      if (actionsDiv) {
        const chatBtn = createHeaderChatButton();
        actionsDiv.insertBefore(chatBtn, actionsDiv.firstChild);
        return;
      }
    }
  }

  // Find and inject the chat button under the follow/sponsor buttons
  function injectChatButton() {
    // Remove existing button if any
    const existingBtn = document.querySelector(".github-chat-btn-profile");
    if (existingBtn) existingBtn.remove();
    const existingWrapper = document.querySelector(".github-chat-btn-wrapper");
    if (existingWrapper) existingWrapper.remove();

    // Find the follow button or sponsor button area
    const followForm =
      document.querySelector('form[action*="/follow"]') ||
      document.querySelector('[data-target="follow.form"]');

    const sponsorLink = document.querySelector('a[href*="/sponsors/"]');

    // Find the flex container that holds follow + sponsor
    let buttonRow = null;
    if (followForm) {
      // The follow form might be wrapped in a flex container with sponsor
      buttonRow =
        followForm.closest(".d-flex") ||
        followForm.closest('[class*="flex"]') ||
        followForm.parentElement;
    } else if (sponsorLink) {
      buttonRow = sponsorLink.closest(".d-flex") || sponsorLink.parentElement;
    }

    if (buttonRow) {
      // Create a wrapper div that will sit below the button row
      const wrapper = document.createElement("div");
      wrapper.className = "github-chat-btn-wrapper";
      wrapper.style.width = "100%";
      wrapper.style.marginTop = "-4px";
      wrapper.style.marginBottom = "8px";

      const chatBtn = createChatButton();
      wrapper.appendChild(chatBtn);

      // Insert after the button row
      buttonRow.insertAdjacentElement("afterend", wrapper);
      return;
    }

    // Fallback: look for vcard-names and insert after it
    const vcardNames = document.querySelector(".vcard-names");
    if (vcardNames) {
      const wrapper = document.createElement("div");
      wrapper.className = "github-chat-btn-wrapper";
      wrapper.style.width = "100%";
      wrapper.style.marginTop = "16px";

      const chatBtn = createChatButton();
      wrapper.appendChild(chatBtn);

      vcardNames.insertAdjacentElement("afterend", wrapper);
      return;
    }

    // Last fallback: append to vcard
    const vcard =
      document.querySelector(".h-card") ||
      document.querySelector('[itemtype="http://schema.org/Person"]');
    if (vcard) {
      const wrapper = document.createElement("div");
      wrapper.className = "github-chat-btn-wrapper";
      wrapper.style.width = "100%";
      wrapper.style.marginTop = "8px";

      const chatBtn = createChatButton();
      wrapper.appendChild(chatBtn);
      vcard.appendChild(wrapper);
    }
  }

  // Create the chat drawer
  function createChatDrawer(username, displayName, avatar) {
    // Create overlay if not exists
    if (!chatOverlay) {
      chatOverlay = document.createElement("div");
      chatOverlay.className = "github-chat-overlay";
      chatOverlay.addEventListener("click", closeChatDrawer);
      document.body.appendChild(chatOverlay);
    }

    // Create drawer if not exists
    if (!chatDrawer) {
      chatDrawer = document.createElement("div");
      chatDrawer.className = "github-chat-drawer";
      document.body.appendChild(chatDrawer);
    }

    // Set the content for individual chat
    chatDrawer.innerHTML = `
      <div class="github-chat-header">
        <div class="github-chat-header-left">
          <button class="github-chat-back" title="Back to chats">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z"/>
            </svg>
          </button>
          <img src="${avatar}" alt="${username}" class="github-chat-avatar">
          <div class="github-chat-user-info">
            <h3>${displayName}</h3>
            <span>@${username}</span>
          </div>
        </div>
        <button class="github-chat-close" title="Close chat">
          <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      </div>
      <div class="github-chat-messages" id="github-chat-messages">
        <div class="github-chat-empty">
          <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"/>
          </svg>
          <h4>Start a conversation</h4>
          <p>Send a message to @${username}</p>
        </div>
      </div>
      <div class="github-chat-input-area">
        <div class="github-chat-input-container">
          <textarea 
            class="github-chat-input" 
            placeholder="Type a message..." 
            rows="1"
            id="github-chat-input"
            data-username="${username}"
          ></textarea>
          <button class="github-chat-send" id="github-chat-send" title="Send message">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M.989 8 .064 2.68a1.342 1.342 0 0 1 1.85-1.462l13.402 5.744a1.13 1.13 0 0 1 0 2.076L1.913 14.782a1.343 1.343 0 0 1-1.85-1.463L.99 8Zm.603-5.288L2.38 7.25h4.87a.75.75 0 0 1 0 1.5H2.38l-.788 4.538L13.929 8Z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Set up event listeners
    const closeBtn = chatDrawer.querySelector(".github-chat-close");
    closeBtn.addEventListener("click", closeChatDrawer);

    const backBtn = chatDrawer.querySelector(".github-chat-back");
    backBtn.addEventListener("click", () => {
      showChatListView();
    });

    const input = chatDrawer.querySelector("#github-chat-input");
    const sendBtn = chatDrawer.querySelector("#github-chat-send");

    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      sendBtn.disabled = !input.value.trim();
    });

    // Send message on Enter (Shift+Enter for new line)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(username);
      }
    });

    sendBtn.addEventListener("click", () => sendMessage(username));
    sendBtn.disabled = true;

    // Load existing messages
    loadMessages(username);

    isShowingChatList = false;
  }

  // Create chat list view (all conversations)
  function createChatListView() {
    // Create overlay if not exists
    if (!chatOverlay) {
      chatOverlay = document.createElement("div");
      chatOverlay.className = "github-chat-overlay";
      chatOverlay.addEventListener("click", closeChatDrawer);
      document.body.appendChild(chatOverlay);
    }

    // Create drawer if not exists
    if (!chatDrawer) {
      chatDrawer = document.createElement("div");
      chatDrawer.className = "github-chat-drawer";
      document.body.appendChild(chatDrawer);
    }

    chatDrawer.innerHTML = `
      <div class="github-chat-header">
        <div class="github-chat-header-left">
          <svg viewBox="0 0 16 16" class="github-chat-header-icon" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"/>
          </svg>
          <div class="github-chat-user-info">
            <h3>My Chats</h3>
            <span>Your conversations</span>
          </div>
        </div>
        <button class="github-chat-close" title="Close">
          <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      </div>
      <div class="github-chat-list" id="github-chat-list">
        <div class="github-chat-list-loading">Loading chats...</div>
      </div>
    `;

    const closeBtn = chatDrawer.querySelector(".github-chat-close");
    closeBtn.addEventListener("click", closeChatDrawer);

    // Load all chats
    loadAllChats();

    isShowingChatList = true;
  }

  // Load all chats from storage
  function loadAllChats() {
    chrome.storage.local.get(null, (result) => {
      const chatList = document.querySelector("#github-chat-list");
      if (!chatList) return;

      const chatKeys = Object.keys(result).filter((key) =>
        key.startsWith("github-chat-"),
      );

      if (chatKeys.length === 0) {
        chatList.innerHTML = `
          <div class="github-chat-list-empty">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5zM1.75 1A1.75 1.75 0 000 2.75v8.5C0 12.216.784 13 1.75 13H3v1.543a1.457 1.457 0 002.487 1.03L8.061 13h6.189A1.75 1.75 0 0016 11.25v-8.5A1.75 1.75 0 0014.25 1H1.75z"/>
            </svg>
            <h4>No conversations yet</h4>
            <p>Visit a GitHub profile and click the chat icon to start a conversation</p>
          </div>
        `;
        return;
      }

      // Build chat list items
      let html = "";
      chatKeys.forEach((key) => {
        const username = key.replace("github-chat-", "");
        const messages = result[key];
        const lastMessage = messages[messages.length - 1];
        const lastMessageText = lastMessage ? lastMessage.text : "No messages";
        const lastMessageTime = lastMessage
          ? formatTime(lastMessage.timestamp)
          : "";

        html += `
          <div class="github-chat-list-item" data-username="${username}">
            <img src="https://github.com/${username}.png" alt="${username}" class="github-chat-list-avatar" onerror="this.src='https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'">
            <div class="github-chat-list-info">
              <div class="github-chat-list-name">@${username}</div>
              <div class="github-chat-list-preview">${escapeHtml(
                lastMessageText.substring(0, 50),
              )}${lastMessageText.length > 50 ? "..." : ""}</div>
            </div>
            <div class="github-chat-list-meta">
              <span class="github-chat-list-time">${lastMessageTime}</span>
              <span class="github-chat-list-count">${messages.length}</span>
            </div>
          </div>
        `;
      });

      chatList.innerHTML = html;

      // Add click handlers
      chatList.querySelectorAll(".github-chat-list-item").forEach((item) => {
        item.addEventListener("click", () => {
          const username = item.dataset.username;
          openChatDrawer(
            username,
            username,
            `https://github.com/${username}.png`,
          );
        });
      });
    });
  }

  // Format timestamp for chat list
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h";
    if (diff < 604800000) return Math.floor(diff / 86400000) + "d";

    return date.toLocaleDateString();
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Show chat list view
  function showChatListView() {
    createChatListView();
  }

  // Send a message
  function sendMessage(username) {
    const input = document.querySelector("#github-chat-input");
    const message = input.value.trim();

    if (!message) return;

    const targetUsername = username || input.dataset.username;
    const timestamp = new Date().toISOString();

    // Save message
    saveMessage(targetUsername, {
      text: message,
      sent: true,
      timestamp: timestamp,
    });

    // Add message to UI
    addMessageToUI(message, true, timestamp);

    // Clear input
    input.value = "";
    input.style.height = "auto";
    document.querySelector("#github-chat-send").disabled = true;

    // Focus back on input
    input.focus();
  }

  // Add message to the chat UI
  function addMessageToUI(text, isSent, timestamp) {
    const messagesContainer = document.querySelector("#github-chat-messages");
    if (!messagesContainer) return;

    // Remove empty state if present
    const emptyState = messagesContainer.querySelector(".github-chat-empty");
    if (emptyState) {
      emptyState.remove();
    }

    const messageEl = document.createElement("div");
    messageEl.className = `github-chat-message ${isSent ? "sent" : "received"}`;

    const time = new Date(timestamp);
    const timeStr = time.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    messageEl.innerHTML = `
      ${escapeHtml(text)}
      <div class="github-chat-message-time">${timeStr}</div>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Save message to storage
  function saveMessage(username, message) {
    const storageKey = `github-chat-${username}`;

    chrome.storage.local.get([storageKey], (result) => {
      const messages = result[storageKey] || [];
      messages.push(message);
      chrome.storage.local.set({ [storageKey]: messages });
    });
  }

  // Load messages from storage
  function loadMessages(username) {
    const storageKey = `github-chat-${username}`;

    chrome.storage.local.get([storageKey], (result) => {
      const messages = result[storageKey] || [];

      if (messages.length > 0) {
        // Remove empty state
        const emptyState = document.querySelector(".github-chat-empty");
        if (emptyState) emptyState.remove();

        messages.forEach((msg) => {
          addMessageToUI(msg.text, msg.sent, msg.timestamp);
        });
      }
    });
  }

  // Open the chat drawer for a specific user
  function openChatDrawer(username, displayName, avatar) {
    createChatDrawer(username, displayName, avatar);

    // Small delay to trigger animation
    requestAnimationFrame(() => {
      chatOverlay.classList.add("open");
      chatDrawer.classList.add("open");

      // Focus the input
      setTimeout(() => {
        const input = document.querySelector("#github-chat-input");
        if (input) input.focus();
      }, 300);
    });
  }

  // Open the chat list
  function openChatList() {
    createChatListView();

    // Small delay to trigger animation
    requestAnimationFrame(() => {
      chatOverlay.classList.add("open");
      chatDrawer.classList.add("open");
    });
  }

  // Close the chat drawer
  function closeChatDrawer() {
    if (chatOverlay) chatOverlay.classList.remove("open");
    if (chatDrawer) chatDrawer.classList.remove("open");
  }

  // Initialize the extension for profile pages
  function initProfilePage() {
    if (!isProfilePage()) return;

    currentUsername = getProfileUsername();
    if (!currentUsername) return;

    // Inject the chat button next to name
    injectChatButton();
  }

  // Initialize header chat button (works on all GitHub pages)
  function initHeaderButton() {
    injectHeaderChatButton();
  }

  // Run on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initHeaderButton();
      initProfilePage();
    });
  } else {
    initHeaderButton();
    initProfilePage();
  }

  // Re-run on navigation (GitHub uses SPA-style navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Clean up existing elements
      const existingBtn = document.querySelector(".github-chat-btn-profile");
      if (existingBtn) existingBtn.remove();
      if (chatDrawer) {
        chatDrawer.remove();
        chatDrawer = null;
      }
      if (chatOverlay) {
        chatOverlay.remove();
        chatOverlay = null;
      }
      // Re-initialize after a short delay to let the page update
      setTimeout(() => {
        initHeaderButton();
        initProfilePage();
      }, 500);
    }
  }).observe(document, { subtree: true, childList: true });
})();
