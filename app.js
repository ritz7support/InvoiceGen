/* ── app.js ─────────────────────────────────────────
   InvoiceGen — All application logic
   ─────────────────────────────────────────────────── */

'use strict';

/* ══════════════════════════ STATE ═══════════════════════ */
const DEFAULT_STATE = {
  id: null,
  currency: '₹',
  invoiceNumber: '',
  invoiceDate: '',
  subject: '',
  from: { name: '', company: '', email: '', phone: '', address: '' },
  to:   { name: '', email: '', address: '' },
  logo: null,             // base64 string or null
  description: '',
  bullets: [],            // array of strings
  items: [],              // { desc, amount, gst }
  payment: { mode: '', account: '', ifsc: '', upi: '', pan: '', email: '', phone: '', note: '' },
  closing: { message: 'Kindly process the payment for the above-mentioned work.', name: '' }
};

let state = deepClone(DEFAULT_STATE);

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ══════════════════════ PERSISTENCE ══════════════════════ */
const LS_KEY = 'invoicegen_v2';

function saveToStorage() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    // Sync to cloud (debounced)
    debounceSaveToCloud();
  } catch (e) {
    // Storage may be full — silent fail
  }
}

let cloudSaveTimeout = null;
function debounceSaveToCloud() {
  if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
  cloudSaveTimeout = setTimeout(saveToCloud, 2000);
}

let isSaving = false;
let pendingSave = false;

async function saveToCloud() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;

  try {
    let subtotal = 0;
    let total_gst = 0;
    state.items.forEach(it => {
      const amt = parseFloat(it.amount) || 0;
      const gst = parseFloat(it.gst) || 0;
      subtotal += amt;
      total_gst += (amt * gst) / 100;
    });

    const dbInvoice = {
      user_id: session.user.id,
      invoice_number: state.invoiceNumber,
      invoice_date: state.invoiceDate || null,
      subject: state.subject,
      currency: state.currency,
      from_name: state.from.name,
      from_company: state.from.company,
      from_email: state.from.email,
      from_phone: state.from.phone,
      from_address: state.from.address,
      logo_base64: state.logo,
      to_name: state.to.name,
      to_email: state.to.email,
      to_address: state.to.address,
      description: state.description,
      bullets: state.bullets,
      payment_mode: state.payment.mode,
      payment_account: state.payment.account,
      payment_ifsc: state.payment.ifsc,
      payment_upi: state.payment.upi,
      payment_pan: state.payment.pan,
      payment_email: state.payment.email,
      payment_phone: state.payment.phone,
      payment_phone_note: state.payment.note,
      closing_message: state.closing.message,
      closing_name: state.closing.name,
      subtotal: subtotal,
      total_gst: total_gst,
      grand_total: subtotal + total_gst,
      updated_at: new Date().toISOString()
    };

    if (state.id) {
      dbInvoice.id = state.id;
      const { error: updErr } = await supabase.from('invoices').update(dbInvoice).eq('id', state.id);
      if (updErr) throw updErr;
    } else {
      const { data, error: insErr } = await supabase.from('invoices').insert(dbInvoice).select('id').single();
      if (insErr) throw insErr;
      if (data) state.id = data.id;
    }

    if (state.id) {
      await supabase.from('invoice_items').delete().eq('invoice_id', state.id);
      
      if (state.items.length > 0) {
        const dbItems = state.items.map((it, i) => ({
          invoice_id: state.id,
          user_id: session.user.id,
          sort_order: i,
          description: it.desc || '',
          amount: parseFloat(it.amount) || 0,
          gst_pct: parseFloat(it.gst) || 0
        }));
        await supabase.from('invoice_items').insert(dbItems);
      }
    }
  } catch (err) {
    console.error('Cloud Save Error:', err);
  } finally {
    isSaving = false;
    if (pendingSave) debounceSaveToCloud();
  }
}

async function fetchDashboardData() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    
    window.allInvoices = invoices || [];
    renderDashboard();
  } catch (err) {
    console.error('Fetch Dashboard Error:', err);
  }
}

window.allInvoices = [];

window.showDashboard = function() {
  document.getElementById('dashboard-main').style.display = 'block';
  document.getElementById('editor-main').style.display = 'none';
  document.getElementById('nav-dashboard-btn').style.display = 'none';
  document.getElementById('editor-currency-wrapper').style.display = 'none';
  document.getElementById('reset-btn').style.display = 'none';
  document.getElementById('download-btn').style.display = 'none';
  fetchDashboardData();
};

window.showEditor = function() {
  document.getElementById('dashboard-main').style.display = 'none';
  document.getElementById('editor-main').style.display = 'grid';
  document.getElementById('nav-dashboard-btn').style.display = 'inline-flex';
  document.getElementById('editor-currency-wrapper').style.display = 'block';
  document.getElementById('reset-btn').style.display = 'inline-flex';
  document.getElementById('download-btn').style.display = 'inline-flex';
  populateFormFromState();
  updatePreview();
};

window.createNewInvoice = function() {
  state = deepClone(DEFAULT_STATE);
  state.invoiceDate = new Date().toISOString().slice(0, 10);
  refs.logoUpload.value = '';
  if (refs.logoPreviewImg) refs.logoPreviewImg.src = '';
  if (refs.logoPreviewWrapper) refs.logoPreviewWrapper.classList.add('hidden');
  if (refs.logoPlaceholder) refs.logoPlaceholder.style.display = 'flex';
  
  const bulletsCont = document.getElementById('bullets-container');
  if (bulletsCont) bulletsCont.innerHTML = '';
  
  const itemsCont = document.getElementById('items-container');
  if (itemsCont) itemsCont.innerHTML = '';
  
  addItem();
  showEditor();
};

window.editInvoice = function(id) {
  const inv = window.allInvoices.find(i => i.id === id);
  if (!inv) return;
  state = {
    id: inv.id,
    currency: inv.currency || '₹',
    invoiceNumber: inv.invoice_number || '',
    invoiceDate: inv.invoice_date || '',
    subject: inv.subject || '',
    logo: inv.logo_base64 || null,
    from: {
      name: inv.from_name || '', company: inv.from_company || '', email: inv.from_email || '', phone: inv.from_phone || '', address: inv.from_address || ''
    },
    to: {
      name: inv.to_name || '', email: inv.to_email || '', address: inv.to_address || ''
    },
    description: inv.description || '',
    bullets: inv.bullets || [],
    payment: {
      mode: inv.payment_mode || '', account: inv.payment_account || '', ifsc: inv.payment_ifsc || '', upi: inv.payment_upi || '', pan: inv.payment_pan || '', email: inv.payment_email || '', phone: inv.payment_phone || '', note: inv.payment_phone_note || ''
    },
    closing: { message: inv.closing_message || 'Kindly process the payment for the above-mentioned work.', name: inv.closing_name || '' }
  };
  
  if (inv.invoice_items && inv.invoice_items.length > 0) {
    state.items = inv.invoice_items.sort((a,b) => a.sort_order - b.sort_order).map(it => ({
      desc: it.description || '', amount: it.amount != null ? it.amount.toString() : '', gst: it.gst_pct != null ? it.gst_pct.toString() : '0'
    }));
  } else {
    state.items = [];
  }
  
  const bulletsCont = document.getElementById('bullets-container');
  if (bulletsCont) bulletsCont.innerHTML = '';
  const itemsCont = document.getElementById('items-container');
  if (itemsCont) itemsCont.innerHTML = '';
  
  populateFormFromState();
  if (state.items.length === 0) addItem();
  showEditor();
};

function renderDashboard() {
  const tbody = document.getElementById('dashboard-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  let totalCount = window.allInvoices.length;
  let totalAmount = 0;
  
  if (totalCount === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px;">No invoices found. Create one to get started!</td></tr>`;
  } else {
    window.allInvoices.forEach(inv => {
      totalAmount += parseFloat(inv.grand_total || 0);
      const statusBadge = inv.pdf_url ? '<span class="badge sent">Generated</span>' : '<span class="badge draft">Draft</span>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(inv.invoice_number || 'Untitled')}</strong> <div style="margin-top: 6px;">${statusBadge}</div></td>
        <td>${fmtDate(inv.invoice_date)}</td>
        <td>${escapeHtml(inv.to_name || '—')}</td>
        <td><strong>${escapeHtml(inv.currency)} ${parseFloat(inv.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
        <td class="action-btns">
          <button class="btn btn-outline btn-sm" onclick="editInvoice('${inv.id}')">Edit</button>
          ${inv.pdf_url ? `<a href="${inv.pdf_url}" target="_blank" class="btn btn-primary btn-sm">PDF</a>` : `<button class="btn btn-ghost btn-sm" disabled>PDF</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  document.getElementById('stat-total-count').textContent = totalCount;
  document.getElementById('stat-total-amount').textContent = totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    // Deep merge so new default fields don't break old saves
    state = deepMerge(deepClone(DEFAULT_STATE), saved);
    return true;
  } catch (e) {
    return false;
  }
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/* ══════════════════════ ELEMENT REFS ════════════════════ */
const $ = id => document.getElementById(id);

const refs = {
  // Header
  currencySelect:   $('currency-select'),
  resetBtn:         $('reset-btn'),
  downloadBtn:      $('download-btn'),
  downloadLabel:    $('download-label'),

  // Section 01 — Invoice Details
  invoiceNumber:  $('invoice-number'),
  invoiceDate:    $('invoice-date'),
  subject:        $('invoice-subject'),

  // Section 02 — From
  logoUploadArea: $('logo-upload-area'),
  logoUpload:     $('logo-upload'),
  logoPlaceholder: $('logo-placeholder'),
  logoPreviewWrapper: $('logo-preview-wrapper'),
  logoPreviewImg: $('logo-preview-img'),
  logoRemoveBtn:  $('logo-remove-btn'),
  fromName:       $('from-name'),
  fromCompany:    $('from-company'),
  fromEmail:      $('from-email'),
  fromPhone:      $('from-phone'),
  fromAddress:    $('from-address'),

  // Section 03 — To
  toName:         $('to-name'),
  toEmail:        $('to-email'),
  toAddress:      $('to-address'),

  // Section 04 — Description
  descText:       $('description-text'),
  bulletsContainer: $('bullets-container'),
  addBulletBtn:   $('add-bullet-btn'),

  // Section 05 — Items
  itemsContainer: $('items-container'),
  addItemBtn:     $('add-item-btn'),
  subtotalDisplay:$('subtotal-display'),
  gstTotalDisplay:$('gst-total-display'),
  grandTotalDisplay: $('grand-total-display'),

  // Section 06 — Payment
  payMode:        $('pay-mode'),
  payAccount:     $('pay-account'),
  payIfsc:        $('pay-ifsc'),
  payUpi:         $('pay-upi'),
  payPan:         $('pay-pan'),
  payEmail:       $('pay-email'),
  payPhone:       $('pay-phone'),
  payPhoneNote:   $('pay-phone-note'),

  // Section 07 — Closing
  closingMessage: $('closing-message'),
  closingName:    $('closing-name'),

  // Preview
  prevLogo:       $('prev-logo'),
  prevNumber:     $('prev-number'),
  prevDate:       $('prev-date'),
  prevFrom:       $('prev-from'),
  prevTo:         $('prev-to'),
  prevSubject:    $('prev-subject'),
  prevDescText:   $('prev-desc-text'),
  prevBullets:    $('prev-bullets'),
  prevItemsBody:  $('prev-items-body'),
  prevSubtotal:   $('prev-subtotal'),
  prevGstTotal:   $('prev-gst-total'),
  prevGrandTotal: $('prev-grand-total'),
  prevPayMode:    $('prev-pay-mode'),
  prevPayAccount: $('prev-pay-account'),
  prevPayIfsc:    $('prev-pay-ifsc'),
  prevPayUpi:     $('prev-pay-upi'),
  prevPayPan:     $('prev-pay-pan'),
  prevPayEmail:   $('prev-pay-email'),
  prevPayPhone:   $('prev-pay-phone'),
  prevPayNote:    $('prev-pay-note'),
  prevClosingMsg: $('prev-closing-msg'),
  prevClosingName:$('prev-closing-name'),

  // Currency sym in preview table header
  currencySyms:   document.querySelectorAll('.currency-sym'),

  // Preview DL button
  previewDlBtn:   $('preview-dl-btn'),

  // Toast
  toast:          $('toast'),
};

/* ══════════════════════ ACCORDION ════════════════════════ */
function initAccordion() {
  document.querySelectorAll('.section-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.form-section');
      section.classList.toggle('open');
    });
  });
}

/* ══════════════════════ FORM → STATE ════════════════════ */
function populateFormFromState() {
  // Currency
  refs.currencySelect.value = state.currency;
  updateCurrencySymbols();

  // Invoice Meta
  refs.invoiceNumber.value = state.invoiceNumber;
  refs.invoiceDate.value   = state.invoiceDate;
  refs.subject.value       = state.subject;

  // From
  refs.fromName.value    = state.from.name;
  refs.fromCompany.value = state.from.company;
  refs.fromEmail.value   = state.from.email;
  refs.fromPhone.value   = state.from.phone;
  refs.fromAddress.value = state.from.address;

  // Logo
  if (state.logo) {
    refs.logoPreviewImg.src = state.logo;
    refs.logoPlaceholder.classList.add('hidden');
    refs.logoPreviewWrapper.classList.remove('hidden');
  }

  // To
  refs.toName.value    = state.to.name;
  refs.toEmail.value   = state.to.email;
  refs.toAddress.value = state.to.address;

  // Description
  refs.descText.value = state.description;
  renderBullets();

  // Line items
  renderItems();
  recalcTotals();

  // Payment
  refs.payMode.value      = state.payment.mode;
  refs.payAccount.value   = state.payment.account;
  refs.payIfsc.value      = state.payment.ifsc;
  refs.payUpi.value       = state.payment.upi;
  refs.payPan.value       = state.payment.pan;
  refs.payEmail.value     = state.payment.email;
  refs.payPhone.value     = state.payment.phone;
  refs.payPhoneNote.value = state.payment.note;

  // Closing
  refs.closingMessage.value = state.closing.message;
  refs.closingName.value    = state.closing.name;

  // Sync preview
  updatePreview();
}

function bindFormEvents() {
  const bind = (el, stateKey, subKey) => {
    if (!el) return;
    el.addEventListener('input', () => {
      if (subKey) state[stateKey][subKey] = el.value;
      else        state[stateKey]          = el.value;
      // Auto-fill closing name from from-name
      if (stateKey === 'from' && subKey === 'name' && !refs.closingName.value) {
        refs.prevClosingName.textContent = el.value || '—';
      }
      updatePreview();
      saveToStorage();
    });
  };

  refs.currencySelect.addEventListener('change', () => {
    state.currency = refs.currencySelect.value;
    updateCurrencySymbols();
    recalcTotals();
    updatePreview();
    saveToStorage();
  });

  // Invoice meta
  bind(refs.invoiceNumber, 'invoiceNumber');
  // Date inputs fire 'change', not 'input', on most browsers
  refs.invoiceDate.addEventListener('change', () => {
    state.invoiceDate = refs.invoiceDate.value;
    updatePreview();
    saveToStorage();
  });
  refs.invoiceDate.addEventListener('input', () => {
    state.invoiceDate = refs.invoiceDate.value;
    updatePreview();
    saveToStorage();
  });
  bind(refs.subject, 'subject');

  // From
  bind(refs.fromName,    'from', 'name');
  bind(refs.fromCompany, 'from', 'company');
  bind(refs.fromEmail,   'from', 'email');
  bind(refs.fromPhone,   'from', 'phone');
  bind(refs.fromAddress, 'from', 'address');

  // To
  bind(refs.toName,    'to', 'name');
  bind(refs.toEmail,   'to', 'email');
  bind(refs.toAddress, 'to', 'address');

  // Description
  bind(refs.descText, 'description');

  // Payment
  bind(refs.payMode,      'payment', 'mode');
  bind(refs.payAccount,   'payment', 'account');
  bind(refs.payIfsc,      'payment', 'ifsc');
  bind(refs.payUpi,       'payment', 'upi');
  bind(refs.payPan,       'payment', 'pan');
  bind(refs.payEmail,     'payment', 'email');
  bind(refs.payPhone,     'payment', 'phone');
  bind(refs.payPhoneNote, 'payment', 'note');

  // Closing
  bind(refs.closingMessage, 'closing', 'message');
  bind(refs.closingName,    'closing', 'name');

  // Logo upload
  refs.logoUploadArea.addEventListener('click', () => refs.logoUpload.click());
  refs.logoUpload.addEventListener('change', handleLogoUpload);
  refs.logoUploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    refs.logoUploadArea.classList.add('drag-over');
  });
  refs.logoUploadArea.addEventListener('dragleave', () => refs.logoUploadArea.classList.remove('drag-over'));
  refs.logoUploadArea.addEventListener('drop', e => {
    e.preventDefault();
    refs.logoUploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processLogoFile(file);
  });
  refs.logoRemoveBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeLogo();
  });

  // Bullets
  refs.addBulletBtn.addEventListener('click', () => addBullet(''));

  // Line Items
  refs.addItemBtn.addEventListener('click', () => addItem());

  // Buttons
  refs.resetBtn.addEventListener('click', resetForm);
  refs.downloadBtn.addEventListener('click', exportPDF);
  refs.previewDlBtn.addEventListener('click', exportPDF);
}

/* ══════════════════════ LOGO ═════════════════════════════ */
function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  processLogoFile(file);
}

function processLogoFile(file) {
  if (file.size > 2 * 1024 * 1024) {
    showToast('Logo file is too large. Maximum size is 2 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    state.logo = ev.target.result;
    refs.logoPreviewImg.src = state.logo;
    refs.logoPlaceholder.classList.add('hidden');
    refs.logoPreviewWrapper.classList.remove('hidden');
    refs.prevLogo.src = state.logo;
    refs.prevLogo.classList.remove('hidden');
    saveToStorage();
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  state.logo = null;
  refs.logoUpload.value = '';
  refs.logoPreviewImg.src = '';
  refs.logoPlaceholder.classList.remove('hidden');
  refs.logoPreviewWrapper.classList.add('hidden');
  refs.prevLogo.src = '';
  refs.prevLogo.classList.add('hidden');
  saveToStorage();
}

/* ══════════════════════ BULLETS ═════════════════════════ */
function renderBullets() {
  refs.bulletsContainer.innerHTML = '';
  state.bullets.forEach((text, i) => {
    refs.bulletsContainer.appendChild(createBulletRow(text, i));
  });
}

function createBulletRow(text, index) {
  const row = document.createElement('div');
  row.className = 'bullet-row';
  row.dataset.index = index;

  const prefix = document.createElement('span');
  prefix.className = 'bullet-prefix';
  prefix.textContent = '•';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = text;
  input.placeholder = 'Bullet point text...';
  input.setAttribute('aria-label', `Bullet point ${index + 1}`);
  input.addEventListener('input', () => {
    state.bullets[index] = input.value;
    updatePreview();
    saveToStorage();
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'bullet-remove-btn';
  removeBtn.innerHTML = '✕';
  removeBtn.setAttribute('aria-label', 'Remove bullet');
  removeBtn.addEventListener('click', () => removeBullet(index));

  row.appendChild(prefix);
  row.appendChild(input);
  row.appendChild(removeBtn);
  return row;
}

function addBullet(text = '') {
  state.bullets.push(text);
  const index = state.bullets.length - 1;
  refs.bulletsContainer.appendChild(createBulletRow(text, index));
  // Focus the new input
  const rows = refs.bulletsContainer.querySelectorAll('.bullet-row input');
  if (rows.length) rows[rows.length - 1].focus();
  updatePreview();
  saveToStorage();
}

function removeBullet(index) {
  const row = refs.bulletsContainer.querySelector(`[data-index="${index}"]`);
  if (row) {
    row.style.cssText = 'animation: fadeUp 0.2s ease reverse both; overflow:hidden;';
    setTimeout(() => { row.remove(); }, 180);
  }
  state.bullets.splice(index, 1);
  // Re-render so indices are correct
  setTimeout(() => renderBullets(), 200);
  updatePreview();
  saveToStorage();
}

/* ══════════════════════ LINE ITEMS ══════════════════════ */
function renderItems() {
  refs.itemsContainer.innerHTML = '';
  state.items.forEach((item, i) => {
    refs.itemsContainer.appendChild(createItemRow(item, i));
  });
}

function createItemRow(item, index) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.index = index;

  const gstAmt   = calcGstAmt(item.amount, item.gst);
  const lineTotal = calcLineTotal(item.amount, item.gst);

  // Description input
  const descInput = makeInput('text', item.desc, 'Description...', 'icol-desc');
  descInput.addEventListener('input', () => {
    state.items[index].desc = descInput.value;
    updatePreview(); saveToStorage();
  });

  // Amount input
  const amtInput = makeInput('number', item.amount, '0.00', 'icol-amt');
  amtInput.min = '0'; amtInput.step = '0.01';
  amtInput.addEventListener('input', () => {
    state.items[index].amount = parseFloat(amtInput.value) || 0;
    refreshCalcFields(row, index);
    recalcTotals();
    updatePreview(); saveToStorage();
  });

  // GST % input
  const gstInput = makeInput('number', item.gst, '0', 'icol-gst');
  gstInput.min = '0'; gstInput.max = '100'; gstInput.step = '0.5';
  gstInput.addEventListener('input', () => {
    state.items[index].gst = parseFloat(gstInput.value) || 0;
    refreshCalcFields(row, index);
    recalcTotals();
    updatePreview(); saveToStorage();
  });

  // Total (read-only)
  const totalDisplay = document.createElement('div');
  totalDisplay.className = 'item-calc icol-total';
  totalDisplay.textContent = fmtNum(lineTotal);

  // Delete
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'item-del-btn';
  delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  delBtn.setAttribute('aria-label', 'Remove item');
  delBtn.addEventListener('click', () => removeItem(index));

  row.appendChild(descInput);
  row.appendChild(amtInput);
  row.appendChild(gstInput);
  row.appendChild(totalDisplay);
  row.appendChild(delBtn);
  return row;
}

function makeInput(type, value, placeholder, cls) {
  const el = document.createElement('input');
  el.type = type;
  el.value = value !== undefined && value !== '' ? value : '';
  el.placeholder = placeholder;
  el.className = cls;
  return el;
}

function refreshCalcFields(row, index) {
  const item = state.items[index];
  const lineTotal = calcLineTotal(item.amount, item.gst);
  const totalEl = row.querySelector('.item-calc.icol-total');
  if (totalEl) totalEl.textContent = fmtNum(lineTotal);
}

function calcGstAmt(amount, gstPct) {
  return ((parseFloat(amount) || 0) * (parseFloat(gstPct) || 0)) / 100;
}

function calcLineTotal(amount, gstPct) {
  const base = parseFloat(amount) || 0;
  return base + calcGstAmt(base, gstPct);
}

function recalcTotals() {
  let subtotal = 0, gstTotal = 0;
  state.items.forEach(item => {
    const base = parseFloat(item.amount) || 0;
    const gst  = calcGstAmt(base, item.gst);
    subtotal  += base;
    gstTotal  += gst;
  });
  const grand = subtotal + gstTotal;
  const sym = state.currency;

  refs.subtotalDisplay.textContent    = `${sym} ${fmtNum(subtotal)}`;
  refs.gstTotalDisplay.textContent    = `${sym} ${fmtNum(gstTotal)}`;
  refs.grandTotalDisplay.textContent  = `${sym} ${fmtNum(grand)}`;
}

function addItem() {
  const newItem = { desc: '', amount: '', gst: '18' };
  state.items.push(newItem);
  const index = state.items.length - 1;
  const row = createItemRow(newItem, index);
  refs.itemsContainer.appendChild(row);
  // Focus description of new row
  const descInput = row.querySelector('input[type="text"]');
  if (descInput) descInput.focus();
  recalcTotals();
  updatePreview();
  saveToStorage();
}

function removeItem(index) {
  const row = refs.itemsContainer.querySelector(`[data-index="${index}"]`);
  if (row) {
    row.style.cssText = 'opacity:0;max-height:0;overflow:hidden;margin:0;padding:0;transition:all 0.2s ease;';
    setTimeout(() => row.remove(), 220);
  }
  state.items.splice(index, 1);
  setTimeout(() => {
    renderItems();
    recalcTotals();
    updatePreview();
    saveToStorage();
  }, 230);
}

/* ══════════════════════ CURRENCY ════════════════════════ */
function updateCurrencySymbols() {
  refs.currencySyms.forEach(el => { el.textContent = state.currency; });
  recalcTotals();
}

function fmtNum(n) {
  return parseFloat(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    // Parse YYYY-MM-DD parts directly to avoid timezone offset issues
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return dateStr; }
}

/* ══════════════════════ PREVIEW UPDATE ══════════════════ */
function updatePreview() {
  const sym = state.currency;

  // Logo
  if (state.logo) {
    refs.prevLogo.src = state.logo;
    refs.prevLogo.classList.remove('hidden');
  } else {
    refs.prevLogo.classList.add('hidden');
  }

  // Invoice Number & Date
  setText(refs.prevNumber, state.invoiceNumber || '—');
  setText(refs.prevDate,   state.invoiceDate ? fmtDate(state.invoiceDate) : '—');

  // From
  const fromParts = [
    state.from.name,
    state.from.company,
    state.from.email,
    state.from.phone,
    state.from.address
  ].filter(Boolean);
  refs.prevFrom.textContent = fromParts.join('\n') || '—';

  // To
  const toParts = [
    state.to.name,
    state.to.email,
    state.to.address
  ].filter(Boolean);
  refs.prevTo.textContent = toParts.join('\n') || '—';

  // Subject
  setText(refs.prevSubject, state.subject || '—');

  // Description
  refs.prevDescText.textContent = state.description || '';

  // Bullets
  refs.prevBullets.innerHTML = '';
  state.bullets.forEach(b => {
    if (!b.trim()) return;
    const li = document.createElement('li');
    li.textContent = b;
    refs.prevBullets.appendChild(li);
  });

  // Line Items Table
  refs.prevItemsBody.innerHTML = '';
  if (state.items.length === 0) {
    refs.prevItemsBody.innerHTML = `<tr class="inv-empty-row"><td colspan="5" style="text-align:center;color:#aaa;font-style:italic;padding:16px 0;">Add line items to see them here</td></tr>`;
  } else {
    state.items.forEach(item => {
      const base     = parseFloat(item.amount) || 0;
      const gstPct   = parseFloat(item.gst) || 0;
      const gstAmt   = calcGstAmt(base, gstPct);
      const lineTotal = calcLineTotal(base, gstPct);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.desc) || '<span style="color:#aaa;font-style:italic">—</span>'}</td>
        <td style="text-align:right">${sym} ${fmtNum(base)}</td>
        <td style="text-align:right">${gstPct > 0 ? gstPct + '%' : '—'}</td>
        <td style="text-align:right">${gstAmt > 0 ? sym + ' ' + fmtNum(gstAmt) : '—'}</td>
        <td style="text-align:right;font-weight:600">${sym} ${fmtNum(lineTotal)}</td>
      `;
      refs.prevItemsBody.appendChild(tr);
    });
  }

  // Totals
  let subtotal = 0, gstTotalAmt = 0;
  state.items.forEach(item => {
    subtotal    += parseFloat(item.amount) || 0;
    gstTotalAmt += calcGstAmt(parseFloat(item.amount) || 0, item.gst);
  });
  const grand = subtotal + gstTotalAmt;
  refs.prevSubtotal.textContent  = `${sym} ${fmtNum(subtotal)}`;
  refs.prevGstTotal.textContent  = `${sym} ${fmtNum(gstTotalAmt)}`;
  refs.prevGrandTotal.textContent = `${sym} ${fmtNum(grand)}`;

  // Payment rows
  setPayRow('prow-mode',    refs.prevPayMode,    state.payment.mode);
  setPayRow('prow-account', refs.prevPayAccount, state.payment.account);
  setPayRow('prow-ifsc',    refs.prevPayIfsc,    state.payment.ifsc);
  setPayRow('prow-upi',     refs.prevPayUpi,     state.payment.upi);
  setPayRow('prow-pan',     refs.prevPayPan,     state.payment.pan);
  setPayRow('prow-pemail',  refs.prevPayEmail,   state.payment.email);
  setPayRow('prow-pphone',  refs.prevPayPhone,   state.payment.phone);
  refs.prevPayNote.textContent = state.payment.note || '';

  // Show/hide payment phone row based on having a value
  const ppRow = $('prow-pphone');
  if (ppRow) ppRow.style.display = (state.payment.phone || state.payment.note) ? 'flex' : 'none';

  // Closing
  refs.prevClosingMsg.textContent  = state.closing.message || '';
  refs.prevClosingName.textContent = state.closing.name || state.from.name || '—';
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function setPayRow(rowId, valEl, val) {
  const row = $(rowId);
  if (row) row.style.display = val ? 'flex' : 'none';
  if (valEl) valEl.textContent = val || '—';
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

/* ══════════════════════ PDF EXPORT ══════════════════════ */
async function exportPDF() {
  const preview = $('invoice-preview');
  if (!preview) return;

  // Validate line items
  const hasInvalidItems = state.items.some(item => item.amount <= 0);
  if (state.items.length > 0 && hasInvalidItems) {
    showToast('⚠ Please provide a valid amount > 0 for all line items before exporting.');
    return;
  }

  // Button loading state
  refs.downloadLabel.textContent = 'Generating…';
  refs.downloadBtn.disabled = true;
  refs.previewDlBtn.disabled = true;

  const invoiceNum = state.invoiceNumber || 'invoice';
  const dateStr    = state.invoiceDate
    ? state.invoiceDate.replace(/-/g, '')
    : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `Invoice-${invoiceNum}-${dateStr}.pdf`;

  // ── FIX: html2canvas can't fully capture elements inside overflow-clipped/
  // scrolled containers. Clone the invoice onto <body> (off-screen) first. ──
  const offscreenWrapper = document.createElement('div');
  offscreenWrapper.style.cssText = [
    'position:fixed', 'top:0', 'left:-9999px',
    'width:794px', 'background:#ffffff',
    'overflow:visible', 'z-index:-9999', 'pointer-events:none'
  ].join(';');

  const clone = preview.cloneNode(true);
  // Strip visual-only styles that are irrelevant in PDF
  clone.style.cssText = [
    'width:794px', 'min-height:auto',
    'padding:48px 56px',
    'background:#ffffff',
    'box-shadow:none', 'border-radius:0',
    'animation:none', 'transform:none',
    'position:relative',
    'font-family:Inter,Arial,sans-serif',
    'font-size:13px', 'color:#1a1a1a', 'line-height:1.55'
  ].join(';');

  offscreenWrapper.appendChild(clone);
  document.body.appendChild(offscreenWrapper);

  const opt = {
    margin:      [10, 10, 10, 10],
    filename,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      onclone: (clonedDoc) => {
        // Ensure no stray animations or shadows in the captured document
        const el = clonedDoc.querySelector('.invoice-preview');
        if (el) {
          el.style.boxShadow = 'none';
          el.style.animation = 'none';
          el.style.transform = 'none';
        }
      }
    },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] }
  };

  try {
    const pdfBlob = await html2pdf().set(opt).from(clone).output('blob');
    await html2pdf().set(opt).from(clone).save();

    if (state.id && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const filePath = `${session.user.id}/${state.id}_${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage.from('invoices').upload(filePath, pdfBlob, { 
          contentType: 'application/pdf', 
          upsert: true 
        });
        
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(filePath);
          await supabase.from('invoices').update({ 
            pdf_url: publicUrlData.publicUrl, 
            pdf_path: filePath 
          }).eq('id', state.id);
        }
      }
    }

    showToast('✓ Invoice downloaded successfully!');
  } catch (err) {
    console.error('PDF export failed:', err);
    showToast('Export failed. Please try again.');
  } finally {
    document.body.removeChild(offscreenWrapper);
    refs.downloadLabel.textContent = 'Download PDF';
    refs.downloadBtn.disabled = false;
    refs.previewDlBtn.disabled = false;
  }
}

/* ══════════════════════ RESET ════════════════════════════ */
function resetForm() {
  if (!confirm('Reset all fields? This cannot be undone.')) return;
  state = deepClone(DEFAULT_STATE);
  localStorage.removeItem(LS_KEY);
  populateFormFromState();
  // Reset file input
  refs.logoUpload.value = '';
  showToast('Form has been reset.');
}

/* ══════════════════════ INIT ═════════════════════════════ */
async function init() {
  initAccordion();
  bindFormEvents();

  if (!supabase) {
    // offline mode
    loadFromStorage();
    if (!state.invoiceDate) state.invoiceDate = new Date().toISOString().slice(0, 10);
    populateFormFromState();
    if (state.items.length === 0) addItem();
    showEditor();
    let nDb = document.getElementById('nav-dashboard-btn');
    if (nDb) nDb.style.display = 'none'; // force hide
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // guest mode
    loadFromStorage();
    if (!state.invoiceDate) state.invoiceDate = new Date().toISOString().slice(0, 10);
    populateFormFromState();
    if (state.items.length === 0) addItem();
    showEditor(); 
    let nDb = document.getElementById('nav-dashboard-btn');
    if (nDb) nDb.style.display = 'none'; // force hide
  } else {
    // logged in, populate dashboard
    await fetchDashboardData();
    if (window.allInvoices && window.allInvoices.length > 0) {
      showDashboard();
    } else {
      window.createNewInvoice();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('landing-overlay');
  
  if (!overlay || overlay.style.display === 'none' || overlay.classList.contains('hidden')) {
    if (!window._appInitialised) {
      window._appInitialised = true;
      init();
    }
  }
});
