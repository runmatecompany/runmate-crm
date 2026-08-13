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
