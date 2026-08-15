import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  // 0.0.0.0: a helyi hálózaton (LAN) bárki eléri, nem csak ez a gép.
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  emailEncryptionKey: required("EMAIL_ENCRYPTION_KEY"),
  // Opcionális: hiányában a lead-fotó AI-kitöltés funkció ki van kapcsolva.
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
};
