'use strict';

const WEBHOOK_URL   = window.APP_CONFIG?.WEBHOOK_URL;
const RATE_LIMIT_MS = 60_000;

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM_RE = /^@[a-zA-Z0-9_]{4,32}$/;

let lastSubmitTime = 0;

/* ── Phone mask ───────────────────────────────────────────── */
function formatPhone(raw) {
  let digits = raw.replace(/\D/g, '');
  // Маска завжди додає "+38 (" → в digits завжди є "38" спереду.
  // Знімаємо рівно "38" (2 цифри) — інакше "38" + "066..." = "38066" буде
  // помилково прийнятий за повний код країни і "0" зникне.
  // Якщо вставили повний номер "+380...", то після зрізання "38" залишиться "0..." — правильно.
  if (digits.startsWith('38')) digits = digits.slice(2);
  digits = digits.slice(0, 10);

  if (!digits.length) return '';
  let out = '+38 (';
  out += digits.slice(0, Math.min(3, digits.length));
  if (digits.length > 3) out += ') ' + digits.slice(3, Math.min(6, digits.length));
  if (digits.length > 6) out += '-' + digits.slice(6, Math.min(8, digits.length));
  if (digits.length > 8) out += '-' + digits.slice(8, 10);
  return out;
}

function onPhoneKeydown(e) {
  if (e.ctrlKey || e.metaKey) return;
  const controlKeys = ['Backspace','Delete','Tab','Escape','Enter',
                       'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
  if (controlKeys.includes(e.key)) return;
  if (!/^\d$/.test(e.key)) e.preventDefault();
}

function onPhoneInput(e) {
  const input = e.target;
  input.value = formatPhone(input.value);
  if (e.inputType !== 'deleteContentBackward') {
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }
}

/* ── Helpers ──────────────────────────────────────────────── */
function sanitize(str) {
  return String(str).trim()
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

function isRateLimited() {
  return Date.now() - lastSubmitTime < RATE_LIMIT_MS;
}

function setButtonState(btn, state) {
  const labels = {
    idle:    'Отримати демо',
    loading: 'Надсилаємо…',
    success: 'Заявку отримано ✓',
    error:   'Помилка. Спробуйте ще раз',
  };
  btn.textContent = labels[state];
  btn.disabled    = state === 'loading' || state === 'success';
  btn.className   = 'form-submit';
  if (state === 'success') btn.classList.add('is-success');
  if (state === 'error')   btn.classList.add('is-error');
}

function showError(input, errorEl, message) {
  input.classList.add('is-invalid');
  if (errorEl) { errorEl.textContent = message; errorEl.classList.add('is-visible'); }
}

function clearError(input, errorEl) {
  input.classList.remove('is-invalid');
  if (errorEl) errorEl.classList.remove('is-visible');
}

/* ── Validation ───────────────────────────────────────────── */
function validate(form) {
  const f = name => form.elements[name];
  const e = key  => form.querySelector(`[data-error="${key}"]`);

  const fullnameInput  = f('fullname');
  const phoneInput     = f('phone');
  const emailInput     = f('email');
  const telegramInput  = f('telegram');

  clearError(fullnameInput,  e('fullname'));
  clearError(phoneInput,     e('phone'));
  clearError(emailInput,     e('email'));
  clearError(telegramInput,  e('telegram'));

  let valid = true;

  // ПІБ — обов'язкове
  if (fullnameInput.value.trim().length < 2) {
    showError(fullnameInput, e('fullname'), 'Введіть ваше прізвище та ім\'я');
    valid = false;
  }

  // Телефон — обов'язковий, 10 цифр (0XXXXXXXXX) або 12 (380XXXXXXXXX)
  const phoneDigits = phoneInput.value.replace(/\D/g, '');
  const phoneOk = (phoneDigits.length === 10 && phoneDigits.startsWith('0')) ||
                  (phoneDigits.length === 12 && phoneDigits.startsWith('380'));
  if (!phoneInput.value.trim()) {
    showError(phoneInput, e('phone'), 'Введіть номер телефону');
    valid = false;
  } else if (!phoneOk) {
    showError(phoneInput, e('phone'), 'Введіть повний номер: +38 (0XX) XXX-XX-XX');
    valid = false;
  }

  // Email — обов'язкове
  const emailVal = emailInput.value.trim();
  if (!emailVal) {
    showError(emailInput, e('email'), 'Введіть вашу email-адресу');
    valid = false;
  } else if (!EMAIL_RE.test(emailVal)) {
    showError(emailInput, e('email'), 'Введіть коректну адресу (name@mail.ua)');
    valid = false;
  }

  // Telegram — за бажанням
  const tgVal = telegramInput.value.trim();
  if (tgVal && !TELEGRAM_RE.test(tgVal)) {
    showError(telegramInput, e('telegram'), 'Telegram: @username, від 5 символів, латиниця');
    valid = false;
  }

  return valid;
}

/* ── Modal ────────────────────────────────────────────────── */
function showModal(type, title, text) {
  let overlay = document.getElementById('form-modal');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'form-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'form-modal-title');
    overlay.innerHTML =
      '<div class="form-modal">' +
        '<div class="form-modal__icon"></div>' +
        '<h3 class="form-modal__title" id="form-modal-title"></h3>' +
        '<p class="form-modal__text"></p>' +
        '<button class="form-modal__close" type="button">Закрити</button>' +
      '</div>';
    document.body.appendChild(overlay);

    /* Закрити по кліку на оверлей або кнопку */
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('.form-modal__close').addEventListener('click', closeModal);

    /* Закрити по Escape */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-visible')) closeModal();
    });
  }

  overlay.className = `form-modal-overlay form-modal--${type}`;
  overlay.querySelector('.form-modal__icon').textContent  = type === 'success' ? '✓' : '✕';
  overlay.querySelector('.form-modal__title').textContent = title;
  overlay.querySelector('.form-modal__text').textContent  = text;

  /* Блокуємо скрол сторінки */
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
  }));
}

function closeModal() {
  const overlay = document.getElementById('form-modal');
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  document.body.style.overflow = '';
}

/* ── Submit ───────────────────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const btn  = form.querySelector('.form-submit');

  if (!validate(form)) return;

  if (isRateLimited()) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSubmitTime)) / 1000);
    setButtonState(btn, 'error');
    btn.textContent = `Зачекайте ${remaining}с перед повторною відправкою`;
    setTimeout(() => setButtonState(btn, 'idle'), 3000);
    return;
  }

  setButtonState(btn, 'loading');

  const payload = {
    fullname: sanitize(form.elements['fullname'].value),
    phone:    sanitize(form.elements['phone'].value),
    email:    sanitize(form.elements['email'].value),
    telegram: sanitize(form.elements['telegram'].value),
    source:    'landing',
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    lastSubmitTime = Date.now();
    setButtonState(btn, 'success');
    form.reset();
    showModal(
      'success',
      'Дякуємо за заявку!',
      'Ми отримали ваші дані і найближчим часом зв\'яжемося з вами для узгодження демо.'
    );
    setTimeout(() => setButtonState(btn, 'idle'), 4000);

  } catch (err) {
    console.error('[form] Webhook error:', err);
    setButtonState(btn, 'error');
    showModal(
      'error',
      'Щось пішло не так',
      'Спробуйте надіслати форму ще раз або зв\'яжіться з нами напряму.'
    );
    setTimeout(() => setButtonState(btn, 'idle'), 4000);
  }
}

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('lead-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);

  // Знімаємо помилку при виправленні
  ['fullname', 'phone', 'email', 'telegram'].forEach(name => {
    const input   = form.elements[name];
    const errorEl = form.querySelector(`[data-error="${name}"]`);
    if (input) input.addEventListener('input', () => clearError(input, errorEl));
  });

  // Маска + digit-фільтр на телефоні
  const phoneInput = form.elements['phone'];
  if (phoneInput) {
    phoneInput.addEventListener('keydown', onPhoneKeydown);
    phoneInput.addEventListener('input',   onPhoneInput);
    phoneInput.addEventListener('paste', () =>
      setTimeout(() => { phoneInput.value = formatPhone(phoneInput.value); }, 0)
    );
  }

  /* Sticky header */
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Smooth CTA scroll */
  document.querySelectorAll('a[href="#contact"]').forEach(link => {
    link.addEventListener('click', ev => {
      ev.preventDefault();
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});
