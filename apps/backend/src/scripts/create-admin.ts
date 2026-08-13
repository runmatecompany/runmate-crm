import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function run() {
  const name = arg("name");
  const email = arg("email");
  const password = arg("password");

  if (!name || !email || !password) {
    console.error(
      'Usage: npm run create-admin -- --name="Teszt Elek" --email="admin@example.com" --password="ErosJelszo123"'
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
     RETURNING id, email, role`,
    [name, email, passwordHash]
  );

  console.log("Admin user ready:", rows[0]);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
