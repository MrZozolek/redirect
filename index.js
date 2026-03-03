const { fork } = require('child_process');
const path = require('path');

function start(file) {
    const name = path.basename(file);
    const proc = fork(file, [], { silent: false });

    proc.on('exit', (code) => {
        console.log(`[${name}] Zakończył działanie (kod: ${code}) — restartuję za 3s...`);
        setTimeout(() => start(file), 3000);
    });

    proc.on('error', (err) => {
        console.error(`[${name}] Błąd: ${err.message}`);
    });

    console.log(`[${name}] Uruchomiony (PID: ${proc.pid})`);
}

start(path.join(__dirname, 'server.js'));
start(path.join(__dirname, 'bot.js'));
