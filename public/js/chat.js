'use strict';

(() => {
    const log = $('#chat-log');

    const line = m => {
        const mine = m.steamId === S.snapshot?.server?.playerId;
        const time = m.time ? new Date(m.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="msg ${mine ? 'mine' : ''}"><div class="who" style="color:${esc(m.color || '#ccc')}">${esc(m.name)} <span class="muted">${time}</span></div>
            <div class="text">${esc(m.message)}</div></div>`;
    };

    function renderAll() {
        log.innerHTML = S.chat.map(line).join('') || empty('No team chat yet.');
        log.scrollTop = log.scrollHeight;
    }

    function append(m) {
        const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        if (log.querySelector('.empty-note')) log.innerHTML = '';
        log.insertAdjacentHTML('beforeend', line(m));
        if (stick) log.scrollTop = log.scrollHeight;
    }

    $('#chat-form').onsubmit = async e => {
        e.preventDefault();
        const input = $('#chat-input');
        const message = input.value.trim();
        if (!message) return;
        input.disabled = true;
        try {
            await api('/api/chat', { method: 'POST', body: { message } });
            input.value = '';
        } catch (err) {
            toast({ kind: 'alarm', label: 'Not sent', text: err.message });
        }
        input.disabled = false;
        input.focus();
    };

    async function renderCommands() {
        try {
            const s = await api('/api/settings');
            $('#bot-commands').innerHTML = s.bot.enabled
                ? `Bot is <b class="ok">on</b>. Anyone in your team can type: ${s.commands.map(c => `<code data-cmd="${s.bot.prefix}${c}">${esc(s.bot.prefix + c)}</code>`).join(' ')}`
                : 'Bot is <b>off</b> — turn it on in Settings.';
            $$('#bot-commands code').forEach(c => c.onclick = () => { $('#chat-input').value = c.dataset.cmd + ' '; $('#chat-input').focus(); });
        } catch {  }
    }

    bus.on('chat', m => m ? append(m) : renderAll());
    bus.on('reset', renderAll);
    bus.on('tab:chat', () => { renderCommands(); log.scrollTop = log.scrollHeight; });
})();
