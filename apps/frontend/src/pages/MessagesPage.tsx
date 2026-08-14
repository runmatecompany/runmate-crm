import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  getMessage,
  listEmailAccounts,
  listFolders,
  listMessages,
  sendMail,
  type EmailAccountSummary,
  type MailMessage,
  type MailMessageSummary,
} from "../lib/email";
import AccountList from "../components/mail/AccountList";
import MessageList from "../components/mail/MessageList";
import ReadingPane from "../components/mail/ReadingPane";
import ComposeModal, { type ComposeInitial, type ComposeSendInput } from "../components/mail/ComposeModal";

const INBOX_PATH = "INBOX";

export default function MessagesPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [accounts, setAccounts] = useState<EmailAccountSummary[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);
  const [sentFolderPath, setSentFolderPath] = useState<string | null>(null);
  const [folderTab, setFolderTab] = useState<"inbox" | "sent">("inbox");
  const [messages, setMessages] = useState<MailMessageSummary[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeUid, setActiveUid] = useState<number | null>(null);
  const [activeMessage, setActiveMessage] = useState<MailMessage | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeInitial | null>(null);

  useEffect(() => {
    if (!token) return;
    listEmailAccounts(token).then((result) => {
      setAccounts(result.accounts);
      setHasAccess(result.hasAccess);
      setActiveAccountId((prev) => prev ?? result.accounts[0]?.id ?? null);
    });
  }, [token]);

  useEffect(() => {
    setSentFolderPath(null);
    setFolderTab("inbox");
    if (!token || activeAccountId == null) return;
    listFolders(token, activeAccountId).then((folders) => {
      const sent = folders.find((f) => f.specialUse === "\\Sent");
      setSentFolderPath(sent?.path ?? null);
    });
  }, [token, activeAccountId]);

  const activeFolderPath = folderTab === "sent" ? sentFolderPath : INBOX_PATH;

  const refreshMessages = useCallback(() => {
    if (!token || activeAccountId == null || !activeFolderPath) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    listMessages(token, activeAccountId, activeFolderPath)
      .then(setMessages)
      .finally(() => setMessagesLoading(false));
  }, [token, activeAccountId, activeFolderPath]);

  useEffect(() => {
    setActiveUid(null);
    setActiveMessage(null);
    refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    if (!token || activeAccountId == null || activeUid == null || !activeFolderPath) return;
    setMessageLoading(true);
    getMessage(token, activeAccountId, activeUid, activeFolderPath)
      .then((msg) => {
        setActiveMessage(msg);
        setMessages((prev) => prev.map((m) => (m.uid === activeUid ? { ...m, seen: true } : m)));
      })
      .finally(() => setMessageLoading(false));
  }, [token, activeAccountId, activeUid, activeFolderPath]);

  function handleReply() {
    if (!activeMessage) return;
    const quoted = (activeMessage.text ?? "")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setCompose({
      to: activeMessage.from?.address ?? "",
      subject: activeMessage.subject?.toLowerCase().startsWith("re:")
        ? activeMessage.subject
        : `Re: ${activeMessage.subject ?? ""}`,
      body: `\n\n${quoted}`,
      inReplyToUid: activeMessage.uid,
      inReplyToFolder: activeFolderPath ?? undefined,
    });
  }

  async function handleSend(input: ComposeSendInput) {
    if (!token || activeAccountId == null) return;
    await sendMail(token, activeAccountId, input);
    setCompose(null);
    if (folderTab === "sent") refreshMessages();
  }

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <div className="mail-page">
      <AccountList accounts={accounts} activeAccountId={activeAccountId} onSelect={setActiveAccountId} />

      {activeAccount ? (
        <>
          <MessageList
            folder={folderTab}
            onFolderChange={setFolderTab}
            hasSentFolder={!!sentFolderPath}
            messages={messages}
            activeUid={activeUid}
            onSelect={setActiveUid}
            onRefresh={refreshMessages}
            onCompose={() => setCompose({})}
            loading={messagesLoading}
          />
          <ReadingPane message={activeMessage} loading={messageLoading} onReply={handleReply} />
        </>
      ) : (
        <div className="mail-empty-state-page">
          <p>
            {hasAccess
              ? "Nincs hozzád rendelve email fiók. Kérj hozzáférést egy adminisztrátortól."
              : "Nincs hozzáférésed az Üzenetek modulhoz. Kérj hozzáférést egy adminisztrátortól."}
          </p>
        </div>
      )}

      {compose && <ComposeModal initial={compose} onClose={() => setCompose(null)} onSend={handleSend} />}
    </div>
  );
}
