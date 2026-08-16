CREATE TABLE IF NOT EXISTS ai_usage_daily (
    day DATE PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0
);
