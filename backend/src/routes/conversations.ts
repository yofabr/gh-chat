import { Hono } from "hono";
import { sql } from "../db/index.js";
import { broadcastToConversation } from "../websocket.js";

interface AuthUser {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  github_id: number;
}

type Variables = {
  user: AuthUser;
};

const conversations = new Hono<{ Variables: Variables }>();

// Middleware to require authentication
async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.split(" ")[1];

  const sessions = await sql`
    SELECT s.*, u.id as user_id, u.username, u.display_name, u.avatar_url, u.github_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token} AND s.expires_at > NOW()
  `;

  if (sessions.length === 0) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("user", sessions[0]);
  await next();
}

// Apply auth middleware to all routes
conversations.use("/*", requireAuth);

// Get all conversations for the current user
conversations.get("/", async (c) => {
  const user = c.get("user");

  const results = await sql`
    SELECT 
      c.id,
      c.created_at,
      c.updated_at,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.id
        ELSE u1.id
      END as other_user_id,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.username
        ELSE u1.username
      END as other_username,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.display_name
        ELSE u1.display_name
      END as other_display_name,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.avatar_url
        ELSE u1.avatar_url
      END as other_avatar_url,
      CASE 
        WHEN c.user1_id = ${user.user_id} THEN u2.has_account
        ELSE u1.has_account
      END as other_has_account,
      (
        SELECT content FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as last_message,
      (
        SELECT created_at FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) as last_message_time
    FROM conversations c
    JOIN users u1 ON c.user1_id = u1.id
    JOIN users u2 ON c.user2_id = u2.id
    WHERE c.user1_id = ${user.user_id} OR c.user2_id = ${user.user_id}
    ORDER BY c.updated_at DESC
  `;

  return c.json({ conversations: results });
});

// Get or create a conversation with a specific user by username
conversations.post("/with/:username", async (c) => {
  const user = c.get("user");
  const targetUsername = c.req.param("username");

  if (targetUsername.toLowerCase() === user.username.toLowerCase()) {
    return c.json({ error: "Cannot start conversation with yourself" }, 400);
  }

  // Find the target user (case-insensitive)
  let targetUsers = await sql`
    SELECT id, username, display_name, avatar_url, has_account
    FROM users WHERE LOWER(username) = LOWER(${targetUsername})
  `;

  let targetUser = targetUsers[0];
  let userCreated = false;

  // If user doesn't exist, create a placeholder by fetching from GitHub API
  if (!targetUser) {
    try {
      const githubResponse = await fetch(
        `https://api.github.com/users/${targetUsername}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "GitHub-Chat-App",
          },
        },
      );

      if (!githubResponse.ok) {
        return c.json({ error: "GitHub user not found" }, 404);
      }

      const githubUser = (await githubResponse.json()) as {
        id: number;
        login: string;
        name: string | null;
        avatar_url: string;
      };

      // Check if user already exists by github_id (in case username changed)
      const existingByGithubId = await sql`
        SELECT id, username, display_name, avatar_url, has_account
        FROM users WHERE github_id = ${githubUser.id}
      `;

      if (existingByGithubId.length > 0) {
        // Update username if it changed
        if (existingByGithubId[0].username !== githubUser.login) {
          await sql`
            UPDATE users SET username = ${githubUser.login}, display_name = ${
            githubUser.name || githubUser.login
          }, avatar_url = ${githubUser.avatar_url}
            WHERE github_id = ${githubUser.id}
          `;
          existingByGithubId[0].username = githubUser.login;
          existingByGithubId[0].display_name =
            githubUser.name || githubUser.login;
          existingByGithubId[0].avatar_url = githubUser.avatar_url;
        }
        targetUser = existingByGithubId[0];
      } else {
        // Create placeholder user
        const newUsers = await sql`
          INSERT INTO users (github_id, username, display_name, avatar_url, has_account)
          VALUES (${githubUser.id}, ${githubUser.login}, ${
          githubUser.name || githubUser.login
        }, ${githubUser.avatar_url}, FALSE)
          RETURNING id, username, display_name, avatar_url, has_account
        `;
        targetUser = newUsers[0];
        userCreated = true;
      }
    } catch (error) {
      console.error("Error fetching/creating GitHub user:", error);
      return c.json(
        { error: "Failed to start conversation. Please try again." },
        500,
      );
    }
  }

  // Ensure consistent ordering (lower id first)
  const user1Id = Math.min(user.user_id, targetUser.id);
  const user2Id = Math.max(user.user_id, targetUser.id);

  // Try to find existing conversation
  let convResults = await sql`
    SELECT id, created_at, updated_at
    FROM conversations
    WHERE user1_id = ${user1Id} AND user2_id = ${user2Id}
  `;

  let conversation = convResults[0];
  let conversationCreated = false;

  // Create if doesn't exist
  if (!conversation) {
    const newConvs = await sql`
      INSERT INTO conversations (user1_id, user2_id)
      VALUES (${user1Id}, ${user2Id})
      RETURNING id, created_at, updated_at
    `;
    conversation = newConvs[0];
    conversationCreated = true;
  }

  return c.json({
    conversation: {
      id: conversation.id,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      other_user: {
        id: targetUser.id,
        username: targetUser.username,
        display_name: targetUser.display_name,
        avatar_url: targetUser.avatar_url,
        has_account: targetUser.has_account,
      },
    },
    created: conversationCreated,
    user_created: userCreated,
  });
});

// Get messages in a conversation
conversations.get("/:id/messages", async (c) => {
  const user = c.get("user");
  const conversationId = parseInt(c.req.param("id"));
  const limit = parseInt(c.req.query("limit") || "50");
  const before = c.req.query("before"); // message id for pagination

  // Verify user is part of this conversation
  const convCheck = await sql`
    SELECT id FROM conversations
    WHERE id = ${conversationId} 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  let messages;
  if (before) {
    messages = await sql`
      SELECT m.id, m.content, m.created_at, m.read_at, m.sender_id,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ${conversationId} AND m.id < ${parseInt(before)}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
  } else {
    messages = await sql`
      SELECT m.id, m.content, m.created_at, m.read_at, m.sender_id,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
  }

  // Debug: log messages with read_at status
  console.log(
    "Fetched messages:",
    messages.map((m: any) => ({ id: m.id, read_at: m.read_at })),
  );

  // Reverse to get chronological order
  return c.json({ messages: messages.reverse() });
});

// Send a message
conversations.post("/:id/messages", async (c) => {
  const user = c.get("user");
  const conversationId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const content = body.content?.trim();

  if (!content) {
    return c.json({ error: "Message content is required" }, 400);
  }

  if (content.length > 5000) {
    return c.json({ error: "Message too long (max 5000 characters)" }, 400);
  }

  // Verify user is part of this conversation
  const convCheck = await sql`
    SELECT id FROM conversations
    WHERE id = ${conversationId} 
    AND (user1_id = ${user.user_id} OR user2_id = ${user.user_id})
  `;

  if (convCheck.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Insert message
  const newMessages = await sql`
    INSERT INTO messages (conversation_id, sender_id, content)
    VALUES (${conversationId}, ${user.user_id}, ${content})
    RETURNING id, content, created_at, sender_id
  `;

  // Update conversation updated_at
  await sql`
    UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}
  `;

  const message = newMessages[0];

  const messageData = {
    id: message.id,
    content: message.content,
    created_at: message.created_at,
    sender_id: message.sender_id,
    sender_username: user.username,
    sender_display_name: user.display_name,
    sender_avatar: user.avatar_url,
  };

  // Broadcast to all WebSocket connections for this conversation
  broadcastToConversation(conversationId, {
    type: "new_message",
    message: messageData,
  });

  return c.json({ message: messageData });
});

export default conversations;
