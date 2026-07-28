'use strict';

/* ── Конфігурація ─────────────────────────────────────── */
const WIDGET_WEBHOOK = window.APP_CONFIG?.WIDGET_WEBHOOK;

const WELCOME_MSG = 'Вітаю! Я — юридичний ШІ-асистент LexBot.\n\nОпишіть вашу ситуацію або запитайте про наші послуги — я допоможу підготуватись до консультації з адвокатом.';

/* ── SVG іконки ───────────────────────────────────────── */
const SVG_BOT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="8" width="18" height="13" rx="2"/>
  <circle cx="9"  cy="15" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/>
  <path d="M12 2v6"/>
  <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none"/>
  <path d="M3 15H1M23 15h-2"/>
</svg>`;

const SVG_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="7" r="4"/>
  <path d="M5 21c0-4 3.1-7 7-7s7 3 7 7"/>
</svg>`;

const SVG_SEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
</svg>`;

const SVG_CHAT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
</svg>`;

const SVG_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M18 6L6 18M6 6l12 12"/>
</svg>`;

/* ── Стан ─────────────────────────────────────────────── */
let isOpen         = false;
let isTyping       = false;
let welcomeSent    = false;
const sessionId    = 'widget_' + Math.random().toString(36).slice(2, 10);

/* ── Утиліти ──────────────────────────────────────────── */
function sanitize(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseResponse(data) {
  if (typeof data === 'string') return data;
  return data?.output
      || data?.message
      || data?.text
      || data?.response
      || (Array.isArray(data) && data[0]?.output)
      || (Array.isArray(data) && data[0]?.message)
      || 'Вибачте, сталася помилка. Спробуйте ще раз.';
}

/* ── Побудова DOM ─────────────────────────────────────── */
function buildWidget() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-widget';
  wrap.id = 'chat-widget';
  wrap.innerHTML = `
    <button class="chat-trigger" id="chat-trigger" aria-label="Відкрити чат" aria-expanded="false">
      <span class="chat-trigger-icon">${SVG_CHAT}</span>
      <span class="chat-badge" id="chat-badge"></span>
    </button>

    <div class="chat-window" id="chat-window" role="dialog" aria-label="Чат з асистентом" aria-hidden="true">

      <div class="chat-header">
        <div class="chat-header-info">
          <div class="chat-bot-avatar">${SVG_BOT}</div>
          <div>
            <span class="chat-header-name">LexBot Асистент</span>
            <span class="chat-header-status">онлайн</span>
          </div>
        </div>
        <button class="chat-close" id="chat-close" aria-label="Закрити чат">
          ${SVG_CLOSE}
        </button>
      </div>

      <div class="chat-messages" id="chat-messages"></div>

      <div class="chat-input-area">
        <input
          type="text"
          class="chat-input"
          id="chat-input"
          placeholder="Написати повідомлення…"
          autocomplete="off"
          maxlength="1000"
        >
        <button class="chat-send" id="chat-send" aria-label="Надіслати">
          ${SVG_SEND}
        </button>
      </div>

    </div>
  `;
  document.body.appendChild(wrap);
}

/* ── Додавання повідомлень ────────────────────────────── */
function addMessage(text, role) {
  const msgs   = document.getElementById('chat-messages');
  const isBot  = role === 'bot';

  const row = document.createElement('div');
  row.className = `chat-msg chat-msg--${isBot ? 'bot' : 'user'}`;

  row.innerHTML = `
    <div class="chat-msg-icon">${isBot ? SVG_BOT : SVG_USER}</div>
    <div class="chat-bubble">${sanitize(text)}</div>
  `;

  msgs.appendChild(row);
  scrollToBottom(msgs);
}

function showTyping() {
  const msgs = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg--bot';
  el.id = 'chat-typing-row';
  el.innerHTML = `
    <div class="chat-msg-icon">${SVG_BOT}</div>
    <div class="chat-typing">
      <span class="chat-typing-dot"></span>
      <span class="chat-typing-dot"></span>
      <span class="chat-typing-dot"></span>
    </div>
  `;
  msgs.appendChild(el);
  scrollToBottom(msgs);
}

function hideTyping() {
  document.getElementById('chat-typing-row')?.remove();
}

function scrollToBottom(el) {
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

/* ── Відкрити / закрити ───────────────────────────────── */
function openWidget() {
  isOpen = true;
  const win     = document.getElementById('chat-window');
  const trigger = document.getElementById('chat-trigger');
  const badge   = document.getElementById('chat-badge');

  win.classList.add('is-open');
  win.setAttribute('aria-hidden', 'false');
  trigger.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  trigger.querySelector('.chat-trigger-icon').innerHTML = SVG_CLOSE;
  badge.classList.remove('is-visible');

  /* Фокус на поле вводу */
  setTimeout(() => document.getElementById('chat-input')?.focus(), 320);

  /* Привітальне повідомлення при першому відкритті */
  if (!welcomeSent) {
    welcomeSent = true;
    setTimeout(() => addMessage(WELCOME_MSG, 'bot'), 420);
  }
}

function closeWidget() {
  isOpen = false;
  const win     = document.getElementById('chat-window');
  const trigger = document.getElementById('chat-trigger');

  win.classList.remove('is-open');
  win.setAttribute('aria-hidden', 'true');
  trigger.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.querySelector('.chat-trigger-icon').innerHTML = SVG_CHAT;
}

/* ── Відправка повідомлення ───────────────────────────── */
async function sendMessage() {
  if (isTyping) return;

  const input = document.getElementById('chat-input');
  const send  = document.getElementById('chat-send');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  addMessage(text, 'user');

  isTyping = true;
  send.disabled = true;
  showTyping();

  try {
    const res = await fetch(WIDGET_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chatInput: text,
        sessionId,
        source: 'widget',
      }),
    });

    hideTyping();

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data   = await res.json();
    const answer = parseResponse(data);
    addMessage(answer, 'bot');

  } catch (err) {
    hideTyping();
    console.error('[widget] Webhook error:', err);
    addMessage('Вибачте, виникла проблема зі зв\'язком. Спробуйте ще раз або скористайтеся формою на сайті.', 'bot');
  } finally {
    isTyping       = false;
    send.disabled  = false;
    input.focus();
  }
}

/* ── Ініціалізація ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildWidget();

  const trigger = document.getElementById('chat-trigger');
  const close   = document.getElementById('chat-close');
  const send    = document.getElementById('chat-send');
  const input   = document.getElementById('chat-input');

  trigger.addEventListener('click', () => isOpen ? closeWidget() : openWidget());
  close.addEventListener('click', closeWidget);
  send.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* Закрити по Escape */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeWidget();
  });
});
