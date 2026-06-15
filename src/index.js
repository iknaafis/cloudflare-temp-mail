import PostalMime from 'postal-mime';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  // 1. HANDLER EMAIL MASUK (Dipicu oleh Cloudflare Email Routing)
  async email(message, env, ctx) {
    try {
      const rawEmail = await new Response(message.raw).arrayBuffer();
      const parser = new PostalMime();
      const email = await parser.parse(rawEmail);

      const id = crypto.randomUUID();
      const address = message.to.toLowerCase().trim();
      const sender = message.from.toLowerCase().trim();
      const senderName = email.from.name || '';
      const subject = email.subject || '(Tidak ada subjek)';
      const bodyHtml = email.html || '';
      const bodyText = email.text || '';

      // Ekstrak lampiran
      const parsedAttachments = [];
      if (email.attachments && email.attachments.length > 0) {
        for (const att of email.attachments) {
          // Hanya simpan lampiran jika ukuran di bawah 1MB untuk mencegah melebihi batas D1 per row (1MB)
          if (att.content.byteLength > 1024 * 1024) {
            parsedAttachments.push({
              filename: att.filename || 'attachment',
              mimeType: att.mimeType || 'application/octet-stream',
              size: att.content.byteLength,
              content: null,
              error: 'File terlalu besar (di atas 1MB)'
            });
            continue;
          }

          // Konversi arrayBuffer ke base64 agar aman disimpan di DB teks
          const contentBytes = new Uint8Array(att.content);
          let binary = '';
          for (let i = 0; i < contentBytes.byteLength; i++) {
            binary += String.fromCharCode(contentBytes[i]);
          }
          const base64Content = btoa(binary);

          parsedAttachments.push({
            filename: att.filename || 'attachment',
            mimeType: att.mimeType || 'application/octet-stream',
            size: att.content.byteLength,
            content: base64Content
          });
        }
      }

      const attachmentsJson = JSON.stringify(parsedAttachments);
      const createdAt = Date.now();

      // Simpan ke D1
      await env.DB.prepare(
        `INSERT INTO messages (id, address, sender, sender_name, subject, body_html, body_text, attachments, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, address, sender, senderName, subject, bodyHtml, bodyText, attachmentsJson, createdAt).run();

      console.log(`Email berhasil disimpan untuk: ${address}`);

      // Hapus otomatis email lama (berusia lebih dari 24 jam) untuk menghemat ruang D1
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      ctx.waitUntil(
        env.DB.prepare(`DELETE FROM messages WHERE created_at < ?`).bind(twentyFourHoursAgo).run()
      );

    } catch (err) {
      console.error(`Gagal menyimpan email masuk: ${err.message}`);
    }
  },

  // 2. HANDLER HTTP API & FRONTEND ASSETS
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Tangani preflight OPTIONS untuk CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Hanya tangani API Route
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    // Jika bukan API, biarkan Cloudflare Worker Assets menyajikan file statis (HTML, CSS, JS)
    return env.ASSETS.fetch(request);
  }
};

// Pengendali API REST
async function handleApi(request, env, url) {
  try {
    // A. Mengambil Daftar Domain Aktif
    if (url.pathname === '/api/config') {
      const domainsStr = env.DOMAINS || 'mail.example.com';
      const domains = domainsStr.split(',').map(d => d.trim()).filter(d => d);
      return new Response(JSON.stringify({ domains }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // B. Mengambil Kotak Masuk berdasarkan Alamat Email
    if (url.pathname === '/api/messages' && request.method === 'GET') {
      const address = url.searchParams.get('address');
      if (!address) {
        return new Response(JSON.stringify({ error: 'Parameter address wajib diisi' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cleanAddress = address.toLowerCase().trim();
      // Hanya select meta-data agar response cepat dan hemat bandwidth
      const { results } = await env.DB.prepare(
        `SELECT id, sender, sender_name, subject, created_at 
         FROM messages 
         WHERE address = ? 
         ORDER BY created_at DESC 
         LIMIT 50`
      ).bind(cleanAddress).all();

      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // C. Mengunduh Lampiran Spesifik
    // Format: /api/messages/:id/attachment/:index
    if (url.pathname.includes('/attachment/')) {
      const parts = url.pathname.split('/');
      const index = parseInt(parts.pop()); // ambil indeks terakhir
      const action = parts.pop(); // buang kata 'attachment'
      const id = parts.pop(); // ambil ID pesan

      const message = await env.DB.prepare(
        `SELECT attachments FROM messages WHERE id = ?`
      ).bind(id).first();

      if (!message || !message.attachments) {
        return new Response('Lampiran tidak ditemukan', { status: 404, headers: corsHeaders });
      }

      const attachments = JSON.parse(message.attachments);
      const att = attachments[index];
      if (!att || !att.content) {
        return new Response('Lampiran tidak ditemukan atau file terlalu besar', { status: 404, headers: corsHeaders });
      }

      // Konversi base64 kembali ke binary
      const binaryString = atob(att.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return new Response(bytes, {
        headers: {
          'Content-Type': att.mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(att.filename)}"`,
          ...corsHeaders
        }
      });
    }

    // D. Mengambil Konten Detail Satu Email
    // Format: /api/messages/:id
    if (url.pathname.startsWith('/api/messages/') && request.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const message = await env.DB.prepare(
        `SELECT * FROM messages WHERE id = ?`
      ).bind(id).first();

      if (!message) {
        return new Response(JSON.stringify({ error: 'Email tidak ditemukan' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Bersihkan data base64 lampiran dari detail email agar hemat bandwidth
      let attachments = [];
      if (message.attachments) {
        try {
          const rawAttachments = JSON.parse(message.attachments);
          attachments = rawAttachments.map((att, idx) => ({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            error: att.error || null,
            downloadUrl: `/api/messages/${id}/attachment/${idx}`
          }));
        } catch (e) {}
      }

      const responseData = {
        id: message.id,
        address: message.address,
        sender: message.sender,
        sender_name: message.sender_name,
        subject: message.subject,
        body_html: message.body_html,
        body_text: message.body_text,
        attachments: attachments,
        created_at: message.created_at
      };

      return new Response(JSON.stringify(responseData), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // E. Menghapus Email
    // Format: /api/messages/:id (DELETE)
    if (url.pathname.startsWith('/api/messages/') && request.method === 'DELETE') {
      const id = url.pathname.split('/').pop();
      await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run();

      return new Response(JSON.stringify({ success: true, message: 'Email berhasil dihapus' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Rute tidak dikenal
    return new Response(JSON.stringify({ error: 'Endpoint tidak ditemukan' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
