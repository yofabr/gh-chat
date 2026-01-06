import { Hono } from "hono";
import { sql } from "../db/index.js";
import { getUserStatus } from "../redis.js";

interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  github_id: number;
}

type Variables = {
  user: AuthUser;
};

const users = new Hono<{ Variables: Variables }>();

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
users.use("/*", requireAuth);

// Get user status (online/offline + last seen)
users.get("/:userId/status", async (c) => {
  const userId = c.req.param("userId");

  try {
    // Verify the user exists
    const userCheck = await sql`
      SELECT id, username FROM users WHERE id = ${userId}::uuid
    `;

    if (userCheck.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    const status = await getUserStatus(userId);

    return c.json({
      userId,
      username: userCheck[0].username,
      online: status.online,
      lastSeenAt: status.lastSeenAt,
    });
  } catch (error) {
    console.error("Error getting user status:", error);
    return c.json({ error: "Failed to get user status" }, 500);
  }
});

// Get status by username
users.get("/username/:username/status", async (c) => {
  const username = c.req.param("username");

  try {
    // Get user by username
    const userResult = await sql`
      SELECT id, username FROM users WHERE username = ${username}
    `;

    if (userResult.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    const userId = userResult[0].id;
    const status = await getUserStatus(userId);

    return c.json({
      userId,
      username: userResult[0].username,
      online: status.online,
      lastSeenAt: status.lastSeenAt,
    });
  } catch (error) {
    console.error("Error getting user status:", error);
    return c.json({ error: "Failed to get user status" }, 500);
  }
});

// ============= Block API =============

// Check if a block exists between two users (either direction)
export async function isBlocked(
  userId1: string,
  userId2: string,
): Promise<{ blocked: boolean; blockedBy?: string }> {
  try {
    const result = await sql`
      SELECT blocker_id FROM blocks 
      WHERE (blocker_id = ${userId1}::uuid AND blocked_id = ${userId2}::uuid)
         OR (blocker_id = ${userId2}::uuid AND blocked_id = ${userId1}::uuid)
      LIMIT 1
    `;
    if (result.length > 0) {
      return { blocked: true, blockedBy: result[0].blocker_id };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

// Block a user
users.post("/:userId/block", async (c) => {
  const currentUser = c.get("user");
  const targetUserId = c.req.param("userId");

  // Can't block yourself
  if (currentUser.user_id === targetUserId) {
    return c.json({ error: "Cannot block yourself" }, 400);
  }

  try {
    // Verify target user exists
    const userCheck = await sql`
      SELECT id FROM users WHERE id = ${targetUserId}::uuid
    `;

    if (userCheck.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // Create the block (ignore if already exists)
    await sql`
      INSERT INTO blocks (blocker_id, blocked_id)
      VALUES (${currentUser.user_id}::uuid, ${targetUserId}::uuid)
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
    `;

    return c.json({ success: true, blocked: true });
  } catch (error) {
    console.error("Error blocking user:", error);
    return c.json({ error: "Failed to block user" }, 500);
  }
});

// Unblock a user
users.delete("/:userId/block", async (c) => {
  const currentUser = c.get("user");
  const targetUserId = c.req.param("userId");

  try {
    await sql`
      DELETE FROM blocks 
      WHERE blocker_id = ${currentUser.user_id}::uuid 
        AND blocked_id = ${targetUserId}::uuid
    `;

    return c.json({ success: true, blocked: false });
  } catch (error) {
    console.error("Error unblocking user:", error);
    return c.json({ error: "Failed to unblock user" }, 500);
  }
});

// Get list of blocked users
users.get("/blocked/list", async (c) => {
  const currentUser = c.get("user");

  try {
    const blockedUsers = await sql`
      SELECT u.id, u.username, u.display_name, u.avatar_url, b.created_at as blocked_at
      FROM blocks b
      JOIN users u ON b.blocked_id = u.id
      WHERE b.blocker_id = ${currentUser.user_id}::uuid
      ORDER BY b.created_at DESC
    `;

    return c.json({ blocked_users: blockedUsers });
  } catch (error) {
    console.error("Error getting blocked users:", error);
    return c.json({ error: "Failed to get blocked users" }, 500);
  }
});

// Check if current user has blocked a specific user (or vice versa)
users.get("/:userId/block-status", async (c) => {
  const currentUser = c.get("user");
  const targetUserId = c.req.param("userId");

  try {
    const blockStatus = await isBlocked(currentUser.user_id, targetUserId);

    let status: "none" | "blocked_by_me" | "blocked_by_them" = "none";
    if (blockStatus.blocked) {
      status =
        blockStatus.blockedBy === currentUser.user_id
          ? "blocked_by_me"
          : "blocked_by_them";
    }

    return c.json({
      blocked: blockStatus.blocked,
      status,
    });
  } catch (error) {
    console.error("Error checking block status:", error);
    return c.json({ error: "Failed to check block status" }, 500);
  }
});

export default users;
