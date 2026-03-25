/* ================================================================
   صيدليتي — DataService  (db.js)
   ─────────────────────────────────────────────────────────────────
   طبقة البيانات المركزية للتطبيق.
   
   الوضع الحالي : Mock data محلية في الذاكرة.
   للتحويل إلى Supabase: استبدل كل دالة في SupabaseAdapter
   بالاستدعاء الحقيقي، ثم ضع الـ adapter بدلاً من LocalAdapter.
   
   بنية الدواء (Drug):
   {
     id:          string (uuid)
     barcode:     string
     name:        string
     category:    string
     company:     string
     minQty:      number   ← حد التنبيه
     buyPrice:    number
     sellPrice:   number
     notes:       string
     createdAt:   string   (ISO)
     updatedAt:   string   (ISO)
     batches: [           ← الدفعات (مصدر qty و expiry)
       { id, qty, expiry }
     ]
     // الحقول التالية مشتقة تلقائياً من batches:
     qty:     number  ← مجموع كميات الدفعات
     expiry:  string  ← أقرب تاريخ انتهاء من دفعة فيها كمية
   }
================================================================ */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   1. MOCK DATA — استبدلها بـ fetch من Supabase لاحقاً
══════════════════════════════════════════════════════════════════ */
const MOCK_DRUGS = [
  {
    id: 'drug-001', barcode: '6912345678901',
    name: 'باراسيتامول 500mg', category: 'مسكن ألم',
    company: 'شركة سامي للأدوية', minQty: 10,
    buyPrice: 2500, sellPrice: 3500, notes: '',
    createdAt: '2025-01-01T08:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
    batches: [
      { id: 'b-001-1', qty: 25, expiry: '2026-08-01' },
      { id: 'b-001-2', qty: 20, expiry: '2026-12-15' },
    ],
  },
  {
    id: 'drug-002', barcode: '6931234567890',
    name: 'أموكسيسيلين 250mg', category: 'مضاد حيوي',
    company: 'فايزر', minQty: 15,
    buyPrice: 5000, sellPrice: 7500, notes: 'يُحفظ في مكان بارد',
    createdAt: '2025-01-05T08:00:00Z', updatedAt: '2026-02-20T09:00:00Z',
    batches: [
      { id: 'b-002-1', qty: 30, expiry: '2026-04-15' },
      { id: 'b-002-2', qty: 22, expiry: '2026-10-01' },
    ],
  },
  {
    id: 'drug-003', barcode: '6901234567890',
    name: 'فيتامين C 1000mg', category: 'فيتامينات',
    company: 'نوفارتس', minQty: 20,
    buyPrice: 3000, sellPrice: 4500, notes: '',
    createdAt: '2025-02-01T08:00:00Z', updatedAt: '2026-03-10T11:00:00Z',
    batches: [
      { id: 'b-003-1', qty: 60, expiry: '2026-06-30' },
      { id: 'b-003-2', qty: 60, expiry: '2027-01-20' },
    ],
  },
  {
    id: 'drug-004', barcode: '4000539014947',
    name: 'ميتفورمين 850mg', category: 'أمراض مزمنة',
    company: 'ميرك', minQty: 20,
    buyPrice: 4200, sellPrice: 6000, notes: '',
    createdAt: '2025-02-10T08:00:00Z', updatedAt: '2026-01-15T08:00:00Z',
    batches: [
      { id: 'b-004-1', qty: 88, expiry: '2027-06-10' },
    ],
  },
  {
    id: 'drug-005', barcode: '5000168206947',
    name: 'أوميبرازول 20mg', category: 'جهاز هضمي',
    company: 'أسترا زينيكا', minQty: 15,
    buyPrice: 3800, sellPrice: 5500, notes: '',
    createdAt: '2025-03-01T08:00:00Z', updatedAt: '2026-03-05T08:00:00Z',
    batches: [
      { id: 'b-005-1', qty: 20, expiry: '2026-09-30' },
      { id: 'b-005-2', qty: 15, expiry: '2027-03-15' },
    ],
  },
  {
    id: 'drug-006', barcode: '3400935558820',
    name: 'لوساتران 50mg', category: 'أمراض قلب',
    company: 'MSD', minQty: 10,
    buyPrice: 6000, sellPrice: 8500, notes: '',
    createdAt: '2025-03-15T08:00:00Z', updatedAt: '2026-02-28T08:00:00Z',
    batches: [
      { id: 'b-006-1', qty: 60, expiry: '2027-03-15' },
    ],
  },
  {
    id: 'drug-007', barcode: '8001072001232',
    name: 'إيبوبروفين 400mg', category: 'مسكن ألم',
    company: 'نوفارتس', minQty: 15,
    buyPrice: 2000, sellPrice: 3000, notes: '',
    createdAt: '2025-04-01T08:00:00Z', updatedAt: '2026-03-18T08:00:00Z',
    batches: [
      { id: 'b-007-1', qty: 8, expiry: '2026-12-01' },
    ],
  },
  {
    id: 'drug-008', barcode: '7501031311309',
    name: 'أسبيرين 100mg', category: 'أمراض قلب',
    company: 'باير', minQty: 30,
    buyPrice: 1800, sellPrice: 2500, notes: '',
    createdAt: '2025-04-10T08:00:00Z', updatedAt: '2026-01-20T08:00:00Z',
    batches: [
      { id: 'b-008-1', qty: 100, expiry: '2026-08-20' },
      { id: 'b-008-2', qty: 100, expiry: '2027-08-20' },
    ],
  },
  {
    id: 'drug-009', barcode: '6935245600023',
    name: 'سيتيريزين 10mg', category: 'حساسية',
    company: 'UCB Pharma', minQty: 10,
    buyPrice: 2500, sellPrice: 3800, notes: '',
    createdAt: '2025-05-01T08:00:00Z', updatedAt: '2026-03-01T08:00:00Z',
    batches: [
      { id: 'b-009-1', qty: 5, expiry: '2026-05-10' },
    ],
  },
  {
    id: 'drug-010', barcode: '4811501100100',
    name: 'ديكلوفيناك 50mg', category: 'مسكن ألم',
    company: 'نوفارتس', minQty: 20,
    buyPrice: 2800, sellPrice: 4200, notes: '',
    createdAt: '2025-05-15T08:00:00Z', updatedAt: '2026-02-10T08:00:00Z',
    batches: [
      { id: 'b-010-1', qty: 40, expiry: '2026-07-15' },
      { id: 'b-010-2', qty: 35, expiry: '2027-02-28' },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════
   2. LOCAL ADAPTER — الحالي (بيانات في الذاكرة)
══════════════════════════════════════════════════════════════════ */
const LocalAdapter = (() => {
  // Runtime drug list — يبدأ بالـ mock ثم يتراكم التعديلات
  let _drugs = MOCK_DRUGS.map(d => ({ ...d, batches: (d.batches || []).map(b => ({...b})) }));
  // Runtime invoices list — تخزين محلي في الذاكرة
  let _invoices = [];

  function _uid() {
    return 'drug-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function _batchUid() {
    return 'b-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function _invoiceUid() {
    return 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * يحسب qty و expiry من الدفعات ويعيدها كحقول مشتقة.
   * كل الكود الخارجي يستمر بقراءة d.qty و d.expiry كما هو.
   */
  function _normalizeDrug(d) {
    const batches = d.batches || [];
    const qty = batches.reduce((s, b) => s + (b.qty || 0), 0);
    // أقرب تاريخ انتهاء من الدفعات التي فيها كمية
    const activeBatches = batches
      .filter(b => b.qty > 0 && b.expiry)
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
    // إذا كل الدفعات فارغة، خذ أقرب تاريخ موجود
    const expiry = activeBatches.length
      ? activeBatches[0].expiry
      : (batches.filter(b => b.expiry)[0] || {}).expiry || '';
    return { ...d, qty, expiry };
  }

  return {
    /** جلب كل الأدوية */
    async getAll() {
      return _drugs.map(d => _normalizeDrug({ ...d, batches: d.batches.map(b=>({...b})) }));
    },

    /** البحث بالباركود */
    async findByBarcode(barcode) {
      const d = _drugs.find(d => d.barcode === barcode.trim());
      return d ? _normalizeDrug({ ...d, batches: d.batches.map(b=>({...b})) }) : null;
    },

    /** البحث النصي — اسم / باركود / شركة / تصنيف */
    async search(query) {
      const q = query.trim().toLowerCase();
      const normalized = _drugs.map(d => _normalizeDrug({ ...d, batches: d.batches.map(b=>({...b})) }));
      if (!q) return normalized;
      return normalized.filter(d =>
        d.name.toLowerCase().includes(q)    ||
        d.barcode.includes(q)               ||
        d.company.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
      );
    },

    /** فلترة الأدوية */
    async filter(type) {
      const today = new Date();
      const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const normalized = _drugs.map(d => _normalizeDrug({ ...d, batches: d.batches.map(b=>({...b})) }));
      switch (type) {
        case 'low_stock':
          return normalized.filter(d => d.qty <= d.minQty);
        case 'expiring_soon':
          return normalized.filter(d => {
            const exp = new Date(d.expiry);
            return exp >= today && exp <= in30Days;
          });
        case 'added_today':
          return normalized.filter(d => {
            const created = new Date(d.createdAt);
            return created.toDateString() === today.toDateString();
          });
        default:
          return normalized;
      }
    },

    /** فحص تكرار الباركود */
    async isDuplicateBarcode(barcode, excludeId = null) {
      return _drugs.some(d =>
        d.barcode === barcode.trim() &&
        d.id !== excludeId
      );
    },

    /** إضافة دواء جديد */
    async add(drugData) {
      const batches = (drugData.batches || []).map(b => ({
        id: b.id || _batchUid(),
        qty: b.qty || 0,
        expiry: b.expiry || '',
      }));
      const drug = {
        ...drugData,
        batches,
        id:        _uid(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      _drugs.push(drug);
      return _normalizeDrug({ ...drug, batches: drug.batches.map(b=>({...b})) });
    },

    /** تعديل دواء موجود */
    async update(id, changes) {
      const idx = _drugs.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('الدواء غير موجود');
      const updated = { ..._drugs[idx], ...changes, updatedAt: new Date().toISOString() };
      // إذا أُرسلت batches جديدة، احفظها بشكل صحيح
      if (changes.batches) {
        updated.batches = changes.batches.map(b => ({
          id: b.id || _batchUid(),
          qty: b.qty || 0,
          expiry: b.expiry || '',
        }));
      }
      _drugs[idx] = updated;
      return _normalizeDrug({ ...updated, batches: updated.batches.map(b=>({...b})) });
    },

    /** حذف دواء */
    async remove(id) {
      const idx = _drugs.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('الدواء غير موجود');
      _drugs.splice(idx, 1);
      return true;
    },

    /**
     * تخفيض المخزون عند البيع — FEFO
     * يبدأ من الدفعة الأقرب انتهاء أولاً
     */
    async decrementQty(id, amount = 1) {
      const idx = _drugs.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('الدواء غير موجود');
      if (amount <= 0) throw new Error('الكمية المطلوبة غير صالحة');
      const availableQty = (_drugs[idx].batches || []).reduce((s, b) => s + (b.qty || 0), 0);
      if (availableQty < amount) throw new Error('المخزون غير كافٍ');
      // ترتيب الدفعات حسب الأقرب انتهاء أولاً (FEFO)
      const sorted = _drugs[idx].batches
        .filter(b => b.qty > 0)
        .sort((a, b) => a.expiry.localeCompare(b.expiry));
      const batchAllocation = [];
      let remaining = amount;
      for (const sortedBatch of sorted) {
        if (remaining <= 0) break;
        const orig = _drugs[idx].batches.find(b => b.id === sortedBatch.id);
        if (!orig) continue;
        const take = Math.min(orig.qty, remaining);
        orig.qty -= take;
        if (take > 0) {
          batchAllocation.push({ batchId: orig.id, qty: take });
        }
        remaining -= take;
      }
      _drugs[idx].updatedAt = new Date().toISOString();
      return {
        drug: _normalizeDrug({ ..._drugs[idx], batches: _drugs[idx].batches.map(b => ({ ...b })) }),
        batchAllocation,
      };
    },

    /** حفظ فاتورة مؤكدة في التخزين المحلي */
    async createInvoice(payload) {
      const now = new Date().toISOString();
      const invoice = {
        id: _invoiceUid(),
        status: 'confirmed',
        confirmedAt: now,
        refundedAt: null,
        ...payload,
      };
      _invoices.unshift(JSON.parse(JSON.stringify(invoice)));
      return JSON.parse(JSON.stringify(invoice));
    },

    /** جلب الفواتير من التخزين المحلي */
    async getInvoices() {
      return JSON.parse(JSON.stringify(_invoices));
    },

    /** استرجاع فاتورة مؤكدة: يعيد الكميات لنفس batch IDs */
    async refundInvoice(invoiceId) {
      const idx = _invoices.findIndex(inv => inv.id === invoiceId);
      if (idx === -1) throw new Error('الفاتورة غير موجودة');

      const invoice = _invoices[idx];
      if (invoice.status !== 'confirmed') {
        if (invoice.status === 'refunded') throw new Error('تم استرجاع هذه الفاتورة مسبقاً');
        throw new Error('يمكن استرجاع الفواتير المؤكدة فقط');
      }

      (invoice.items || []).forEach(item => {
        const drugIdx = _drugs.findIndex(d => d.id === item.drugId);
        if (drugIdx === -1) throw new Error('تعذر العثور على دواء ضمن الفاتورة');

        (item.batchAllocation || []).forEach(alloc => {
          const batch = (_drugs[drugIdx].batches || []).find(b => b.id === alloc.batchId);
          if (!batch) throw new Error('تعذر العثور على الدفعة الأصلية للاسترجاع');
          batch.qty = (batch.qty || 0) + (alloc.qty || 0);
        });

        _drugs[drugIdx].updatedAt = new Date().toISOString();
      });

      invoice.status = 'refunded';
      invoice.refundedAt = new Date().toISOString();
      _invoices[idx] = invoice;
      return JSON.parse(JSON.stringify(invoice));
    },

    /** إحصائيات للـ Dashboard */
    async getStats() {
      const today = new Date();
      const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const normalized = _drugs.map(d => _normalizeDrug({...d}));
      return {
        totalDrugs:    normalized.length,
        lowStock:      normalized.filter(d => d.qty <= d.minQty).length,
        expiringSoon:  normalized.filter(d => {
          const exp = new Date(d.expiry);
          return exp >= today && exp <= in30Days;
        }).length,
        outOfStock:    normalized.filter(d => d.qty === 0).length,
      };
    },
  };
})();

/* ══════════════════════════════════════════════════════════════════
   3. SUPABASE ADAPTER — جاهز للتفعيل
   ─────────────────────────────────────────────────────────────────
   لتفعيل Supabase:
   1. npm install @supabase/supabase-js
   2. أضف SUPABASE_URL و SUPABASE_ANON_KEY
   3. فعّل السطر: DataService.setAdapter(SupabaseAdapter)
══════════════════════════════════════════════════════════════════ */
/*
const SupabaseAdapter = (() => {
  const { createClient } = supabase;
  const client = createClient(
    'YOUR_SUPABASE_URL',
    'YOUR_SUPABASE_ANON_KEY'
  );
  const TABLE = 'drugs';

  return {
    async getAll() {
      const { data, error } = await client.from(TABLE).select('*').order('name');
      if (error) throw error;
      return data;
    },

    async findByBarcode(barcode) {
      const { data, error } = await client
        .from(TABLE).select('*').eq('barcode', barcode).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },

    async search(query) {
      const { data, error } = await client
        .from(TABLE).select('*')
        .or(`name.ilike.%${query}%,barcode.ilike.%${query}%,company.ilike.%${query}%`);
      if (error) throw error;
      return data;
    },

    async filter(type) {
      let q = client.from(TABLE).select('*');
      if (type === 'low_stock')     q = q.lte('qty', 'min_qty');
      // expiring_soon requires RPC or computed column
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    async isDuplicateBarcode(barcode, excludeId = null) {
      let q = client.from(TABLE).select('id').eq('barcode', barcode);
      if (excludeId) q = q.neq('id', excludeId);
      const { data, error } = await q;
      if (error) throw error;
      return data.length > 0;
    },

    async add(drugData) {
      const { data, error } = await client.from(TABLE).insert(drugData).select().single();
      if (error) throw error;
      return data;
    },

    async update(id, changes) {
      const { data, error } = await client
        .from(TABLE).update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async remove(id) {
      const { error } = await client.from(TABLE).delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    async decrementQty(id, amount = 1) {
      const { data: current } = await client.from(TABLE).select('qty').eq('id', id).single();
      return this.update(id, { qty: Math.max(0, current.qty - amount) });
    },

    async getStats() {
      const { data, error } = await client.rpc('get_inventory_stats');
      if (error) throw error;
      return data;
    },
  };
})();
*/

/* ══════════════════════════════════════════════════════════════════
   4. DataService — الواجهة العامة للتطبيق
   ─────────────────────────────────────────────────────────────────
   كل الكود يستدعي DataService وليس LocalAdapter مباشرة.
   عند التحويل لـ Supabase: DataService.setAdapter(SupabaseAdapter)
══════════════════════════════════════════════════════════════════ */
const DataService = (() => {
  let _adapter = LocalAdapter;

  return {
    /** تغيير الـ adapter (local → Supabase) */
    setAdapter(adapter) { _adapter = adapter; },

    /** Drugs CRUD */
    getAll:             (...a) => _adapter.getAll(...a),
    findByBarcode:      (...a) => _adapter.findByBarcode(...a),
    search:             (...a) => _adapter.search(...a),
    filter:             (...a) => _adapter.filter(...a),
    isDuplicateBarcode: (...a) => _adapter.isDuplicateBarcode(...a),
    add:                (...a) => _adapter.add(...a),
    update:             (...a) => _adapter.update(...a),
    remove:             (...a) => _adapter.remove(...a),
    decrementQty:       (...a) => _adapter.decrementQty(...a),
    getStats:           (...a) => _adapter.getStats(...a),
    createInvoice:      (...a) => _adapter.createInvoice(...a),
    getInvoices:        (...a) => _adapter.getInvoices(...a),
    refundInvoice:      (...a) => _adapter.refundInvoice(...a),
  };
})();

/* ══════════════════════════════════════════════════════════════════
   5. AppState — حالة التطبيق المركزية
══════════════════════════════════════════════════════════════════ */
const AppState = {
  currentScreen:    'screen-splash',
  history:          [],

  /* آخر باركود ممسوح — يُمرَّر بين الشاشات */
  pendingBarcode:   null,
  pendingDrugName:  null,

  /* المخزن */
  inventory: {
    drugs:         [],      // القائمة الكاملة
    filtered:      [],      // بعد الفلترة
    activeFilter:  'all',   // 'all' | 'low_stock' | 'expiring_soon' | 'added_today'
    searchQuery:   '',
  },

  /* الفاتورة الحالية */
  cart: {
    items: [],              // { drug, qty, unitPrice, subtotal }
    discount: 0,
    paymentMethod: 'cash',
    customerName: '',
  },

  /** حفظ باركود ممسوح لنقله بين الشاشات */
  setPendingBarcode(barcode, drugName = null) {
    this.pendingBarcode  = barcode;
    this.pendingDrugName = drugName;
  },

  /** استهلاك الباركود المُعلَّق وتنظيفه */
  consumePendingBarcode() {
    const b = this.pendingBarcode;
    this.pendingBarcode  = null;
    this.pendingDrugName = null;
    return b;
  },
};
