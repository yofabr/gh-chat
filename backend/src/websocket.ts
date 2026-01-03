import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { sql } from "./db/index.js";

interface AuthenticatedSocket extends WebSocket {
  userId?: number;
  username?: string;
  conversationId?: number;
  isAlive?: boolean;
}

// Map of conversation ID to set of connected sockets
const conversationSockets = new Map<number, Set<AuthenticatedSocket>>();

// Map of user ID to set of all their connected sockets (for global notifications like read receipts)
const userSockets = new Map<number, Set<AuthenticatedSocket>>();

// Track typing timeouts per user per conversation
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// Add socket to user's global socket set
function addUserSocket(socket: AuthenticatedSocket) {
  if (!socket.userId) return;
  if (!userSockets.has(socket.userId)) {
    userSockets.set(socket.userId, new Set());
  }
  userSockets.get(socket.userId)!.add(socket);
}

// Remove socket from user's global socket set
function removeUserSocket(socket: AuthenticatedSocket) {
  if (!socket.userId) return;
  const sockets = userSockets.get(socket.userId);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      userSockets.delete(socket.userId);
    }
  }
}

// Broadcast to a specific user (all their sockets, regardless of which conversation they're in)
export function broadcastToUser(userId: number, message: any) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  const messageStr = JSON.stringify(message);

  sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
    }
  });
}

// Verify token and get user info
async function verifyToken(
  token: string,
): Promise<{ userId: number; username: string } | null> {
  try {
    const sessions = await sql`
      SELECT s.*, u.id as user_id, u.username
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ${token} AND s.expires_at > NOW()
    `;

    if (sessions.length === 0) return null;
    return { userId: sessions[0].user_id, username: sessions[0].username };
  } catch {
    return null;
  }
}

// Broadcast message to all sockets in a conversation except sender
export function broadcastToConversation(
  conversationId: number,
  message: any,
  excludeUserId?: number,
) {
  const sockets = conversationSockets.get(conversationId);
  if (!sockets) return;

  const messageStr = JSON.stringify(message);

  sockets.forEach((socket) => {
    if (
      socket.userId !== excludeUserId &&
      socket.readyState === WebSocket.OPEN
    ) {
      socket.send(messageStr);
    }
  });
}

// Broadcast to specific user in a conversation
export function broadcastToUserInConversation(
  conversationId: number,
  userId: number,
  message: any,
) {
  const sockets = conversationSockets.get(conversationId);
  if (!sockets) return;

  const messageStr = JSON.stringify(message);

  sockets.forEach((socket) => {
    if (socket.userId === userId && socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
    }
  });
}

// Check if user is online in a conversation
export function isUserOnlineInConversation(
  conversationId: number,
  userId: number,
): boolean {
  const sockets = conversationSockets.get(conversationId);
  if (!sockets) return false;

  for (const socket of sockets) {
    if (socket.userId === userId && socket.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

// Create WebSocket server
export function createWebSocketServer(port: number) {
  const wss = new WebSocketServer({ port });

  console.log(`WebSocket server running on ws://localhost:${port}`);

  // Heartbeat to detect dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (socket.isAlive === false) {
        removeSocketFromConversation(socket);
        removeUserSocket(socket);
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  wss.on("connection", (ws: AuthenticatedSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle authentication
        if (message.type === "auth") {
          const user = await verifyToken(message.token);
          if (!user) {
            ws.send(JSON.stringify({ type: "error", error: "Invalid token" }));
            ws.close();
            return;
          }
          ws.userId = user.userId;
          ws.username = user.username;
          // Register this socket globally for the user
          addUserSocket(ws);
          ws.send(
            JSON.stringify({ type: "authenticated", userId: user.userId }),
          );
          return;
        }

        // Require authentication for other messages
        if (!ws.userId) {
          ws.send(
            JSON.stringify({ type: "error", error: "Not authenticated" }),
          );
          return;
        }

        // Join a conversation room
        if (message.type === "join") {
          const conversationId = message.conversationId;

          // Verify user is part of this conversation
          const convCheck = await sql`
            SELECT id FROM conversations
            WHERE id = ${conversationId} 
            AND (user1_id = ${ws.userId} OR user2_id = ${ws.userId})
          `;

          if (convCheck.length === 0) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Conversation not found",
              }),
            );
            return;
          }

          // Leave previous conversation if any
          if (ws.conversationId) {
            removeSocketFromConversation(ws);
          }

          // Join new conversation
          ws.conversationId = conversationId;
          if (!conversationSockets.has(conversationId)) {
            conversationSockets.set(conversationId, new Set());
          }
          conversationSockets.get(conversationId)!.add(ws);

          ws.send(JSON.stringify({ type: "joined", conversationId }));
          return;
        }

        // Leave conversation
        if (message.type === "leave") {
          // Clear typing timeout when leaving
          const typingKey = `${ws.conversationId}:${ws.userId}`;
          if (typingTimeouts.has(typingKey)) {
            clearTimeout(typingTimeouts.get(typingKey)!);
            typingTimeouts.delete(typingKey);
          }
          removeSocketFromConversation(ws);
          ws.send(JSON.stringify({ type: "left" }));
          return;
        }

        // Typing indicator
        if (message.type === "typing") {
          if (!ws.conversationId) return;

          const typingKey = `${ws.conversationId}:${ws.userId}`;

          // Clear existing timeout
          if (typingTimeouts.has(typingKey)) {
            clearTimeout(typingTimeouts.get(typingKey)!);
          }

          // Broadcast typing to others in conversation
          broadcastToConversation(
            ws.conversationId,
            {
              type: "typing",
              userId: ws.userId,
              username: ws.username,
            },
            ws.userId,
          );

          // Set timeout to clear typing after 3 seconds
          typingTimeouts.set(
            typingKey,
            setTimeout(() => {
              broadcastToConversation(
                ws.conversationId!,
                {
                  type: "stop_typing",
                  userId: ws.userId,
                },
                ws.userId,
              );
              typingTimeouts.delete(typingKey);
            }, 3000),
          );
          return;
        }

        // Stop typing
        if (message.type === "stop_typing") {
          if (!ws.conversationId) return;

          const typingKey = `${ws.conversationId}:${ws.userId}`;
          if (typingTimeouts.has(typingKey)) {
            clearTimeout(typingTimeouts.get(typingKey)!);
            typingTimeouts.delete(typingKey);
          }

          broadcastToConversation(
            ws.conversationId,
            {
              type: "stop_typing",
              userId: ws.userId,
            },
            ws.userId,
          );
          return;
        }

        // Mark messages as read
        if (message.type === "mark_read") {
          if (!ws.conversationId) return;

          const messageIds = message.messageIds as number[];
          if (!Array.isArray(messageIds) || messageIds.length === 0) return;

          // Update messages as read in database and get the sender IDs
          const updatedMessages = await sql`
            UPDATE messages 
            SET read_at = NOW() 
            WHERE id = ANY(${messageIds}) 
            AND conversation_id = ${ws.conversationId}
            AND sender_id != ${ws.userId}
            AND read_at IS NULL
            RETURNING id, sender_id
          `;

          if (updatedMessages.length === 0) return;

          // Group message IDs by sender
          const messagesBySender = new Map<number, number[]>();
          for (const msg of updatedMessages) {
            if (!messagesBySender.has(msg.sender_id)) {
              messagesBySender.set(msg.sender_id, []);
            }
            messagesBySender.get(msg.sender_id)!.push(msg.id);
          }

          // Notify each sender about their messages being read (globally, not just in conversation)
          for (const [senderId, msgIds] of messagesBySender) {
            broadcastToUser(senderId, {
              type: "messages_read",
              conversationId: ws.conversationId,
              messageIds: msgIds,
              readBy: ws.userId,
            });
          }
          return;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      // Clear typing timeout on disconnect
      if (ws.conversationId && ws.userId) {
        const typingKey = `${ws.conversationId}:${ws.userId}`;
        if (typingTimeouts.has(typingKey)) {
          clearTimeout(typingTimeouts.get(typingKey)!);
          typingTimeouts.delete(typingKey);
          // Notify others that user stopped typing
          broadcastToConversation(
            ws.conversationId,
            { type: "stop_typing", userId: ws.userId },
            ws.userId,
          );
        }
      }
      removeSocketFromConversation(ws);
      removeUserSocket(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      removeSocketFromConversation(ws);
      removeUserSocket(ws);
    });
  });

  return wss;
}

function removeSocketFromConversation(socket: AuthenticatedSocket) {
  if (socket.conversationId) {
    const sockets = conversationSockets.get(socket.conversationId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        conversationSockets.delete(socket.conversationId);
      }
    }
    socket.conversationId = undefined;
  }
}
