# GitHub Chat Chrome Extension

A Chrome extension that adds a chat button to GitHub user profiles, allowing you to send messages directly from their profile page.

## Features

- 💬 **Chat Button**: Adds a chat icon to the GitHub profile header
- 🎨 **Native Look**: Matches GitHub's dark theme design
- 📱 **Floating Drawer**: Beautiful slide-in chat panel
- 💾 **Message History**: Messages are saved locally per user
- ⌨️ **Keyboard Support**: Press Enter to send, Shift+Enter for new line

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `github-chat` folder

### Creating Icons

The extension requires PNG icons. You can convert the SVG icons to PNG using any image editor or online converter:

- `icons/icon16.png` - 16x16 pixels
- `icons/icon48.png` - 48x48 pixels
- `icons/icon128.png` - 128x128 pixels

Or use these commands if you have ImageMagick installed:

```bash
cd icons
convert -background none icon16.svg icon16.png
convert -background none icon48.svg icon48.png
convert -background none icon128.svg icon128.png
```

## Usage

1. Navigate to any GitHub user's profile (e.g., `https://github.com/octocat`)
2. Look for the chat icon (💬) in the profile header alongside other action buttons
3. Click the chat icon to open the messaging drawer
4. Type your message and press Enter or click the send button

## How It Works

- Messages are stored locally in Chrome's storage
- Each conversation is stored separately per GitHub username
- The extension only activates on GitHub profile pages

## Note

This is a client-side only extension - messages are stored locally in your browser. To actually deliver messages to other users, you would need to implement a backend service.

## Tech Stack

- Manifest V3
- Vanilla JavaScript
- CSS with GitHub's design system variables
- Chrome Storage API

## License

MIT
