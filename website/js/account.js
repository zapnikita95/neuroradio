/* Эфир AI — личный кабинет (вход, сессия, отвязка карты) */
(function () {
  'use strict';

  var SESSION_KEY = 'efir_cabinet_v1';
  var API_BASE = (window.EFIR_API_BASE || '').replace(/\/$/, '');

  function $(s, r) { return (r || document).querySelector(s); }

  function apiUrl(path) {
    return (API_BASE || '') + '/v1/public' + path;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.email || !data.code) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function saveSession(email, code, status) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      email: email,
      code: code,
      status: status || null,
      at: Date.now(),
    }));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function planLabel(plan) {
    if (plan === 'premium') return 'Расширенный';
    if (plan === 'trial') return 'Пробный';
    return 'Базовый';
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function isSubscriptionActive(st) {
    if (!st) return false;
    var now = Date.now();
    if (st.plan === 'premium' && st.premiumUntil && st.premiumUntil > now) return true;
    if (st.plan === 'trial' && st.trialUntil && st.trialUntil > now) return true;
    return false;
  }

  function activeUntil(st) {
    if (!st) return null;
    if (st.plan === 'premium' && st.premiumUntil) return st.premiumUntil;
    if (st.plan === 'trial' && st.trialUntil) return st.trialUntil;
    return null;
  }

  function renderCabinetStatus(statusEl, st, options) {
    if (!statusEl || !st) return;
    options = options || {};
    var active = isSubscriptionActive(st);
    var until = activeUntil(st);
    var html = '';

    if (active) {
      html += '<div class="cabinet-badge cabinet-badge--active"><span class="site-ic ic-check" aria-hidden="true"></span> Подписка активна</div>';
      if (until) {
        html += '<p class="cabinet-until">Действует до <strong>' + fmtDate(until) + '</strong></p>';
      }
    } else {
      html += '<div class="cabinet-badge cabinet-badge--inactive">Подписка не активна</div>';
    }

    html += '<div class="account-status">';
    html += '<p><strong>Email:</strong> ' + st.email + '</p>';
    html += '<p><strong>Тариф:</strong> ' + planLabel(st.plan) + '</p>';
    if (st.premiumUntil) html += '<p><strong>Расширенный до:</strong> ' + fmtDate(st.premiumUntil) + '</p>';
    if (st.trialUntil && st.plan === 'trial') html += '<p><strong>Пробный до:</strong> ' + fmtDate(st.trialUntil) + '</p>';
    if (st.nextPaymentAt && st.autoRenew) {
      html += '<p><strong>Следующее списание:</strong> ' + fmtDate(st.nextPaymentAt) + '</p>';
    }
    html += '<p><strong>Карта привязана:</strong> ' + (st.cardSaved ? 'да' : 'нет') + '</p>';
    html += '<p><strong>Автопродление:</strong> ' + (st.autoRenew ? 'включено' : 'отключено') + '</p>';
    html += '</div>';

    statusEl.innerHTML = html;

    if (options.cancelBtn || options.unlinkBtn) {
      var canManage = isSubscriptionActive(st) || st.cardSaved || st.autoRenew;
      if (options.cancelBtn) options.cancelBtn.hidden = !canManage;
      if (options.unlinkBtn) options.unlinkBtn.hidden = !canManage;
      if (options.actionHint) options.actionHint.hidden = !canManage;
    }
  }

  function doLogout() {
    clearSession();
    updateHeaderAuth();
    window.location.href = window.EFIR_ACCOUNT_URL ? '../' : '/';
  }

  function postCabinetAction(path, email, code) {
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code }),
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, body: j }; });
    });
  }

  function fetchStatus(email, code) {
    return fetch(apiUrl('/account/status'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code }),
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, body: j }; });
    });
  }

  function updateHeaderAuth() {
    var loginBtn = $('#navLoginBtn');
    var cabinetLink = $('#navCabinetBtn');
    var logoutBtn = $('#navLogoutBtn');
    var session = getSession();
    if (loginBtn) loginBtn.hidden = Boolean(session);
    if (cabinetLink) cabinetLink.hidden = true;
    if (logoutBtn) logoutBtn.hidden = !session;
  }

  function bindHeaderLogout() {
    var logoutBtn = $('#navLogoutBtn');
    if (!logoutBtn || logoutBtn.dataset.bound) return;
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', function () {
      if (window.confirm('Выйти из личного кабинета?')) doLogout();
    });
  }

  function openLoginModal() {
    var backdrop = $('#loginModalBackdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    var emailInput = $('#loginModalEmail');
    if (emailInput) setTimeout(function () { emailInput.focus(); }, 50);
  }

  function closeLoginModal() {
    var backdrop = $('#loginModalBackdrop');
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function resetLoginModal() {
    var form = $('#loginModalForm');
    var codeBlock = $('#loginModalCodeBlock');
    var submitBtn = $('#loginModalSubmit');
    var msgEl = $('#loginModalMsg');
    if (form) form.reset();
    if (codeBlock) codeBlock.hidden = true;
    if (submitBtn) submitBtn.hidden = true;
    if (msgEl) { msgEl.hidden = true; msgEl.textContent = ''; }
    var emailErr = $('#loginModalEmailErr');
    var codeErr = $('#loginModalCodeErr');
    if (emailErr) emailErr.hidden = true;
    if (codeErr) codeErr.hidden = true;
  }

  function initLoginModal() {
    var backdrop = $('#loginModalBackdrop');
    if (!backdrop) return;

    var form = $('#loginModalForm');
    var emailInput = $('#loginModalEmail');
    var codeInput = $('#loginModalCode');
    var codeBlock = $('#loginModalCodeBlock');
    var sendBtn = $('#loginModalSendCode');
    var submitBtn = $('#loginModalSubmit');
    var emailErr = $('#loginModalEmailErr');
    var codeErr = $('#loginModalCodeErr');
    var msgEl = $('#loginModalMsg');
    var closeBtn = $('#loginModalClose');

    function showMsg(text, isErr) {
      if (!msgEl) return;
      msgEl.hidden = !text;
      msgEl.textContent = text || '';
      msgEl.className = 'login-modal-msg' + (isErr ? ' is-err' : ' is-ok');
    }

    if (closeBtn) closeBtn.addEventListener('click', function () { closeLoginModal(); });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeLoginModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !backdrop.hidden) closeLoginModal();
    });

    var navLogin = $('#navLoginBtn');
    if (navLogin) {
      navLogin.addEventListener('click', function () {
        if (backdrop) {
          resetLoginModal();
          openLoginModal();
          return;
        }
        window.location.href = '../?login=1';
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var email = emailInput ? emailInput.value.trim() : '';
        if (emailErr) emailErr.hidden = validEmail(email);
        if (!validEmail(email)) return;
        showMsg('', false);
        sendBtn.disabled = true;
        sendBtn.textContent = 'Отправляем…';
        fetch(apiUrl('/account/code'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email }),
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (res) {
            if (res.ok) {
              if (codeBlock) codeBlock.hidden = false;
              if (submitBtn) submitBtn.hidden = false;
              if (codeErr) codeErr.hidden = true;
              showMsg('Код отправлен на ' + email + '. Проверьте почту (и спам).', false);
              if (codeInput) codeInput.focus();
              return;
            }
            showMsg(res.body.error || 'Не удалось отправить код', true);
          })
          .catch(function () { showMsg('Сеть недоступна — попробуйте позже', true); })
          .finally(function () {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Получить код';
          });
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = emailInput ? emailInput.value.trim() : '';
        if (!validEmail(email)) {
          if (emailErr) emailErr.hidden = false;
          return;
        }
        if (emailErr) emailErr.hidden = true;
        if (codeBlock && codeBlock.hidden) {
          if (sendBtn) sendBtn.click();
          return;
        }
        var code = codeInput ? codeInput.value.trim() : '';
        if (codeErr) codeErr.hidden = true;
        if (code.length < 4) {
          if (codeErr) codeErr.hidden = false;
          return;
        }
        showMsg('', false);
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Входим…'; }
        fetchStatus(email, code)
          .then(function (res) {
            if (res.ok && res.body.status) {
              saveSession(email, code, res.body.status);
              updateHeaderAuth();
              closeLoginModal();
              var dest = window.EFIR_ACCOUNT_URL || 'account/';
              window.location.href = dest;
              return;
            }
            if (codeErr) codeErr.hidden = false;
            showMsg(res.body.error || 'Не удалось войти', true);
          })
          .catch(function () { showMsg('Сеть недоступна — попробуйте позже', true); })
          .finally(function () {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Войти в кабинет'; }
          });
      });
    }
  }

  function initCabinetPage() {
    var page = $('#cabinetPage');
    if (!page) return;

    var session = getSession();
    if (!session) {
      window.location.href = '../?login=1';
      return;
    }

    var statusEl = $('#cabinetStatus');
    var cancelBtn = $('#cabinetCancelBtn');
    var unlinkBtn = $('#cabinetUnlinkBtn');
    var actionHint = $('#cabinetActionHint');
    var msgEl = $('#cabinetMsg');
    var emailEl = $('#cabinetUserEmail');

    function showMsg(text, isErr) {
      if (!msgEl) return;
      msgEl.hidden = !text;
      msgEl.textContent = text || '';
      msgEl.className = 'account-msg' + (isErr ? ' is-err' : ' is-ok');
    }

    function applyStatus(st) {
      saveSession(session.email, session.code, st);
      session.status = st;
      if (emailEl) emailEl.textContent = st.email;
      renderCabinetStatus(statusEl, st, {
        cancelBtn: cancelBtn,
        unlinkBtn: unlinkBtn,
        actionHint: actionHint,
      });
    }

    function runCabinetAction(btn, path, confirmText, okFallback) {
      if (!window.confirm(confirmText)) return;
      btn.disabled = true;
      showMsg('', false);
      postCabinetAction(path, session.email, session.code)
        .then(function (res) {
          if (res.ok && res.body.status) {
            applyStatus(res.body.status);
            showMsg(res.body.message || okFallback, false);
            return;
          }
          showMsg((res.body && res.body.error) || 'Не удалось выполнить действие', true);
        })
        .catch(function () { showMsg('Сеть недоступна — попробуйте позже', true); })
        .finally(function () { btn.disabled = false; });
    }

    if (emailEl) emailEl.textContent = session.email;
    if (session.status) applyStatus(session.status);

    fetchStatus(session.email, session.code)
      .then(function (res) {
        if (res.ok && res.body.status) {
          applyStatus(res.body.status);
          return;
        }
        if (res.body && res.body.code === 'NOT_FOUND') {
          showMsg('Аккаунт не найден. Оформите подписку или войдите с email оплаты.', true);
          return;
        }
        showMsg((res.body && res.body.error) || 'Сессия истекла — войдите снова', true);
        setTimeout(function () {
          clearSession();
          window.location.href = '../?login=1';
        }, 2500);
      })
      .catch(function () { showMsg('Не удалось загрузить данные подписки', true); });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        runCabinetAction(
          cancelBtn,
          '/account/cancel-subscription',
          'Отменить подписку? Автопродление отключится. Доступ сохранится до конца оплаченного периода.',
          'Подписка отменена. Автопродление отключено.',
        );
      });
    }

    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', function () {
        runCabinetAction(
          unlinkBtn,
          '/account/unlink-card',
          'Отвязать карту? Автопродление отключится. Доступ сохранится до конца оплаченного периода.',
          'Карта отвязана',
        );
      });
    }
  }

  function init() {
    updateHeaderAuth();
    bindHeaderLogout();
    initLoginModal();
    initCabinetPage();

    if (window.location.search.indexOf('login=1') !== -1) {
      resetLoginModal();
      openLoginModal();
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EfirAccount = {
    getSession: getSession,
    clearSession: clearSession,
    openLoginModal: openLoginModal,
    updateHeaderAuth: updateHeaderAuth,
  };
})();
