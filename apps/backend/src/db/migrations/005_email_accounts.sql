CREATE TABLE IF NOT EXISTS email_accounts (
    id SERIAL PRIMARY KEY,
    display_name TEXT NOT NULL,
    from_name TEXT NOT NULL,
    from_address TEXT NOT NULL,

    imap_host TEXT NOT NULL,
    imap_port INTEGER NOT NULL,
    imap_security TEXT NOT NULL CHECK (imap_security IN ('tls', 'starttls', 'none')),
    imap_username TEXT NOT NULL,
    imap_password_enc TEXT NOT NULL,

    smtp_host TEXT NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_security TEXT NOT NULL CHECK (smtp_security IN ('tls', 'starttls', 'none')),
    smtp_username TEXT NOT NULL,
    smtp_password_enc TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_account_access (
    account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, user_id)
);
