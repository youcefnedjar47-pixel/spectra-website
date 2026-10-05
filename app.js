(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Constantes                                                         */
  /* ------------------------------------------------------------------ */

  const API_CONTENT = '/api/content';
  const API_CONTACT = '/api/contact';
  const STORAGE_KEY = 'spectra:lang';
  const CONTENT_TIMEOUT_MS = 10000;
  const CONTACT_TIMEOUT_MS = 15000;
  const SUPPORTED_LANGS = ['fr', 'en', 'ar'];
  const DEFAULT_LANG = 'fr';

  // Textes minimaux utilisés uniquement quand l'API est injoignable.
  const FALLBACK_TEXT = {
    fr: {
      loading: 'Chargement…',
      error: 'Impossible de charger le contenu du site.',
      detail: 'Vérifiez votre connexion internet puis réessayez.',
      retry: 'Réessayer'
    },
    en: {
      loading: 'Loading…',
      error: 'The site content could not be loaded.',
      detail: 'Check your internet connection and try again.',
      retry: 'Try again'
    },
    ar: {
      loading: 'جارٍ التحميل…',
      error: 'تعذر تحميل محتوى الموقع.',
      detail: 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة.',
      retry: 'إعادة المحاولة'
    }
  };

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_PATTERN = /^\+?[0-9][0-9 .()-]{6,18}[0-9]$/;
  const FORM_FIELDS = ['lastName', 'firstName', 'activity', 'phone', 'email', 'wilaya', 'message'];

  const state = {
    content: null,
    lang: DEFAULT_LANG,
    submitting: false
  };

  /* ------------------------------------------------------------------ */
  /*  Utilitaires                                                        */
  /* ------------------------------------------------------------------ */

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function getPath(object, path) {
    return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), object);
  }

  function tr(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return value[state.lang] || value.fr || value.en || '';
  }

  function fallback() {
    return FALLBACK_TEXT[state.lang] || FALLBACK_TEXT[DEFAULT_LANG];
  }

  function safeUrl(url) {
    if (typeof url !== 'string') return '#';
    return /^(https?:|mailto:|tel:|#|\/)/i.test(url) ? url : '#';
  }

  function h(tag, className, text, attributes) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null && text !== '') element.textContent = text;
    if (attributes) {
      Object.keys(attributes).forEach((name) => element.setAttribute(name, attributes[name]));
    }
    return element;
  }

  function fill(container, children) {
    if (!container) return;
    container.replaceChildren(...children);
  }

  function externalLink(className, text, url) {
    const link = h('a', className, text, { href: safeUrl(url) });
    if (/^https?:/i.test(url)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    return link;
  }

  function show(element, display) {
    element.classList.remove('hidden');
    if (display) element.classList.add(display);
  }

  function hide(element, display) {
    element.classList.add('hidden');
    if (display) element.classList.remove(display);
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  function detectLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
    } catch (error) {
      /* localStorage indisponible : on continue avec la langue du navigateur */
    }
    const candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (const candidate of candidates) {
      const code = String(candidate || '').slice(0, 2).toLowerCase();
      if (SUPPORTED_LANGS.includes(code)) return code;
    }
    return DEFAULT_LANG;
  }

  function applyDocumentLanguage() {
    const meta = state.content && state.content.meta;
    const language = meta && meta.languages.find((item) => item.code === state.lang);
    document.documentElement.lang = state.lang;
    document.documentElement.dir = language ? language.dir : state.lang === 'ar' ? 'rtl' : 'ltr';
  }

  /* ------------------------------------------------------------------ */
  /*  Chargement du contenu (API)                                        */
  /* ------------------------------------------------------------------ */

  async function fetchContent() {
    const response = await fetchWithTimeout(API_CONTENT, { headers: { Accept: 'application/json' } }, CONTENT_TIMEOUT_MS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !data.site || !data.contact) throw new Error('Contenu invalide');
    return data;
  }

  function showLoader() {
    const loader = $('#loader');
    $('#loader-text').textContent = fallback().loading;
    show(loader, 'flex');
  }

  function hideLoader() {
    hide($('#loader'), 'flex');
  }

  function showError(error) {
    console.error('[app] Chargement impossible :', error);
    const panel = $('#error-panel');
    $('#error-message').textContent = fallback().error;
    $('#error-detail').textContent = fallback().detail;
    $('#retry-button').textContent = fallback().retry;
    hideLoader();
    show(panel, 'flex');
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  }

  async function loadSite() {
    hide($('#error-panel'), 'flex');
    showLoader();
    try {
      state.content = await fetchContent();
      renderAll();
      hideLoader();
    } catch (error) {
      showError(error);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Rendu : liaisons génériques                                        */
  /* ------------------------------------------------------------------ */

  function renderBindings() {
    $$('[data-bind]').forEach((element) => {
      element.textContent = tr(getPath(state.content, element.getAttribute('data-bind')));
    });

    $$('[data-bind-attr]').forEach((element) => {
      element
        .getAttribute('data-bind-attr')
        .split(';')
        .forEach((pair) => {
          const separator = pair.indexOf(':');
          if (separator < 1) return;
          const attribute = pair.slice(0, separator).trim();
          const path = pair.slice(separator + 1).trim();
          element.setAttribute(attribute, tr(getPath(state.content, path)));
        });
    });
  }

  function renderMeta() {
    const { site } = state.content;
    document.title = tr(site.title);
    const description = $('meta[name="description"]');
    if (description) description.setAttribute('content', tr(site.description));

    const logo = $('#brand-logo');
    if (logo && site.logo) {
      logo.src = safeUrl(site.logo);
      logo.alt = site.name;
    }
    const brandLink = $('a[href="#hero"]');
    if (brandLink) brandLink.setAttribute('aria-label', site.name);
  }

  /* ------------------------------------------------------------------ */
  /*  Rendu : en-tête                                                    */
  /* ------------------------------------------------------------------ */

  function renderNavigation() {
    const items = state.content.ui.nav;

    fill($('#main-nav'), items.map((item) =>
      h('a', 'px-3 py-2 text-sm font-medium text-ink transition hover:text-azure', tr(item.label), { href: `#${item.id}` })
    ));

    fill($('#mobile-nav'), items.map((item) => {
      const link = h('a', 'block border-b border-line py-3 font-medium text-ink last:border-b-0', tr(item.label), { href: `#${item.id}` });
      link.addEventListener('click', closeMobileMenu);
      return link;
    }));

    fill($('#footer-nav'), items.map((item) => {
      const entry = h('li');
      entry.appendChild(h('a', 'transition hover:text-white', tr(item.label), { href: `#${item.id}` }));
      return entry;
    }));

    $('#menu-toggle').setAttribute('aria-label', tr(state.content.ui.menu));
  }

  function renderLanguageSwitcher() {
    const switcher = $('#lang-switcher');
    switcher.setAttribute('aria-label', tr(state.content.ui.language));

    fill(switcher, state.content.meta.languages.map((language) => {
      const active = language.code === state.lang;
      const button = h(
        'button',
        `px-3 py-2 text-sm font-semibold transition ${active ? 'bg-ink text-white' : 'text-ink hover:bg-mist'}`,
        language.label,
        { type: 'button', title: language.name, lang: language.code, 'aria-pressed': String(active) }
      );
      button.addEventListener('click', () => setLanguage(language.code));
      return button;
    }));
  }

  function renderContactLinks() {
    const { contact } = state.content;
    ['#header-whatsapp', '#contact-whatsapp'].forEach((selector) => {
      const link = $(selector);
      if (link) link.setAttribute('href', safeUrl(contact.whatsapp.url));
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Rendu : sections                                                   */
  /* ------------------------------------------------------------------ */

  function renderRoute() {
    const steps = state.content.hero.route.steps;
    fill($('#route-list'), steps.map((step, index) => {
      const last = index === steps.length - 1;
      const item = h('li', 'relative');
      item.appendChild(h('span', `absolute -start-[31px] top-1.5 h-3 w-3 ${last ? 'bg-amber-soft' : 'bg-white'}`, '', { 'aria-hidden': 'true' }));
      item.appendChild(h('p', 'font-display text-xl font-semibold', tr(step.place)));
      item.appendChild(h('p', 'mt-1 text-sm text-white/70', tr(step.text)));
      return item;
    }));
  }

  function renderStats() {
    fill($('#stats-list'), state.content.stats.map((stat, index) => {
      const borders = `${index % 2 === 1 ? 'border-s ' : ''}${index > 0 ? 'md:border-s' : 'md:border-s-0'}`;
      const item = h('li', `flex flex-col justify-center border-line px-5 py-6 ${borders}`);
      item.appendChild(h('span', 'font-display text-3xl font-bold text-navy md:text-4xl', stat.value));
      item.appendChild(h('span', 'mt-1 text-sm text-slate', tr(stat.label)));
      return item;
    }));
  }

  function renderAbout() {
    const { about } = state.content;

    fill($('#about-mission'), about.mission.map((paragraph) => h('p', '', tr(paragraph))));

    fill($('#about-values'), about.values.map((value) => {
      const row = h('div', 'border-s-4 border-amber ps-4');
      row.appendChild(h('dt', 'font-display text-xl font-semibold text-ink', tr(value.title)));
      row.appendChild(h('dd', 'mt-1 leading-relaxed text-slate', tr(value.text)));
      return row;
    }));
  }

  function renderServices() {
    fill($('#services-list'), state.content.services.items.map((service) => {
      const item = h('li', 'grid gap-2 py-7 md:grid-cols-12 md:gap-8');
      item.appendChild(h('h3', 'font-display text-2xl font-semibold text-navy md:col-span-4', tr(service.title)));
      item.appendChild(h('p', 'leading-relaxed text-slate md:col-span-8', tr(service.text)));
      return item;
    }));
  }

  function renderProcess() {
    fill($('#process-list'), state.content.process.steps.map((step, index) => {
      const item = h('li');
      item.appendChild(h('span', 'flex h-12 w-12 items-center justify-center bg-navy font-display text-2xl font-bold text-white', String(index + 1)));
      item.appendChild(h('h3', 'mt-4 font-display text-xl font-semibold text-ink', tr(step.title)));
      item.appendChild(h('p', 'mt-1 text-sm leading-relaxed text-slate', tr(step.text)));
      return item;
    }));
  }

  function renderWhy() {
    const { why } = state.content;

    fill($('#why-list'), why.items.map((entry) => {
      const item = h('li', 'border-s-2 border-amber ps-5');
      item.appendChild(h('h3', 'font-display text-xl font-semibold', tr(entry.title)));
      item.appendChild(h('p', 'mt-2 leading-relaxed text-white/75', tr(entry.text)));
      return item;
    }));

    const partners = why.partners.map((partner) => {
      const item = h('li', 'border border-white/25 px-5 py-3');
      item.appendChild(h('p', 'font-display text-2xl font-semibold', partner.name));
      item.appendChild(h('p', 'text-sm text-white/70', tr(partner.detail)));
      return item;
    });
    partners.push(h('li', 'flex items-center border border-dashed border-white/25 px-5 py-3 text-sm text-white/70', tr(why.partnersMore)));
    fill($('#partners-list'), partners);
  }

  function renderContact() {
    const { contact } = state.content;

    const links = [contact.phone].concat(contact.emails).map((entry) => {
      const item = h('li');
      const link = externalLink('group flex flex-col border-s-2 border-line ps-4 transition hover:border-amber', '', entry.url);
      link.appendChild(h('span', 'text-xs text-slate', tr(entry.label)));
      const value = h('span', 'font-semibold text-ink group-hover:text-azure', entry.display);
      value.setAttribute('dir', 'ltr');
      value.classList.add('text-start');
      link.appendChild(value);
      item.appendChild(link);
      return item;
    });
    fill($('#contact-links'), links);

    fill($('#contact-socials'), contact.socials.map((social) => {
      const item = h('li');
      item.appendChild(externalLink('inline-block border border-line px-4 py-2 text-sm font-semibold transition hover:bg-mist', social.name, social.url));
      return item;
    }));

    fill($('#contact-countries'), contact.areas.countries.map((country) => h('li', 'bg-mist px-3 py-1 text-sm text-ink', tr(country))));

    fill($('#contact-guarantees'), contact.guarantees.map((guarantee) => {
      const item = h('li');
      item.appendChild(h('p', 'font-display text-lg font-semibold text-navy', tr(guarantee.title)));
      item.appendChild(h('p', 'text-sm leading-relaxed text-slate', tr(guarantee.text)));
      return item;
    }));
  }

  function renderSelectOptions(selectId, placeholder, options) {
    const select = $(selectId);
    const previous = select.value;
    const nodes = [h('option', '', tr(placeholder), { value: '' })];
    options.forEach((option) => nodes.push(h('option', '', tr(option.label), { value: option.value })));
    fill(select, nodes);
    select.value = options.some((option) => option.value === previous) ? previous : '';
  }

  function renderForm() {
    const { form } = state.content.contact;
    renderSelectOptions('#activity', form.placeholders.activity, form.activities);
    renderSelectOptions('#wilaya', form.placeholders.wilaya, form.wilayas);
    if (!state.submitting) $('#submit-label').textContent = tr(form.submit);
  }

  function renderFooter() {
    const { contact } = state.content;

    const contactItems = [contact.whatsapp, contact.phone].concat(contact.emails).map((entry) => {
      const item = h('li');
      const label = entry.label && typeof entry.label === 'object' ? tr(entry.label) : entry.label;
      const link = externalLink('transition hover:text-white', '', entry.url);
      link.appendChild(h('span', '', `${label} : `));
      const value = h('span', '', entry.display);
      value.setAttribute('dir', 'ltr');
      link.appendChild(value);
      item.appendChild(link);
      return item;
    });
    fill($('#footer-contact'), contactItems);

    fill($('#footer-socials'), contact.socials.map((social) => {
      const item = h('li');
      item.appendChild(externalLink('transition hover:text-white', social.name, social.url));
      return item;
    }));
  }

  function renderAll() {
    applyDocumentLanguage();
    renderMeta();
    renderNavigation();
    renderLanguageSwitcher();
    renderContactLinks();
    renderRoute();
    renderStats();
    renderAbout();
    renderServices();
    renderProcess();
    renderWhy();
    renderContact();
    renderForm();
    renderFooter();
    renderBindings();
  }

  function setLanguage(code) {
    if (!SUPPORTED_LANGS.includes(code) || code === state.lang) return;
    state.lang = code;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (error) {
      /* préférence non mémorisée : sans conséquence */
    }
    clearFormFeedback();
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /*  Menu mobile                                                        */
  /* ------------------------------------------------------------------ */

  function closeMobileMenu() {
    hide($('#mobile-nav'));
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
  }

  function toggleMobileMenu() {
    const menu = $('#mobile-nav');
    const open = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    $('#menu-toggle').setAttribute('aria-expanded', String(open));
  }

  /* ------------------------------------------------------------------ */
  /*  Formulaire de contact                                              */
  /* ------------------------------------------------------------------ */

  function collectValues() {
    const values = {};
    FORM_FIELDS.forEach((field) => {
      const element = $(`#${field}`);
      values[field] = element ? element.value.trim() : '';
    });
    return values;
  }

  function validate(values) {
    const errors = {};
    const { form } = state.content.contact;

    if (!values.lastName) errors.lastName = 'required';
    else if (values.lastName.length < 2) errors.lastName = 'minLength';

    if (!values.firstName) errors.firstName = 'required';
    else if (values.firstName.length < 2) errors.firstName = 'minLength';

    if (!values.activity) errors.activity = 'required';
    else if (!form.activities.some((item) => item.value === values.activity)) errors.activity = 'invalid';

    if (!values.phone) errors.phone = 'required';
    else if (!PHONE_PATTERN.test(values.phone)) errors.phone = 'phone';

    if (!values.email) errors.email = 'required';
    else if (!EMAIL_PATTERN.test(values.email)) errors.email = 'email';

    if (!values.wilaya) errors.wilaya = 'required';
    else if (!form.wilayas.some((item) => item.value === values.wilaya)) errors.wilaya = 'invalid';

    if (!values.message) errors.message = 'required';
    else if (values.message.length < 10) errors.message = 'minLength';

    return errors;
  }

  function setFieldError(field, message) {
    const slot = $(`#err-${field}`);
    const input = $(`#${field}`);
    if (slot) slot.textContent = message || '';
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function clearFormFeedback() {
    FORM_FIELDS.forEach((field) => setFieldError(field, ''));
    setStatus('', '');
  }

  function setStatus(message, type) {
    const status = $('#form-status');
    status.textContent = message || '';
    status.classList.remove('text-green-700', 'text-red-700');
    if (type === 'success') status.classList.add('text-green-700');
    if (type === 'error') status.classList.add('text-red-700');
  }

  function setSubmitting(active) {
    state.submitting = active;
    const button = $('#submit-button');
    const spinner = $('#submit-spinner');
    const { form } = state.content.contact;

    button.disabled = active;
    button.setAttribute('aria-busy', String(active));
    spinner.classList.toggle('hidden', !active);
    $('#submit-label').textContent = tr(active ? form.sending : form.submit);
  }

  function showFieldErrors(errors, useServerText) {
    const messages = state.content.contact.form.errors;
    let firstField = null;

    FORM_FIELDS.forEach((field) => {
      if (!errors[field]) return;
      const text = useServerText ? errors[field] : tr(messages[errors[field]]);
      setFieldError(field, text);
      if (!firstField) firstField = field;
    });

    if (firstField) {
      const element = $(`#${firstField}`);
      if (element) element.focus();
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (state.submitting || !state.content) return;

    const messages = state.content.contact.form.errors;
    clearFormFeedback();

    const values = collectValues();
    const errors = validate(values);
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors, false);
      return;
    }

    const honeypot = $('#website');
    const payload = Object.assign({}, values, {
      lang: state.lang,
      website: honeypot ? honeypot.value : ''
    });

    setSubmitting(true);

    try {
      const response = await fetchWithTimeout(
        API_CONTACT,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        },
        CONTACT_TIMEOUT_MS
      );
      const data = await response.json().catch(() => null);

      if (response.ok && data && data.success) {
        $('#contact-form').reset();
        setStatus(data.message || tr(state.content.contact.form.success), 'success');
      } else if (response.status === 400 && data && data.errors) {
        showFieldErrors(data.errors, true);
      } else if (response.status === 429) {
        setStatus((data && data.message) || tr(messages.tooMany), 'error');
      } else {
        setStatus(tr(messages.server), 'error');
      }
    } catch (error) {
      console.error('[app] Envoi impossible :', error);
      setStatus(tr(messages.network), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function onFieldInput(event) {
    const field = event.target && event.target.id;
    if (FORM_FIELDS.includes(field)) setFieldError(field, '');
  }

  /* ------------------------------------------------------------------ */
  /*  Démarrage                                                          */
  /* ------------------------------------------------------------------ */

  function init() {
    state.lang = detectLanguage();
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';

    const form = $('#contact-form');
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', onFieldInput);
    form.addEventListener('change', onFieldInput);

    $('#menu-toggle').addEventListener('click', toggleMobileMenu);
    $('#retry-button').addEventListener('click', loadSite);

    loadSite();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
