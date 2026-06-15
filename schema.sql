-- Skema Database Cloudflare D1 untuk InstaMail Temporary Email

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_name TEXT,
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    attachments TEXT, -- Menyimpan JSON array dari lampiran: [{"filename": "...", "mimeType": "...", "size": 123, "content": "base64..."}]
    created_at INTEGER NOT NULL
);

-- Buat index agar pencarian kotak masuk berdasarkan alamat email cepat
CREATE INDEX IF NOT EXISTS idx_messages_address ON messages(address);

-- Buat index untuk pengurutan berdasarkan waktu masuk dan pembersihan otomatis (cleanup)
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
