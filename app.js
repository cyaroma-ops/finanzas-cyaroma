/* ============================================================
   FINANZAS — CONTROL MULTI-NEGOCIO
   Núcleo: auth, estado global, negocios, navegación, utilidades
   ============================================================ */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATE = {
  user: null,
  businesses: [],
  currentBusinessId: null,
  currentSection: 'dashboard',
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
};

/* ---------- Utilidades ---------- */
const fmt = (n) => {
  n = Number(n) || 0;
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
};
const fmtNum = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end };
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
function toast(msg, kind) {
  let t = document.getElementById('toastBox');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toastBox';
    t.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:400;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(t);
  }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `background:${kind === 'error' ? '#c94a4a' : '#0a1f3d'};color:#fff;padding:12px 18px;border-radius:9px;font-size:13.5px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:fade .25s;`;
  t.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function biz() {
  return STATE.businesses.find(b => b.id === STATE.currentBusinessId) || null;
}

/* ---------- Enter avanza a la siguiente celda (como en una hoja de cálculo) ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (!(t.matches && (t.matches('input.cell') || t.matches('select.cell')))) return;
  const table = t.closest('table');
  if (!table) return;
  const focusables = Array.from(table.querySelectorAll('input.cell, select.cell'));
  const idx = focusables.indexOf(t);
  if (idx > -1 && idx < focusables.length - 1) {
    e.preventDefault();
    const next = focusables[idx + 1];
    next.focus();
    if (next.select) next.select();
  }
});

/* ---------- AUTH ---------- */
async function checkSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    STATE.user = data.session.user;
    await boot();
  }
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'Ingresa tu correo y contraseña.'; return; }
  const btn = document.getElementById('loginBtn');
  btn.textContent = 'Entrando...'; btn.disabled = true;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.textContent = 'Entrar'; btn.disabled = false;
  if (error) { errEl.textContent = 'Correo o contraseña incorrectos.'; return; }
  STATE.user = data.user;
  await boot();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});
document.getElementById('deniedLogoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

/* ---------- CONTROL DE ACCESO ---------- */
async function checkAcceso(email) {
  const { data, error } = await sb.from('fz_usuarios_autorizados').select('*').ilike('email', email).limit(1);
  if (error) { toast('Error verificando acceso: ' + error.message, 'error'); return false; }
  const row = data?.[0];
  return !!(row && row.activo !== false);
}

/* ---------- BOOT ---------- */
async function boot() {
  const autorizado = await checkAcceso(STATE.user.email);
  if (!autorizado) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('deniedEmail').textContent = STATE.user.email;
    document.getElementById('accessDeniedScreen').style.display = 'flex';
    return;
  }

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('userEmail').textContent = STATE.user.email;
  document.getElementById('monthPicker').value = STATE.currentMonth;

  await loadBusinesses();
  setupNav();
  setupBizControls();
  setupUsuariosControls();

  document.getElementById('monthPicker').addEventListener('change', (e) => {
    STATE.currentMonth = e.target.value;
    renderCurrentSection();
  });

  renderCurrentSection();
}

/* ---------- USUARIOS AUTORIZADOS ---------- */
function setupUsuariosControls() {
  document.getElementById('openUsuariosBtn').addEventListener('click', openUsuariosModal);
}
async function loadUsuariosAutorizados() {
  const { data, error } = await sb.from('fz_usuarios_autorizados').select('*').order('email');
  if (error) { toast('Error: ' + error.message, 'error'); return []; }
  return data || [];
}
async function openUsuariosModal() {
  await renderUsuariosList();
  document.getElementById('modalUsuarios').classList.add('show');
  document.getElementById('closeUsuarios').onclick = () => document.getElementById('modalUsuarios').classList.remove('show');
  document.getElementById('saveUsuario').onclick = async () => {
    const email = document.getElementById('newUsuarioEmail').value.trim().toLowerCase();
    const nombre = document.getElementById('newUsuarioNombre').value.trim();
    if (!email) { toast('Escribe un correo.', 'error'); return; }
    const { error } = await sb.from('fz_usuarios_autorizados').insert({ email, nombre: nombre || null });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newUsuarioEmail').value = '';
    document.getElementById('newUsuarioNombre').value = '';
    renderUsuariosList();
  };
}
async function renderUsuariosList() {
  const usuarios = await loadUsuariosAutorizados();
  const box = document.getElementById('usuariosList');
  if (!usuarios.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Sin usuarios autorizados todavía.</div>`; return; }
  box.innerHTML = usuarios.map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--line);gap:10px;">
      <div style="min-width:0;">
        <strong>${u.email}</strong>${u.email.toLowerCase()===STATE.user.email.toLowerCase()?' <span style="color:var(--muted);font-size:11px;">(tú)</span>':''}
        ${u.nombre ? `<div style="color:var(--muted);font-size:12px;">${u.nombre}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);cursor:pointer;">
          <input type="checkbox" class="usuario-activo" data-id="${u.id}" ${u.activo!==false?'checked':''}> Activo
        </label>
        <button class="row-del usuario-del" data-id="${u.id}" style="font-size:15px;">✕</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.usuario-activo').forEach(chk => chk.addEventListener('change', async () => {
    await sb.from('fz_usuarios_autorizados').update({ activo: chk.checked }).eq('id', chk.dataset.id);
    renderUsuariosList();
  }));
  box.querySelectorAll('.usuario-del').forEach(btn => btn.addEventListener('click', async () => {
    if (usuarios.length <= 1) { toast('Debe quedar al menos un usuario autorizado.', 'error'); return; }
    await sb.from('fz_usuarios_autorizados').delete().eq('id', btn.dataset.id);
    renderUsuariosList();
  }));
}

/* ---------- NEGOCIOS ---------- */
async function loadBusinesses() {
  const { data, error } = await sb.from('businesses').select('*').order('name');
  if (error) { toast('Error cargando negocios: ' + error.message, 'error'); return; }
  STATE.businesses = data || [];
  if (!STATE.businesses.length) return;
  if (!STATE.currentBusinessId || !STATE.businesses.find(b => b.id === STATE.currentBusinessId)) {
    STATE.currentBusinessId = STATE.businesses.filter(b => b.active !== false)[0]?.id || STATE.businesses[0].id;
  }
  renderBizSelect();
}

function renderBizSelect() {
  const sel = document.getElementById('bizSelect');
  sel.innerHTML = STATE.businesses
    .filter(b => b.active !== false)
    .map(b => `<option value="${b.id}" ${b.id === STATE.currentBusinessId ? 'selected' : ''}>${b.name}</option>`)
    .join('');
}

function setupBizControls() {
  document.getElementById('bizSelect').addEventListener('change', (e) => {
    STATE.currentBusinessId = e.target.value;
    renderCurrentSection();
  });
  document.getElementById('addBizBtn').addEventListener('click', () => {
    document.getElementById('newBizName').value = '';
    document.getElementById('modalBiz').classList.add('show');
  });
  document.getElementById('cancelBiz').addEventListener('click', () => {
    document.getElementById('modalBiz').classList.remove('show');
  });
  document.getElementById('saveBiz').addEventListener('click', async () => {
    const name = document.getElementById('newBizName').value.trim();
    if (!name) { toast('Escribe un nombre.', 'error'); return; }
    const { data, error } = await sb.from('businesses').insert({ name, active: true }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('modalBiz').classList.remove('show');
    await loadBusinesses();
    STATE.currentBusinessId = data.id;
    renderBizSelect();
    document.getElementById('bizSelect').value = data.id;
    renderCurrentSection();
    toast('Negocio agregado.');
  });
}

/* ---------- NAVEGACIÓN ---------- */
const SECTION_META = {
  dashboard: { title: 'Dashboard', sub: 'Vista consolidada de todos los negocios', showMonth: true, needsBiz: false },
  ventas: { title: 'Ventas', sub: '', showMonth: true, needsBiz: true },
  efectivo: { title: 'Efectivo & Divisas', sub: '', showMonth: false, needsBiz: true },
  bancos: { title: 'Bancos', sub: '', showMonth: false, needsBiz: true },
  proveedores: { title: 'Proveedores', sub: '', showMonth: false, needsBiz: true },
  pl: { title: 'P&L', sub: '', showMonth: true, needsBiz: true },
  flujo: { title: 'Flujo de Efectivo', sub: '', showMonth: false, needsBiz: true },
  polizas: { title: 'Pólizas de Diario', sub: '', showMonth: false, needsBiz: true },
};

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      STATE.currentSection = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('sec-' + STATE.currentSection).classList.add('active');
      updateTopbar();
      renderCurrentSection();
    });
  });
  document.querySelector('.nav-item[data-section="dashboard"]').classList.add('active');
}

const SECCIONES_IMPRIMIBLES = ['efectivo', 'bancos', 'pl', 'flujo'];

function updateTopbar() {
  const meta = SECTION_META[STATE.currentSection];
  const b = biz();
  const titulo = meta.title + (meta.needsBiz && b ? ' — ' + b.name : '');
  document.getElementById('pageTitle').textContent = titulo;
  document.getElementById('pageSub').textContent = meta.sub;
  document.getElementById('monthPicker').style.display = meta.showMonth ? 'block' : 'none';

  const printBtn = document.getElementById('printBtn');
  if (SECCIONES_IMPRIMIBLES.includes(STATE.currentSection)) {
    printBtn.style.display = 'inline-flex';
    printBtn.onclick = () => {
      document.getElementById('printTitle').textContent = titulo;
      document.getElementById('printSub').textContent = `${meta.showMonth ? STATE.currentMonth + ' · ' : ''}Impreso el ${new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' })}`;
      window.print();
    };
  } else {
    printBtn.style.display = 'none';
  }
}

function renderCurrentSection() {
  updateTopbar();
  const s = STATE.currentSection;
  if (s === 'dashboard') renderDashboard();
  if (s === 'ventas') renderVentas();
  if (s === 'efectivo') renderEfectivo();
  if (s === 'bancos') renderBancos();
  if (s === 'proveedores') renderProveedores();
  if (s === 'pl') renderPL();
  if (s === 'flujo') renderFlujo();
  if (s === 'polizas') renderPolizas();
}

/* ============================================================
   RESUMEN FINANCIERO POR NEGOCIO
   (usado por Dashboard consolidado y por Flujo de Efectivo)
   ============================================================ */
function totalVentaDinamico(v, conceptosVenta) {
  const vd = v.venta_data || {};
  let total = 0;
  conceptosVenta.forEach(c => {
    const val = Number(vd[c.id]) || 0;
    total += c.tipo === 'resta' ? -val : val;
  });
  return total;
}

function conceptosParaMoneda(moneda, conceptosEfectivo) {
  const porId = conceptosEfectivo.filter(c => c.moneda_id === moneda.id);
  if (porId.length) return porId;
  // respaldo: conceptos creados antes de que existiera el vínculo explícito
  return conceptosEfectivo.filter(c => !c.moneda_id && c.nombre.trim().toLowerCase() === moneda.nombre.trim().toLowerCase());
}

async function computeMonedaSaldo(businessId, moneda, conceptosEfectivo) {
  const concepts = conceptosParaMoneda(moneda, conceptosEfectivo);
  let autoDepositos = 0;
  if (concepts.length) {
    const { data: allVentas } = await sb.from('fz_ventas').select('recon_data').eq('business_id', businessId);
    (allVentas || []).forEach(v => {
      concepts.forEach(concepto => {
        const entry = (v.recon_data || {})[concepto.id];
        if (entry) autoDepositos += Number(entry.monto) || 0; // valor en la moneda tal cual, sin convertir
      });
    });
  }
  const { data: movs } = await sb.from('fz_efectivo_mov').select('depositos,cargos').eq('moneda_id', moneda.id);
  const manualNet = (movs || []).reduce((s, m) => s + (Number(m.depositos) || 0) - (Number(m.cargos) || 0), 0);
  return (Number(moneda.saldo_inicial) || 0) + autoDepositos + manualNet;
}

/* ---------- Vinculación Tarjetas (Ventas) → Cuenta bancaria ---------- */
function conceptosParaBanco(cuenta, conceptosTarjetas) {
  return conceptosTarjetas.filter(c => c.banco_cuenta_id === cuenta.id);
}
async function computeBancoSaldo(businessId, cuenta, conceptosTarjetas) {
  const concepts = conceptosParaBanco(cuenta, conceptosTarjetas);
  let autoDepositos = 0;
  if (concepts.length) {
    const { data: allVentas } = await sb.from('fz_ventas').select('recon_data').eq('business_id', businessId);
    (allVentas || []).forEach(v => {
      concepts.forEach(concepto => {
        const entry = (v.recon_data || {})[concepto.id];
        if (entry) autoDepositos += Number(entry.monto) || 0;
      });
    });
  }
  const { data: movs } = await sb.from('fz_bancos_mov').select('depositos,cargos').eq('cuenta_id', cuenta.id);
  const manualNet = (movs || []).reduce((s, m) => s + (Number(m.depositos) || 0) - (Number(m.cargos) || 0), 0);
  return (Number(cuenta.saldo_inicial) || 0) + autoDepositos + manualNet;
}
async function getBancoLedgerRows(businessId, cuenta, conceptosTarjetas) {
  const concepts = conceptosParaBanco(cuenta, conceptosTarjetas);
  const autoRows = [];
  if (concepts.length) {
    const { data: ventas } = await sb.from('fz_ventas').select('id,fecha,recon_data').eq('business_id', businessId).order('fecha');
    (ventas || []).forEach(v => {
      concepts.forEach(concepto => {
        const entry = (v.recon_data || {})[concepto.id];
        if (entry && Number(entry.monto)) {
          autoRows.push({ id: 'auto-' + v.id + '-' + concepto.id, fecha: v.fecha, descripcion: `Tarjetas conciliadas en Ventas (${concepto.nombre})`, concepto: 'Corte de caja', cargos: 0, depositos: Number(entry.monto) || 0, auto: true });
        }
      });
    });
  }
  const { data: movs } = await sb.from('fz_bancos_mov').select('*').eq('cuenta_id', cuenta.id).order('fecha');
  const manualRows = (movs || []).map(m => ({ ...m, auto: false }));
  return [...autoRows, ...manualRows].sort((a, b) => a.fecha.localeCompare(b.fecha));
}


async function computeBusinessSummary(businessId, ym) {
  const { start, end } = monthBounds(ym);

  const [ventasMesQ, conceptosVentaQ, conceptosQ, monedasQ, cuentasQ, provQ] = await Promise.all([
    sb.from('fz_ventas').select('*').eq('business_id', businessId).gte('fecha', start).lte('fecha', end),
    sb.from('fz_conceptos_venta').select('*').eq('business_id', businessId),
    sb.from('fz_conceptos').select('*').eq('business_id', businessId),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId),
    sb.from('fz_proveedores').select('*').eq('business_id', businessId),
  ]);

  const ventasMesRows = ventasMesQ.data || [];
  const conceptosVenta = conceptosVentaQ.data || [];
  const conceptos = conceptosQ.data || [];
  const conceptosEfectivo = conceptos.filter(c => c.categoria === 'efectivo');
  const conceptosTarjetas = conceptos.filter(c => c.categoria === 'tarjetas');

  const ventasMes = ventasMesRows.reduce((s, v) => s + totalVentaDinamico(v, conceptosVenta), 0);
  const gastosOperativosMes = ventasMesRows.reduce((s, v) => s + (Number(v.gastos) || 0), 0);

  const monedas = (monedasQ.data || []).filter(m => m.activo !== false);
  let efectivoTotal = 0;
  const efectivoDetalle = [];
  for (const m of monedas) {
    const saldo = await computeMonedaSaldo(businessId, m, conceptosEfectivo);
    const pesoEquiv = saldo * (Number(m.tc_reporte) || 1);
    efectivoTotal += pesoEquiv;
    efectivoDetalle.push({ nombre: m.nombre, saldo, tc: m.tc_reporte, pesoEquiv });
  }

  const cuentas = cuentasQ.data || [];
  let bancosTotal = 0;
  const bancosDetalle = [];
  for (const c of cuentas) {
    const saldo = await computeBancoSaldo(businessId, c, conceptosTarjetas);
    if (c.activo !== false) bancosTotal += saldo;
    bancosDetalle.push({ nombre: c.nombre, saldo, activo: c.activo !== false });
  }

  const prov = provQ.data || [];
  const proveedoresPendientes = prov.filter(p => p.estatus === 'Pendiente').reduce((s, p) => s + (Number(p.importe) || 0), 0);

  const posicionNeta = efectivoTotal + bancosTotal - proveedoresPendientes;

  return { ventasMes, gastosOperativosMes, efectivoTotal, efectivoDetalle, bancosTotal, bancosDetalle, proveedoresPendientes, posicionNeta };
}

/* ============================================================
   DASHBOARD CONSOLIDADO
   ============================================================ */
let dashChart1 = null, dashChart2 = null;

async function renderDashboard() {
  const el = document.getElementById('sec-dashboard');
  el.innerHTML = `<div class="empty">Calculando resumen de todos los negocios…</div>`;

  const activos = STATE.businesses.filter(b => b.active !== false);
  const rows = [];
  for (const b of activos) {
    const s = await computeBusinessSummary(b.id, STATE.currentMonth);
    rows.push({ biz: b, ...s });
  }

  const totVentas = rows.reduce((s, r) => s + r.ventasMes, 0);
  const totEfectivo = rows.reduce((s, r) => s + r.efectivoTotal, 0);
  const totBancos = rows.reduce((s, r) => s + r.bancosTotal, 0);
  const totProv = rows.reduce((s, r) => s + r.proveedoresPendientes, 0);
  const totNeta = totEfectivo + totBancos - totProv;

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Ventas del mes (todos)</div><div class="value num">${fmt(totVentas)}</div></div>
      <div class="kpi"><div class="label">Efectivo en caja (todos)</div><div class="value num">${fmt(totEfectivo)}</div></div>
      <div class="kpi"><div class="label">Saldo en bancos (todos)</div><div class="value num">${fmt(totBancos)}</div></div>
      <div class="kpi"><div class="label">Proveedores pendientes</div><div class="value num red">${fmt(totProv)}</div></div>
      <div class="kpi"><div class="label">Posición neta consolidada</div><div class="value num ${totNeta >= 0 ? 'green' : 'red'}">${fmt(totNeta)}</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Ventas del mes por negocio</h3>
        <span class="hint">${STATE.currentMonth}</span>
      </div>
      <canvas id="chartVentasNegocio" height="90"></canvas>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Composición de liquidez</h3>
        <span class="hint">Efectivo vs. Bancos vs. Pendiente a proveedores</span>
      </div>
      <div style="max-width:340px;margin:0 auto;"><canvas id="chartComposicion"></canvas></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Detalle por negocio</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Negocio</th><th>Ventas mes</th><th>Efectivo</th><th>Bancos</th><th>Prov. pendientes</th><th>Posición neta</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${r.biz.name}</strong></td>
                <td class="num">${fmt(r.ventasMes)}</td>
                <td class="num">${fmt(r.efectivoTotal)}</td>
                <td class="num">${fmt(r.bancosTotal)}</td>
                <td class="num" style="color:${r.proveedoresPendientes > 0 ? 'var(--red)' : 'inherit'}">${fmt(r.proveedoresPendientes)}</td>
                <td class="num" style="font-weight:800;color:${r.posicionNeta >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(r.posicionNeta)}</td>
              </tr>`).join('')}
            <tr class="total-row">
              <td>TOTAL</td>
              <td class="num">${fmt(totVentas)}</td>
              <td class="num">${fmt(totEfectivo)}</td>
              <td class="num">${fmt(totBancos)}</td>
              <td class="num">${fmt(totProv)}</td>
              <td class="num">${fmt(totNeta)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (dashChart1) dashChart1.destroy();
  if (dashChart2) dashChart2.destroy();

  dashChart1 = new Chart(document.getElementById('chartVentasNegocio'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.biz.name),
      datasets: [{ label: 'Ventas', data: rows.map(r => r.ventasMes), backgroundColor: '#123a70', borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => fmt(v) } } } }
  });

  dashChart2 = new Chart(document.getElementById('chartComposicion'), {
    type: 'doughnut',
    data: {
      labels: ['Efectivo', 'Bancos', 'Prov. pendientes'],
      datasets: [{ data: [totEfectivo, totBancos, totProv], backgroundColor: ['#1f9d6b', '#123a70', '#c94a4a'] }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

/* ============================================================
   VENTAS  +  CONCILIACIÓN — todo en UNA sola tabla horizontal
   ============================================================ */
const SISTEMA_COLS = [
  ['efectivo_sistema', 'Efectivo (sistema)'], ['tarjetas_sistema', 'Tarjetas (sistema)'],
  ['cxc', 'CxC (sistema)'], ['gastos', 'Gastos del día'],
];
const CAT_LABEL = { efectivo: 'Efectivo', tarjetas: 'Tarjetas', cxc: 'CxC', propinas: 'Propinas' };
const conceptoValor = (concepto, entry) => {
  if (!entry) return 0;
  return concepto.es_moneda ? (Number(entry.monto)||0) * (Number(entry.tc)||0) : (Number(entry.monto)||0);
};

// Diferencia = (Sistema + Propinas del medio) − Recibido. Gastos solo afectan la de Efectivo.
function computeRowDiffs(r, conceptosVenta, porCat) {
  const rd = r.recon_data || {};
  const totalVenta = totalVentaDinamico(r, conceptosVenta);
  const totalEfvo = porCat.efectivo.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalTarj = porCat.tarjetas.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalCxc = porCat.cxc.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalProp = porCat.propinas.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const propEfvo = porCat.propinas.filter(c=>(c.medio||'efectivo')==='efectivo').reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const propTarj = porCat.propinas.filter(c=>c.medio==='tarjetas').reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const gastos = Number(r.gastos)||0;
  const difEfvo = ((Number(r.efectivo_sistema)||0) + propEfvo) - totalEfvo - gastos;
  const difTarj = ((Number(r.tarjetas_sistema)||0) + propTarj) - totalTarj;
  const difCxc = (Number(r.cxc)||0) - totalCxc;
  const difTotal = difEfvo + difTarj + difCxc;
  return { totalVenta, totalEfvo, totalTarj, totalCxc, totalProp, propEfvo, propTarj, difEfvo, difTarj, difCxc, difTotal };
}

async function loadConceptosVenta(businessId) {
  const { data, error } = await sb.from('fz_conceptos_venta').select('*').eq('business_id', businessId).order('orden');
  if (error) { toast('Error cargando categorías de venta: ' + error.message, 'error'); return []; }
  return data || [];
}
async function loadConceptos(businessId) {
  const { data, error } = await sb.from('fz_conceptos').select('*').eq('business_id', businessId).order('categoria').order('orden');
  if (error) { toast('Error cargando conceptos: ' + error.message, 'error'); return []; }
  return data || [];
}

async function renderVentas() {
  const el = document.getElementById('sec-ventas');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const { start, end } = monthBounds(STATE.currentMonth);
  const [ventasQ, conceptosVenta, conceptos] = await Promise.all([
    sb.from('fz_ventas').select('*').eq('business_id', b.id).gte('fecha', start).lte('fecha', end).order('fecha'),
    loadConceptosVenta(b.id),
    loadConceptos(b.id),
  ]);
  if (ventasQ.error) { el.innerHTML = `<div class="empty">Error: ${ventasQ.error.message}</div>`; return; }
  const rows = ventasQ.data || [];

  const porCat = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  const recibidoCats = ['efectivo','tarjetas','cxc','propinas'].filter(cat => porCat[cat].length);

  const totalGeneral = rows.reduce((s, r) => s + totalVentaDinamico(r, conceptosVenta), 0);
  const gastosMes = rows.reduce((s, r) => s + (Number(r.gastos)||0), 0);

  let mesProp=0, mesDifTotal=0;
  let sumEfvo=0, sumTarj=0, sumCxc=0, sumDifEfvo=0, sumDifTarj=0;
  rows.forEach(r => {
    const d = computeRowDiffs(r, conceptosVenta, porCat);
    mesProp += d.totalProp;
    mesDifTotal += d.difTotal;
    sumEfvo += d.totalEfvo; sumTarj += d.totalTarj; sumCxc += d.totalCxc;
    sumDifEfvo += d.difEfvo; sumDifTarj += d.difTarj;
  });

  const totVentaCols = {};
  conceptosVenta.forEach(c => totVentaCols[c.id] = rows.reduce((s,r) => s + (Number((r.venta_data||{})[c.id]) || 0), 0));
  const totSistemaCols = {};
  SISTEMA_COLS.forEach(([k]) => totSistemaCols[k] = rows.reduce((s,r) => s + (Number(r[k]) || 0), 0));
  const totReconCols = {};
  recibidoCats.flatMap(cat => porCat[cat]).forEach(c => {
    totReconCols[c.id] = rows.reduce((s,r) => s + conceptoValor(c, (r.recon_data||{})[c.id]), 0);
  });

  if (conceptosVenta.length === 0) {
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Aún no configuras qué vende este negocio</h3></div>
        <div class="empty">Este negocio no tiene categorías de venta configuradas (Alimentos, Bebidas, Daypass, etc.). Usa el botón para agregar las que apliquen.</div>
        <div style="text-align:center;margin-top:10px;"><button class="btn btn-gold" id="openVentaConceptosBtn">⚙ Configurar categorías de venta</button></div>
      </div>`;
    document.getElementById('openVentaConceptosBtn').addEventListener('click', () => openVentaConceptosModal(b.id));
    return;
  }

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total ventas del mes</div><div class="value num">${fmt(totalGeneral)}</div></div>
      <div class="kpi"><div class="label">Gastos operativos del mes</div><div class="value num red">${fmt(gastosMes)}</div></div>
      <div class="kpi"><div class="label">Propinas del mes</div><div class="value num">${fmt(mesProp)}</div></div>
      <div class="kpi"><div class="label">Diferencia acumulada del mes</div><div class="value num ${Math.abs(mesDifTotal)<1?'green':'red'}">${fmt(mesDifTotal)}</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Ventas y conciliación — ${STATE.currentMonth}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="openVentaConceptosBtn">⚙ Categorías de venta</button>
          <button class="btn btn-ghost btn-sm" id="openConceptosBtn">⚙ Conceptos de recibido</button>
          <button class="btn btn-gold btn-sm" id="addVentaRow">+ Agregar día</button>
        </div>
      </div>
      <div class="table-wrap scroll-sticky">
        <table>
          <thead>
            <tr>
              <th rowspan="2">Fecha</th>
              <th colspan="${conceptosVenta.length}" style="text-align:center;">Lo vendido</th>
              <th rowspan="2">Total venta</th>
              ${SISTEMA_COLS.map(([k,l])=>`<th rowspan="2">${l}</th>`).join('')}
              ${recibidoCats.map(cat => `<th colspan="${porCat[cat].length}" style="text-align:center;">${CAT_LABEL[cat]} recibido</th>`).join('')}
              <th rowspan="2">Total Efvo.</th><th rowspan="2">Total Tarj.</th><th rowspan="2">Total CxC</th><th rowspan="2">Total Prop.</th>
              <th rowspan="2">Dif. Efvo.</th><th rowspan="2">Dif. Tarj.</th><th rowspan="2">Dif. Total</th>
              <th rowspan="2"></th>
            </tr>
            <tr>
              ${conceptosVenta.map(c => `<th>${c.nombre}${c.tipo==='resta'?' (−)':''}</th>`).join('')}
              ${recibidoCats.flatMap(cat => porCat[cat].map(c => `<th>${c.nombre}${c.es_moneda?' (+TC)':''}${c.categoria==='propinas'?(c.medio==='tarjetas'?' (Tarj)':' (Efvo)'):''}</th>`)).join('')}
            </tr>
          </thead>
          <tfoot>
            <tr class="total-row">
              <td>TOTAL MES</td>
              ${conceptosVenta.map(c => `<td class="num">${fmt(totVentaCols[c.id])}</td>`).join('')}
              <td class="num">${fmt(totalGeneral)}</td>
              ${SISTEMA_COLS.map(([k]) => `<td class="num">${fmt(totSistemaCols[k])}</td>`).join('')}
              ${recibidoCats.flatMap(cat => porCat[cat].map(c => `<td class="num">${fmt(totReconCols[c.id])}</td>`)).join('')}
              <td class="num">${fmt(sumEfvo)}</td>
              <td class="num">${fmt(sumTarj)}</td>
              <td class="num">${fmt(sumCxc)}</td>
              <td class="num">${fmt(mesProp)}</td>
              <td class="num" style="color:${Math.abs(sumDifEfvo)<1?'inherit':'var(--red)'}">${fmt(sumDifEfvo)}</td>
              <td class="num" style="color:${Math.abs(sumDifTarj)<1?'inherit':'var(--red)'}">${fmt(sumDifTarj)}</td>
              <td class="num" style="color:${Math.abs(mesDifTotal)<1?'inherit':'var(--red)'}">${fmt(mesDifTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
          <tbody id="ventasBody">
            ${rows.map(r => ventasRowHtml(r, conceptosVenta, porCat, recibidoCats)).join('') || `<tr><td class="empty">Sin días capturados este mes.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('addVentaRow').addEventListener('click', async () => {
    const { error: e2 } = await sb.from('fz_ventas').insert({ business_id: b.id, fecha: todayStr() });
    if (e2) { toast('Error: ' + e2.message, 'error'); return; }
    renderVentas();
  });
  document.getElementById('openConceptosBtn').addEventListener('click', () => openConceptosModal(b.id));
  document.getElementById('openVentaConceptosBtn').addEventListener('click', () => openVentaConceptosModal(b.id));

  el.querySelectorAll('.ventas-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id = inp.dataset.id, field = inp.dataset.field;
      const val = field === 'fecha' ? inp.value : Number(inp.value) || 0;
      const { error: e3 } = await sb.from('fz_ventas').update({ [field]: val }).eq('id', id);
      if (e3) { toast('Error guardando: ' + e3.message, 'error'); return; }
      renderVentas();
    });
  });
  el.querySelectorAll('.ventas-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('fz_ventas').delete().eq('id', btn.dataset.id);
      renderVentas();
    });
  });
  el.querySelectorAll('.vd-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const ventaId = inp.dataset.ventaId, conceptoId = inp.dataset.concepto;
      const row = rows.find(r => r.id === ventaId);
      const vd = { ...(row.venta_data || {}) };
      vd[conceptoId] = Number(inp.value) || 0;
      const { error } = await sb.from('fz_ventas').update({ venta_data: vd }).eq('id', ventaId);
      if (error) { toast('Error guardando: ' + error.message, 'error'); return; }
      renderVentas();
    });
  });
  el.querySelectorAll('.recon-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const ventaId = inp.dataset.ventaId, conceptoId = inp.dataset.concepto, field = inp.dataset.field;
      const row = rows.find(r => r.id === ventaId);
      const rd = { ...(row.recon_data || {}) };
      rd[conceptoId] = { ...(rd[conceptoId] || {}), [field]: Number(inp.value) || 0 };
      const { error: e4 } = await sb.from('fz_ventas').update({ recon_data: rd }).eq('id', ventaId);
      if (e4) { toast('Error guardando: ' + e4.message, 'error'); return; }
      if (field === 'monto') {
        const concepto = conceptos.find(c => c.id === conceptoId);
        if (concepto && concepto.categoria === 'propinas') {
          await provisionarPropina(b.id, ventaId, concepto, Number(inp.value) || 0, row.fecha);
        }
      }
      renderVentas();
    });
  });
}

/* ---------- Provisión automática de propinas como cuenta por pagar ---------- */
async function provisionarPropina(businessId, ventaId, concepto, monto, fecha) {
  if (!monto) return;
  let cat = (await sb.from('fz_proveedores_catalogo').select('*').eq('business_id', businessId).eq('nombre', 'Propinas por repartir').limit(1)).data?.[0];
  if (!cat) {
    const ins = await sb.from('fz_proveedores_catalogo').insert({ business_id: businessId, nombre: 'Propinas por repartir' }).select().single();
    cat = ins.data;
  }
  if (!cat) return;
  const { data: existing } = await sb.from('fz_proveedores').select('*').eq('origen_venta_id', ventaId).eq('origen_concepto_id', concepto.id).limit(1);
  const found = existing?.[0];
  if (found) {
    if (found.estatus === 'Pendiente') {
      await sb.from('fz_proveedores').update({ importe: monto, fecha }).eq('id', found.id);
    }
  } else {
    await sb.from('fz_proveedores').insert({
      business_id: businessId, proveedor_id: cat.id, proveedor: cat.nombre,
      fecha, factura: `Propina ${concepto.nombre} ${fecha}`, importe: monto, estatus: 'Pendiente',
      origen_venta_id: ventaId, origen_concepto_id: concepto.id,
    });
  }
}

function ventasRowHtml(r, conceptosVenta, porCat, recibidoCats) {
  const vd = r.venta_data || {};
  const rd = r.recon_data || {};
  const total = totalVentaDinamico(r, conceptosVenta);
  const cellForVenta = (c) => `<td><input class="cell vd-cell num" type="number" step="0.01" value="${vd[c.id] ?? 0}" data-venta-id="${r.id}" data-concepto="${c.id}"></td>`;
  const cellForRecon = (c) => {
    const entry = rd[c.id] || {};
    if (c.es_moneda) {
      return `<td><div style="display:flex;flex-direction:column;gap:2px;">
        <input class="cell recon-cell num" type="number" step="0.01" placeholder="monto" value="${entry.monto ?? ''}" data-venta-id="${r.id}" data-concepto="${c.id}" data-field="monto" style="width:70px;">
        <input class="cell recon-cell num" type="number" step="0.01" placeholder="TC" value="${entry.tc ?? ''}" data-venta-id="${r.id}" data-concepto="${c.id}" data-field="tc" style="width:70px;color:var(--muted);font-size:11.5px;">
      </div></td>`;
    }
    return `<td><input class="cell recon-cell num" type="number" step="0.01" value="${entry.monto ?? 0}" data-venta-id="${r.id}" data-concepto="${c.id}" data-field="monto"></td>`;
  };
  const { totalEfvo, totalTarj, totalCxc, totalProp, difEfvo, difTarj, difTotal } = computeRowDiffs(r, conceptosVenta, porCat);
  const colorDif = (v) => Math.abs(v) < 1 ? 'inherit' : 'var(--red)';
  return `<tr>
    <td><input class="cell ventas-cell" type="date" value="${r.fecha}" data-id="${r.id}" data-field="fecha"></td>
    ${conceptosVenta.map(cellForVenta).join('')}
    <td class="num" style="font-weight:700;">${fmt(total)}</td>
    ${SISTEMA_COLS.map(([k]) => `<td><input class="cell ventas-cell num" type="number" step="0.01" value="${r[k] ?? 0}" data-id="${r.id}" data-field="${k}"></td>`).join('')}
    ${recibidoCats.flatMap(cat => porCat[cat].map(cellForRecon)).join('')}
    <td class="num" style="font-weight:700;">${fmt(totalEfvo)}</td>
    <td class="num" style="font-weight:700;">${fmt(totalTarj)}</td>
    <td class="num" style="font-weight:700;">${fmt(totalCxc)}</td>
    <td class="num" style="font-weight:700;">${fmt(totalProp)}</td>
    <td class="num" style="color:${colorDif(difEfvo)}">${fmt(difEfvo)}</td>
    <td class="num" style="color:${colorDif(difTarj)}">${fmt(difTarj)}</td>
    <td class="num" style="font-weight:800;color:${colorDif(difTotal)}">${fmt(difTotal)}</td>
    <td><button class="row-del ventas-del" data-id="${r.id}">✕</button></td>
  </tr>`;
}

/* ---------- Modal: conceptos de recibido (efectivo/tarjetas/cxc/propinas) ---------- */
async function openConceptosModal(businessId) {
  await renderConceptosList(businessId);
  const [{ data: monedas }, { data: cuentasBanco }] = await Promise.all([
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).order('orden'),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).order('nombre'),
  ]);
  document.getElementById('newConceptoMonedaId').innerHTML = `<option value="">— no vincular —</option>` +
    (monedas || []).map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');
  document.getElementById('newConceptoBancoId').innerHTML = `<option value="">— no vincular —</option>` +
    (cuentasBanco || []).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  document.getElementById('modalConceptos').classList.add('show');
  document.getElementById('newConceptoCategoria').onchange = updateConceptoFieldsVisibility;
  updateConceptoFieldsVisibility();

  document.getElementById('closeConceptos').onclick = () => {
    document.getElementById('modalConceptos').classList.remove('show');
    renderVentas();
  };
  document.getElementById('saveConcepto').onclick = async () => {
    const nombre = document.getElementById('newConceptoNombre').value.trim();
    const categoria = document.getElementById('newConceptoCategoria').value;
    const es_moneda = categoria === 'efectivo' && document.getElementById('newConceptoMoneda').checked;
    const medio = categoria === 'propinas' ? document.getElementById('newConceptoMedio').value : null;
    const moneda_id = categoria === 'efectivo' ? (document.getElementById('newConceptoMonedaId').value || null) : null;
    const banco_cuenta_id = categoria === 'tarjetas' ? (document.getElementById('newConceptoBancoId').value || null) : null;
    if (!nombre) { toast('Escribe un nombre para el concepto.', 'error'); return; }
    const { error } = await sb.from('fz_conceptos').insert({ business_id: businessId, nombre, categoria, es_moneda, medio, moneda_id, banco_cuenta_id, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newConceptoNombre').value = '';
    document.getElementById('newConceptoMoneda').checked = false;
    renderConceptosList(businessId);
  };
}
function updateConceptoFieldsVisibility() {
  const cat = document.getElementById('newConceptoCategoria').value;
  document.getElementById('esMonedaLabel').style.display = cat === 'efectivo' ? 'flex' : 'none';
  document.getElementById('medioWrap').style.display = cat === 'propinas' ? 'block' : 'none';
  document.getElementById('monedaVinculoWrap').style.display = cat === 'efectivo' ? 'block' : 'none';
  document.getElementById('bancoVinculoWrap').style.display = cat === 'tarjetas' ? 'block' : 'none';
}
async function renderConceptosList(businessId) {
  const [conceptos, monedasQ, cuentasQ] = await Promise.all([
    loadConceptos(businessId),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).order('orden'),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).order('nombre'),
  ]);
  const monedas = monedasQ.data || [];
  const cuentasBanco = cuentasQ.data || [];
  const box = document.getElementById('conceptosList');
  if (!conceptos.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Aún no hay conceptos. Agrega el primero abajo.</div>`; return; }
  box.innerHTML = conceptos.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--line);gap:10px;">
      <div style="min-width:0;">
        <strong>${c.nombre}</strong> <span style="color:var(--muted);font-size:12px;">— ${CAT_LABEL[c.categoria]}${c.es_moneda ? ' · con TC' : ''}${c.categoria==='propinas' ? ' · '+(c.medio==='tarjetas'?'Tarjetas':'Efectivo') : ''}</span>
      </div>
      ${c.categoria === 'efectivo' ? `<select class="cell concepto-moneda-vinculo" data-id="${c.id}" style="max-width:170px;flex-shrink:0;">
        <option value="">— no vincular —</option>
        ${monedas.map(m => `<option value="${m.id}" ${c.moneda_id===m.id?'selected':''}>${m.nombre}</option>`).join('')}
      </select>` : ''}
      ${c.categoria === 'tarjetas' ? `<select class="cell concepto-banco-vinculo" data-id="${c.id}" style="max-width:170px;flex-shrink:0;">
        <option value="">— no vincular —</option>
        ${cuentasBanco.map(cb => `<option value="${cb.id}" ${c.banco_cuenta_id===cb.id?'selected':''}>${cb.nombre}</option>`).join('')}
      </select>` : ''}
      <button class="row-del concepto-del" data-id="${c.id}" style="font-size:16px;flex-shrink:0;">✕</button>
    </div>`).join('');
  box.querySelectorAll('.concepto-moneda-vinculo').forEach(sel => {
    sel.addEventListener('change', async () => {
      await sb.from('fz_conceptos').update({ moneda_id: sel.value || null }).eq('id', sel.dataset.id);
      toast('Vínculo actualizado.');
    });
  });
  box.querySelectorAll('.concepto-banco-vinculo').forEach(sel => {
    sel.addEventListener('change', async () => {
      await sb.from('fz_conceptos').update({ banco_cuenta_id: sel.value || null }).eq('id', sel.dataset.id);
      toast('Vínculo actualizado.');
    });
  });
  box.querySelectorAll('.concepto-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('fz_conceptos').delete().eq('id', btn.dataset.id);
      renderConceptosList(businessId);
    });
  });
}

/* ---------- Modal: categorías de venta (lo vendido) ---------- */
async function openVentaConceptosModal(businessId) {
  await renderVentaConceptosList(businessId);
  document.getElementById('modalConceptosVenta').classList.add('show');
  document.getElementById('closeConceptosVenta').onclick = () => {
    document.getElementById('modalConceptosVenta').classList.remove('show');
    renderVentas();
  };
  document.getElementById('saveConceptoVenta').onclick = async () => {
    const nombre = document.getElementById('newConceptoVentaNombre').value.trim();
    const tipo = document.getElementById('newConceptoVentaTipo').value;
    if (!nombre) { toast('Escribe un nombre para la categoría.', 'error'); return; }
    const { error } = await sb.from('fz_conceptos_venta').insert({ business_id: businessId, nombre, tipo, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newConceptoVentaNombre').value = '';
    renderVentaConceptosList(businessId);
  };
}
async function renderVentaConceptosList(businessId) {
  const conceptos = await loadConceptosVenta(businessId);
  const box = document.getElementById('conceptosVentaList');
  if (!conceptos.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Aún no hay categorías. Agrega la primera abajo (ej. Alimentos, Bebidas, Daypass...).</div>`; return; }
  box.innerHTML = conceptos.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--line);">
      <div><strong>${c.nombre}</strong> <span style="color:var(--muted);font-size:12px;">— ${c.tipo === 'resta' ? 'Resta (ej. descuentos)' : 'Suma'}</span></div>
      <button class="row-del conceptoventa-del" data-id="${c.id}" style="font-size:16px;">✕</button>
    </div>`).join('');
  box.querySelectorAll('.conceptoventa-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('fz_conceptos_venta').delete().eq('id', btn.dataset.id);
      renderVentaConceptosList(businessId);
    });
  });
}

/* ============================================================
   CATÁLOGO DE CUENTAS (cuenta mayor + subcuentas)
   ============================================================ */
async function loadCuentasMayor(businessId) {
  const { data } = await sb.from('fz_cuentas_mayor').select('*').eq('business_id', businessId).order('orden');
  return data || [];
}
async function loadSubcuentas(businessId) {
  const { data } = await sb.from('fz_subcuentas').select('*').eq('business_id', businessId).order('orden');
  return data || [];
}

async function openCuentasModal(businessId, onClose) {
  await renderCuentasList(businessId);
  document.getElementById('modalCuentas').classList.add('show');
  document.getElementById('closeCuentas').onclick = () => { document.getElementById('modalCuentas').classList.remove('show'); if (onClose) onClose(); };
  document.getElementById('saveCuentaMayor').onclick = async () => {
    const nombre = document.getElementById('newCuentaMayorNombre').value.trim();
    const tipo = document.getElementById('newCuentaMayorTipo').value;
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const { error } = await sb.from('fz_cuentas_mayor').insert({ business_id: businessId, nombre, tipo, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newCuentaMayorNombre').value = '';
    renderCuentasList(businessId);
  };
  document.getElementById('saveSubcuenta').onclick = async () => {
    const cuenta_mayor_id = document.getElementById('newSubcuentaMayor').value;
    const nombre = document.getElementById('newSubcuentaNombre').value.trim();
    if (!cuenta_mayor_id) { toast('Primero crea una cuenta mayor.', 'error'); return; }
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const { error } = await sb.from('fz_subcuentas').insert({ business_id: businessId, cuenta_mayor_id, nombre, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newSubcuentaNombre').value = '';
    renderCuentasList(businessId);
  };
}
const TIPO_CUENTA_LABEL = { activo: 'Activo', pasivo: 'Pasivo', capital: 'Capital', ingreso: 'Ingreso', gasto: 'Gasto' };
async function renderCuentasList(businessId) {
  const [mayores, subcuentas] = await Promise.all([loadCuentasMayor(businessId), loadSubcuentas(businessId)]);
  const box = document.getElementById('cuentasMayorList');
  const sel = document.getElementById('newSubcuentaMayor');
  sel.innerHTML = mayores.map(m => `<option value="${m.id}">${m.nombre} (${TIPO_CUENTA_LABEL[m.tipo]||m.tipo})</option>`).join('') || `<option value="">— crea una cuenta mayor primero —</option>`;

  if (!mayores.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Aún no hay cuentas mayor. Crea la primera abajo.</div>`; return; }
  box.innerHTML = mayores.map(m => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;background:#f7f9fc;border-radius:7px;">
        <strong>${m.nombre}</strong>
        <span style="display:flex;align-items:center;gap:10px;">
          <span class="tag" style="cursor:default;padding:2px 10px;font-size:11px;">${TIPO_CUENTA_LABEL[m.tipo]||m.tipo}</span>
          <button class="row-del mayor-del" data-id="${m.id}" style="font-size:15px;">✕</button>
        </span>
      </div>
      ${subcuentas.filter(s=>s.cuenta_mayor_id===m.id).map(s => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 4px 5px 16px;border-bottom:1px solid var(--line);font-size:13px;">
          <span>${s.nombre}</span>
          <button class="row-del sub-del" data-id="${s.id}" style="font-size:14px;">✕</button>
        </div>`).join('') || `<div style="padding:5px 4px 5px 16px;color:var(--muted);font-size:12px;">Sin subcuentas todavía.</div>`}
    </div>`).join('');
  box.querySelectorAll('.mayor-del').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta cuenta mayor y todas sus subcuentas?')) return;
    const { error } = await sb.from('fz_cuentas_mayor').delete().eq('id', btn.dataset.id);
    if (error) {
      toast('No se puede eliminar: ya tiene movimientos, facturas o pólizas registradas con alguna de sus subcuentas. Si ya no la usas, deja de seleccionarla en capturas nuevas — el historial se conserva.', 'error');
      return;
    }
    renderCuentasList(businessId);
  }));
  box.querySelectorAll('.sub-del').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta subcuenta?')) return;
    const { error } = await sb.from('fz_subcuentas').delete().eq('id', btn.dataset.id);
    if (error) {
      toast('No se puede eliminar: ya tiene movimientos, facturas o pólizas registradas. Si ya no la usas, simplemente deja de seleccionarla en capturas nuevas — el historial se conserva.', 'error');
      return;
    }
    renderCuentasList(businessId);
  }));
}

/* ============================================================
   CATÁLOGO DE PROVEEDORES
   ============================================================ */
async function loadProveedoresCatalogo(businessId) {
  const { data } = await sb.from('fz_proveedores_catalogo').select('*').eq('business_id', businessId).eq('activo', true).order('nombre');
  return data || [];
}
async function openProveedoresCatModal(businessId, onClose) {
  await renderProveedoresCatList(businessId);
  document.getElementById('modalProveedoresCat').classList.add('show');
  document.getElementById('closeProveedoresCat').onclick = () => { document.getElementById('modalProveedoresCat').classList.remove('show'); if (onClose) onClose(); };
  document.getElementById('saveProveedorCat').onclick = async () => {
    const nombre = document.getElementById('newProveedorCatNombre').value.trim();
    const razon_social = document.getElementById('newProveedorCatRazonSocial').value.trim() || null;
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const { error } = await sb.from('fz_proveedores_catalogo').insert({ business_id: businessId, nombre, nombre_comercial: nombre, razon_social });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newProveedorCatNombre').value = '';
    document.getElementById('newProveedorCatRazonSocial').value = '';
    renderProveedoresCatList(businessId);
  };
  document.getElementById('importProveedoresBtn').onclick = () => openImportExcelModal('proveedores', businessId, () => renderProveedoresCatList(businessId));
}
async function renderProveedoresCatList(businessId) {
  const provs = await loadProveedoresCatalogo(businessId);
  const box = document.getElementById('proveedoresCatList');
  if (!provs.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Aún no hay proveedores. Agrega el primero abajo.</div>`; return; }
  box.innerHTML = provs.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--line);">
      <div><strong>${p.nombre_comercial || p.nombre}</strong>${p.razon_social ? `<div style="color:var(--muted);font-size:12px;">${p.razon_social}</div>` : ''}</div>
      <button class="row-del provcat-del" data-id="${p.id}" style="font-size:16px;">✕</button>
    </div>`).join('');
  box.querySelectorAll('.provcat-del').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_proveedores_catalogo').update({ activo: false }).eq('id', btn.dataset.id);
    renderProveedoresCatList(businessId);
  }));
}

/* ============================================================
   DESGLOSE DE FACTURA (por subcuenta)
   ============================================================ */
async function openDesgloseModal(businessId, facturaId, onClose) {
  const subcuentas = await loadSubcuentas(businessId);
  const mayores = await loadCuentasMayor(businessId);
  const sel = document.getElementById('newDesgloseSubcuenta');
  sel.innerHTML = subcuentas.map(s => {
    const mayor = mayores.find(m => m.id === s.cuenta_mayor_id);
    return `<option value="${s.id}">${mayor ? mayor.nombre + ' › ' : ''}${s.nombre}</option>`;
  }).join('') || `<option value="">— crea subcuentas primero en el P&L —</option>`;

  await renderDesgloseList(businessId, facturaId, subcuentas, mayores);
  document.getElementById('modalDesglose').classList.add('show');
  document.getElementById('closeDesglose').onclick = () => { document.getElementById('modalDesglose').classList.remove('show'); if (onClose) onClose(); };
  document.getElementById('addDesgloseLinea').onclick = async () => {
    const subId = document.getElementById('newDesgloseSubcuenta').value;
    const monto = Number(document.getElementById('newDesgloseMonto').value) || 0;
    if (!subId || !monto) { toast('Selecciona subcuenta y monto.', 'error'); return; }
    const { data: fRow } = await sb.from('fz_proveedores').select('desglose').eq('id', facturaId).single();
    const desglose = { ...(fRow?.desglose || {}) };
    desglose[subId] = (Number(desglose[subId]) || 0) + monto;
    await sb.from('fz_proveedores').update({ desglose }).eq('id', facturaId);
    document.getElementById('newDesgloseMonto').value = '';
    renderDesgloseList(businessId, facturaId, subcuentas, mayores);
  };
}
async function renderDesgloseList(businessId, facturaId, subcuentas, mayores) {
  const { data: fRow } = await sb.from('fz_proveedores').select('*').eq('id', facturaId).single();
  const desglose = fRow?.desglose || {};
  const box = document.getElementById('desgloseList');
  const entries = Object.entries(desglose).filter(([,v]) => Number(v));
  const totalAsignado = entries.reduce((s,[,v])=>s+Number(v),0);
  document.getElementById('desgloseTotales').innerHTML = `Factura: ${fmt(fRow?.importe||0)} &nbsp;|&nbsp; Asignado: <span style="color:${Math.abs(totalAsignado-(fRow?.importe||0))<1?'var(--green)':'var(--red)'}">${fmt(totalAsignado)}</span>`;
  box.innerHTML = entries.map(([subId, monto]) => {
    const sub = subcuentas.find(s=>s.id===subId);
    const mayor = mayores.find(m=>m.id===sub?.cuenta_mayor_id);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 4px;border-bottom:1px solid var(--line);font-size:13px;">
      <span>${mayor ? mayor.nombre+' › ' : ''}${sub ? sub.nombre : '(subcuenta eliminada)'}</span>
      <span style="display:flex;align-items:center;gap:10px;"><strong>${fmt(monto)}</strong><button class="row-del desglose-del" data-sub="${subId}" style="font-size:14px;">✕</button></span>
    </div>`;
  }).join('') || `<div class="empty" style="padding:10px;">Sin líneas todavía.</div>`;
  box.querySelectorAll('.desglose-del').forEach(btn => btn.addEventListener('click', async () => {
    const d = { ...desglose };
    delete d[btn.dataset.sub];
    await sb.from('fz_proveedores').update({ desglose: d }).eq('id', facturaId);
    renderDesgloseList(businessId, facturaId, subcuentas, mayores);
  }));
}

/* ============================================================
   TRASPASOS ENTRE CUENTAS (bancos y/o cajas de efectivo)
   ============================================================ */
async function populateTraspasoSelects(businessId, keepOrigen, keepDestino) {
  const [cuentas, monedas] = await Promise.all([
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
  ]);
  const options = [
    ...(cuentas.data||[]).map(c => `<option value="banco:${c.id}">Banco — ${c.nombre}</option>`),
    ...(monedas.data||[]).map(m => `<option value="efectivo:${m.id}">Caja — ${m.nombre}</option>`),
    `<option value="nuevo:banco">+ Nueva cuenta bancaria…</option>`,
    `<option value="nuevo:efectivo">+ Nueva caja de efectivo…</option>`,
  ].join('');
  const oSel = document.getElementById('traspasoOrigen');
  const dSel = document.getElementById('traspasoDestino');
  oSel.innerHTML = options; dSel.innerHTML = options;
  if (keepOrigen) oSel.value = keepOrigen;
  if (keepDestino) dSel.value = keepDestino;
}

async function crearCuentaOCajaRapida(businessId, tipo) {
  if (tipo === 'banco') {
    const nombre = prompt('Nombre de la nueva cuenta bancaria (ej. Banco-Kapital):');
    if (!nombre) return null;
    const saldoInicial = Number(prompt('Saldo inicial (opcional, 0 si no aplica):', '0')) || 0;
    const { data, error } = await sb.from('fz_bancos_cuentas').insert({ business_id: businessId, nombre, saldo_inicial: saldoInicial, activo: true }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return null; }
    return 'banco:' + data.id;
  }
  const nombre = prompt('Nombre de la nueva caja de efectivo (ej. Pesos, Dólares, Canadienses):');
  if (!nombre) return null;
  const saldoInicial = Number(prompt('Saldo inicial (opcional, 0 si no aplica):', '0')) || 0;
  const tcReporte = Number(prompt('Tipo de cambio de referencia a pesos (1 si ya es pesos):', '1')) || 1;
  const { data, error } = await sb.from('fz_efectivo_monedas').insert({ business_id: businessId, nombre, saldo_inicial: saldoInicial, tc_reporte: tcReporte, activo: true }).select().single();
  if (error) { toast('Error: ' + error.message, 'error'); return null; }
  return 'efectivo:' + data.id;
}

/* ============================================================
   IMPORTAR DESDE EXCEL (catálogo de proveedores, facturas o movimientos bancarios)
   ============================================================ */
function normalizarEncabezado(k) {
  return k.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita acentos
}
function buscarColumna(row, candidatos) {
  const claves = Object.keys(row);
  for (const c of candidatos) {
    const found = claves.find(k => normalizarEncabezado(k) === c);
    if (found) return row[found];
  }
  return null;
}
function parseFechaExcel(val) {
  if (val === null || val === undefined || val === '') return todayStr();
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return todayStr();
}

function openImportExcelModal(tipo, businessId, onDone, extra) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) { toast('El archivo no tiene filas.', 'error'); return; }

      if (tipo === 'proveedores') {
        const payload = rows.map(r => {
          const nombre_comercial = buscarColumna(r, ['nombre comercial', 'nombre', 'proveedor']) || '';
          const razon_social = buscarColumna(r, ['razon social', 'razón social']) || null;
          return { business_id: businessId, nombre: String(nombre_comercial).trim(), nombre_comercial: String(nombre_comercial).trim(), razon_social: razon_social ? String(razon_social).trim() : null };
        }).filter(p => p.nombre);
        if (!payload.length) { toast('No se encontró la columna "Nombre Comercial" en el archivo.', 'error'); return; }
        const { error } = await sb.from('fz_proveedores_catalogo').insert(payload);
        if (error) { toast('Error al importar: ' + error.message, 'error'); return; }
        toast(`${payload.length} proveedores importados.`);

      } else if (tipo === 'facturas') {
        const { data: catalogo } = await sb.from('fz_proveedores_catalogo').select('*').eq('business_id', businessId);
        const payload = rows.map(r => {
          const proveedorTexto = String(buscarColumna(r, ['proveedor', 'nombre comercial', 'nombre']) || '').trim();
          const match = (catalogo || []).find(c => (c.nombre_comercial || c.nombre || '').trim().toLowerCase() === proveedorTexto.toLowerCase());
          const estatusRaw = String(buscarColumna(r, ['estatus', 'status']) || '').trim().toLowerCase();
          return {
            business_id: businessId,
            fecha: parseFechaExcel(buscarColumna(r, ['fecha'])),
            proveedor: proveedorTexto || (match ? (match.nombre_comercial || match.nombre) : ''),
            proveedor_id: match ? match.id : null,
            factura: String(buscarColumna(r, ['factura', 'no factura', 'numero factura']) || '').trim() || null,
            importe: Number(buscarColumna(r, ['importe', 'monto', 'total'])) || 0,
            estatus: estatusRaw.startsWith('pag') ? 'Pagado' : 'Pendiente',
            desglose: {},
          };
        }).filter(f => f.proveedor && f.importe);
        if (!payload.length) { toast('No se encontraron filas válidas (revisa las columnas Proveedor e Importe).', 'error'); return; }
        const { error } = await sb.from('fz_proveedores').insert(payload);
        if (error) { toast('Error al importar: ' + error.message, 'error'); return; }
        toast(`${payload.length} facturas importadas. Ya puedes desglosarlas por subcuenta.`);

      } else if (tipo === 'bancos_mov') {
        const cuentaId = extra;
        if (!cuentaId) { toast('Selecciona primero una cuenta bancaria.', 'error'); return; }
        const payload = rows.map(r => ({
          business_id: businessId,
          cuenta_id: cuentaId,
          fecha: parseFechaExcel(buscarColumna(r, ['fecha'])),
          descripcion: String(buscarColumna(r, ['descripcion', 'descripción']) || '').trim() || null,
          concepto: String(buscarColumna(r, ['concepto']) || '').trim() || null,
          referencia: String(buscarColumna(r, ['referencia']) || '').trim() || null,
          depositos: Number(buscarColumna(r, ['depositos', 'depósitos', 'abono', 'abonos'])) || 0,
          cargos: Number(buscarColumna(r, ['cargos', 'cargo'])) || 0,
          tipo_salida: 'otro',
        })).filter(m => m.depositos || m.cargos);
        if (!payload.length) { toast('No se encontraron filas válidas (revisa las columnas Depósitos/Cargos).', 'error'); return; }
        const { error } = await sb.from('fz_bancos_mov').insert(payload);
        if (error) { toast('Error al importar: ' + error.message, 'error'); return; }
        toast(`${payload.length} movimientos importados.`);
      }
      if (onDone) onDone();
    } catch (e) {
      toast('No se pudo leer el archivo: ' + e.message, 'error');
    }
  };
  input.click();
}

async function openTraspasoModal(businessId, onDone) {
  await populateTraspasoSelects(businessId);
  document.getElementById('traspasoFecha').value = todayStr();
  document.getElementById('traspasoMonto').value = '';
  document.getElementById('traspasoDescripcion').value = '';
  document.getElementById('modalTraspaso').classList.add('show');

  const handleNuevo = async (selectEl) => {
    if (!selectEl.value.startsWith('nuevo:')) return;
    const tipo = selectEl.value.split(':')[1];
    const otherSel = selectEl.id === 'traspasoOrigen' ? document.getElementById('traspasoDestino') : document.getElementById('traspasoOrigen');
    const otherVal = otherSel.value;
    const nuevoValor = await crearCuentaOCajaRapida(businessId, tipo);
    await populateTraspasoSelects(businessId, selectEl.id === 'traspasoOrigen' ? nuevoValor : otherVal, selectEl.id === 'traspasoDestino' ? nuevoValor : otherVal);
    if (nuevoValor) toast('Cuenta/caja creada. Ya puedes usarla en el traspaso.');
  };
  document.getElementById('traspasoOrigen').onchange = (e) => handleNuevo(e.target);
  document.getElementById('traspasoDestino').onchange = (e) => handleNuevo(e.target);

  document.getElementById('cancelTraspaso').onclick = () => document.getElementById('modalTraspaso').classList.remove('show');
  document.getElementById('saveTraspaso').onclick = async () => {
    const origen = document.getElementById('traspasoOrigen').value;
    const destino = document.getElementById('traspasoDestino').value;
    const fecha = document.getElementById('traspasoFecha').value;
    const monto = Number(document.getElementById('traspasoMonto').value) || 0;
    const descripcion = document.getElementById('traspasoDescripcion').value || 'Traspaso entre cuentas';
    if (origen.startsWith('nuevo:') || destino.startsWith('nuevo:')) { toast('Termina de crear la cuenta/caja nueva antes de guardar.', 'error'); return; }
    if (origen === destino) { toast('Elige cuentas distintas.', 'error'); return; }
    if (!monto) { toast('Escribe un monto.', 'error'); return; }
    const traspasoId = uid();
    const [oTipo, oId] = origen.split(':');
    const [dTipo, dId] = destino.split(':');
    const insertLeg = (tipo, id, esOrigen) => {
      const payload = {
        business_id: businessId, fecha, tipo_salida: 'traspaso', traspaso_id: traspasoId,
        cargos: esOrigen ? monto : 0, depositos: esOrigen ? 0 : monto,
      };
      if (tipo === 'banco') return sb.from('fz_bancos_mov').insert({ ...payload, cuenta_id: id, descripcion, concepto: 'Traspaso' });
      return sb.from('fz_efectivo_mov').insert({ ...payload, moneda_id: id, proveedor: 'Traspaso', descripcion });
    };
    const [r1, r2] = await Promise.all([insertLeg(oTipo, oId, true), insertLeg(dTipo, dId, false)]);
    if (r1.error || r2.error) { toast('Error al registrar el traspaso.', 'error'); return; }
    document.getElementById('modalTraspaso').classList.remove('show');
    toast('Traspaso registrado.');
    if (onDone) onDone();
  };
}

/* ---------- Celdas compartidas: clasificación de una salida (gasto/proveedor/otro) ---------- */
function salidaCellsHtml(r, subcuentas, mayores, facturasPend, prefix, traspasoCtx) {
  if (r.tipo_salida === 'traspaso') {
    return `<td><span style="color:var(--muted);">🔁 Traspaso</span></td><td>—</td>`;
  }
  const tipo = r.tipo_salida || 'otro';
  const tipoSelect = `<select class="cell salida-tipo" data-id="${r.id}">
    <option value="otro" ${tipo==='otro'?'selected':''}>Sin clasificar</option>
    <option value="gasto" ${tipo==='gasto'?'selected':''}>Gasto</option>
    <option value="proveedor" ${tipo==='proveedor'?'selected':''}>Pago a proveedor</option>
    <option value="traspaso_banco" ${tipo==='traspaso_banco'?'selected':''}>Traspaso a banco</option>
    <option value="traspaso_efectivo" ${tipo==='traspaso_efectivo'?'selected':''}>Traspaso a caja de efectivo</option>
  </select>`;
  let detalle = '—';
  if (tipo === 'gasto') {
    detalle = `<select class="cell salida-detalle" data-id="${r.id}" data-field="subcuenta_id">
      <option value="">— elegir subcuenta —</option>
      ${subcuentas.map(s => { const m = mayores.find(x=>x.id===s.cuenta_mayor_id); return `<option value="${s.id}" ${r.subcuenta_id===s.id?'selected':''}>${m?m.nombre+' › ':''}${s.nombre}</option>`; }).join('')}
    </select>`;
  } else if (tipo === 'proveedor') {
    detalle = `<select class="cell salida-detalle" data-id="${r.id}" data-field="proveedor_factura_id">
      <option value="">— elegir factura —</option>
      ${facturasPend.map(f => `<option value="${f.id}" ${r.proveedor_factura_id===f.id?'selected':''}>${f.proveedor} · ${f.factura||'s/f'} · ${fmt(f.importe)}</option>`).join('')}
    </select>`;
  } else if (tipo === 'traspaso_banco' && traspasoCtx) {
    const opciones = (traspasoCtx.cuentasBanco || []).filter(c => !(traspasoCtx.origenTipo === 'banco' && c.id === traspasoCtx.origenId));
    detalle = `<select class="cell salida-traspaso-destino" data-id="${r.id}" data-tipo="banco">
      <option value="">— elegir cuenta destino —</option>
      ${opciones.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
    </select>`;
  } else if (tipo === 'traspaso_efectivo' && traspasoCtx) {
    const opciones = (traspasoCtx.monedasEfectivo || []).filter(m => !(traspasoCtx.origenTipo === 'efectivo' && m.id === traspasoCtx.origenId));
    detalle = `<select class="cell salida-traspaso-destino" data-id="${r.id}" data-tipo="efectivo">
      <option value="">— elegir caja destino —</option>
      ${opciones.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}
    </select>`;
  }
  return `<td>${tipoSelect}</td><td>${detalle}</td>`;
}
function wireSalidaCellHandlers(container, table, onChange, traspasoCtx) {
  container.querySelectorAll('.salida-tipo').forEach(sel => sel.addEventListener('change', async () => {
    await sb.from(table).update({ tipo_salida: sel.value, subcuenta_id: null, proveedor_factura_id: null }).eq('id', sel.dataset.id);
    onChange();
  }));
  container.querySelectorAll('.salida-detalle').forEach(sel => sel.addEventListener('change', async () => {
    const field = sel.dataset.field;
    await sb.from(table).update({ [field]: sel.value || null }).eq('id', sel.dataset.id);
    if (field === 'proveedor_factura_id' && sel.value) {
      const { data: movRow } = await sb.from(table).select('fecha').eq('id', sel.dataset.id).single();
      await sb.from('fz_proveedores').update({
        estatus: 'Pagado',
        fecha_pago: movRow?.fecha || todayStr(),
        pagado_desde: traspasoCtx?.origenCorto || null,
      }).eq('id', sel.value);
      toast('Factura marcada como pagada.');
    }
    onChange();
  }));
  container.querySelectorAll('.salida-traspaso-destino').forEach(sel => sel.addEventListener('change', async () => {
    if (!sel.value) return;
    const { data: origenRow } = await sb.from(table).select('*').eq('id', sel.dataset.id).single();
    if (!origenRow) return;
    const monto = Number(origenRow.cargos) > 0 ? Number(origenRow.cargos) : Number(origenRow.depositos) || 0;
    if (!monto) { toast('Este movimiento no tiene monto en cargos o depósitos.', 'error'); return; }
    const esSalida = Number(origenRow.cargos) > 0;
    const traspasoId = uid();
    const destinoTipo = sel.dataset.tipo;
    const origenLabel = traspasoCtx?.origenNombre || 'otra cuenta';
    const destinoPayload = {
      business_id: origenRow.business_id, fecha: origenRow.fecha, tipo_salida: 'traspaso', traspaso_id: traspasoId,
      cargos: esSalida ? 0 : monto, depositos: esSalida ? monto : 0,
    };
    let destErr;
    if (destinoTipo === 'banco') {
      destinoPayload.cuenta_id = sel.value;
      destinoPayload.descripcion = `Traspaso desde ${origenLabel}`;
      destinoPayload.concepto = 'Traspaso';
      const { error } = await sb.from('fz_bancos_mov').insert(destinoPayload);
      destErr = error;
    } else {
      destinoPayload.moneda_id = sel.value;
      destinoPayload.proveedor = 'Traspaso';
      destinoPayload.descripcion = `Traspaso desde ${origenLabel}`;
      const { error } = await sb.from('fz_efectivo_mov').insert(destinoPayload);
      destErr = error;
    }
    if (destErr) { toast('Error al crear el traspaso: ' + destErr.message, 'error'); return; }
    await sb.from(table).update({ tipo_salida: 'traspaso', traspaso_id: traspasoId }).eq('id', sel.dataset.id);
    toast('Traspaso vinculado correctamente.');
    onChange();
  }));
}

/* ============================================================
   EFECTIVO & DIVISAS — libro por moneda, alimentado por Ventas
   ============================================================ */
let STATE_monedaAbierta = null;

async function getMonedaLedgerRows(businessId, moneda, conceptosEfectivo) {
  const concepts = conceptosParaMoneda(moneda, conceptosEfectivo);
  const autoRows = [];
  if (concepts.length) {
    const { data: ventas } = await sb.from('fz_ventas').select('id,fecha,recon_data').eq('business_id', businessId).order('fecha');
    (ventas || []).forEach(v => {
      concepts.forEach(concepto => {
        const entry = (v.recon_data || {})[concepto.id];
        if (entry && Number(entry.monto)) {
          autoRows.push({ id: 'auto-' + v.id + '-' + concepto.id, fecha: v.fecha, proveedor: 'Corte de caja', descripcion: `Efectivo conciliado en Ventas (${concepto.nombre})`, factura: '', cargos: 0, depositos: Number(entry.monto) || 0, auto: true });
        }
      });
    });
  }
  const { data: movs } = await sb.from('fz_efectivo_mov').select('*').eq('moneda_id', moneda.id).order('fecha');
  const manualRows = (movs || []).map(m => ({ ...m, auto: false }));
  return [...autoRows, ...manualRows].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function renderEfectivo() {
  const el = document.getElementById('sec-efectivo');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }

  const [monedasQ, cuentasQ, conceptosQ] = await Promise.all([
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).order('orden'),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id),
    sb.from('fz_conceptos').select('*').eq('business_id', b.id),
  ]);
  const monedas = monedasQ.data || [];
  const cuentas = cuentasQ.data || [];
  const conceptosEfectivo = (conceptosQ.data || []).filter(c => c.categoria === 'efectivo');
  const conceptosTarjetas = (conceptosQ.data || []).filter(c => c.categoria === 'tarjetas');

  const monedasConSaldo = [];
  for (const m of monedas) {
    const saldo = await computeMonedaSaldo(b.id, m, conceptosEfectivo);
    monedasConSaldo.push({ ...m, saldo, pesoEquiv: saldo * (Number(m.tc_reporte) || 1) });
  }
  const bancosConSaldo = [];
  for (const c of cuentas) {
    const saldo = await computeBancoSaldo(b.id, c, conceptosTarjetas);
    bancosConSaldo.push({ nombre: c.nombre, saldo, activo: c.activo !== false });
  }

  const totalMonedas = monedasConSaldo.filter(m => m.activo !== false).reduce((s, m) => s + m.pesoEquiv, 0);
  const totalBancos = bancosConSaldo.filter(c => c.activo !== false).reduce((s, c) => s + c.saldo, 0);
  const totalGeneral = totalMonedas + totalBancos;

  if (!STATE_monedaAbierta && monedasConSaldo.length) STATE_monedaAbierta = monedasConSaldo[0].id;

  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Resumen de liquidez — ${b.name}</h3><span class="hint">Al día de hoy · edita el TC si cambió</span></div>
      <table>
        <tbody>
          ${monedasConSaldo.map(m => `<tr>
            <td>${m.nombre}${m.activo===false?' (inactiva)':''}</td>
            <td class="num">${fmtNum(m.saldo)}</td>
            <td class="num"><input class="cell tc-reporte-cell" type="number" step="0.0001" value="${m.tc_reporte}" data-id="${m.id}" style="width:75px;color:var(--muted);"></td>
            <td class="num" style="font-weight:700;">${fmt(m.pesoEquiv)}</td>
          </tr>`).join('')}
          ${bancosConSaldo.map(c => `<tr>
            <td>Banco — ${c.nombre}${c.activo===false?' (inactiva)':''}</td>
            <td class="num">—</td><td class="num">—</td>
            <td class="num" style="font-weight:700;">${fmt(c.saldo)}</td>
          </tr>`).join('')}
          <tr class="total-row"><td>TOTAL (efectivo + bancos)</td><td></td><td></td><td class="num">${fmt(totalGeneral)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Cajas de efectivo por moneda</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="traspasoBtnEfvo">🔁 Transferir</button>
          <button class="btn btn-gold btn-sm" id="addMonedaBtn">+ Agregar moneda</button>
        </div>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-bottom:12px;">El efectivo ya conciliado en Ventas entra aquí automáticamente como "Corte de caja" (solo lo recibido en efectivo — tarjetas, CxC y gastos no se registran en esta caja). Aquí anotas lo que pagas en efectivo.</p>
      <div class="tag-row">
        ${monedasConSaldo.map(m => `<div class="tag moneda-tab ${m.id===STATE_monedaAbierta?'active':''}" data-id="${m.id}">${m.nombre} · ${fmtNum(m.saldo)}</div>`).join('') || '<span class="hint">Aún no hay monedas configuradas.</span>'}
      </div>
      <div id="monedaLedger"></div>
    </div>
  `;

  el.querySelectorAll('.tc-reporte-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const val = Number(inp.value) || 1;
      await sb.from('fz_efectivo_monedas').update({ tc_reporte: val }).eq('id', inp.dataset.id);
      renderEfectivo();
    });
  });
  document.getElementById('traspasoBtnEfvo').addEventListener('click', () => openTraspasoModal(b.id, renderEfectivo));
  document.getElementById('addMonedaBtn').addEventListener('click', async () => {
    const nombre = prompt('Nombre de la moneda / caja (ej. Pesos, Dólares, Euros, Canadienses):');
    if (!nombre) return;
    const saldoInicial = Number(prompt('Saldo inicial (opcional, 0 si no aplica):', '0')) || 0;
    const tcReporte = Number(prompt('Tipo de cambio de referencia a pesos (1 si ya es pesos):', '1')) || 1;
    const { data, error } = await sb.from('fz_efectivo_monedas').insert({ business_id: b.id, nombre, saldo_inicial: saldoInicial, tc_reporte: tcReporte, activo: true }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    STATE_monedaAbierta = data.id;
    renderEfectivo();
  });
  el.querySelectorAll('.moneda-tab').forEach(tab => {
    tab.addEventListener('click', () => { STATE_monedaAbierta = tab.dataset.id; renderEfectivo(); });
  });

  if (STATE_monedaAbierta) {
    const moneda = monedasConSaldo.find(m => m.id === STATE_monedaAbierta);
    if (moneda) renderMonedaLedger(moneda, b.id, conceptosEfectivo);
  } else {
    document.getElementById('monedaLedger').innerHTML = `<div class="empty">Agrega tu primera moneda o caja de efectivo.</div>`;
  }
}

async function renderMonedaLedger(moneda, businessId, conceptosEfectivo) {
  const box = document.getElementById('monedaLedger');
  const [ledger, subcuentas, mayores, facturasPend, cuentasBancoQ, monedasEfectivoQ] = await Promise.all([
    getMonedaLedgerRows(businessId, moneda, conceptosEfectivo),
    loadSubcuentas(businessId),
    loadCuentasMayor(businessId),
    sb.from('fz_proveedores').select('id,proveedor,factura,importe').eq('business_id', businessId).eq('estatus', 'Pendiente').then(r => r.data || []),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
  ]);
  const traspasoCtx = { cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasEfectivoQ.data || [], origenTipo: 'efectivo', origenId: moneda.id, origenNombre: 'la caja ' + moneda.nombre, origenCorto: 'Caja — ' + moneda.nombre };
  let saldo = Number(moneda.saldo_inicial) || 0;
  const rowsHtml = ledger.map(r => {
    saldo += (Number(r.depositos) || 0) - (Number(r.cargos) || 0);
    if (r.auto) {
      return `<tr style="background:#f7f9fc;">
        <td>${r.fecha}</td>
        <td><em>${r.proveedor}</em> <span style="color:var(--muted);font-size:11px;">· auto</span></td>
        <td>${r.descripcion}</td>
        <td class="num">—</td>
        <td class="num">${fmtNum(r.depositos)}</td>
        <td class="num" style="font-weight:700;">${fmtNum(saldo)}</td>
        <td>—</td><td></td>
      </tr>`;
    }
    return `<tr>
      <td><input class="cell mov-cell" type="date" value="${r.fecha}" data-id="${r.id}" data-field="fecha"></td>
      <td><input class="cell mov-cell" type="text" value="${r.proveedor||''}" data-id="${r.id}" data-field="proveedor"></td>
      <td><input class="cell mov-cell" type="text" value="${r.descripcion||''}" data-id="${r.id}" data-field="descripcion"></td>
      <td><input class="cell mov-cell num" type="number" step="0.01" value="${r.cargos ?? 0}" data-id="${r.id}" data-field="cargos"></td>
      <td><input class="cell mov-cell num" type="number" step="0.01" value="${r.depositos ?? 0}" data-id="${r.id}" data-field="depositos"></td>
      <td class="num" style="font-weight:700;">${fmtNum(saldo)}</td>
      ${salidaCellsHtml(r, subcuentas, mayores, facturasPend, 'mov', traspasoCtx)}
      <td><button class="row-del mov-del" data-id="${r.id}">✕</button></td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="card-head" style="margin-top:14px;">
      <span class="hint">Saldo inicial: ${fmtNum(moneda.saldo_inicial || 0)} ${moneda.nombre}</span>
      <button class="btn btn-ghost btn-sm" id="addMovBtn">+ Agregar movimiento (pago en efectivo)</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor / Concepto</th><th>Descripción</th><th>Cargos</th><th>Depósitos</th><th>Saldo</th><th>Tipo de salida</th><th>Detalle</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="9" class="empty">Sin movimientos todavía.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('addMovBtn').addEventListener('click', async () => {
    await sb.from('fz_efectivo_mov').insert({ business_id: businessId, moneda_id: moneda.id, fecha: todayStr(), proveedor: '', cargos: 0, depositos: 0, tipo_salida: 'otro' });
    const m2 = { ...moneda };
    renderMonedaLedger(m2, businessId, conceptosEfectivo);
  });
  wireSalidaCellHandlers(box, 'fz_efectivo_mov', () => renderMonedaLedger(moneda, businessId, conceptosEfectivo), traspasoCtx);
  box.querySelectorAll('.mov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      const val = (field === 'fecha' || field === 'proveedor' || field === 'descripcion' || field === 'factura') ? inp.value : Number(inp.value) || 0;
      await sb.from('fz_efectivo_mov').update({ [field]: val }).eq('id', inp.dataset.id);
      renderMonedaLedger(moneda, businessId, conceptosEfectivo);
    });
  });
  box.querySelectorAll('.mov-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('fz_efectivo_mov').delete().eq('id', btn.dataset.id);
      renderMonedaLedger(moneda, businessId, conceptosEfectivo);
    });
  });
}

/* ============================================================
   BANCOS
   ============================================================ */
let STATE_bancoCuentaAbierta = null;

async function renderBancos() {
  const el = document.getElementById('sec-bancos');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }

  const [cuentasQ, conceptosQ] = await Promise.all([
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).order('nombre'),
    sb.from('fz_conceptos').select('*').eq('business_id', b.id).eq('categoria', 'tarjetas'),
  ]);
  if (cuentasQ.error) { el.innerHTML = `<div class="empty">Error: ${cuentasQ.error.message}</div>`; return; }
  const conceptosTarjetas = conceptosQ.data || [];

  const cuentasConSaldo = [];
  for (const c of (cuentasQ.data || [])) {
    const saldo = await computeBancoSaldo(b.id, c, conceptosTarjetas);
    cuentasConSaldo.push({ ...c, saldo });
  }
  const totalBancos = cuentasConSaldo.filter(c=>c.activo!==false).reduce((s,c)=>s+c.saldo,0);

  if (!STATE_bancoCuentaAbierta && cuentasConSaldo.length) STATE_bancoCuentaAbierta = cuentasConSaldo[0].id;

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total en bancos</div><div class="value num green">${fmt(totalBancos)}</div></div>
      <div class="kpi"><div class="label">Cuentas activas</div><div class="value">${cuentasConSaldo.filter(c=>c.activo!==false).length}</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Cuentas bancarias</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="traspasoBtnBanco">🔁 Transferir</button>
          <button class="btn btn-gold btn-sm" id="addCuentaBtn">+ Agregar cuenta</button>
        </div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Las terminales/tarjetas conciliadas en Ventas que estén vinculadas a una cuenta (en "⚙ Conceptos de recibido") entran aquí automáticamente como "Corte de caja". Dentro de cada cuenta puedes importar su estado de cuenta desde Excel.</p>
      <div class="tag-row">
        ${cuentasConSaldo.map(c => `<div class="tag banco-tab ${c.id===STATE_bancoCuentaAbierta?'active':''}" data-id="${c.id}">${c.nombre} · ${fmt(c.saldo)}</div>`).join('') || '<span class="hint">Aún no hay cuentas.</span>'}
      </div>
      <div id="bancoLedger"></div>
    </div>
  `;

  document.getElementById('traspasoBtnBanco').addEventListener('click', () => openTraspasoModal(b.id, renderBancos));
  document.getElementById('addCuentaBtn').addEventListener('click', async () => {
    const nombre = prompt('Nombre de la cuenta / banco (ej. Banco-Peibo):');
    if (!nombre) return;
    const saldoInicial = Number(prompt('Saldo inicial (opcional, 0 si no aplica):', '0')) || 0;
    const { data, error: e2 } = await sb.from('fz_bancos_cuentas').insert({ business_id: b.id, nombre, saldo_inicial: saldoInicial, activo: true }).select().single();
    if (e2) { toast('Error: ' + e2.message, 'error'); return; }
    STATE_bancoCuentaAbierta = data.id;
    renderBancos();
  });

  el.querySelectorAll('.banco-tab').forEach(tab => {
    tab.addEventListener('click', () => { STATE_bancoCuentaAbierta = tab.dataset.id; renderBancos(); });
  });

  if (STATE_bancoCuentaAbierta) renderBancoLedger(STATE_bancoCuentaAbierta, b.id, conceptosTarjetas);
  else document.getElementById('bancoLedger').innerHTML = `<div class="empty">Agrega tu primera cuenta bancaria.</div>`;
}

async function renderBancoLedger(cuentaId, businessId, conceptosTarjetas) {
  const box = document.getElementById('bancoLedger');
  const cuentaQ = await sb.from('fz_bancos_cuentas').select('*').eq('id', cuentaId).single();
  const cuentaArr = cuentaQ.data;
  if (!conceptosTarjetas) {
    const { data } = await sb.from('fz_conceptos').select('*').eq('business_id', businessId).eq('categoria', 'tarjetas');
    conceptosTarjetas = data || [];
  }
  const [ledger, subcuentas, mayores, facturasPend, cuentasBancoQ, monedasEfectivoQ] = await Promise.all([
    getBancoLedgerRows(businessId, cuentaArr, conceptosTarjetas),
    loadSubcuentas(businessId),
    loadCuentasMayor(businessId),
    sb.from('fz_proveedores').select('id,proveedor,factura,importe').eq('business_id', businessId).eq('estatus', 'Pendiente').then(r => r.data || []),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
  ]);
  const traspasoCtx = { cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasEfectivoQ.data || [], origenTipo: 'banco', origenId: cuentaId, origenNombre: 'el banco ' + (cuentaArr?.nombre || ''), origenCorto: 'Banco — ' + (cuentaArr?.nombre || '') };
  let saldo = Number(cuentaArr?.saldo_inicial) || 0;
  const rowsHtml = ledger.map(m => {
    saldo += (Number(m.depositos)||0) - (Number(m.cargos)||0);
    if (m.auto) {
      return `<tr style="background:#f7f9fc;">
        <td>${m.fecha}</td>
        <td><em>${m.descripcion}</em> <span style="color:var(--muted);font-size:11px;">· auto</span></td>
        <td>${m.concepto}</td>
        <td>—</td>
        <td class="num">${fmtNum(m.depositos)}</td>
        <td class="num">—</td>
        <td class="num" style="font-weight:700;">${fmt(saldo)}</td>
        <td>—</td><td>—</td><td></td>
      </tr>`;
    }
    return `<tr>
      <td><input class="cell mov-cell" type="date" value="${m.fecha}" data-id="${m.id}" data-field="fecha"></td>
      <td><input class="cell mov-cell" type="text" value="${m.descripcion||''}" data-id="${m.id}" data-field="descripcion"></td>
      <td><input class="cell mov-cell" type="text" value="${m.concepto||''}" data-id="${m.id}" data-field="concepto"></td>
      <td><input class="cell mov-cell" type="text" value="${m.referencia||''}" data-id="${m.id}" data-field="referencia"></td>
      <td><input class="cell mov-cell num" type="number" step="0.01" value="${m.depositos ?? 0}" data-id="${m.id}" data-field="depositos"></td>
      <td><input class="cell mov-cell num" type="number" step="0.01" value="${m.cargos ?? 0}" data-id="${m.id}" data-field="cargos"></td>
      <td class="num" style="font-weight:700;">${fmt(saldo)}</td>
      ${salidaCellsHtml(m, subcuentas, mayores, facturasPend, 'mov', traspasoCtx)}
      <td><button class="row-del mov-del" data-id="${m.id}">✕</button></td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="card-head" style="margin-top:14px;">
      <span class="hint">Saldo inicial: ${fmt(cuentaArr?.saldo_inicial || 0)}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" id="importMovBtn">📥 Importar movimientos (Excel)</button>
        <button class="btn btn-ghost btn-sm" id="addMovBtn">+ Agregar movimiento</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Descripción</th><th>Concepto</th><th>Referencia</th><th>Depósitos</th><th>Cargos</th><th>Saldo</th><th>Tipo de salida</th><th>Detalle</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="10" class="empty">Sin movimientos.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('importMovBtn').addEventListener('click', () => openImportExcelModal('bancos_mov', businessId, () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas), cuentaId));
  document.getElementById('addMovBtn').addEventListener('click', async () => {
    await sb.from('fz_bancos_mov').insert({ cuenta_id: cuentaId, business_id: businessId, fecha: todayStr(), tipo_salida: 'otro' });
    renderBancoLedger(cuentaId, businessId, conceptosTarjetas);
  });
  wireSalidaCellHandlers(box, 'fz_bancos_mov', () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas), traspasoCtx);
  box.querySelectorAll('.mov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      const val = (field === 'fecha' || field === 'descripcion' || field === 'concepto' || field === 'referencia') ? inp.value : Number(inp.value) || 0;
      await sb.from('fz_bancos_mov').update({ [field]: val }).eq('id', inp.dataset.id);
      renderBancoLedger(cuentaId, businessId, conceptosTarjetas);
    });
  });
  box.querySelectorAll('.mov-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('fz_bancos_mov').delete().eq('id', btn.dataset.id);
      renderBancoLedger(cuentaId, businessId, conceptosTarjetas);
    });
  });
}

/* ============================================================
   PROVEEDORES
   ============================================================ */
let STATE_provFiltro = 'Todos';

async function renderProveedores() {
  const el = document.getElementById('sec-proveedores');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const [provQ, catalogo, cuentasBancoQ, monedasQ] = await Promise.all([
    sb.from('fz_proveedores').select('*').eq('business_id', b.id).order('fecha', { ascending: false }),
    loadProveedoresCatalogo(b.id),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).eq('activo', true),
  ]);
  if (provQ.error) { el.innerHTML = `<div class="empty">Error: ${provQ.error.message}</div>`; return; }
  const all = provQ.data || [];
  const opcionesPagoDesde = [
    ...(cuentasBancoQ.data || []).map(c => 'Banco — ' + c.nombre),
    ...(monedasQ.data || []).map(m => 'Caja — ' + m.nombre),
  ];
  const pendiente = all.filter(p => p.estatus === 'Pendiente').reduce((s,p)=>s+(Number(p.importe)||0),0);
  const pagado = all.filter(p => p.estatus === 'Pagado').reduce((s,p)=>s+(Number(p.importe)||0),0);
  const rows = STATE_provFiltro === 'Todos' ? all : all.filter(p => p.estatus === STATE_provFiltro);

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total pendiente</div><div class="value num red">${fmt(pendiente)}</div></div>
      <div class="kpi"><div class="label">Total pagado (histórico)</div><div class="value num green">${fmt(pagado)}</div></div>
      <div class="kpi"><div class="label">Facturas registradas</div><div class="value">${all.length}</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Cuentas por pagar</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="openProveedoresCatBtn">⚙ Catálogo de proveedores</button>
          <button class="btn btn-ghost btn-sm" id="openCuentasBtnProv">⚙ Catálogo de cuentas</button>
          <button class="btn btn-ghost btn-sm" id="importFacturasBtn">📥 Importar facturas (Excel)</button>
          <button class="btn btn-gold btn-sm" id="addProvBtn">+ Agregar factura</button>
        </div>
      </div>
      <div class="tag-row">
        ${['Todos','Pendiente','Pagado'].map(f => `<div class="tag prov-tab ${STATE_provFiltro===f?'active':''}" data-f="${f}">${f}</div>`).join('')}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Importe</th><th>Desglose</th><th>Estatus</th><th>Fecha pago</th><th>Pagado desde</th><th></th></tr></thead>
          <tbody>
            ${rows.map(p => provRowHtml(p, catalogo, opcionesPagoDesde)).join('') || `<tr><td colspan="9" class="empty">Sin registros.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('addProvBtn').addEventListener('click', async () => {
    await sb.from('fz_proveedores').insert({ business_id: b.id, fecha: todayStr(), proveedor: catalogo[0]?.nombre || 'Nuevo proveedor', proveedor_id: catalogo[0]?.id || null, importe: 0, estatus: 'Pendiente' });
    renderProveedores();
  });
  document.getElementById('openProveedoresCatBtn').addEventListener('click', () => openProveedoresCatModal(b.id, renderProveedores));
  document.getElementById('openCuentasBtnProv').addEventListener('click', () => openCuentasModal(b.id, renderProveedores));
  document.getElementById('importFacturasBtn').addEventListener('click', () => openImportExcelModal('facturas', b.id, renderProveedores));
  el.querySelectorAll('.prov-tab').forEach(t => t.addEventListener('click', () => { STATE_provFiltro = t.dataset.f; renderProveedores(); }));
  el.querySelectorAll('.prov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      let val = inp.value;
      if (field === 'importe') val = Number(val) || 0;
      const payload = { [field]: val };
      if (field === 'proveedor_id') {
        const c = catalogo.find(x => x.id === val);
        payload.proveedor = c ? c.nombre : '';
      }
      await sb.from('fz_proveedores').update(payload).eq('id', inp.dataset.id);
      renderProveedores();
    });
  });
  el.querySelectorAll('.prov-del').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_proveedores').delete().eq('id', btn.dataset.id);
    renderProveedores();
  }));
  el.querySelectorAll('.prov-desglosar').forEach(btn => btn.addEventListener('click', () => openDesgloseModal(b.id, btn.dataset.id, renderProveedores)));
}

function provRowHtml(p, catalogo, opcionesPagoDesde) {
  const desgloseTotal = Object.values(p.desglose || {}).reduce((s,v)=>s+(Number(v)||0),0);
  const desgloseOk = Math.abs(desgloseTotal - (Number(p.importe)||0)) < 1 && desgloseTotal > 0;
  return `<tr>
    <td><input class="cell prov-cell" type="date" value="${p.fecha}" data-id="${p.id}" data-field="fecha"></td>
    <td><select class="cell prov-cell" data-id="${p.id}" data-field="proveedor_id" style="min-width:220px;">
      <option value="">${p.proveedor || '— elegir —'}</option>
      ${catalogo.map(c => `<option value="${c.id}" ${p.proveedor_id===c.id?'selected':''}>${c.razon_social ? c.razon_social + ' — ' : ''}${c.nombre_comercial || c.nombre}</option>`).join('')}
    </select></td>
    <td><input class="cell prov-cell" type="text" value="${p.factura||''}" data-id="${p.id}" data-field="factura"></td>
    <td><input class="cell prov-cell num" type="number" step="0.01" value="${p.importe ?? 0}" data-id="${p.id}" data-field="importe"></td>
    <td><button class="btn btn-ghost btn-sm prov-desglosar" data-id="${p.id}" style="color:${desgloseOk?'var(--green)':(desgloseTotal>0?'var(--red)':'var(--muted)')};">${desgloseTotal>0?fmt(desgloseTotal):'Desglosar'}</button></td>
    <td><select class="cell prov-cell" data-id="${p.id}" data-field="estatus">
      <option ${p.estatus==='Pendiente'?'selected':''}>Pendiente</option>
      <option ${p.estatus==='Pagado'?'selected':''}>Pagado</option>
    </select></td>
    <td><input class="cell prov-cell" type="date" value="${p.fecha_pago||''}" data-id="${p.id}" data-field="fecha_pago"></td>
    <td><select class="cell prov-cell" data-id="${p.id}" data-field="pagado_desde" style="min-width:150px;">
      <option value="">— sin especificar —</option>
      ${opcionesPagoDesde.map(o => `<option ${p.pagado_desde===o?'selected':''}>${o}</option>`).join('')}
    </select></td>
    <td><button class="row-del prov-del" data-id="${p.id}">✕</button></td>
  </tr>`;
}

/* ============================================================
   P&L — ESTADO DE RESULTADOS
   ============================================================ */
let STATE_plVista = 'mensual'; // 'mensual' | 'acumulado'

function periodoPL(ym, vista) {
  const { start, end } = monthBounds(ym);
  if (vista === 'acumulado') {
    const year = ym.slice(0, 4);
    return { start: `${year}-01-01`, end, mesStart: `${year}-01`, mesEnd: ym };
  }
  return { start, end, mesStart: ym, mesEnd: ym };
}

async function getPolizasLineasPeriodo(businessId, periodo) {
  const { start, end } = periodo;
  const { data: polizas } = await sb.from('fz_polizas').select('id').eq('business_id', businessId).gte('fecha', start).lte('fecha', end);
  const ids = (polizas || []).map(p => p.id);
  if (!ids.length) return [];
  const { data: lineas } = await sb.from('fz_polizas_lineas').select('cargo,abono,subcuenta_id').in('poliza_id', ids);
  return lineas || [];
}

async function computeGastosClasificados(businessId, periodo, subcuentas, mayores) {
  const { start, end, mesStart, mesEnd } = periodo;
  const porSubcuenta = {}; // subcuenta_id -> monto
  let sinClasificar = 0;

  const [provQ, bancosMovQ, efvoMovQ, plGastosQ, lineasPoliza] = await Promise.all([
    sb.from('fz_proveedores').select('desglose').eq('business_id', businessId).gte('fecha', start).lte('fecha', end),
    sb.from('fz_bancos_mov').select('cargos,subcuenta_id').eq('business_id', businessId).eq('tipo_salida', 'gasto').gte('fecha', start).lte('fecha', end),
    sb.from('fz_efectivo_mov').select('cargos,subcuenta_id').eq('business_id', businessId).eq('tipo_salida', 'gasto').gte('fecha', start).lte('fecha', end),
    sb.from('fz_pl_gastos').select('*').eq('business_id', businessId).gte('mes', mesStart).lte('mes', mesEnd),
    getPolizasLineasPeriodo(businessId, periodo),
  ]);

  (provQ.data || []).forEach(f => {
    Object.entries(f.desglose || {}).forEach(([subId, monto]) => {
      porSubcuenta[subId] = (porSubcuenta[subId] || 0) + (Number(monto) || 0);
    });
  });
  [...(bancosMovQ.data || []), ...(efvoMovQ.data || [])].forEach(m => {
    if (m.subcuenta_id) porSubcuenta[m.subcuenta_id] = (porSubcuenta[m.subcuenta_id] || 0) + (Number(m.cargos) || 0);
    else sinClasificar += Number(m.cargos) || 0;
  });
  const gastosManuales = plGastosQ.data || [];
  gastosManuales.forEach(g => {
    if (g.subcuenta_id) porSubcuenta[g.subcuenta_id] = (porSubcuenta[g.subcuenta_id] || 0) + (Number(g.monto) || 0);
    else sinClasificar += Number(g.monto) || 0;
  });
  lineasPoliza.forEach(l => {
    if (!l.subcuenta_id) return;
    const sub = subcuentas.find(s => s.id === l.subcuenta_id);
    const mayor = sub && mayores.find(m => m.id === sub.cuenta_mayor_id);
    if (mayor && mayor.tipo === 'gasto') {
      porSubcuenta[l.subcuenta_id] = (porSubcuenta[l.subcuenta_id] || 0) + ((Number(l.cargo)||0) - (Number(l.abono)||0));
    }
  });

  const porMayor = mayores.filter(m=>m.tipo==='gasto').map(m => {
    const subs = subcuentas.filter(s => s.cuenta_mayor_id === m.id)
      .map(s => ({ nombre: s.nombre, monto: porSubcuenta[s.id] || 0 }))
      .filter(s => s.monto);
    return { nombre: m.nombre, subs, subtotal: subs.reduce((s,x)=>s+x.monto,0) };
  }).filter(m => m.subtotal);

  const totalClasificado = porMayor.reduce((s,m)=>s+m.subtotal,0);
  return { porMayor, sinClasificar, totalClasificado, gastosManuales };
}

async function computeIngresosPoliza(businessId, periodo, subcuentas, mayores) {
  const lineasPoliza = await getPolizasLineasPeriodo(businessId, periodo);
  const porSubcuenta = {};
  lineasPoliza.forEach(l => {
    if (!l.subcuenta_id) return;
    const sub = subcuentas.find(s => s.id === l.subcuenta_id);
    const mayor = sub && mayores.find(m => m.id === sub.cuenta_mayor_id);
    if (mayor && mayor.tipo === 'ingreso') {
      porSubcuenta[l.subcuenta_id] = (porSubcuenta[l.subcuenta_id] || 0) + ((Number(l.abono)||0) - (Number(l.cargo)||0));
    }
  });
  const porMayor = mayores.filter(m=>m.tipo==='ingreso').map(m => {
    const subs = subcuentas.filter(s => s.cuenta_mayor_id === m.id)
      .map(s => ({ nombre: s.nombre, monto: porSubcuenta[s.id] || 0 }))
      .filter(s => s.monto);
    return { nombre: m.nombre, subs, subtotal: subs.reduce((s,x)=>s+x.monto,0) };
  }).filter(m => m.subtotal);
  return { porMayor, total: porMayor.reduce((s,m)=>s+m.subtotal,0) };
}

async function renderPL() {
  const el = document.getElementById('sec-pl');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const periodo = periodoPL(STATE.currentMonth, STATE_plVista);

  const [ventasQ, conceptosVenta, conceptos, subcuentas, mayores] = await Promise.all([
    sb.from('fz_ventas').select('*').eq('business_id', b.id).gte('fecha', periodo.start).lte('fecha', periodo.end),
    loadConceptosVenta(b.id),
    loadConceptos(b.id),
    loadSubcuentas(b.id),
    loadCuentasMayor(b.id),
  ]);
  const v = ventasQ.data || [];
  const ingresosPorConcepto = conceptosVenta.map(c => ({
    nombre: c.nombre, tipo: c.tipo,
    monto: v.reduce((s, r) => s + (Number((r.venta_data || {})[c.id]) || 0), 0),
  }));
  const totalIngresosVentas = ingresosPorConcepto.reduce((s, i) => s + (i.tipo === 'resta' ? -i.monto : i.monto), 0);
  const gastosOperativos = v.reduce((s,r)=>s+(Number(r.gastos)||0),0);

  // Faltantes / sobrantes de caja detectados en la conciliación de Ventas
  const porCatPL = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  let diffPeriodo = 0;
  v.forEach(r => { diffPeriodo += computeRowDiffs(r, conceptosVenta, porCatPL).difTotal; });
  const faltanteCaja = diffPeriodo > 0 ? diffPeriodo : 0;
  const sobranteCaja = diffPeriodo < 0 ? -diffPeriodo : 0;

  const totalIngresos = totalIngresosVentas + sobranteCaja;

  const gClas = await computeGastosClasificados(b.id, periodo, subcuentas, mayores);
  const iPoliza = await computeIngresosPoliza(b.id, periodo, subcuentas, mayores);
  const totalIngresosFinal = totalIngresos + iPoliza.total;
  const gastosTotales = gastosOperativos + gClas.totalClasificado + gClas.sinClasificar + faltanteCaja;
  const utilidad = totalIngresosFinal - gastosTotales;
  const margen = totalIngresosFinal ? (utilidad/totalIngresosFinal*100) : 0;
  const periodoLabel = STATE_plVista === 'acumulado' ? `Acumulado ${STATE.currentMonth.slice(0,4)} (ene—${STATE.currentMonth.slice(5,7)})` : STATE.currentMonth;

  el.innerHTML = `
    <div class="tag-row">
      <div class="tag ${STATE_plVista==='mensual'?'active':''}" id="plTabMensual">Mensual</div>
      <div class="tag ${STATE_plVista==='acumulado'?'active':''}" id="plTabAcumulado">Acumulado</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total ingresos</div><div class="value num">${fmt(totalIngresosFinal)}</div></div>
      <div class="kpi"><div class="label">Total gastos</div><div class="value num red">${fmt(gastosTotales)}</div></div>
      <div class="kpi"><div class="label">Utilidad / Pérdida</div><div class="value num ${utilidad>=0?'green':'red'}">${fmt(utilidad)}</div></div>
      <div class="kpi"><div class="label">Margen</div><div class="value">${margen.toFixed(1)}%</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Ingresos — ${periodoLabel}</h3><span class="hint">Calculado de Ventas</span></div>
      <table>
        <tbody>
          ${ingresosPorConcepto.length ? ingresosPorConcepto.map(i => `<tr><td>${i.nombre}${i.tipo==='resta'?' (descuento)':''}</td><td class="num" style="${i.tipo==='resta'?'color:var(--red);':''}">${i.tipo==='resta'?'-':''}${fmt(i.monto)}</td></tr>`).join('') : `<tr><td colspan="2" class="empty">Este negocio no tiene categorías de venta configuradas (ve a Ventas → Configurar categorías de venta).</td></tr>`}
          ${sobranteCaja ? `<tr><td>Sobrante de caja (conciliación de Ventas)</td><td class="num" style="color:var(--green);">${fmt(sobranteCaja)}</td></tr>` : ''}
          ${iPoliza.porMayor.map(m => `
            <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">${m.nombre} (póliza)</td></tr>
            ${m.subs.map(s => `<tr><td style="padding-left:22px;">${s.nombre}</td><td class="num">${fmt(s.monto)}</td></tr>`).join('')}
          `).join('')}
          <tr class="total-row"><td>Total ingresos</td><td class="num">${fmt(totalIngresosFinal)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Gastos por cuenta — ${periodoLabel}</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="openCuentasBtnPL">⚙ Catálogo de cuentas</button>
          <button class="btn btn-gold btn-sm" id="addGastoBtn">+ Ajuste manual</button>
        </div>
      </div>
      <table>
        <tbody>
          <tr><td>Gastos operativos del día (desde Ventas, sin clasificar)</td><td class="num">${fmt(gastosOperativos)}</td><td></td></tr>
          ${faltanteCaja ? `<tr><td>Faltante de caja (conciliación de Ventas)</td><td class="num" style="color:var(--red);">${fmt(faltanteCaja)}</td><td></td></tr>` : ''}
          ${gClas.porMayor.map(m => `
            <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">${m.nombre}</td><td></td></tr>
            ${m.subs.map(s => `<tr><td style="padding-left:22px;">${s.nombre}</td><td class="num">${fmt(s.monto)}</td><td></td></tr>`).join('')}
            <tr><td style="padding-left:22px;font-style:italic;color:var(--muted);">Subtotal ${m.nombre}</td><td class="num" style="font-weight:600;">${fmt(m.subtotal)}</td><td></td></tr>
          `).join('')}
          ${gClas.sinClasificar ? `<tr><td>Otros gastos sin subcuenta asignada</td><td class="num">${fmt(gClas.sinClasificar)}</td><td></td></tr>` : ''}
          <tr class="total-row"><td>Total gastos</td><td class="num">${fmt(gastosTotales)}</td><td></td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:var(--muted);margin-top:10px;">Los gastos se toman de las facturas de Proveedores (por su desglose), de las salidas de Bancos/Efectivo marcadas como "Gasto", y de los ajustes manuales de abajo.</p>
      ${gClas.gastosManuales.length ? `
      <div class="table-wrap" style="margin-top:14px;">
        <table>
          <thead><tr><th>Mes</th><th>Subcuenta</th><th>Monto</th><th></th></tr></thead>
          <tbody>
            ${gClas.gastosManuales.map(g => `<tr>
              <td>${g.mes}</td>
              <td><select class="cell gasto-cell" data-id="${g.id}" data-field="subcuenta_id">
                <option value="">— sin subcuenta —</option>
                ${subcuentas.map(s => { const mm = mayores.find(x=>x.id===s.cuenta_mayor_id); return `<option value="${s.id}" ${g.subcuenta_id===s.id?'selected':''}>${mm?mm.nombre+' › ':''}${s.nombre}</option>`; }).join('')}
              </select></td>
              <td><input class="cell gasto-cell num" type="number" step="0.01" value="${g.monto ?? 0}" data-id="${g.id}" data-field="monto"></td>
              <td><button class="row-del gasto-del" data-id="${g.id}">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h3>Resultado</h3></div>
      <table>
        <tbody>
          <tr><td>Total ingresos</td><td class="num">${fmt(totalIngresosFinal)}</td></tr>
          <tr><td>Total gastos</td><td class="num" style="color:var(--red);">-${fmt(gastosTotales)}</td></tr>
          <tr class="total-row"><td>Utilidad / Pérdida neta</td><td class="num ${utilidad>=0?'':'red'}" style="color:${utilidad>=0?'var(--green)':'var(--red)'};">${fmt(utilidad)}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('plTabMensual').addEventListener('click', () => { STATE_plVista = 'mensual'; renderPL(); });
  document.getElementById('plTabAcumulado').addEventListener('click', () => { STATE_plVista = 'acumulado'; renderPL(); });
  document.getElementById('openCuentasBtnPL').addEventListener('click', () => openCuentasModal(b.id, renderPL));
  document.getElementById('addGastoBtn').addEventListener('click', async () => {
    await sb.from('fz_pl_gastos').insert({ business_id: b.id, mes: STATE.currentMonth, monto: 0 });
    renderPL();
  });
  el.querySelectorAll('.gasto-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      const val = field === 'monto' ? Number(inp.value) || 0 : (inp.value || null);
      await sb.from('fz_pl_gastos').update({ [field]: val }).eq('id', inp.dataset.id);
      renderPL();
    });
  });
  el.querySelectorAll('.gasto-del').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_pl_gastos').delete().eq('id', btn.dataset.id);
    renderPL();
  }));
}

/* ============================================================
   FLUJO DE EFECTIVO / CASH POSITION
   ============================================================ */
async function renderFlujo() {
  const el = document.getElementById('sec-flujo');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const s = await computeBusinessSummary(b.id, STATE.currentMonth);

  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Cash Position — ${b.name}</h3><span class="hint">Al día de hoy</span></div>
      <table>
        <tbody>
          ${s.efectivoDetalle.map(m => `<tr><td>Caja — ${m.nombre} (${fmtNum(m.saldo)} × TC ${fmtNum(m.tc)})</td><td class="num">${fmt(m.pesoEquiv)}</td></tr>`).join('')}
          ${s.bancosDetalle.map(d => `<tr><td>Banco — ${d.nombre}${d.activo?'':' (inactiva)'}</td><td class="num">${fmt(d.saldo)}</td></tr>`).join('')}
          <tr class="total-row"><td>Total disponible (caja + bancos)</td><td class="num">${fmt(s.efectivoTotal + s.bancosTotal)}</td></tr>
          <tr><td>Menos: proveedores pendientes de pago</td><td class="num" style="color:var(--red);">-${fmt(s.proveedoresPendientes)}</td></tr>
          <tr class="total-row"><td>Posición neta de efectivo</td><td class="num" style="color:${s.posicionNeta>=0?'var(--green)':'var(--red)'};font-size:16px;">${fmt(s.posicionNeta)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-head"><h3>Resumen del mes — ${STATE.currentMonth}</h3></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Ventas del mes</div><div class="value num">${fmt(s.ventasMes)}</div></div>
        <div class="kpi"><div class="label">Gastos operativos del mes</div><div class="value num red">${fmt(s.gastosOperativosMes)}</div></div>
      </div>
    </div>
  `;
}

checkSession();

/* ============================================================
   PÓLIZAS DE DIARIO — partida doble (Cargo / Abono)
   ============================================================ */
async function loadPolizas(businessId) {
  const { data } = await sb.from('fz_polizas').select('*').eq('business_id', businessId).order('fecha', { ascending: false }).order('numero', { ascending: false });
  return data || [];
}
async function loadTodasLasLineas(businessId) {
  const { data } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId);
  return data || [];
}

async function renderPolizas() {
  const el = document.getElementById('sec-polizas');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }

  const [polizas, lineas, subcuentas, mayores] = await Promise.all([
    loadPolizas(b.id), loadTodasLasLineas(b.id), loadSubcuentas(b.id), loadCuentasMayor(b.id),
  ]);

  const subcuentaOptions = subcuentas.map(s => {
    const m = mayores.find(x => x.id === s.cuenta_mayor_id);
    return `<option value="${s.id}">${m ? m.nombre + ' › ' : ''}${s.nombre}${m ? ' (' + (TIPO_CUENTA_LABEL[m.tipo]||m.tipo) + ')' : ''}</option>`;
  }).join('');

  const totalCuadradas = polizas.filter(p => {
    const ls = lineas.filter(l => l.poliza_id === p.id);
    const c = ls.reduce((s,l)=>s+(Number(l.cargo)||0),0), a = ls.reduce((s,l)=>s+(Number(l.abono)||0),0);
    return Math.abs(c - a) < 0.01 && ls.length > 0;
  }).length;

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Pólizas registradas</div><div class="value">${polizas.length}</div></div>
      <div class="kpi"><div class="label">Cuadradas</div><div class="value num green">${totalCuadradas}</div></div>
      <div class="kpi"><div class="label">Descuadradas</div><div class="value num ${polizas.length-totalCuadradas>0?'red':''}">${polizas.length - totalCuadradas}</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Pólizas de Diario</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="openCuentasBtnPolizas">⚙ Catálogo de cuentas</button>
          <button class="btn btn-gold btn-sm" id="addPolizaBtn">+ Nueva póliza</button>
        </div>
      </div>
      ${subcuentas.length === 0 ? `<div class="empty">Aún no tienes cuentas en el catálogo. Crea al menos una (de cualquier tipo) para poder registrar pólizas.</div>` : ''}
      <div id="polizasList">
        ${polizas.length === 0 ? `<div class="empty">Sin pólizas todavía.</div>` : polizas.map(p => polizaCardHtml(p, lineas.filter(l=>l.poliza_id===p.id), subcuentaOptions, subcuentas, mayores)).join('')}
      </div>
    </div>
  `;

  document.getElementById('openCuentasBtnPolizas').addEventListener('click', () => openCuentasModal(b.id, renderPolizas));
  document.getElementById('addPolizaBtn').addEventListener('click', async () => {
    const maxNum = polizas.reduce((mx,p)=>Math.max(mx, p.numero||0), 0);
    const { data, error } = await sb.from('fz_polizas').insert({ business_id: b.id, numero: maxNum+1, fecha: todayStr(), concepto: '' }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('fz_polizas_lineas').insert([
      { business_id: b.id, poliza_id: data.id, cargo: 0, abono: 0 },
      { business_id: b.id, poliza_id: data.id, cargo: 0, abono: 0 },
    ]);
    renderPolizas();
  });
  wirePolizaHandlers(el, b.id);
}

function polizaCardHtml(p, lineasPoliza, subcuentaOptions, subcuentas, mayores) {
  const totalCargo = lineasPoliza.reduce((s,l)=>s+(Number(l.cargo)||0),0);
  const totalAbono = lineasPoliza.reduce((s,l)=>s+(Number(l.abono)||0),0);
  const diff = totalCargo - totalAbono;
  const cuadrada = Math.abs(diff) < 0.01;
  return `
    <div class="card" style="background:#fbfcfe;border:1.5px solid var(--line);margin-bottom:16px;">
      <div class="card-head" style="margin-bottom:10px;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <strong style="color:var(--navy-1);">Póliza #${p.numero ?? '—'}</strong>
          <input class="cell poliza-cell" type="date" value="${p.fecha}" data-id="${p.id}" data-field="fecha" style="width:auto;">
          <input class="cell poliza-cell" type="text" placeholder="Concepto de la póliza" value="${p.concepto||''}" data-id="${p.id}" data-field="concepto" style="min-width:220px;">
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="badge ${cuadrada?'pag':'pend'}">${cuadrada ? 'Cuadrada' : 'Diferencia ' + fmt(diff)}</span>
          <button class="row-del poliza-del" data-id="${p.id}" style="font-size:16px;">✕</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Subcuenta</th><th>Descripción</th><th>Cargo</th><th>Abono</th><th></th></tr></thead>
          <tbody>
            ${lineasPoliza.map(l => `<tr>
              <td><select class="cell linea-cell" data-id="${l.id}" data-field="subcuenta_id"><option value="">— elegir —</option>${subcuentaOptions.replace(`value="${l.subcuenta_id}"`, `value="${l.subcuenta_id}" selected`)}</select></td>
              <td><input class="cell linea-cell" type="text" value="${l.descripcion||''}" data-id="${l.id}" data-field="descripcion"></td>
              <td><input class="cell linea-cell num" type="number" step="0.01" value="${l.cargo ?? 0}" data-id="${l.id}" data-field="cargo"></td>
              <td><input class="cell linea-cell num" type="number" step="0.01" value="${l.abono ?? 0}" data-id="${l.id}" data-field="abono"></td>
              <td><button class="row-del linea-del" data-id="${l.id}">✕</button></td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="2">Totales</td>
              <td class="num">${fmt(totalCargo)}</td>
              <td class="num">${fmt(totalAbono)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn-ghost btn-sm addLineaBtn" data-poliza="${p.id}" style="margin-top:10px;">+ Agregar línea</button>
    </div>`;
}

function wirePolizaHandlers(el, businessId) {
  el.querySelectorAll('.poliza-cell').forEach(inp => inp.addEventListener('change', async () => {
    await sb.from('fz_polizas').update({ [inp.dataset.field]: inp.value }).eq('id', inp.dataset.id);
    renderPolizas();
  }));
  el.querySelectorAll('.poliza-del').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_polizas').delete().eq('id', btn.dataset.id);
    renderPolizas();
  }));
  el.querySelectorAll('.linea-cell').forEach(inp => inp.addEventListener('change', async () => {
    const field = inp.dataset.field;
    const val = (field === 'descripcion' || field === 'subcuenta_id') ? (inp.value || null) : (Number(inp.value) || 0);
    await sb.from('fz_polizas_lineas').update({ [field]: val }).eq('id', inp.dataset.id);
    renderPolizas();
  }));
  el.querySelectorAll('.linea-del').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_polizas_lineas').delete().eq('id', btn.dataset.id);
    renderPolizas();
  }));
  el.querySelectorAll('.addLineaBtn').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_polizas_lineas').insert({ business_id: businessId, poliza_id: btn.dataset.poliza, cargo: 0, abono: 0 });
    renderPolizas();
  }));
}
