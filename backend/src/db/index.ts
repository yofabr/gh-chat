import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const sql = postgres(connectionString, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Initialize database tables
export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      github_id INTEGER UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      avatar_url TEXT,
      access_token TEXT,
      has_account BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add has_account column if it doesn't exist (for existing databases)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='has_account') THEN
        ALTER TABLE users ADD COLUMN has_account BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `;

  // Update existing users to have has_account = true (they signed up via OAuth)
  await sql`UPDATE users SET has_account = TRUE WHERE access_token IS NOT NULL AND has_account = FALSE`;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user1_id, user2_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      read_at TIMESTAMP
    )
  `;

  // Add read_at column if it doesn't exist (for existing databases)
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='messages' AND column_name='read_at') THEN
        ALTER TABLE messages ADD COLUMN read_at TIMESTAMP;
      END IF;
    END $$;
  `;

  // Create indexes for better query performance
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)`;

  console.log("Database tables initialized");
}
