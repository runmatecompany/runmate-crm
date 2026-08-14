import { ImapFlow } from "imapflow";
import type { EmailAccountRow } from "../../db/emailAccounts.js";
import { toImapOptions } from "./config.js";

// Minden híváshoz friss IMAP kapcsolatot nyitunk — nincs pool, nincs IDLE,
// szándékosan, hogy ne kelljen kapcsolat-életciklus/reconnect logikát építeni.
// Az ára egy kis extra latency kérésenként, cserébe egyszerű és megbízható.
export async function withImapClient<T>(
  account: EmailAccountRow,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow(toImapOptions(account));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
