/* ================================================================
   صيدليتي — app.js  (v3)
   Navigation · UI Rendering · Cart · Inventory Filter
   يعتمد على DataService من db.js
================================================================ */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════════ */
function navigate(screenId, params) {
  params = params || {};
  var curr = document.getElementById(AppState.currentScreen);
  var next = document.getElementById(screenId);
  if (!next || screenId === AppState.currentScreen) return;

  if (curr) { curr.classList.remove('active'); curr.style.display = 'none'; }
  next.style.display = 'block';
  next.offsetHeight; // reflow
  next.classList.add('active');

  AppState.history.push(AppState.currentScreen);
  AppState.currentScreen = screenId;

  next.querySelectorAll('.content-area, .sales-layout').forEach(function(el) { el.scrollTop = 0; });

  // تحديث الـ nav الموحد
  _syncNav(screenId);

  _onScreenEnter(screenId, params);
}

/* ─── تحديث حالة الـ nav الموحد ─── */
var NAV_SCREENS = {
  'screen-dashboard':  'nav-btn-dashboard',
  'screen-inventory':  'nav-btn-inventory',
  'screen-sales':      'nav-btn-sales',
  'screen-reports':    'nav-btn-reports',
  'screen-profile':    'nav-btn-profile',
  'screen-invoices':   'nav-btn-reports',
};

/* الشاشات التي تُخفي الـ nav (auth screens) */
var NAV_HIDDEN_SCREENS = ['screen-splash','screen-login','screen-register','screen-owner-setup'];

function _syncNav(screenId) {
  var nav = document.getElementById('global-bottom-nav');
  if (!nav) return;

  // أخفِ الـ nav في شاشات الـ auth
  if (NAV_HIDDEN_SCREENS.indexOf(screenId) !== -1) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  // عيّن الزر النشط
  nav.querySelectorAll('.nav-item').forEach(function(btn) { btn.classList.remove('active'); });
  var activeId = NAV_SCREENS[screenId];
  if (activeId) {
    var activeBtn = document.getElementById(activeId);
    if (activeBtn) activeBtn.classList.add('active');
  }
}

async function _onScreenEnter(screenId, params) {
  switch (screenId) {
    case 'screen-inventory':  await InventoryUI.load(); break;
    case 'screen-dashboard':  await DashboardUI.refresh(); break;
    case 'screen-add-drug':   AddDrugUI.init(params); break;
    case 'screen-sales':      await SalesUI.load(); break;
    case 'screen-reports':    setTimeout(animateCharts, 100); break;
  }
}

/* ══════════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════════ */
var _toastTimer = null;

function showToast(msg, type) {
  type = type || 'default';
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast show toast-' + type;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

/* ══════════════════════════════════════════════════════════════════
   MODAL
══════════════════════════════════════════════════════════════════ */
function toggleModal(id) {
  var overlay = document.getElementById(id);
  if (!overlay) return;
  var isOpen = overlay.classList.contains('open');
  if (isOpen) {
    overlay.classList.remove('open');
    setTimeout(function() { overlay.style.display = 'none'; }, 300);
  } else {
    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('open');
  }
}

document.addEventListener('click', function(e) {
  document.querySelectorAll('.modal-overlay.open').forEach(function(overlay) {
    if (e.target === overlay) toggleModal(overlay.id);
  });
});

/* ══════════════════════════════════════════════════════════════════
   DARK MODE
══════════════════════════════════════════════════════════════════ */
function toggleDarkMode(checkbox) {
  document.body.classList.toggle('dark', checkbox.checked);
  showToast(checkbox.checked ? 'تم تفعيل الوضع الليلي' : 'تم إيقاف الوضع الليلي');
}

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD UI
══════════════════════════════════════════════════════════════════ */
var DashboardUI = {
  refresh: async function() {
    try {
      var stats = await DataService.getStats();
      function el(id) { return document.getElementById(id); }
      if (el('dash-stat-drugs'))    el('dash-stat-drugs').textContent    = stats.totalDrugs;
      if (el('dash-stat-low'))      el('dash-stat-low').textContent      = stats.lowStock;
      if (el('dash-stat-expiring')) el('dash-stat-expiring').textContent = stats.expiringSoon;
      await this._renderAlerts();
      await NotifUI.updateBadge();
    } catch(e) {}
  },

  _renderAlerts: async function() {
    var alertsList = document.getElementById('dash-alerts-list');
    if (!alertsList) return;
    var all    = await DataService.getAll();
    var today  = new Date();
    var in30   = new Date(today.getTime() + 30*24*60*60*1000);
    var lowStock     = all.filter(function(d) { return d.qty <= d.minQty && d.qty > 0; });
    var outOfStock   = all.filter(function(d) { return d.qty === 0; });
    var expiringSoon = all.filter(function(d) { var e=new Date(d.expiry); return e>=today && e<=in30; });
    var items = [].concat(
      outOfStock.map(function(d)   { return {drug:d, type:'out',      tag:'نافد',   color:'danger'}; }),
      lowStock.map(function(d)     { return {drug:d, type:'low',      tag:'منخفض',  color:'warning'}; }),
      expiringSoon.map(function(d) { return {drug:d, type:'expiring', tag:'قريب',   color:'warning'}; })
    ).slice(0,5);
    if (items.length === 0) {
      alertsList.innerHTML = '<div class="alert-item" style="justify-content:center;padding:20px"><span style="color:var(--text-muted);font-size:14px">لا توجد تنبيهات حالياً</span></div>';
      return;
    }
    alertsList.innerHTML = items.map(function(x) {
      var dotColor = x.color==='danger'?'red':'orange';
      var subtitle = x.type==='expiring'?('ينتهي: '+x.drug.expiry):('متبقي: '+x.drug.qty+' قطعة');
      return '<div class="alert-item alert-'+x.color+'"><div class="alert-dot '+dotColor+'"></div><div class="alert-content"><div class="alert-title">'+x.drug.name+'</div><div class="alert-subtitle">'+subtitle+'</div></div><span class="alert-tag '+x.color+'">'+x.tag+'</span></div>';
    }).join('');
  },
};

/* ══════════════════════════════════════════════════════════════════
   INVENTORY UI
══════════════════════════════════════════════════════════════════ */
var InventoryUI = {
  _renderTimer: null,

  load: async function(resetFilter) {
    if (resetFilter) {
      AppState.inventory.activeFilter = 'all';
      AppState.inventory.searchQuery  = '';
      var si = document.getElementById('inv-search-input');
      if (si) si.value = '';
    }
    var drugs = await DataService.getAll();
    AppState.inventory.drugs = drugs;
    await this.apply();
    this._updateChipCounts();
  },

  apply: async function() {
    var results  = AppState.inventory.drugs.slice();
    var q        = AppState.inventory.searchQuery;
    var fType    = AppState.inventory.activeFilter;
    var today    = new Date();
    var in30     = new Date(today.getTime()+30*24*60*60*1000);

    if (fType !== 'all') {
      results = results.filter(function(d) {
        if (fType==='low_stock')     return d.qty <= d.minQty;
        if (fType==='expiring_soon') { var e=new Date(d.expiry); return e>=today && e<=in30; }
        if (fType==='added_today')   return new Date(d.createdAt).toDateString()===today.toDateString();
        return true;
      });
    }
    if (q) {
      var lq = q.toLowerCase();
      results = results.filter(function(d) {
        return d.name.toLowerCase().includes(lq) || d.barcode.includes(q) ||
               d.company.toLowerCase().includes(lq) || d.category.toLowerCase().includes(lq);
      });
    }
    AppState.inventory.filtered = results;
    this.render(results, q);
  },

  onSearchInput: function(query) {
    AppState.inventory.searchQuery = query;
    clearTimeout(this._renderTimer);
    var self = this;
    this._renderTimer = setTimeout(function() { self.apply(); }, 200);
  },

  setFilter: function(type) {
    AppState.inventory.activeFilter = type;
    this.apply();
  },

  render: function(drugs, query) {
    var list = document.getElementById('drug-list');
    if (!list) return;
    if (!drugs || drugs.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-pills"></i></div><div class="empty-title">'+(query?'لا نتائج للبحث':'المخزن فارغ')+'</div><div class="empty-sub">'+(query?'لم يُعثر على نتيجة — جرّب الباركود أو اسم الشركة':'أضف دواءً جديداً للبدء')+'</div></div>';
      return;
    }
    var today = new Date();
    var in30  = new Date(today.getTime()+30*24*60*60*1000);
    list.innerHTML = drugs.map(function(drug) {
      var isLow      = drug.qty <= drug.minQty;
      var isOut      = drug.qty === 0;
      var expDate    = new Date(drug.expiry);
      var isExpiring = expDate>=today && expDate<=in30;
      var isExpired  = expDate<today;
      var iconColor  = _categoryColor(drug.category);
      var iconName   = _categoryIcon(drug.category);
      var qtyClass   = isOut?'zero':isLow?'warn':'ok';
      var hName      = query?_highlight(drug.name,query):drug.name;
      var tags = [];
      if (isOut)           tags.push('<span class="dtag danger">نافد</span>');
      else if (isLow)      tags.push('<span class="dtag danger">مخزون منخفض</span>');
      if (isExpired)       tags.push('<span class="dtag danger">منتهي</span>');
      else if (isExpiring) tags.push('<span class="dtag warning">ينتهي قريباً</span>');
      tags.push('<span class="dtag gray">'+drug.category+'</span>');
      return '<div class="drug-card">'+
        '<div class="drug-card-top" onclick="navigate(\'screen-add-drug\',{editId:\''+drug.id+'\'})">'+
          '<div class="drug-icon '+iconColor+'"><i class="fa-solid '+iconName+'"></i></div>'+
          '<div class="drug-info"><div class="drug-name">'+hName+'</div><div class="drug-company">'+drug.company+'</div></div>'+
          '<div class="drug-qty '+qtyClass+'">'+drug.qty+'</div>'+
        '</div>'+
        '<div class="drug-card-footer">'+
          '<div class="drug-card-tags">'+tags.join('')+'</div>'+
          '<div class="drug-card-actions">'+
            '<button class="drug-action-btn edit" onclick="navigate(\'screen-add-drug\',{editId:\''+drug.id+'\'})">'+
              '<i class="fa-solid fa-pen"></i> تعديل'+
            '</button>'+
            '<button class="drug-action-btn delete" onclick="DrugActions.confirmDelete(\''+drug.id+'\',\''+drug.name.replace(/'/g,"\\'")+'\')" >'+
              '<i class="fa-solid fa-trash"></i> حذف'+
            '</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('');
  },

  _updateChipCounts: function() {
    var all   = AppState.inventory.drugs;
    var today = new Date();
    var in30  = new Date(today.getTime()+30*24*60*60*1000);
    var low   = all.filter(function(d){return d.qty<=d.minQty;}).length;
    var exp   = all.filter(function(d){var e=new Date(d.expiry);return e>=today&&e<=in30;}).length;
    var todayC= all.filter(function(d){return new Date(d.createdAt).toDateString()===today.toDateString();}).length;
    document.querySelectorAll('#screen-inventory .chip').forEach(function(c) {
      var t = c.textContent.replace(/\d+/g,'').trim();
      if (t==='الكل')          c.innerHTML='الكل <span class="chip-count">'+all.length+'</span>';
      if (t==='منخفض')         c.innerHTML='منخفض <span class="chip-count warn">'+low+'</span>';
      if (t==='ينتهي قريباً')  c.innerHTML='ينتهي قريباً <span class="chip-count warn">'+exp+'</span>';
      if (t==='مضافة اليوم')   c.innerHTML='مضافة اليوم <span class="chip-count">'+todayC+'</span>';
    });
  },
};

function _categoryColor(cat) {
  var map={'مسكن ألم':'teal','مضاد حيوي':'blue','فيتامينات':'purple','أمراض مزمنة':'orange','جهاز هضمي':'teal','أمراض قلب':'blue','حساسية':'purple'};
  return map[cat]||'teal';
}
function _categoryIcon(cat) {
  var map={'مسكن ألم':'fa-capsules','مضاد حيوي':'fa-pills','فيتامينات':'fa-tablets','أمراض مزمنة':'fa-syringe','جهاز هضمي':'fa-flask','أمراض قلب':'fa-heart-pulse','حساسية':'fa-wind'};
  return map[cat]||'fa-pills';
}
function _highlight(text, query) {
  if (!query) return text;
  var re = new RegExp('('+query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return text.replace(re,'<mark class="search-highlight">$1</mark>');
}

/* ══════════════════════════════════════════════════════════════════
   ADD/EDIT DRUG UI
══════════════════════════════════════════════════════════════════ */
var AddDrugUI = {
  _editId: null,
  _barcodeTimer: null,

  init: function(params) {
    params = params || {};
    this._editId = params.editId || null;

    // Consume pending barcode from scanner
    var pendingBarcode = AppState.consumePendingBarcode();
    if (pendingBarcode) {
      var bi = document.getElementById('drug-barcode-input');
      if (bi) {
        bi.value = pendingBarcode;
        var self = this;
        setTimeout(function() { self.checkDuplicateBarcode(pendingBarcode); }, 300);
      }
    }

    var titleEl = document.querySelector('#screen-add-drug .top-bar-title');
    if (titleEl) titleEl.textContent = this._editId ? 'تعديل الدواء' : 'إضافة دواء جديد';

    if (this._editId) {
      this._loadForEdit(this._editId);
    } else if (!pendingBarcode) {
      this._resetForm();
    }
  },

  _resetForm: function() {
    ['drug-name-input','drug-company-input','drug-minqty-input',
     'drug-buy-input','drug-sell-input','drug-barcode-input','drug-notes-input']
    .forEach(function(id) { var el=document.getElementById(id); if(el) el.value=''; });
    this._hideDuplicateWarning();
    var profitEl = document.querySelector('.profit-val');
    if (profitEl) { profitEl.textContent = '0 ل.س (0%)'; profitEl.style.color = ''; }
    BatchesUI.init([]);
    BatchesUI.addBatch(); // دفعة واحدة فارغة افتراضياً
  },

  _loadForEdit: async function(id) {
    var drugs = await DataService.getAll();
    var drug  = drugs.find(function(d){ return d.id===id; });
    if (!drug) return;
    function set(id,val){ var el=document.getElementById(id); if(el) el.value=val; }
    set('drug-name-input',     drug.name);
    set('drug-company-input',  drug.company);
    set('drug-minqty-input',   drug.minQty);
    set('drug-buy-input',      drug.buyPrice);
    set('drug-sell-input',     drug.sellPrice);
    set('drug-barcode-input',  drug.barcode);
    set('drug-notes-input',    drug.notes);
    BatchesUI.init(drug.batches || []);
    _updateProfitPreview();
  },

  checkDuplicateBarcode: async function(barcode) {
    if (!barcode || barcode.length < 4) { this._hideDuplicateWarning(); return; }
    var isDup = await DataService.isDuplicateBarcode(barcode, this._editId);
    if (isDup) this._showDuplicateWarning(barcode);
    else       this._hideDuplicateWarning();
  },

  _showDuplicateWarning: function(barcode) {
    var warn = document.getElementById('barcode-duplicate-warn');
    if (!warn) {
      warn = document.createElement('div');
      warn.id = 'barcode-duplicate-warn';
      warn.className = 'barcode-dup-warn';
      warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>هذا الباركود مسجّل مسبقاً في المخزن</span><button onclick="AddDrugUI.jumpToDuplicate(\''+barcode+'\')">عرض الدواء</button>';
      var barcodeGroup = document.getElementById('drug-barcode-input') && document.getElementById('drug-barcode-input').closest('.form-group');
      if (barcodeGroup) barcodeGroup.after(warn);
      else document.getElementById('drug-form').appendChild(warn);
    }
    warn.style.display = 'flex';
    var bi = document.getElementById('drug-barcode-input');
    if (bi) bi.classList.add('input-error');
  },

  _hideDuplicateWarning: function() {
    var warn = document.getElementById('barcode-duplicate-warn');
    if (warn) warn.style.display = 'none';
    var bi = document.getElementById('drug-barcode-input');
    if (bi) bi.classList.remove('input-error');
  },

  jumpToDuplicate: function(barcode) {
    AppState.inventory.searchQuery = barcode;
    navigate('screen-inventory');
    setTimeout(function() {
      var si = document.getElementById('inv-search-input');
      if (si) { si.value = barcode; InventoryUI.onSearchInput(barcode); }
    }, 400);
  },

  save: async function() {
    function get(id) { var el=document.getElementById(id); return el?(el.value||'').trim():''; }
    var barcode   = get('drug-barcode-input');
    var name      = get('drug-name-input');
    var buyPrice  = parseInt(get('drug-buy-input'))  || 0;
    var sellPrice = parseInt(get('drug-sell-input')) || 0;
    if (!name)                  { showToast('يرجى إدخال اسم الدواء','warn'); return; }
    if (!barcode)               { showToast('يرجى إدخال الباركود','warn'); return; }
    if (sellPrice < buyPrice)   { showToast('سعر البيع أقل من سعر الشراء!','warn'); return; }
    var batches = BatchesUI.getBatches().filter(function(b){ return b.qty > 0 || b.expiry; });
    if (!batches.length)        { showToast('أضف دفعة واحدة على الأقل','warn'); return; }
    var isDup = await DataService.isDuplicateBarcode(barcode, this._editId);
    if (isDup) { showToast('هذا الباركود موجود مسبقاً!','warn'); return; }
    var drugData = {
      barcode:   barcode,
      name:      name,
      category:  (document.getElementById('drug-category-input')||{}).value || 'عام',
      company:   get('drug-company-input'),
      minQty:    parseInt(get('drug-minqty-input')) || 10,
      buyPrice:  buyPrice,
      sellPrice: sellPrice,
      notes:     get('drug-notes-input'),
      batches:   batches,
    };
    try {
      if (this._editId) { await DataService.update(this._editId, drugData); showToast('تم تعديل بيانات الدواء','success'); }
      else              { await DataService.add(drugData);                   showToast('تمت إضافة الدواء بنجاح','success'); }
      navigate('screen-inventory');
    } catch(e) { showToast('خطأ في الحفظ: '+e.message,'error'); }
  },
};

/* ══════════════════════════════════════════════════════════════════
   CART SERVICE
══════════════════════════════════════════════════════════════════ */
var CartService = {
  addDrug: function(drug) {
    var cartList = document.getElementById('cart-list');
    if (!cartList) return;
    var existing = Array.from(cartList.querySelectorAll('.cart-item'))
      .find(function(el){ return el.dataset.drugId === drug.id; });
    if (existing) {
      var plus = existing.querySelector('.qty-btn.plus');
      if (plus) plus.click();
      showToast('↑ زيادة كمية: ' + drug.name);
      return;
    }
    var item = document.createElement('div');
    item.className = 'cart-item';
    item.dataset.drugId = drug.id;
    item.dataset.price  = drug.sellPrice;   // رقم خام للحساب — يتجنب مشكلة ar-EG
    item.style.animation = 'slideInCart 0.3s cubic-bezier(0.34,1.56,0.64,1)';
    item.innerHTML =
      '<div class="cart-item-info">'+
        '<div class="cart-item-name">'+drug.name+'</div>'+
        '<div class="cart-item-price">'+drug.sellPrice.toLocaleString('ar-EG')+' ل.س / قطعة</div>'+
      '</div>'+
      '<div class="cart-item-controls">'+
        '<button class="qty-btn minus" onclick="changeQty(this,-1)"><i class="fa-solid fa-minus"></i></button>'+
        '<span class="qty-val">1</span>'+
        '<button class="qty-btn plus" onclick="changeQty(this,1)"><i class="fa-solid fa-plus"></i></button>'+
      '</div>'+
      '<div class="cart-item-total">'+drug.sellPrice.toLocaleString('ar-EG')+' ل.س</div>'+
      '<button class="cart-remove" onclick="removeCartItem(this)"><i class="fa-solid fa-xmark"></i></button>';
    cartList.appendChild(item);
    updateCartCount(); calcTotal();
    var si = document.getElementById('sales-search');
    if (si) si.value = '';
  },

  addByName: async function(name) {
    var results = await DataService.search(name);
    if (results.length > 0) {
      this.addDrug(results[0]);
      showToast('تمت إضافة ' + results[0].name);
    } else {
      showToast('لم يُعثر على: ' + name);
    }
  },
};

/* ──────── Cart globals ─────── */
function addDrugToCart(drugName, price) {
  if (drugName) { CartService.addByName(drugName); return; }
  var val = (document.getElementById('sales-search')||{}).value;
  if (val && val.trim()) CartService.addByName(val.trim());
  else showToast('أدخل اسم الدواء أو امسح الباركود');
}

function changeQty(btn, delta) {
  var controls = btn.closest('.cart-item-controls');
  var qtyEl    = controls.querySelector('.qty-val');
  var cartItem = btn.closest('.cart-item');
  // يقرأ من data-price (رقم خام) — يتجنب مشكلة ar-EG numerals
  var price    = parseInt(cartItem.dataset.price) ||
                 parseInt((cartItem.querySelector('.cart-item-price')||{}).textContent.replace(/[^0-9]/g,'')) || 0;
  var qty      = parseInt(qtyEl.textContent) + delta;
  if (qty < 1) qty = 1; if (qty > 999) qty = 999;
  qtyEl.textContent = qty;
  cartItem.querySelector('.cart-item-total').textContent = (price*qty).toLocaleString('ar-EG')+' ل.س';
  calcTotal();
}

function removeCartItem(btn) {
  var item = btn.closest('.cart-item');
  item.style.cssText = 'transform:translateX(-20px);opacity:0;transition:all 0.25s ease;';
  setTimeout(function(){ item.remove(); updateCartCount(); calcTotal(); }, 250);
}

function updateCartCount() {
  var cartList    = document.getElementById('cart-list');
  var cartCountEl = document.getElementById('cart-count');
  if (!cartList||!cartCountEl) return;
  var count = cartList.querySelectorAll('.cart-item').length;
  cartCountEl.textContent = count + (count===1?' صنف':' أصناف');
}

function calcTotal() {
  var cartList = document.getElementById('cart-list');
  if (!cartList) return;
  var subtotal = 0;
  cartList.querySelectorAll('.cart-item').forEach(function(item) {
    // يقرأ من data-price (رقم خام) إن وُجد، وإلا يقرأ من النص كـ fallback للعناصر الثابتة
    var price = parseInt(item.dataset.price) ||
                parseInt((item.querySelector('.cart-item-price')||{}).textContent.replace(/[^0-9]/g,'')) || 0;
    var qty   = parseInt((item.querySelector('.qty-val')||{}).textContent) || 1;
    subtotal += price * qty;
  });
  var discountInput = document.querySelector('.payment-section input[type="number"]');
  var discount = discountInput ? parseInt(discountInput.value)||0 : 0;
  var grand = Math.max(0, subtotal - discount);
  var sub = document.querySelector('.total-row:nth-child(1) strong');
  var dis = document.querySelector('.discount');
  var gnd = document.querySelector('.grand-total');
  if (sub) sub.textContent = subtotal.toLocaleString('ar-EG')+' ل.س';
  if (dis) dis.textContent = discount.toLocaleString('ar-EG')+' ل.س';
  if (gnd) gnd.textContent = grand.toLocaleString('ar-EG')+' ل.س';
}

/* ══════════════════════════════════════════════════════════════════
   PROFIT PREVIEW
══════════════════════════════════════════════════════════════════ */
function _updateProfitPreview() {
  var buyEl    = document.getElementById('drug-buy-input');
  var sellEl   = document.getElementById('drug-sell-input');
  var profitEl = document.querySelector('.profit-val');
  if (!buyEl||!sellEl||!profitEl) return;
  var buy  = parseInt(buyEl.value)||0;
  var sell = parseInt(sellEl.value)||0;
  var diff = sell-buy;
  var pct  = buy>0?((diff/buy)*100).toFixed(1):'0.0';
  profitEl.textContent = diff.toLocaleString('ar-EG')+' ل.س ('+pct+'%)';
  profitEl.style.color = diff>=0?'var(--green)':'var(--red)';
}

/* ══════════════════════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════════════════════ */
function animateCharts() {
  document.querySelectorAll('.bar-fill').forEach(function(bar,i) {
    bar.style.height='0%'; bar.style.transition='none';
    setTimeout(function(){ bar.style.transition='height 0.6s cubic-bezier(0.34,1.56,0.64,1) '+(i*60)+'ms'; bar.style.height='100%'; },50);
  });
  document.querySelectorAll('.td-bar-fill,.pm-fill').forEach(function(bar,i) {
    var w=bar.style.width; bar.style.width='0%'; bar.style.transition='none';
    setTimeout(function(){ bar.style.transition='width 0.7s cubic-bezier(0.34,1.56,0.64,1) '+(i*80)+'ms'; bar.style.width=w; },100);
  });
}

/* ══════════════════════════════════════════════════════════════════
   NOTIFICATIONS UI
══════════════════════════════════════════════════════════════════ */
var NotifUI = {
  open: async function() {
    var overlay = document.getElementById('notif-sheet-overlay');
    var body    = document.getElementById('notif-sheet-body');
    if (!overlay || !body) return;

    // منع سكرول الخلفية
    document.body.style.overflow = 'hidden';

    overlay.classList.add('open');
    body.innerHTML = '<div class="notif-loading"><div class="notif-spinner"></div><span>جاري التحميل...</span></div>';

    try {
      var all   = await DataService.getAll();
      var today = new Date();
      var in30  = new Date(today.getTime() + 30*24*60*60*1000);

      var items = [];
      all.forEach(function(d) {
        if (d.qty === 0) {
          items.push({ drug: d, type: 'out', tag: 'نافد', color: 'danger',
            subtitle: 'نفد المخزون تماماً', icon: 'fa-circle-xmark' });
        } else if (d.qty <= d.minQty) {
          items.push({ drug: d, type: 'low', tag: 'منخفض', color: 'warning',
            subtitle: 'متبقي ' + d.qty + ' قطعة (الحد الأدنى: ' + d.minQty + ')', icon: 'fa-triangle-exclamation' });
        }
        var exp = new Date(d.expiry);
        if (exp >= today && exp <= in30) {
          var daysLeft = Math.ceil((exp - today) / (1000*60*60*24));
          items.push({ drug: d, type: 'expiring', tag: 'ينتهي قريباً', color: 'warning',
            subtitle: 'ينتهي خلال ' + daysLeft + ' يوم (' + d.expiry + ')', icon: 'fa-calendar-xmark' });
        }
        if (exp < today) {
          items.push({ drug: d, type: 'expired', tag: 'منتهي الصلاحية', color: 'danger',
            subtitle: 'انتهت الصلاحية في ' + d.expiry, icon: 'fa-ban' });
        }
      });

      // Update badge
      var badge = document.getElementById('notif-badge');
      if (badge) {
        badge.textContent = items.length;
        badge.style.display = items.length ? 'flex' : 'none';
      }

      if (items.length === 0) {
        body.innerHTML =
          '<div class="notif-empty">' +
            '<div class="notif-empty-icon"><i class="fa-solid fa-bell-slash"></i></div>' +
            '<div class="notif-empty-title">لا توجد إشعارات</div>' +
            '<div class="notif-empty-sub">كل الأدوية بمخزون جيد وصلاحية مناسبة</div>' +
          '</div>';
        return;
      }

      var grouped = {
        danger:  items.filter(function(i){ return i.color === 'danger'; }),
        warning: items.filter(function(i){ return i.color === 'warning'; }),
      };

      var html = '';
      if (grouped.danger.length) {
        html += '<div class="notif-group-label danger"><i class="fa-solid fa-circle-xmark"></i> عاجل (' + grouped.danger.length + ')</div>';
        html += grouped.danger.map(function(x) { return NotifUI._renderItem(x); }).join('');
      }
      if (grouped.warning.length) {
        html += '<div class="notif-group-label warning"><i class="fa-solid fa-triangle-exclamation"></i> تنبيهات (' + grouped.warning.length + ')</div>';
        html += grouped.warning.map(function(x) { return NotifUI._renderItem(x); }).join('');
      }

      body.innerHTML = html;
    } catch(e) {
      body.innerHTML = '<div class="notif-empty"><div class="notif-empty-title">خطأ في التحميل</div></div>';
    }
  },

  _renderItem: function(x) {
    return '<div class="notif-item notif-item-' + x.color + '" onclick="NotifUI.close();navigate(\'screen-inventory\')">' +
      '<div class="notif-item-icon ' + x.color + '"><i class="fa-solid ' + x.icon + '"></i></div>' +
      '<div class="notif-item-content">' +
        '<div class="notif-item-name">' + x.drug.name + '</div>' +
        '<div class="notif-item-sub">' + x.subtitle + '</div>' +
      '</div>' +
      '<span class="notif-item-tag ' + x.color + '">' + x.tag + '</span>' +
    '</div>';
  },

  close: function() {
    var overlay = document.getElementById('notif-sheet-overlay');
    if (overlay) overlay.classList.remove('open');
    // إعادة سكرول الخلفية
    document.body.style.overflow = '';
  },

  updateBadge: async function() {
    try {
      var all   = await DataService.getAll();
      var today = new Date();
      var in30  = new Date(today.getTime() + 30*24*60*60*1000);
      var count = 0;
      all.forEach(function(d) {
        if (d.qty <= d.minQty) count++;
        var exp = new Date(d.expiry);
        if (exp <= in30) count++;
      });
      var badge = document.getElementById('notif-badge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count ? 'flex' : 'none';
      }
    } catch(e) {}
  },
};

/* ══════════════════════════════════════════════════════════════════
   SALES UI — قائمة أدوية المخزن داخل الفاتورة
══════════════════════════════════════════════════════════════════ */
var SalesUI = {
  _allDrugs: [],
  _searchTimer: null,

  load: async function() {
    try {
      this._allDrugs = await DataService.getAll();
      // Filter only in-stock drugs
      var available = this._allDrugs.filter(function(d) { return d.qty > 0; });
      this._render(available, '');
    } catch(e) {
      var list = document.getElementById('sales-drugs-list');
      if (list) list.innerHTML = '<div class="sales-empty-drugs">خطأ في تحميل الأدوية</div>';
    }
  },

  onSearch: function(query) {
    clearTimeout(this._searchTimer);
    var self = this;
    this._searchTimer = setTimeout(function() {
      var q = (query || '').trim().toLowerCase();
      var available = self._allDrugs.filter(function(d) { return d.qty > 0; });
      if (q) {
        available = available.filter(function(d) {
          return d.name.toLowerCase().includes(q) ||
                 d.barcode.includes(q) ||
                 d.company.toLowerCase().includes(q) ||
                 d.category.toLowerCase().includes(q);
        });
      }
      self._render(available, query);
    }, 180);
  },

  _render: function(drugs, query) {
    var list  = document.getElementById('sales-drugs-list');
    var count = document.getElementById('sales-drugs-count');
    if (!list) return;
    if (count) count.textContent = drugs.length + ' صنف';

    if (drugs.length === 0) {
      list.innerHTML = '<div class="sales-empty-drugs">' +
        '<i class="fa-solid fa-box-open"></i>' +
        '<span>' + (query ? 'لا نتائج للبحث' : 'لا توجد أدوية في المخزن') + '</span>' +
      '</div>';
      return;
    }

    var q = (query || '').trim();
    var hl = function(text) {
      if (!q) return text;
      return text.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')','gi'),
        '<mark class="search-highlight">$1</mark>');
    };

    list.innerHTML = drugs.map(function(d) {
      var isLow = d.qty <= d.minQty;
      var qtyClass = isLow ? 'sdrug-qty warn' : 'sdrug-qty ok';
      return '<button class="sales-drug-item" onclick="SalesUI.addToCart(\'' + d.id + '\')">' +
        '<div class="sdrug-info">' +
          '<div class="sdrug-name">' + hl(d.name) + '</div>' +
          '<div class="sdrug-meta">' + d.company + ' · ' + d.category + '</div>' +
        '</div>' +
        '<div class="sdrug-right">' +
          '<div class="sdrug-price">' + d.sellPrice.toLocaleString('ar-EG') + ' ل.س</div>' +
          '<div class="' + qtyClass + '">' + d.qty + ' قطعة</div>' +
        '</div>' +
      '</button>';
    }).join('');
  },

  addToCart: function(drugId) {
    var drug = this._allDrugs.find(function(d) { return d.id === drugId; });
    if (!drug) return;
    CartService.addDrug(drug);
    showToast('✓ تمت إضافة ' + drug.name);
    // Clear search
    var si = document.getElementById('sales-search');
    if (si && si.value) { si.value = ''; this.onSearch(''); }
  },
};

/* ══════════════════════════════════════════════════════════════════
   DRUG ACTIONS — حذف الأدوية مع تأكيد
══════════════════════════════════════════════════════════════════ */
var DrugActions = {
  _pendingId:   null,
  _pendingName: null,

  confirmDelete: function(id, name) {
    this._pendingId   = id;
    this._pendingName = name;

    // بناء modal التأكيد ديناميكياً إذا لم يكن موجوداً
    var existing = document.getElementById('delete-confirm-overlay');
    if (!existing) {
      var el = document.createElement('div');
      el.id = 'delete-confirm-overlay';
      el.innerHTML =
        '<div class="delete-confirm-sheet" id="delete-confirm-sheet">' +
          '<div class="modal-handle"></div>' +
          '<div class="delete-confirm-icon"><i class="fa-solid fa-trash-can"></i></div>' +
          '<div class="delete-confirm-title">تأكيد الحذف</div>' +
          '<div class="delete-confirm-msg" id="delete-confirm-msg"></div>' +
          '<div class="delete-confirm-actions">' +
            '<button class="btn-ghost" onclick="DrugActions.cancel()">إلغاء</button>' +
            '<button class="btn-delete-confirm" onclick="DrugActions.doDelete()">' +
              '<i class="fa-solid fa-trash"></i> حذف نهائياً' +
            '</button>' +
          '</div>' +
        '</div>';
      el.className = 'delete-confirm-overlay';
      el.addEventListener('click', function(e) { if (e.target === el) DrugActions.cancel(); });
      document.body.appendChild(el);
    }

    var msg = document.getElementById('delete-confirm-msg');
    if (msg) msg.innerHTML = 'هل أنت متأكد من حذف <strong>"' + name + '"</strong> نهائياً من المخزن؟<br><small>لا يمكن التراجع عن هذا الإجراء.</small>';

    var overlay = document.getElementById('delete-confirm-overlay');
    overlay.classList.add('open');
  },

  cancel: function() {
    var overlay = document.getElementById('delete-confirm-overlay');
    if (overlay) overlay.classList.remove('open');
    this._pendingId   = null;
    this._pendingName = null;
  },

  doDelete: async function() {
    if (!this._pendingId) return;
    var id   = this._pendingId;
    var name = this._pendingName;
    this.cancel(); // أغلق الـ modal أولاً

    try {
      await DataService.remove(id);

      // أزل الدواء من الحالة المحلية فوراً
      AppState.inventory.drugs = AppState.inventory.drugs.filter(function(d){ return d.id !== id; });
      AppState.inventory.filtered = AppState.inventory.filtered.filter(function(d){ return d.id !== id; });

      // أعد رسم القائمة
      InventoryUI.render(AppState.inventory.filtered, AppState.inventory.searchQuery);
      InventoryUI._updateChipCounts();

      // حدّث الداشبورد إذا كان مفتوحاً
      if (AppState.currentScreen === 'screen-dashboard') {
        DashboardUI.refresh();
      }

      showToast('تم حذف ' + name + ' من المخزن', 'success');
    } catch(e) {
      showToast('خطأ في الحذف: ' + e.message, 'error');
    }
  },
};

/* ══════════════════════════════════════════════════════════════════
   BATCHES UI — إدارة دفعات الدواء في شاشة الإضافة/التعديل
══════════════════════════════════════════════════════════════════ */
var BatchesUI = {
  _batches: [],

  /** تهيئة القائمة بدفعات موجودة أو فارغة */
  init: function(batches) {
    this._batches = (batches || []).map(function(b){ return {id:b.id||'',qty:b.qty||0,expiry:b.expiry||''}; });
    this.render();
  },

  /** إضافة دفعة جديدة فارغة */
  addBatch: function() {
    this._batches.push({ id: 'b-' + Date.now(), qty: 0, expiry: '' });
    this.render();
  },

  /** حذف دفعة بالـ index */
  removeBatch: function(idx) {
    this._batches.splice(idx, 1);
    this.render();
  },

  /** تحديث حقل في دفعة (يُستدعى من oninput — لا يعيد رسم الـ DOM) */
  updateBatch: function(idx, field, value) {
    if (!this._batches[idx]) return;
    this._batches[idx][field] = field === 'qty' ? (parseInt(value) || 0) : value;
    this._updateTotal();
  },

  /** إرجاع قائمة الدفعات */
  getBatches: function() { return this._batches; },

  /** رسم قائمة الدفعات */
  render: function() {
    var container = document.getElementById('batches-list');
    if (!container) return;
    if (!this._batches.length) {
      container.innerHTML = '<div class="batches-empty">لا توجد دفعات — أضف دفعة واحدة على الأقل</div>';
      this._updateTotal();
      return;
    }
    container.innerHTML = this._batches.map(function(b, i) {
      var qtyVal = (b.qty !== undefined && b.qty !== null) ? b.qty : 0;
      return '<div class="batch-row">' +
        '<div class="batch-fields">' +
          '<div class="form-group">' +
            '<label>الكمية</label>' +
            '<div class="input-wrap">' +
              '<i class="fa-solid fa-cubes input-icon"></i>' +
              '<input type="number" min="0" placeholder="0" value="' + qtyVal + '" ' +
                'style="padding-left:12px;direction:ltr;text-align:right;" ' +
                'oninput="BatchesUI.updateBatch(' + i + ',\'qty\',this.value)">' +
            '</div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label>تاريخ الانتهاء</label>' +
            '<div class="input-wrap">' +
              '<i class="fa-solid fa-calendar input-icon"></i>' +
              '<input type="date" value="' + (b.expiry || '') + '" ' +
                'oninput="BatchesUI.updateBatch(' + i + ',\'expiry\',this.value)">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="batch-delete-btn" onclick="BatchesUI.removeBatch(' + i + ')">' +
          '<i class="fa-solid fa-trash"></i>' +
        '</button>' +
      '</div>';
    }).join('');
    this._updateTotal();
  },

  /** تحديث عرض الكمية الإجمالية */
  _updateTotal: function() {
    var totalEl = document.getElementById('batches-total');
    if (!totalEl) return;
    var total = this._batches.reduce(function(s, b){ return s + (b.qty || 0); }, 0);
    totalEl.textContent = 'الإجمالي: ' + total + ' قطعة';
  },
};

/* ══════════════════════════════════════════════════════════════════
   INVOICE UI — تأكيد الفاتورة مع خصم FEFO من الدفعات
══════════════════════════════════════════════════════════════════ */
var InvoiceUI = {
  confirm: async function() {
    var cartList = document.getElementById('cart-list');
    if (!cartList) return;
    var items = cartList.querySelectorAll('.cart-item');
    if (!items.length) { showToast('السلة فارغة', 'warn'); return; }
    try {
      var stockById = {};
      var allDrugs = await DataService.getAll();
      allDrugs.forEach(function(d) { stockById[d.id] = d.qty || 0; });

      var toDeduct = [];
      for (var i = 0; i < items.length; i++) {
        var item  = items[i];
        var drugId = item.dataset.drugId;
        var qty   = parseInt((item.querySelector('.qty-val') || {}).textContent) || 1;
        if (!drugId || !stockById.hasOwnProperty(drugId)) {
          throw new Error('يوجد صنف غير صالح في السلة (Drug ID مفقود)');
        }
        if (qty <= 0) {
          throw new Error('يوجد كمية غير صالحة في السلة');
        }
        if (stockById[drugId] < qty) {
          throw new Error('المخزون غير كافٍ لأحد الأصناف');
        }
        stockById[drugId] -= qty; // تحقق مسبق شامل قبل أي خصم فعلي
        toDeduct.push({ drugId: drugId, qty: qty });
      }

      for (var j = 0; j < toDeduct.length; j++) {
        await DataService.decrementQty(toDeduct[j].drugId, toDeduct[j].qty);
      }
      // تفريغ السلة
      cartList.innerHTML = '';
      updateCartCount();
      calcTotal();
      navigate('screen-invoices');
      showToast('تم حفظ الفاتورة بنجاح ✓', 'success');
    } catch(e) {
      showToast('خطأ في تأكيد الفاتورة: ' + e.message, 'error');
    }
  },
};

/* ══════════════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════════════ */
document.addEventListener('click', function(e) {
  // Period
  if (e.target.classList.contains('period-btn')) {
    document.querySelectorAll('.period-btn').forEach(function(b){b.classList.remove('active');});
    e.target.classList.add('active');
    showToast('عرض تقارير: '+e.target.textContent);
  }
  // Inventory chips
  if (e.target.classList.contains('chip') && !e.target.classList.contains('sugg-chip')) {
    var row = e.target.closest('#screen-inventory .chip-row');
    if (!row) return;
    row.querySelectorAll('.chip').forEach(function(c){c.classList.remove('active');});
    e.target.classList.add('active');
    var text = e.target.textContent.trim();
    var type = 'all';
    if (text.includes('منخفض'))        type='low_stock';
    if (text.includes('ينتهي قريباً')) type='expiring_soon';
    if (text.includes('مضافة اليوم'))  type='added_today';
    InventoryUI.setFilter(type);
  }
  // Eye toggle
  var eyeBtn = e.target.closest('.input-action');
  if (eyeBtn) {
    var inp = eyeBtn.parentElement.querySelector('input');
    if (inp && (inp.type==='password'||inp.type==='text')) {
      inp.type = inp.type==='password'?'text':'password';
      var ic = eyeBtn.querySelector('i');
      if (ic) ic.className = inp.type==='password'?'fa-solid fa-eye':'fa-solid fa-eye-slash';
    }
  }
});

document.addEventListener('input', function(e) {
  if (e.target.id==='inv-search-input') InventoryUI.onSearchInput(e.target.value);
  if (e.target.id==='drug-barcode-input') {
    clearTimeout(AddDrugUI._barcodeTimer);
    var val = e.target.value;
    AddDrugUI._barcodeTimer = setTimeout(function(){ AddDrugUI.checkDuplicateBarcode(val); }, 600);
  }
  if (e.target.id==='drug-buy-input'||e.target.id==='drug-sell-input') _updateProfitPreview();
  if (e.target.closest('.payment-section')) calcTotal();
});

/* ══════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.splash-features span').forEach(function(el,i) {
    el.style.opacity='0'; el.style.transform='translateX(20px)';
    setTimeout(function(){ el.style.transition='all 0.5s ease'; el.style.opacity='1'; el.style.transform='translateX(0)'; }, 600+i*150);
  });
  DataService.getAll().then(function(drugs){ AppState.inventory.drugs = drugs; });

  // الـ nav يبدأ مخفياً في شاشة الـ splash
  var nav = document.getElementById('global-bottom-nav');
  if (nav) nav.style.display = 'none';
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});

document.addEventListener('keydown', function(e) {
  if (e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(function(o){toggleModal(o.id);});
});

/* Cart slide-in animation */
var _cartAnimStyle = document.createElement('style');
_cartAnimStyle.textContent = '@keyframes slideInCart{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
document.head.appendChild(_cartAnimStyle);
