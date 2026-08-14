import { pool } from "./pool.js";

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "user";
  created_at: string;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const { rows } = await pool.query<User>("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0];
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
}): Promise<Omit<User, "password_hash">> {
  const { rows } = await pool.query<Omit<User, "password_hash">>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [input.name, input.email, input.passwordHash, input.role]
  );
  return rows[0];
}

export async function setUserPassword(id: number, passwordHash: string): Promise<boolean> {
  const { rowCount } = await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    passwordHash,
    id,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function listUsers(): Promise<Omit<User, "password_hash">[]> {
  const { rows } = await pool.query<Omit<User, "password_hash">>(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC"
  );
  return rows;
}

export async function getUserById(id: number): Promise<Omit<User, "password_hash"> | undefined> {
  const { rows } = await pool.query<Omit<User, "password_hash">>(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [id]
  );
  return rows[0];
}

export async function updateUserName(id: number, name: string): Promise<Omit<User, "password_hash"> | undefined> {
  const { rows } = await pool.query<Omit<User, "password_hash">>(
    "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role, created_at",
    [name, id]
  );
  return rows[0];
}

export async function setUserAvatar(id: number, mime: string, data: Buffer): Promise<void> {
  await pool.query("UPDATE users SET avatar_mime = $1, avatar_data = $2 WHERE id = $3", [mime, data, id]);
}

export async function getUserAvatar(id: number): Promise<{ mime: string; data: Buffer } | undefined> {
  const { rows } = await pool.query<{ avatar_mime: string | null; avatar_data: Buffer | null }>(
    "SELECT avatar_mime, avatar_data FROM users WHERE id = $1",
    [id]
  );
  const row = rows[0];
  if (!row?.avatar_mime || !row.avatar_data) return undefined;
  return { mime: row.avatar_mime, data: row.avatar_data };
}
