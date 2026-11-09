(() => {
  const style = document.createElement('style');
  style.textContent = `
    .tutor-launcher{position:fixed;z-index:50;right:24px;bottom:23px;width:56px;height:56px;border:0;border-radius:50%;background:#b9f4d0;color:#101622;box-shadow:0 8px 26px #0007;font-size:21px;font-weight:700;cursor:pointer;transition:transform .2s,box-shadow .2s}
    .tutor-launcher:hover{transform:translateY(-3px);box-shadow:0 11px 32px #0009}.tutor-panel{position:fixed;z-index:49;right:24px;bottom:91px;width:min(380px,calc(100vw - 28px));height:min(540px,calc(100dvh - 120px));display:flex;flex-direction:column;border:1px solid #35445a;border-radius:7px;background:#111a27;box-shadow:0 18px 60px #0009;overflow:hidden;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .2s,transform .2s}
    .tutor-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}.tutor-head{display:flex;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid #2b3748;background:#182435}.tutor-title{display:flex;align-items:center;gap:10px}.tutor-avatar{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:#b9f4d0;color:#101622;font-size:14px;font-weight:700}.tutor-title strong{display:block;color:#edf2fb;font:600 13px 'Space Grotesk',sans-serif}.tutor-title span{display:block;color:#91a0b5;font:10px 'DM Sans',sans-serif}.tutor-close{width:30px;height:30px;border:0;background:transparent;color:#a7b2c4;font-size:21px;cursor:pointer}.tutor-messages{flex:1;display:flex;flex-direction:column;gap:10px;padding:14px;overflow:auto;overscroll-behavior:contain}.tutor-message{max-width:88%;padding:10px 12px;border-radius:5px;color:#dce4ef;font:12px/1.6 'DM Sans',sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}.tutor-message.assistant{align-self:flex-start;border:1px solid #2e3b4e;background:#1a2636}.tutor-message.user{align-self:flex-end;background:#b9f4d0;color:#14201b}.tutor-suggestions{display:flex;flex-wrap:wrap;gap:6px;padding:0 13px 10px}.tutor-suggestions button{padding:6px 9px;border:1px solid #3c4b60;border-radius:20px;background:#182435;color:#c2cedb;font:10px 'DM Sans',sans-serif;cursor:pointer}.tutor-suggestions button:hover{border-color:#b9f4d0;color:#b9f4d0}.tutor-form{display:flex;gap:7px;padding:10px;border-top:1px solid #2b3748}.tutor-form textarea{flex:1;min-width:0;max-height:100px;resize:none;padding:10px;border:1px solid #39475b;border-radius:4px;background:#0e1621;color:#edf2fb;font:12px/1.4 'DM Sans',sans-serif}.tutor-form button{width:41px;flex:0 0 41px;border:0;border-radius:4px;background:#b9f4d0;color:#101622;font-size:17px;font-weight:700;cursor:pointer}.tutor-form button:disabled{opacity:.5;cursor:wait}.tutor-typing{display:flex;gap:4px;padding:4px 2px}.tutor-typing i{width:5px;height:5px;border-radius:50%;background:#b9f4d0;animation:tutor-bounce .8s infinite alternate}.tutor-typing i:nth-child(2){animation-delay:.15s}.tutor-typing i:nth-child(3){animation-delay:.3s}@keyframes tutor-bounce{to{opacity:.3;transform:translateY(-3px)}}
    @media(max-width:600px){.tutor-launcher{right:15px;bottom:15px;width:52px;height:52px}.tutor-panel{right:8px;bottom:76px;width:calc(100vw - 16px);height:min(75dvh,600px)}}
    @media(prefers-reduced-motion:reduce){.tutor-launcher,.tutor-panel{transition:none}.tutor-typing i{animation:none}}
  `;
  document.head.append(style);
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'tutor-launcher'; launcher.setAttribute('aria-label', 'Open CodePath AI Tutor'); launcher.setAttribute('aria-expanded', 'false'); launcher.textContent = '✳';
  const panel = document.createElement('section');
  panel.className = 'tutor-panel'; panel.setAttribute('aria-label', 'CodePath AI Tutor chat'); panel.setAttribute('aria-hidden', 'true');
  const head = document.createElement('div'); head.className = 'tutor-head';
  const title = document.createElement('div'); title.className = 'tutor-title';
  const avatar = document.createElement('span'); avatar.className = 'tutor-avatar'; avatar.textContent = 'C';
  const titleText = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = 'CodePath AI Tutor'; const online = document.createElement('span'); online.textContent = 'Here to help you learn'; titleText.append(strong, online); title.append(avatar, titleText);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'tutor-close'; close.setAttribute('aria-label', 'Close tutor'); close.textContent = '×'; head.append(title, close);
  const messagesElement = document.createElement('div'); messagesElement.className = 'tutor-messages'; messagesElement.setAttribute('aria-live', 'polite');
  const suggestions = document.createElement('div'); suggestions.className = 'tutor-suggestions';
  const form = document.createElement('form'); form.className = 'tutor-form';
  const input = document.createElement('textarea'); input.rows = 1; input.maxLength = 3000; input.placeholder = 'Ask a web development question...'; input.setAttribute('aria-label', 'Message the AI Tutor');
  const send = document.createElement('button'); send.type = 'submit'; send.setAttribute('aria-label', 'Send message'); send.textContent = '↑'; form.append(input, send);
  panel.append(head, messagesElement, suggestions, form); document.body.append(launcher, panel);
  let history = [];
  let busy = false;
  function appendMessage(role, text) {
    const bubble = document.createElement('div'); bubble.className = `tutor-message ${role}`; bubble.textContent = text; messagesElement.append(bubble); messagesElement.scrollTop = messagesElement.scrollHeight;
  }
  function setOpen(open) {
    panel.classList.toggle('open', open); panel.setAttribute('aria-hidden', String(!open)); launcher.setAttribute('aria-expanded', String(open)); launcher.setAttribute('aria-label', open ? 'Close CodePath AI Tutor' : 'Open CodePath AI Tutor');
    if (open) input.focus();
  }
  function addSuggestions() {
    ['Explain semantic HTML', 'What is a Promise?', 'Mujhe CSS Grid samjhao'].forEach(text => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.addEventListener('click', () => { input.value = text; form.requestSubmit(); }); suggestions.append(button);
    });
  }
  async function sendMessage(text) {
    if (busy || !text.trim()) return;
    busy = true; send.disabled = true; suggestions.hidden = true;
    appendMessage('user', text.trim());
    history.push({ role: 'user', content: text.trim() });
    const typing = document.createElement('div'); typing.className = 'tutor-message assistant'; typing.setAttribute('aria-label', 'Tutor is typing');
    const dots = document.createElement('span'); dots.className = 'tutor-typing'; for (let index = 0; index < 3; index += 1) dots.append(document.createElement('i')); typing.append(dots); messagesElement.append(typing); messagesElement.scrollTop = messagesElement.scrollHeight;
    try {
      const response = await window.CodePath.fetch('chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-10) }) });
      const result = await response.json(); typing.remove();
      if (!response.ok) throw new Error(result.error || 'The tutor could not respond. Please try again.');
      appendMessage('assistant', result.reply);
      history.push({ role: 'assistant', content: result.reply });
    } catch (error) {
      typing.remove(); appendMessage('assistant', error.message);
    } finally {
      busy = false; send.disabled = false; input.focus();
    }
  }
  addSuggestions();
  appendMessage('assistant', 'Hi! I can help with HTML, CSS, SEO, JavaScript, Node.js, and debugging. What are you working on?');
  launcher.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  close.addEventListener('click', () => setOpen(false));
  form.addEventListener('submit', event => { event.preventDefault(); const text = input.value; input.value = ''; input.style.height = 'auto'; sendMessage(text); });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 100)}px`; });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
})();