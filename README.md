# GH Chat

Real-time messaging for GitHub users. Chat with anyone, right from their profile.

## Features

- **Real-time messaging** - Instant messaging with typing indicators
- **Read receipts** - Know when your messages are seen
- **Secure** - GitHub OAuth, no extra passwords

## Installation

Install the [Chrome Extension](https://chromewebstore.google.com/detail/lpccimcjmaaenlgckbafegoiekccejnj) and start chatting!

## Project Structure

```
├── backend/     # Hono API server
├── extension/   # Chrome extension (Plasmo)
└── frontend/    # Landing page (React + Vite)
```

## Development

### Backend

```bash
cd backend
npm install
npm run dev
```

### Extension

```bash
cd extension
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## License

This project is licensed under the GNU Affero General Public License v3.0. See [`LICENSE`](./LICENSE) for details.
