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
  esPropietario: false,
  negociosPermitidos: null, // null = sin restricción (propietario); array de ids = restringido
};

/* ---------- Utilidades ---------- */
const fmt = (n) => {
  n = Number(n) || 0;
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
};
const fmtNum = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };
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
  if (error) { toast('Error verificando acceso: ' + error.message, 'error'); return { autorizado: false }; }
  const row = data?.[0];
  if (!row || row.activo === false) return { autorizado: false };
  STATE.esPropietario = !!row.es_propietario;
  if (!STATE.esPropietario) {
    const { data: permisos } = await sb.from('fz_usuario_negocios').select('business_id').ilike('email', email);
    STATE.negociosPermitidos = (permisos || []).map(p => p.business_id);
  } else {
    STATE.negociosPermitidos = null; // null = sin restricción
  }
  return { autorizado: true };
}

/* ---------- BOOT ---------- */
async function boot() {
  const { autorizado } = await checkAcceso(STATE.user.email);
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
  if (!STATE.esPropietario) {
    document.getElementById('openUsuariosBtn').style.display = 'none';
    document.getElementById('addBizBtn').style.display = 'none';
  }

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
async function loadTodosNegociosSinFiltro() {
  const { data } = await sb.from('businesses').select('*').order('name');
  return data || [];
}
async function loadUsuarioNegocios(email) {
  const { data } = await sb.from('fz_usuario_negocios').select('business_id').ilike('email', email);
  return (data || []).map(r => r.business_id);
}
async function openUsuariosModal() {
  await renderUsuariosList();
  document.getElementById('modalUsuarios').classList.add('show');
  document.getElementById('closeUsuarios').onclick = () => document.getElementById('modalUsuarios').classList.remove('show');
  document.getElementById('saveUsuario').onclick = async () => {
    const email = document.getElementById('newUsuarioEmail').value.trim().toLowerCase();
    const nombre = document.getElementById('newUsuarioNombre').value.trim();
    const esPropietario = document.getElementById('newUsuarioPropietario').checked;
    if (!email) { toast('Escribe un correo.', 'error'); return; }
    const { error } = await sb.from('fz_usuarios_autorizados').insert({ email, nombre: nombre || null, es_propietario: esPropietario });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newUsuarioEmail').value = '';
    document.getElementById('newUsuarioNombre').value = '';
    document.getElementById('newUsuarioPropietario').checked = false;
    renderUsuariosList();
  };
}
async function renderUsuariosList() {
  const [usuarios, todosNegocios] = await Promise.all([loadUsuariosAutorizados(), loadTodosNegociosSinFiltro()]);
  const box = document.getElementById('usuariosList');
  if (!usuarios.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Sin usuarios autorizados todavía.</div>`; return; }

  const bloques = await Promise.all(usuarios.map(async u => {
    const negociosDe = u.es_propietario ? [] : await loadUsuarioNegocios(u.email);
    return `
    <div style="padding:10px 4px;border-bottom:1px solid var(--line);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="min-width:0;">
          <strong>${u.email}</strong>${u.email.toLowerCase()===STATE.user.email.toLowerCase()?' <span style="color:var(--muted);font-size:11px;">(tú)</span>':''}
          ${u.nombre ? `<div style="color:var(--muted);font-size:12px;">${u.nombre}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);cursor:pointer;">
            <input type="checkbox" class="usuario-propietario" data-id="${u.id}" ${u.es_propietario?'checked':''}> Propietario
          </label>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);cursor:pointer;">
            <input type="checkbox" class="usuario-activo" data-id="${u.id}" ${u.activo!==false?'checked':''}> Activo
          </label>
          <button class="row-del usuario-del" data-id="${u.id}" style="font-size:15px;">✕</button>
        </div>
      </div>
      ${!u.es_propietario ? `
        <div style="margin-top:8px;padding:8px 10px;background:#f7f9fc;border-radius:8px;">
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:6px;">Negocios que puede ver:</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${todosNegocios.map(n => `
              <label style="display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;">
                <input type="checkbox" class="usuario-negocio" data-email="${u.email}" data-negocio="${n.id}" ${negociosDe.includes(n.id)?'checked':''}> ${n.name}
              </label>`).join('') || '<span style="font-size:12px;color:var(--muted);">Aún no hay negocios creados.</span>'}
          </div>
        </div>` : `<div style="margin-top:6px;font-size:11.5px;color:var(--green);">Ve todos los negocios y el dashboard consolidado.</div>`}
    </div>`;
  }));
  box.innerHTML = bloques.join('');

  box.querySelectorAll('.usuario-propietario').forEach(chk => chk.addEventListener('change', async () => {
    await sb.from('fz_usuarios_autorizados').update({ es_propietario: chk.checked }).eq('id', chk.dataset.id);
    renderUsuariosList();
  }));
  box.querySelectorAll('.usuario-activo').forEach(chk => chk.addEventListener('change', async () => {
    await sb.from('fz_usuarios_autorizados').update({ activo: chk.checked }).eq('id', chk.dataset.id);
    renderUsuariosList();
  }));
  box.querySelectorAll('.usuario-negocio').forEach(chk => chk.addEventListener('change', async () => {
    const email = chk.dataset.email, negocioId = chk.dataset.negocio;
    if (chk.checked) {
      await sb.from('fz_usuario_negocios').insert({ email, business_id: negocioId });
    } else {
      await sb.from('fz_usuario_negocios').delete().ilike('email', email).eq('business_id', negocioId);
    }
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
  let todos = data || [];
  if (!STATE.esPropietario && Array.isArray(STATE.negociosPermitidos)) {
    todos = todos.filter(b => STATE.negociosPermitidos.includes(b.id));
  }
  STATE.businesses = todos;
  if (!STATE.businesses.length) {
    document.getElementById('bizSelect').innerHTML = '';
    return;
  }
  const guardado = localStorage.getItem('finanzas_ultimo_negocio');
  if (guardado && STATE.businesses.find(b => b.id === guardado)) {
    STATE.currentBusinessId = guardado;
  } else if (!STATE.currentBusinessId || !STATE.businesses.find(b => b.id === STATE.currentBusinessId)) {
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
    localStorage.setItem('finanzas_ultimo_negocio', e.target.value);
    renderCurrentSection();
    cerrarMenuMovil();
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
    localStorage.setItem('finanzas_ultimo_negocio', data.id);
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
  efectivo: { title: 'Efectivo & Divisas', sub: '', showMonth: true, needsBiz: true },
  bancos: { title: 'Bancos', sub: '', showMonth: true, needsBiz: true },
  proveedores: { title: 'Proveedores', sub: '', showMonth: false, needsBiz: true },
  pl: { title: 'P&L', sub: '', showMonth: true, needsBiz: true },
  flujo: { title: 'Flujo de Efectivo', sub: '', showMonth: false, needsBiz: true },
  polizas: { title: 'Pólizas de Diario', sub: '', showMonth: false, needsBiz: true },
};

function cerrarMenuMovil() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
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
      cerrarMenuMovil();
    });
  });
  document.querySelector('.nav-item[data-section="dashboard"]').classList.add('active');

  document.getElementById('menuToggleBtn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', cerrarMenuMovil);
}

const SECCIONES_IMPRIMIBLES = ['efectivo', 'bancos', 'pl', 'flujo'];

function updateTopbar() {
  const meta = SECTION_META[STATE.currentSection];
  const b = biz();
  const titulo = meta.title + (meta.needsBiz && b ? ' — ' + b.name : '');
  document.getElementById('pageTitle').textContent = titulo;
  document.getElementById('pageSub').textContent = STATE.currentSection === 'dashboard'
    ? (STATE.esPropietario ? 'Vista consolidada de todos los negocios' : (STATE.businesses.length > 1 ? 'Vista consolidada de tus negocios' : 'Tu negocio'))
    : meta.sub;
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
  const polizaLineas = await getPolizaLineasParaCuenta(businessId, 'efectivo', moneda.id);
  const polizaNet = polizaLineas.reduce((s, l) => s + (Number(l.cargo) || 0) - (Number(l.abono) || 0), 0);
  return (Number(moneda.saldo_inicial) || 0) + autoDepositos + manualNet + polizaNet;
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
  const polizaLineas = await getPolizaLineasParaCuenta(businessId, 'banco', cuenta.id);
  const polizaNet = polizaLineas.reduce((s, l) => s + (Number(l.cargo) || 0) - (Number(l.abono) || 0), 0);
  return (Number(cuenta.saldo_inicial) || 0) + autoDepositos + manualNet + polizaNet;
}
async function getBancoLedgerRows(businessId, cuenta, conceptosTarjetas, mesFiltro) {
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
  const polizaLineas = await getPolizaLineasParaCuenta(businessId, 'banco', cuenta.id);
  polizaLineas.forEach(l => {
    autoRows.push({ id: 'poliza-' + l.id, fecha: l.poliza.fecha, descripcion: `Póliza #${l.poliza.numero ?? ''} — ${l.descripcion || l.poliza.concepto || ''}`, concepto: 'Póliza de diario', cargos: Number(l.abono) || 0, depositos: Number(l.cargo) || 0, auto: true });
  });
  const { data: movs } = await sb.from('fz_bancos_mov').select('*').eq('cuenta_id', cuenta.id).order('fecha');
  const manualRows = (movs || []).map(m => ({ ...m, auto: false }));
  const todas = [...autoRows, ...manualRows].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!mesFiltro) return todas;
  const mesStart = mesFiltro + '-01';
  const mesEnd = mesFiltro + '-31';
  const antes = todas.filter(r => r.fecha < mesStart);
  const delMes = todas.filter(r => r.fecha >= mesStart && r.fecha <= mesEnd);
  const saldoApertura = (Number(cuenta.saldo_inicial) || 0) + antes.reduce((s,r)=>s+(Number(r.depositos)||0)-(Number(r.cargos)||0),0);
  return { saldoApertura, rows: delMes };
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
  const conceptosTarjetas = conceptos.filter(c => c.categoria === 'tarjetas' || c.categoria === 'bancos');

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
      <div style="height:280px;"><canvas id="chartVentasNegocio"></canvas></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Composición de liquidez</h3>
        <span class="hint">Efectivo vs. Bancos vs. Pendiente a proveedores</span>
      </div>
      <div style="max-width:340px;height:260px;margin:0 auto;"><canvas id="chartComposicion"></canvas></div>
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
      datasets: [{ label: 'Ventas', data: rows.map(r => r.ventasMes), backgroundColor: '#123a70', borderRadius: 6, maxBarThickness: 56 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#eef1f6' }, ticks: { callback: v => fmt(v) } },
        x: { grid: { display: false } },
      },
    }
  });

  dashChart2 = new Chart(document.getElementById('chartComposicion'), {
    type: 'doughnut',
    data: {
      labels: ['Efectivo', 'Bancos', 'Prov. pendientes'],
      datasets: [{ data: [totEfectivo, totBancos, totProv], backgroundColor: ['#1f9d6b', '#123a70', '#c94a4a'] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

/* ============================================================
   VENTAS  +  CONCILIACIÓN — todo en UNA sola tabla horizontal
   ============================================================ */
const SISTEMA_COLS = [
  ['efectivo_sistema', 'Efectivo (sistema)'], ['tarjetas_sistema', 'Tarjetas (sistema)'],
  ['cxc', 'CxC (sistema)'], ['gastos', 'Gastos del día'],
];
const CAT_LABEL = { efectivo: 'Efectivo', tarjetas: 'Tarjetas', bancos: 'Bancos', cxc: 'CxC', propinas: 'Propinas' };
const conceptoValor = (concepto, entry) => {
  if (!entry) return 0;
  return concepto.es_moneda ? (Number(entry.monto)||0) * (Number(entry.tc)||0) : (Number(entry.monto)||0);
};

// Diferencia = (Sistema + Propinas del medio) − Recibido. Gastos solo afectan la de Efectivo.
function sumSistemaCategoria(r, conceptosSistema, categoria) {
  const conceptosCat = (conceptosSistema || []).filter(c => c.categoria === categoria);
  const sd = r.sistema_data || {};
  const tieneDatos = conceptosCat.some(c => sd[c.id] !== undefined);
  if (tieneDatos) return conceptosCat.reduce((s,c) => s + (Number(sd[c.id]) || 0), 0);
  if (categoria === 'efectivo') return Number(r.efectivo_sistema) || 0;
  if (categoria === 'tarjetas') return Number(r.tarjetas_sistema) || 0;
  if (categoria === 'cxc') return Number(r.cxc) || 0;
  return 0;
}

function computeRowDiffs(r, conceptosVenta, porCat, conceptosSistema) {
  const rd = r.recon_data || {};
  const totalVenta = totalVentaDinamico(r, conceptosVenta);
  const totalEfvo = porCat.efectivo.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalTarj = porCat.tarjetas.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalBancos = (porCat.bancos||[]).reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalCxc = porCat.cxc.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const totalProp = porCat.propinas.reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const propEfvo = porCat.propinas.filter(c=>(c.medio||'efectivo')==='efectivo').reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const propTarj = porCat.propinas.filter(c=>c.medio==='tarjetas').reduce((s,c)=>s+conceptoValor(c, rd[c.id]),0);
  const gastos = Number(r.gastos)||0;
  const sistemaEfvo = sumSistemaCategoria(r, conceptosSistema, 'efectivo');
  const sistemaTarj = sumSistemaCategoria(r, conceptosSistema, 'tarjetas');
  const sistemaCxc = sumSistemaCategoria(r, conceptosSistema, 'cxc');
  const difEfvo = (sistemaEfvo + propEfvo) - totalEfvo - gastos;
  const difTarj = (sistemaTarj + propTarj) - (totalTarj + totalBancos);
  const difCxc = sistemaCxc - totalCxc;
  const difTotal = difEfvo + difTarj + difCxc;
  return { totalVenta, totalEfvo, totalTarj, totalBancos, totalCxc, totalProp, propEfvo, propTarj, sistemaEfvo, sistemaTarj, sistemaCxc, difEfvo, difTarj, difCxc, difTotal };
}

async function loadConceptosSistema(businessId) {
  const { data, error } = await sb.from('fz_conceptos_sistema').select('*').eq('business_id', businessId).order('orden');
  if (error) { toast('Error: ' + error.message, 'error'); return []; }
  return data || [];
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
  const scrollY = window.scrollY;
  const { start, end } = monthBounds(STATE.currentMonth);
  const [ventasQ, conceptosVenta, conceptos, conceptosSistema] = await Promise.all([
    sb.from('fz_ventas').select('*').eq('business_id', b.id).gte('fecha', start).lte('fecha', end).order('fecha'),
    loadConceptosVenta(b.id),
    loadConceptos(b.id),
    loadConceptosSistema(b.id),
  ]);
  if (ventasQ.error) { el.innerHTML = `<div class="empty">Error: ${ventasQ.error.message}</div>`; return; }
  const rows = ventasQ.data || [];

  const porCat = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), bancos: conceptos.filter(c=>c.categoria==='bancos'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  const recibidoCats = ['efectivo','tarjetas','bancos','cxc','propinas'].filter(cat => porCat[cat].length);
  const sistemaCats = ['efectivo','tarjetas','cxc'].filter(cat => conceptosSistema.some(c=>c.categoria===cat));

  const totalGeneral = rows.reduce((s, r) => s + totalVentaDinamico(r, conceptosVenta), 0);
  const gastosMes = rows.reduce((s, r) => s + (Number(r.gastos)||0), 0);

  let mesProp=0, mesDifTotal=0;
  let sumEfvo=0, sumTarj=0, sumBancos=0, sumCxc=0, sumDifEfvo=0, sumDifTarj=0;
  rows.forEach(r => {
    const d = computeRowDiffs(r, conceptosVenta, porCat, conceptosSistema);
    mesProp += d.totalProp;
    mesDifTotal += d.difTotal;
    sumEfvo += d.totalEfvo; sumTarj += d.totalTarj; sumBancos += d.totalBancos; sumCxc += d.totalCxc;
    sumDifEfvo += d.difEfvo; sumDifTarj += d.difTarj;
  });

  const totVentaCols = {};
  conceptosVenta.forEach(c => totVentaCols[c.id] = rows.reduce((s,r) => s + (Number((r.venta_data||{})[c.id]) || 0), 0));
  const totSistemaCols = {};
  if (conceptosSistema.length) {
    conceptosSistema.forEach(c => totSistemaCols[c.id] = rows.reduce((s,r) => s + (Number((r.sistema_data||{})[c.id]) || 0), 0));
  } else {
    SISTEMA_COLS.forEach(([k]) => totSistemaCols[k] = rows.reduce((s,r) => s + (Number(r[k]) || 0), 0));
  }
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
          <button class="btn btn-ghost btn-sm" id="openSistemaConceptosBtn">⚙ Categorías de sistema</button>
          <button class="btn btn-ghost btn-sm" id="openConceptosBtn">⚙ Conceptos de recibido</button>
          <button class="btn btn-ghost btn-sm" id="descargarPlantillaBtn">📄 Descargar plantilla</button>
          <button class="btn btn-ghost btn-sm" id="importVentasBtn">📥 Importar ventas (Excel)</button>
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
              ${conceptosSistema.length ? conceptosSistema.map(c=>`<th rowspan="2">${c.nombre} (sistema)</th>`).join('') : SISTEMA_COLS.map(([k,l])=>`<th rowspan="2">${l}</th>`).join('')}
              ${recibidoCats.map(cat => `<th colspan="${porCat[cat].length}" style="text-align:center;">${CAT_LABEL[cat]} recibido</th>`).join('')}
              <th rowspan="2">Total Efvo.</th><th rowspan="2">Total Tarj.</th><th rowspan="2">Total Bancos</th><th rowspan="2">Total CxC</th><th rowspan="2">Total Prop.</th>
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
              ${conceptosSistema.length ? conceptosSistema.map(c=>`<td class="num">${fmt(totSistemaCols[c.id])}</td>`).join('') : SISTEMA_COLS.map(([k]) => `<td class="num">${fmt(totSistemaCols[k])}</td>`).join('')}
              ${recibidoCats.flatMap(cat => porCat[cat].map(c => `<td class="num">${fmt(totReconCols[c.id])}</td>`)).join('')}
              <td class="num">${fmt(sumEfvo)}</td>
              <td class="num">${fmt(sumTarj)}</td>
              <td class="num">${fmt(sumBancos)}</td>
              <td class="num">${fmt(sumCxc)}</td>
              <td class="num">${fmt(mesProp)}</td>
              <td class="num" style="color:${Math.abs(sumDifEfvo)<1?'inherit':'var(--red)'}">${fmt(sumDifEfvo)}</td>
              <td class="num" style="color:${Math.abs(sumDifTarj)<1?'inherit':'var(--red)'}">${fmt(sumDifTarj)}</td>
              <td class="num" style="color:${Math.abs(mesDifTotal)<1?'inherit':'var(--red)'}">${fmt(mesDifTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
          <tbody id="ventasBody">
            ${rows.map(r => ventasRowHtml(r, conceptosVenta, porCat, recibidoCats, conceptosSistema)).join('') || `<tr><td class="empty">Sin días capturados este mes.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('addVentaRow').addEventListener('click', () => {
    openVentaDiaModal(b.id, renderVentas);
  });
  document.getElementById('openConceptosBtn').addEventListener('click', () => openConceptosModal(b.id));
  document.getElementById('openVentaConceptosBtn').addEventListener('click', () => openVentaConceptosModal(b.id));
  document.getElementById('openSistemaConceptosBtn').addEventListener('click', () => openSistemaConceptosModal(b.id));
  document.getElementById('descargarPlantillaBtn').addEventListener('click', () => descargarPlantillaVentas(b.id));
  document.getElementById('importVentasBtn').addEventListener('click', () => openImportExcelModal('ventas', b.id, renderVentas));

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
  el.querySelectorAll('.sistema-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const ventaId = inp.dataset.ventaId, conceptoId = inp.dataset.concepto;
      const row = rows.find(r => r.id === ventaId);
      const sd = { ...(row.sistema_data || {}) };
      sd[conceptoId] = Number(inp.value) || 0;
      const { error } = await sb.from('fz_ventas').update({ sistema_data: sd }).eq('id', ventaId);
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
  window.scrollTo(0, scrollY);
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

async function provisionarPropinasHistoricas(businessId, onDone) {
  if (!confirm('Esto revisará todos los días de Ventas capturados en este negocio y creará/actualizará la cuenta por pagar de propinas donde falte. No duplica las que ya existen. ¿Continuar?')) return;
  const [ventasQ, conceptos] = await Promise.all([
    sb.from('fz_ventas').select('id,fecha,recon_data').eq('business_id', businessId),
    loadConceptos(businessId),
  ]);
  const conceptosPropinas = conceptos.filter(c => c.categoria === 'propinas');
  if (!conceptosPropinas.length) { toast('Este negocio no tiene conceptos de propinas configurados.', 'error'); return; }
  let count = 0;
  for (const v of (ventasQ.data || [])) {
    for (const c of conceptosPropinas) {
      const monto = Number((v.recon_data || {})[c.id]?.monto) || 0;
      if (monto) { await provisionarPropina(businessId, v.id, c, monto, v.fecha); count++; }
    }
  }
  toast(`Listo — ${count} registro(s) de propinas revisados/creados.`);
  if (onDone) onDone();
}

function ventasRowHtml(r, conceptosVenta, porCat, recibidoCats, conceptosSistema) {
  const vd = r.venta_data || {};
  const rd = r.recon_data || {};
  const sd = r.sistema_data || {};
  const total = totalVentaDinamico(r, conceptosVenta);
  const cellForVenta = (c) => `<td><input class="cell vd-cell num" type="number" step="0.01" value="${vd[c.id] ?? 0}" data-venta-id="${r.id}" data-concepto="${c.id}"></td>`;
  const cellForSistema = (c) => `<td><input class="cell sistema-cell num" type="number" step="0.01" value="${sd[c.id] ?? 0}" data-venta-id="${r.id}" data-concepto="${c.id}"></td>`;
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
  const { totalEfvo, totalTarj, totalBancos, totalCxc, totalProp, difEfvo, difTarj, difTotal } = computeRowDiffs(r, conceptosVenta, porCat, conceptosSistema);
  const colorDif = (v) => Math.abs(v) < 1 ? 'inherit' : 'var(--red)';
  return `<tr>
    <td><input class="cell ventas-cell" type="date" value="${r.fecha}" data-id="${r.id}" data-field="fecha"></td>
    ${conceptosVenta.map(cellForVenta).join('')}
    <td class="num" style="font-weight:700;">${fmt(total)}</td>
    ${conceptosSistema.length ? conceptosSistema.map(cellForSistema).join('') : SISTEMA_COLS.map(([k]) => `<td><input class="cell ventas-cell num" type="number" step="0.01" value="${r[k] ?? 0}" data-id="${r.id}" data-field="${k}"></td>`).join('')}
    ${recibidoCats.flatMap(cat => porCat[cat].map(cellForRecon)).join('')}
    <td class="num" style="font-weight:700;">${fmt(totalEfvo)}</td>
    <td class="num" style="font-weight:700;">${fmt(totalTarj)}</td>
    <td class="num" style="font-weight:700;">${fmt(totalBancos)}</td>
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
    const banco_cuenta_id = (categoria === 'tarjetas' || categoria === 'bancos') ? (document.getElementById('newConceptoBancoId').value || null) : null;
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
  document.getElementById('bancoVinculoWrap').style.display = (cat === 'tarjetas' || cat === 'bancos') ? 'block' : 'none';
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
      ${(c.categoria === 'tarjetas' || c.categoria === 'bancos') ? `<select class="cell concepto-banco-vinculo" data-id="${c.id}" style="max-width:170px;flex-shrink:0;">
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
   MODAL: categorías de sistema (Efectivo/Tarjetas/CxC configurables)
   ============================================================ */
async function openSistemaConceptosModal(businessId) {
  await renderSistemaConceptosList(businessId);
  document.getElementById('modalConceptosSistema').classList.add('show');
  document.getElementById('closeConceptosSistema').onclick = () => {
    document.getElementById('modalConceptosSistema').classList.remove('show');
    renderVentas();
  };
  document.getElementById('saveConceptoSistema').onclick = async () => {
    const nombre = document.getElementById('newConceptoSistemaNombre').value.trim();
    const categoria = document.getElementById('newConceptoSistemaCategoria').value;
    if (!nombre) { toast('Escribe un nombre para la categoría.', 'error'); return; }
    const { error } = await sb.from('fz_conceptos_sistema').insert({ business_id: businessId, nombre, categoria, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newConceptoSistemaNombre').value = '';
    renderSistemaConceptosList(businessId);
  };
}
const SISTEMA_CAT_LABEL = { efectivo: 'Efectivo', tarjetas: 'Tarjetas', cxc: 'CxC' };
async function renderSistemaConceptosList(businessId) {
  const conceptos = await loadConceptosSistema(businessId);
  const box = document.getElementById('conceptosSistemaList');
  if (!conceptos.length) {
    box.innerHTML = `<div class="empty" style="padding:16px;">Aún no has configurado esto — por ahora se usan las 3 columnas clásicas (Efectivo, Tarjetas, CxC). Agrega aquí las que necesites y reemplazarán a las de siempre.</div>`;
  } else {
    box.innerHTML = conceptos.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--line);">
        <div><strong>${c.nombre}</strong> <span style="color:var(--muted);font-size:12px;">— se compara contra "${SISTEMA_CAT_LABEL[c.categoria]} recibido"</span></div>
        <button class="row-del conceptosistema-del" data-id="${c.id}" style="font-size:16px;">✕</button>
      </div>`).join('');
  }
  box.querySelectorAll('.conceptosistema-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('fz_conceptos_sistema').delete().eq('id', btn.dataset.id);
      renderSistemaConceptosList(businessId);
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
function desgloseLineas(desglose) {
  if (!desglose) return [];
  if (Array.isArray(desglose)) return desglose;
  // formato antiguo: objeto { subcuenta_id: monto } — se sigue leyendo, ya no se escribe así
  return Object.entries(desglose).filter(([,v]) => Number(v)).map(([subcuenta_id, monto]) => ({ subcuenta_id, monto: Number(monto), descripcion: null }));
}

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
    const descripcion = document.getElementById('newDesgloseDescripcion').value.trim() || null;
    if (!subId || !monto) { toast('Selecciona subcuenta y monto.', 'error'); return; }
    const { data: fRow } = await sb.from('fz_proveedores').select('desglose').eq('id', facturaId).single();
    const lineas = desgloseLineas(fRow?.desglose);
    lineas.push({ subcuenta_id: subId, monto, descripcion });
    await sb.from('fz_proveedores').update({ desglose: lineas }).eq('id', facturaId);
    document.getElementById('newDesgloseMonto').value = '';
    document.getElementById('newDesgloseDescripcion').value = '';
    renderDesgloseList(businessId, facturaId, subcuentas, mayores);
  };
}
async function renderDesgloseList(businessId, facturaId, subcuentas, mayores) {
  const { data: fRow } = await sb.from('fz_proveedores').select('*').eq('id', facturaId).single();
  const lineas = desgloseLineas(fRow?.desglose);
  const box = document.getElementById('desgloseList');
  const totalAsignado = lineas.reduce((s,l)=>s+Number(l.monto||0),0);
  document.getElementById('desgloseTotales').innerHTML = `Factura: ${fmt(fRow?.importe||0)} &nbsp;|&nbsp; Asignado: <span style="color:${Math.abs(totalAsignado-(fRow?.importe||0))<1?'var(--green)':'var(--red)'}">${fmt(totalAsignado)}</span>`;
  box.innerHTML = lineas.map((linea, idx) => {
    const sub = subcuentas.find(s=>s.id===linea.subcuenta_id);
    const mayor = mayores.find(m=>m.id===sub?.cuenta_mayor_id);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 4px;border-bottom:1px solid var(--line);font-size:13px;gap:8px;">
      <div style="min-width:0;">
        <div>${mayor ? mayor.nombre+' › ' : ''}${sub ? sub.nombre : '(subcuenta eliminada)'}</div>
        ${linea.descripcion ? `<div style="color:var(--muted);font-size:11.5px;">${linea.descripcion}</div>` : ''}
      </div>
      <span style="display:flex;align-items:center;gap:10px;flex-shrink:0;"><strong>${fmt(linea.monto)}</strong><button class="row-del desglose-del" data-idx="${idx}" style="font-size:14px;">✕</button></span>
    </div>`;
  }).join('') || `<div class="empty" style="padding:10px;">Sin líneas todavía.</div>`;
  box.querySelectorAll('.desglose-del').forEach(btn => btn.addEventListener('click', async () => {
    const idx = Number(btn.dataset.idx);
    const nuevas = lineas.filter((_,i)=>i!==idx);
    await sb.from('fz_proveedores').update({ desglose: nuevas }).eq('id', facturaId);
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
    ...(cuentas.data||[]).map(c => `<option value="banco:${c.id}" data-tc="1">Banco — ${c.nombre}</option>`),
    ...(monedas.data||[]).map(m => `<option value="efectivo:${m.id}" data-tc="${m.tc_reporte||1}">Caja — ${m.nombre}</option>`),
    `<option value="nuevo:banco" data-tc="1">+ Nueva cuenta bancaria…</option>`,
    `<option value="nuevo:efectivo" data-tc="1">+ Nueva caja de efectivo…</option>`,
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

async function descargarPlantillaVentas(businessId) {
  const [conceptosVenta, conceptos, conceptosSistema] = await Promise.all([loadConceptosVenta(businessId), loadConceptos(businessId), loadConceptosSistema(businessId)]);
  if (!conceptosVenta.length) { toast('Primero configura las categorías de venta de este negocio.', 'error'); return; }
  const headersSistema = conceptosSistema.length ? conceptosSistema.map(c => c.nombre) : ['Efectivo Sistema', 'Tarjetas Sistema', 'CxC Sistema'];
  const headers = ['Fecha', ...conceptosVenta.map(c => c.nombre), ...headersSistema, 'Gastos del día'];
  conceptos.forEach(c => {
    headers.push(c.nombre);
    if (c.es_moneda) headers.push(c.nombre + ' TC');
  });
  const ejemplo = headers.map((h,i) => i === 0 ? todayStr() : '');
  const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
  XLSX.writeFile(wb, 'plantilla-ventas.xlsx');
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

      } else if (tipo === 'ventas') {
        const [conceptosVentaQ, conceptosQ, conceptosSistemaQ] = await Promise.all([
          sb.from('fz_conceptos_venta').select('*').eq('business_id', businessId),
          sb.from('fz_conceptos').select('*').eq('business_id', businessId),
          sb.from('fz_conceptos_sistema').select('*').eq('business_id', businessId),
        ]);
        const cVenta = conceptosVentaQ.data || [];
        const cRecon = conceptosQ.data || [];
        const cSistema = conceptosSistemaQ.data || [];
        const payload = rows.map(r => {
          const fecha = parseFechaExcel(buscarColumna(r, ['fecha']));
          const venta_data = {};
          cVenta.forEach(c => {
            const val = buscarColumna(r, [normalizarEncabezado(c.nombre)]);
            if (val !== null && val !== '') venta_data[c.id] = Number(val) || 0;
          });
          const gastos = Number(buscarColumna(r, ['gastos del dia', 'gastos del día', 'gastos'])) || 0;
          const recon_data = {};
          cRecon.forEach(c => {
            const val = buscarColumna(r, [normalizarEncabezado(c.nombre)]);
            if (val === null || val === '') return;
            if (c.es_moneda) {
              const tc = Number(buscarColumna(r, [normalizarEncabezado(c.nombre + ' TC')])) || 0;
              recon_data[c.id] = { monto: Number(val) || 0, tc };
            } else {
              recon_data[c.id] = { monto: Number(val) || 0 };
            }
          });
          const base = { business_id: businessId, fecha, venta_data, gastos, recon_data };
          if (cSistema.length) {
            const sistema_data = {};
            cSistema.forEach(c => {
              const val = buscarColumna(r, [normalizarEncabezado(c.nombre)]);
              if (val !== null && val !== '') sistema_data[c.id] = Number(val) || 0;
            });
            base.sistema_data = sistema_data;
          } else {
            base.efectivo_sistema = Number(buscarColumna(r, ['efectivo sistema', 'efectivo'])) || 0;
            base.tarjetas_sistema = Number(buscarColumna(r, ['tarjetas sistema', 'tarjetas'])) || 0;
            base.cxc = Number(buscarColumna(r, ['cxc sistema', 'cxc'])) || 0;
          }
          return base;
        });
        if (!payload.length) { toast('El archivo no tiene filas.', 'error'); return; }
        const { data: nuevasVentas, error } = await sb.from('fz_ventas').insert(payload).select();
        if (error) { toast('Error al importar: ' + error.message, 'error'); return; }
        const conceptosPropinas = cRecon.filter(c => c.categoria === 'propinas');
        if (conceptosPropinas.length) {
          for (const v of (nuevasVentas || [])) {
            for (const c of conceptosPropinas) {
              const monto = Number((v.recon_data || {})[c.id]?.monto) || 0;
              if (monto) await provisionarPropina(businessId, v.id, c, monto, v.fecha);
            }
          }
        }
        toast(`${payload.length} días de ventas importados.`);

      } else if (tipo === 'polizas') {
        const [subcuentasQ] = await Promise.all([
          sb.from('fz_subcuentas').select('*').eq('business_id', businessId),
        ]);
        const subcuentas = subcuentasQ.data || [];
        const grupos = {};
        rows.forEach(r => {
          const fecha = parseFechaExcel(buscarColumna(r, ['fecha']));
          const concepto = String(buscarColumna(r, ['concepto', 'concepto poliza', 'concepto póliza']) || '').trim();
          const key = fecha + '||' + concepto;
          (grupos[key] = grupos[key] || []).push(r);
        });
        const { data: existentes } = await sb.from('fz_polizas').select('numero').eq('business_id', businessId);
        let maxNum = (existentes || []).reduce((mx,p)=>Math.max(mx, p.numero||0), 0);
        let countPolizas = 0, countLineas = 0;
        for (const key of Object.keys(grupos)) {
          const [fecha, concepto] = key.split('||');
          maxNum++;
          const { data: nuevaPoliza, error: e1 } = await sb.from('fz_polizas').insert({ business_id: businessId, numero: maxNum, fecha, concepto }).select().single();
          if (e1 || !nuevaPoliza) continue;
          const lineasPayload = grupos[key].map(r => {
            const subNombre = String(buscarColumna(r, ['subcuenta']) || '').trim();
            const sub = subcuentas.find(s => s.nombre.trim().toLowerCase() === subNombre.toLowerCase());
            return {
              business_id: businessId, poliza_id: nuevaPoliza.id,
              subcuenta_id: sub ? sub.id : null,
              descripcion: String(buscarColumna(r, ['descripcion', 'descripción']) || '').trim() || null,
              cargo: Number(buscarColumna(r, ['cargo'])) || 0,
              abono: Number(buscarColumna(r, ['abono'])) || 0,
            };
          });
          await sb.from('fz_polizas_lineas').insert(lineasPayload);
          countPolizas++; countLineas += lineasPayload.length;
        }
        if (!countPolizas) { toast('No se encontraron filas válidas (revisa Fecha y Concepto).', 'error'); return; }
        toast(`${countPolizas} pólizas importadas (${countLineas} líneas).`);
      }
      if (onDone) onDone();
    } catch (e) {
      toast('No se pudo leer el archivo: ' + e.message, 'error');
    }
  };
  input.click();
}

async function openVentaDiaModal(businessId, onDone) {
  const [conceptosVenta, conceptos, conceptosSistema] = await Promise.all([loadConceptosVenta(businessId), loadConceptos(businessId), loadConceptosSistema(businessId)]);
  const porCat = {
    efectivo: conceptos.filter(c => c.categoria === 'efectivo'),
    tarjetas: conceptos.filter(c => c.categoria === 'tarjetas'),
    bancos: conceptos.filter(c => c.categoria === 'bancos'),
    cxc: conceptos.filter(c => c.categoria === 'cxc'),
    propinas: conceptos.filter(c => c.categoria === 'propinas'),
  };
  const form = document.getElementById('ventaDiaForm');
  form.innerHTML = `
    <div class="field"><label>Fecha</label><input type="date" id="vdFecha" value="${todayStr()}"></div>
    ${conceptosVenta.length ? `
      <h4 style="margin:16px 0 8px;color:var(--navy-1);font-family:'Cormorant Garamond',serif;font-size:18px;">Lo vendido</h4>
      <div class="grid-2">
        ${conceptosVenta.map(c => `<div class="field" style="margin-bottom:8px;"><label>${c.nombre}${c.tipo==='resta'?' (descuento)':''}</label><input type="number" step="0.01" class="vd-venta" data-id="${c.id}" value="0"></div>`).join('')}
      </div>` : `<div class="empty" style="margin:12px 0;">Este negocio no tiene categorías de venta configuradas.</div>`}

    <h4 style="margin:16px 0 8px;color:var(--navy-1);font-family:'Cormorant Garamond',serif;font-size:18px;">Sistema</h4>
    <div class="grid-2">
      ${conceptosSistema.length ? conceptosSistema.map(c => `<div class="field"><label>${c.nombre} (sistema)</label><input type="number" step="0.01" class="vd-sistema" data-id="${c.id}" value="0"></div>`).join('') : `
        <div class="field"><label>Efectivo (sistema)</label><input type="number" step="0.01" id="vdEfectivoSistema" value="0"></div>
        <div class="field"><label>Tarjetas (sistema)</label><input type="number" step="0.01" id="vdTarjetasSistema" value="0"></div>
        <div class="field"><label>CxC (sistema)</label><input type="number" step="0.01" id="vdCxc" value="0"></div>
      `}
      <div class="field"><label>Gastos del día</label><input type="number" step="0.01" id="vdGastos" value="0"></div>
    </div>

    ${['efectivo','tarjetas','bancos','cxc','propinas'].filter(cat => porCat[cat].length).map(cat => `
      <h4 style="margin:16px 0 8px;color:var(--navy-1);font-family:'Cormorant Garamond',serif;font-size:18px;">${CAT_LABEL[cat]} recibido</h4>
      <div class="grid-2">
        ${porCat[cat].map(c => `
          <div class="field" style="margin-bottom:8px;">
            <label>${c.nombre}${c.es_moneda?' (+ TC)':''}</label>
            <input type="number" step="0.01" class="vd-recon" data-id="${c.id}" value="0">
            ${c.es_moneda ? `<input type="number" step="0.0001" class="vd-recon-tc" data-id="${c.id}" placeholder="Tipo de cambio" style="margin-top:5px;">` : ''}
          </div>`).join('')}
      </div>`).join('')}
  `;

  document.getElementById('modalVentaDia').classList.add('show');
  document.getElementById('closeVentaDia').onclick = () => document.getElementById('modalVentaDia').classList.remove('show');
  document.getElementById('saveVentaDia').onclick = async () => {
    const fecha = document.getElementById('vdFecha').value || todayStr();
    const venta_data = {};
    form.querySelectorAll('.vd-venta').forEach(inp => { venta_data[inp.dataset.id] = Number(inp.value) || 0; });
    const recon_data = {};
    form.querySelectorAll('.vd-recon').forEach(inp => {
      const monto = Number(inp.value) || 0;
      const tcInput = form.querySelector(`.vd-recon-tc[data-id="${inp.dataset.id}"]`);
      recon_data[inp.dataset.id] = tcInput ? { monto, tc: Number(tcInput.value) || 0 } : { monto };
    });
    const payload = {
      business_id: businessId, fecha, venta_data,
      gastos: Number(document.getElementById('vdGastos').value) || 0,
      recon_data,
    };
    if (conceptosSistema.length) {
      const sistema_data = {};
      form.querySelectorAll('.vd-sistema').forEach(inp => { sistema_data[inp.dataset.id] = Number(inp.value) || 0; });
      payload.sistema_data = sistema_data;
    } else {
      payload.efectivo_sistema = Number(document.getElementById('vdEfectivoSistema').value) || 0;
      payload.tarjetas_sistema = Number(document.getElementById('vdTarjetasSistema').value) || 0;
      payload.cxc = Number(document.getElementById('vdCxc').value) || 0;
    }
    const { data: nuevaVenta, error } = await sb.from('fz_ventas').insert(payload).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    for (const c of porCat.propinas) {
      const monto = Number(recon_data[c.id]?.monto) || 0;
      if (monto) await provisionarPropina(businessId, nuevaVenta.id, c, monto, fecha);
    }
    document.getElementById('modalVentaDia').classList.remove('show');
    toast('Día de ventas agregado.');
    if (onDone) onDone();
  };
}

/* ---------- Aplicación inteligente de pagos: FIFO + crédito a favor ---------- */
/* ---------- Revertir un pago (al eliminar el movimiento que lo aplicó) ---------- */
async function revertirPagoAFacturas(idsAfectados, montoMovimiento) {
  if (!idsAfectados || !idsAfectados.length) return;
  const { data: facturas } = await sb.from('fz_proveedores').select('*').in('id', idsAfectados);
  if (!facturas || !facturas.length) return;
  const reales = facturas.filter(f => Number(f.importe) >= 0).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const creditos = facturas.filter(f => Number(f.importe) < 0);

  let porRevertir = montoMovimiento;
  for (const f of reales) {
    if (porRevertir <= 0.009) break;
    const actual = Number(f.importe_pagado) || 0;
    if (actual <= 0.009) continue;
    const revertir = Math.min(porRevertir, actual);
    const nuevoPagado = actual - revertir;
    const quedaLimpio = nuevoPagado <= 0.009;
    await sb.from('fz_proveedores').update({
      importe_pagado: quedaLimpio ? 0 : nuevoPagado,
      estatus: quedaLimpio ? 'Pendiente' : 'Parcial',
      pagado_desde: quedaLimpio ? null : f.pagado_desde,
      pagado_desde_tipo: quedaLimpio ? null : f.pagado_desde_tipo,
      pagado_desde_cuenta_id: quedaLimpio ? null : f.pagado_desde_cuenta_id,
      fecha_pago: quedaLimpio ? null : f.fecha_pago,
    }).eq('id', f.id);
    porRevertir -= revertir;
  }
  for (const c of creditos) {
    if (c.estatus === 'Pagado') {
      await sb.from('fz_proveedores').update({ estatus: 'Pendiente', fecha_pago: null }).eq('id', c.id);
    }
  }
}

async function confirmarYEliminarMovimiento(table, row, onDone) {
  const idsAfectados = facturaIdsDe(row);
  if (row.tipo_salida === 'proveedor' && idsAfectados.length) {
    const ok = confirm(`Este movimiento tiene un pago aplicado a ${idsAfectados.length} factura(s) de Proveedores. Al eliminarlo, se revertirá ese pago (regresarán a Pendiente/Parcial según corresponda). ¿Continuar?`);
    if (!ok) return;
    const montoMovimiento = Number(row.cargos) > 0 ? Number(row.cargos) : Number(row.depositos) || 0;
    await revertirPagoAFacturas(idsAfectados, montoMovimiento);
  }
  await sb.from(table).delete().eq('id', row.id);
  onDone();
}

async function aplicarPagoFacturas(idsSeleccionados, montoDisponibleInicial, fechaMov, businessId, origenInfo) {
  if (!idsSeleccionados.length) return { idsAfectados: [], creadoCredito: false, sobrante: 0 };
  const { data: facturas } = await sb.from('fz_proveedores').select('*').in('id', idsSeleccionados);
  if (!facturas || !facturas.length) return { idsAfectados: [], creadoCredito: false, sobrante: 0 };

  const creditos = facturas.filter(f => Number(f.importe) < 0).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const reales = facturas.filter(f => Number(f.importe) >= 0).sort((a,b)=>a.fecha.localeCompare(b.fecha));

  let disponible = montoDisponibleInicial + creditos.reduce((s,c)=>s+Math.abs(Number(c.importe)),0);
  const idsAfectados = [];

  for (const c of creditos) {
    await sb.from('fz_proveedores').update({ estatus: 'Pagado', fecha_pago: fechaMov }).eq('id', c.id);
    idsAfectados.push(c.id);
  }

  for (const f of reales) {
    if (disponible <= 0.009) break;
    const saldoPendiente = Number(f.importe) - Number(f.importe_pagado || 0);
    if (saldoPendiente <= 0.009) continue;
    const aplicar = Math.min(disponible, saldoPendiente);
    const nuevoPagado = Number(f.importe_pagado || 0) + aplicar;
    const nuevoEstatus = nuevoPagado >= Number(f.importe) - 0.01 ? 'Pagado' : 'Parcial';
    await sb.from('fz_proveedores').update({
      importe_pagado: nuevoPagado, estatus: nuevoEstatus, fecha_pago: fechaMov,
      pagado_desde: origenInfo.pagado_desde, pagado_desde_tipo: origenInfo.pagado_desde_tipo, pagado_desde_cuenta_id: origenInfo.pagado_desde_cuenta_id,
    }).eq('id', f.id);
    idsAfectados.push(f.id);
    disponible -= aplicar;
  }

  let creadoCredito = false;
  if (disponible > 0.01 && reales.length) {
    const proveedoresUnicos = [...new Set(reales.map(f => f.proveedor))];
    if (proveedoresUnicos.length === 1) {
      const base = reales[0];
      await sb.from('fz_proveedores').insert({
        business_id: businessId, proveedor_id: base.proveedor_id, proveedor: base.proveedor,
        fecha: fechaMov, factura: `Crédito a favor (pago del ${fechaMov})`,
        importe: -disponible, estatus: 'Pendiente',
      });
      creadoCredito = true;
    }
  }
  return { idsAfectados, creadoCredito, sobrante: disponible };
}

function openFacturasPagoModal(rowId, table, facturasPend, traspasoCtx, onDone) {
  (async () => {
    const { data: row } = await sb.from(table).select('*').eq('id', rowId).single();
    const idsActuales = new Set(facturaIdsDe(row || {}));
    const montoMovimiento = Number(row?.cargos) > 0 ? Number(row.cargos) : Number(row?.depositos) || 0;
    const opciones = facturasPend.filter(f => f.estatus !== 'Pagado' || idsActuales.has(f.id));
    const porProveedor = {};
    opciones.forEach(f => {
      const key = f.proveedor || '(sin proveedor)';
      (porProveedor[key] = porProveedor[key] || []).push(f);
    });
    Object.values(porProveedor).forEach(lista => lista.sort((a,b) => a.fecha.localeCompare(b.fecha)));
    const box = document.getElementById('facturasPagoList');
    const nombresProveedor = Object.keys(porProveedor).sort((a,b)=>a.localeCompare(b));
    box.innerHTML = nombresProveedor.map(prov => `
      <div class="factura-provgroup" data-prov="${prov.toLowerCase()}" style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:12.5px;color:var(--navy-1);margin-bottom:4px;">${prov}</div>
        ${porProveedor[prov].map(f => {
          const saldo = Number(f.importe) - Number(f.importe_pagado||0);
          const esCredito = Number(f.importe) < 0;
          return `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--line);font-size:13px;cursor:pointer;">
            <input type="checkbox" class="factura-check" value="${f.id}" data-importe="${saldo}" ${idsActuales.has(f.id)?'checked':''}>
            <span>${f.fecha} · ${f.factura||'s/f'} · ${esCredito?`<span style="color:var(--green);">crédito ${fmt(saldo)}</span>`:fmt(saldo)}${f.estatus==='Parcial'?' (parcial, de '+fmt(f.importe)+')':''}${f.estatus==='Pagado'?' (ya pagada)':''}</span>
          </label>`;
        }).join('')}
      </div>`).join('') || `<div class="empty">No hay facturas disponibles.</div>`;

    const selectProv = document.getElementById('facturasPagoSelectProv');
    const buscarProv = document.getElementById('facturasPagoBuscarProv');
    selectProv.innerHTML = `<option value="">— todos los proveedores —</option>` + nombresProveedor.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join('');
    buscarProv.value = '';
    const aplicarFiltroProveedor = () => {
      const porTexto = buscarProv.value.trim().toLowerCase();
      const porSelect = selectProv.value;
      box.querySelectorAll('.factura-provgroup').forEach(grp => {
        const nombre = grp.dataset.prov;
        const pasaTexto = !porTexto || nombre.includes(porTexto);
        const pasaSelect = !porSelect || nombre === porSelect;
        grp.style.display = (pasaTexto && pasaSelect) ? '' : 'none';
      });
    };
    buscarProv.oninput = () => { selectProv.value = ''; aplicarFiltroProveedor(); };
    selectProv.onchange = () => { buscarProv.value = ''; aplicarFiltroProveedor(); };

    const actualizarResumen = () => {
      const marcadas = Array.from(box.querySelectorAll('.factura-check:checked'));
      const totalSeleccionado = marcadas.reduce((s,c) => s + (Number(c.dataset.importe) || 0), 0);
      const diferencia = montoMovimiento - totalSeleccionado;
      const cuadra = Math.abs(diferencia) < 0.01;
      document.getElementById('facturasPagoResumen').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span>Monto del movimiento</span><strong>${fmt(montoMovimiento)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span>Total seleccionado (${marcadas.length})</span><strong>${fmt(totalSeleccionado)}</strong></div>
        <div style="display:flex;justify-content:space-between;color:${cuadra?'var(--green)':'var(--muted)'};font-weight:700;"><span>${cuadra?'✓ Cuadra exacto':(diferencia>0?'Si aplicas, sobrará como crédito a favor':'Si aplicas, quedará pendiente/parcial')}</span><span>${cuadra?'':fmt(Math.abs(diferencia))}</span></div>
      `;
    };
    box.querySelectorAll('.factura-check').forEach(chk => chk.addEventListener('change', actualizarResumen));
    actualizarResumen();

    document.getElementById('modalFacturasPago').classList.add('show');
    document.getElementById('closeFacturasPago').onclick = () => document.getElementById('modalFacturasPago').classList.remove('show');
    document.getElementById('applyFacturasPago').onclick = async () => {
      const idsSeleccionados = Array.from(box.querySelectorAll('.factura-check:checked')).map(c => c.value);
      const { idsAfectados, creadoCredito } = await aplicarPagoFacturas(idsSeleccionados, montoMovimiento, row?.fecha || todayStr(), row.business_id, {
        pagado_desde: traspasoCtx?.origenCorto || null,
        pagado_desde_tipo: traspasoCtx?.origenTipo || null,
        pagado_desde_cuenta_id: traspasoCtx?.origenId || null,
      });
      const { error: e1 } = await sb.from(table).update({ proveedor_factura_ids: idsAfectados, proveedor_factura_id: idsAfectados[0] || null }).eq('id', rowId);
      if (e1) { toast('Error al guardar: ' + e1.message, 'error'); return; }
      if (idsAfectados.length) toast(`${idsAfectados.length} registro(s) actualizado(s)${creadoCredito ? ' · se generó un crédito a favor' : ''}.`);
      document.getElementById('modalFacturasPago').classList.remove('show');
      onDone();
    };
  })();
}

async function openMovimientoModal(contexto) {
  const modal = document.getElementById('modalMovimiento');
  document.getElementById('movFecha').value = todayStr();
  document.getElementById('movCampo1').value = '';
  document.getElementById('movConcepto').value = '';
  document.getElementById('movReferencia').value = '';
  document.getElementById('movDescripcion').value = '';
  document.getElementById('movCargos').value = 0;
  document.getElementById('movDepositos').value = 0;
  document.getElementById('movTipoSalida').value = 'otro';
  document.getElementById('movSubcuentaWrap').style.display = 'none';
  document.getElementById('movFacturasWrap').style.display = 'none';

  if (contexto.tipo === 'efectivo') {
    document.getElementById('movLabel1').textContent = 'Proveedor / Concepto';
    document.getElementById('movCampo1').placeholder = 'Ej. Distribuidora de Bebidas';
    document.getElementById('movConceptoWrap').style.display = 'none';
    document.getElementById('movReferenciaWrap').style.display = 'none';
  } else {
    document.getElementById('movLabel1').textContent = 'Concepto';
    document.getElementById('movCampo1').placeholder = 'Ej. Pago de servicio';
    document.getElementById('movConceptoWrap').style.display = 'none';
    document.getElementById('movReferenciaWrap').style.display = 'block';
  }

  // Datos para clasificar (subcuentas y facturas pendientes) y para el nombre de "pagado desde"
  const [subcuentas, mayores, facturasPend, cuentaInfo] = await Promise.all([
    loadSubcuentas(contexto.businessId),
    loadCuentasMayor(contexto.businessId),
    sb.from('fz_proveedores').select('id,proveedor,fecha,factura,importe,importe_pagado,estatus').eq('business_id', contexto.businessId).order('fecha', { ascending: false }).limit(5000).then(r => r.data || []),
    contexto.tipo === 'efectivo'
      ? sb.from('fz_efectivo_monedas').select('nombre').eq('id', contexto.refId).single().then(r => r.data)
      : sb.from('fz_bancos_cuentas').select('nombre').eq('id', contexto.refId).single().then(r => r.data),
  ]);
  const origenCorto = contexto.tipo === 'efectivo' ? 'Caja — ' + (cuentaInfo?.nombre || '') : 'Banco — ' + (cuentaInfo?.nombre || '');

  document.getElementById('movSubcuenta').innerHTML = `<option value="">— elegir subcuenta —</option>` +
    subcuentas.map(s => { const m = mayores.find(x => x.id === s.cuenta_mayor_id); return `<option value="${s.id}">${m ? m.nombre + ' › ' : ''}${s.nombre}</option>`; }).join('');

  const pendientes = facturasPend.filter(f => f.estatus !== 'Pagado');
  const porProveedor = {};
  pendientes.forEach(f => { const key = f.proveedor || '(sin proveedor)'; (porProveedor[key] = porProveedor[key] || []).push(f); });
  Object.values(porProveedor).forEach(lista => lista.sort((a,b) => a.fecha.localeCompare(b.fecha)));
  const nombresProveedorMov = Object.keys(porProveedor).sort((a,b)=>a.localeCompare(b));
  const movFacturasBox = document.getElementById('movFacturasList');
  movFacturasBox.innerHTML = nombresProveedorMov.map(prov => `
    <div class="factura-provgroup" data-prov="${prov.toLowerCase()}" style="margin-bottom:8px;">
      <div style="font-weight:700;font-size:12px;color:var(--navy-1);">${prov}</div>
      ${porProveedor[prov].map(f => {
        const saldo = Number(f.importe) - Number(f.importe_pagado||0);
        const esCredito = Number(f.importe) < 0;
        return `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:12.5px;cursor:pointer;">
          <input type="checkbox" class="mov-factura-check" value="${f.id}" data-importe="${saldo}">
          <span>${f.fecha} · ${f.factura||'s/f'} · ${esCredito?`<span style="color:var(--green);">crédito ${fmt(saldo)}</span>`:fmt(saldo)}${f.estatus==='Parcial'?' (parcial)':''}</span>
        </label>`;
      }).join('')}
    </div>`).join('') || `<div class="empty" style="padding:8px;">No hay facturas pendientes.</div>`;

  const movSelectProv = document.getElementById('movFacturasSelectProv');
  const movBuscarProv = document.getElementById('movFacturasBuscarProv');
  movSelectProv.innerHTML = `<option value="">— todos los proveedores —</option>` + nombresProveedorMov.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join('');
  movBuscarProv.value = '';
  const aplicarFiltroProveedorMov = () => {
    const porTexto = movBuscarProv.value.trim().toLowerCase();
    const porSelect = movSelectProv.value;
    movFacturasBox.querySelectorAll('.factura-provgroup').forEach(grp => {
      const nombre = grp.dataset.prov;
      const pasaTexto = !porTexto || nombre.includes(porTexto);
      const pasaSelect = !porSelect || nombre === porSelect;
      grp.style.display = (pasaTexto && pasaSelect) ? '' : 'none';
    });
  };
  movBuscarProv.oninput = () => { movSelectProv.value = ''; aplicarFiltroProveedorMov(); };
  movSelectProv.onchange = () => { movBuscarProv.value = ''; aplicarFiltroProveedorMov(); };

  const actualizarResumenMovFacturas = () => {
    const marcadas = Array.from(document.querySelectorAll('.mov-factura-check:checked'));
    const totalSeleccionado = marcadas.reduce((s,c)=>s+(Number(c.dataset.importe)||0),0);
    const montoMovimiento = Number(document.getElementById('movCargos').value) || 0;
    const diferencia = montoMovimiento - totalSeleccionado;
    const cuadra = Math.abs(diferencia) < 0.01;
    document.getElementById('movFacturasResumen').innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Cargo capturado</span><strong>${fmt(montoMovimiento)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Total seleccionado (${marcadas.length})</span><strong>${fmt(totalSeleccionado)}</strong></div>
      <div style="display:flex;justify-content:space-between;color:${cuadra?'var(--green)':'var(--muted)'};font-weight:700;"><span>${cuadra?'✓ Cuadra exacto':(diferencia>0?'Sobrará como crédito a favor':'Quedará pendiente/parcial')}</span><span>${cuadra?'':fmt(Math.abs(diferencia))}</span></div>
    `;
  };
  document.querySelectorAll('.mov-factura-check').forEach(chk => chk.addEventListener('change', actualizarResumenMovFacturas));
  document.getElementById('movCargos').oninput = actualizarResumenMovFacturas;
  actualizarResumenMovFacturas();

  const actualizarVisibilidadDetalle = () => {
    const val = document.getElementById('movTipoSalida').value;
    document.getElementById('movSubcuentaWrap').style.display = val === 'gasto' ? 'block' : 'none';
    document.getElementById('movFacturasWrap').style.display = val === 'proveedor' ? 'block' : 'none';
  };
  document.getElementById('movTipoSalida').onchange = actualizarVisibilidadDetalle;
  document.getElementById('movTipoSalida').oninput = actualizarVisibilidadDetalle;

  modal.classList.add('show');
  document.getElementById('closeMovimiento').onclick = () => modal.classList.remove('show');
  document.getElementById('saveMovimiento').onclick = async () => {
    const fecha = document.getElementById('movFecha').value || todayStr();
    const cargos = Number(document.getElementById('movCargos').value) || 0;
    const depositos = Number(document.getElementById('movDepositos').value) || 0;
    const descripcion = document.getElementById('movDescripcion').value || null;
    const tipoSalida = document.getElementById('movTipoSalida').value;
    if (!cargos && !depositos) { toast('Escribe un monto en Cargos o Depósitos.', 'error'); return; }
    const idsFacturas = tipoSalida === 'proveedor' ? Array.from(document.querySelectorAll('.mov-factura-check:checked')).map(c => c.value) : [];
    let payload, table;
    if (contexto.tipo === 'efectivo') {
      table = 'fz_efectivo_mov';
      payload = { business_id: contexto.businessId, moneda_id: contexto.refId, fecha, proveedor: document.getElementById('movCampo1').value || null, descripcion, cargos, depositos, tipo_salida: tipoSalida };
    } else {
      table = 'fz_bancos_mov';
      payload = { business_id: contexto.businessId, cuenta_id: contexto.refId, fecha, concepto: document.getElementById('movCampo1').value || null, referencia: document.getElementById('movReferencia').value || null, descripcion, cargos, depositos, tipo_salida: tipoSalida };
    }
    if (tipoSalida === 'gasto') payload.subcuenta_id = document.getElementById('movSubcuenta').value || null;

    let creadoCredito = false;
    if (tipoSalida === 'proveedor' && idsFacturas.length) {
      const montoDisponible = cargos > 0 ? cargos : depositos;
      const resultado = await aplicarPagoFacturas(idsFacturas, montoDisponible, fecha, contexto.businessId, {
        pagado_desde: origenCorto,
        pagado_desde_tipo: contexto.tipo === 'efectivo' ? 'efectivo' : 'banco',
        pagado_desde_cuenta_id: contexto.refId,
      });
      payload.proveedor_factura_ids = resultado.idsAfectados;
      payload.proveedor_factura_id = resultado.idsAfectados[0] || null;
      creadoCredito = resultado.creadoCredito;
    } else if (tipoSalida === 'proveedor') {
      payload.proveedor_factura_ids = [];
    }

    const { error } = await sb.from(table).insert(payload);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (tipoSalida === 'proveedor' && idsFacturas.length) {
      toast(`${idsFacturas.length} factura(s) procesada(s)${creadoCredito ? ' · se generó un crédito a favor' : ''}.`);
    }
    modal.classList.remove('show');
    toast('Movimiento agregado.');
    if (contexto.onDone) contexto.onDone();
  };
}

async function openTraspasoModal(businessId, onDone) {
  await populateTraspasoSelects(businessId);
  document.getElementById('traspasoFecha').value = todayStr();
  document.getElementById('traspasoMonto').value = '';
  document.getElementById('traspasoMontoDestino').value = '';
  document.getElementById('traspasoDescripcion').value = '';
  document.getElementById('modalTraspaso').classList.add('show');

  let destinoTocadoManualmente = false;
  const sugerirMontoDestino = () => {
    if (destinoTocadoManualmente) return;
    const oSel = document.getElementById('traspasoOrigen');
    const dSel = document.getElementById('traspasoDestino');
    const tcOrigen = Number(oSel.selectedOptions[0]?.dataset.tc) || 1;
    const tcDestino = Number(dSel.selectedOptions[0]?.dataset.tc) || 1;
    const montoOrigen = Number(document.getElementById('traspasoMonto').value) || 0;
    document.getElementById('traspasoMontoDestino').value = montoOrigen ? (montoOrigen * (tcOrigen / tcDestino)).toFixed(2) : '';
  };
  document.getElementById('traspasoMontoDestino').oninput = () => { destinoTocadoManualmente = true; };
  document.getElementById('traspasoMonto').oninput = sugerirMontoDestino;

  const handleNuevo = async (selectEl) => {
    if (!selectEl.value.startsWith('nuevo:')) { sugerirMontoDestino(); return; }
    const tipo = selectEl.value.split(':')[1];
    const otherSel = selectEl.id === 'traspasoOrigen' ? document.getElementById('traspasoDestino') : document.getElementById('traspasoOrigen');
    const otherVal = otherSel.value;
    const nuevoValor = await crearCuentaOCajaRapida(businessId, tipo);
    await populateTraspasoSelects(businessId, selectEl.id === 'traspasoOrigen' ? nuevoValor : otherVal, selectEl.id === 'traspasoDestino' ? nuevoValor : otherVal);
    if (nuevoValor) toast('Cuenta/caja creada. Ya puedes usarla en el traspaso.');
    sugerirMontoDestino();
  };
  document.getElementById('traspasoOrigen').onchange = (e) => handleNuevo(e.target);
  document.getElementById('traspasoDestino').onchange = (e) => handleNuevo(e.target);

  document.getElementById('cancelTraspaso').onclick = () => document.getElementById('modalTraspaso').classList.remove('show');
  document.getElementById('saveTraspaso').onclick = async () => {
    const origen = document.getElementById('traspasoOrigen').value;
    const destino = document.getElementById('traspasoDestino').value;
    const fecha = document.getElementById('traspasoFecha').value;
    const montoOrigen = Number(document.getElementById('traspasoMonto').value) || 0;
    const montoDestino = Number(document.getElementById('traspasoMontoDestino').value) || montoOrigen;
    const descripcion = document.getElementById('traspasoDescripcion').value || 'Traspaso entre cuentas';
    if (origen.startsWith('nuevo:') || destino.startsWith('nuevo:')) { toast('Termina de crear la cuenta/caja nueva antes de guardar.', 'error'); return; }
    if (origen === destino) { toast('Elige cuentas distintas.', 'error'); return; }
    if (!montoOrigen) { toast('Escribe un monto.', 'error'); return; }
    const traspasoId = uid();
    const [oTipo, oId] = origen.split(':');
    const [dTipo, dId] = destino.split(':');
    const insertLeg = (tipo, id, esOrigen) => {
      const monto = esOrigen ? montoOrigen : montoDestino;
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
    const idsVinculados = facturaIdsDe(r);
    detalle = `<button class="btn btn-ghost btn-sm salida-abrir-facturas" data-id="${r.id}">${idsVinculados.length ? '🧾 ' + idsVinculados.length + ' factura(s)' : '🧾 Elegir facturas'}</button>`;
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
function facturaIdsDe(r) {
  if (Array.isArray(r.proveedor_factura_ids) && r.proveedor_factura_ids.length) return r.proveedor_factura_ids;
  if (r.proveedor_factura_id) return [r.proveedor_factura_id];
  return [];
}

function wireSalidaCellHandlers(container, table, onChange, traspasoCtx, facturasPend) {
  container.querySelectorAll('.salida-tipo').forEach(sel => sel.addEventListener('change', async () => {
    await sb.from(table).update({ tipo_salida: sel.value, subcuenta_id: null, proveedor_factura_id: null, proveedor_factura_ids: [] }).eq('id', sel.dataset.id);
    onChange();
  }));
  container.querySelectorAll('.salida-detalle').forEach(sel => sel.addEventListener('change', async () => {
    const field = sel.dataset.field;
    await sb.from(table).update({ [field]: sel.value || null }).eq('id', sel.dataset.id);
    onChange();
  }));
  container.querySelectorAll('.salida-abrir-facturas').forEach(btn => btn.addEventListener('click', () => {
    openFacturasPagoModal(btn.dataset.id, table, facturasPend, traspasoCtx, onChange);
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

async function getMonedaLedgerRows(businessId, moneda, conceptosEfectivo, mesFiltro) {
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
  const polizaLineas = await getPolizaLineasParaCuenta(businessId, 'efectivo', moneda.id);
  polizaLineas.forEach(l => {
    autoRows.push({ id: 'poliza-' + l.id, fecha: l.poliza.fecha, proveedor: 'Póliza de diario', descripcion: `Póliza #${l.poliza.numero ?? ''} — ${l.descripcion || l.poliza.concepto || ''}`, factura: '', cargos: Number(l.abono) || 0, depositos: Number(l.cargo) || 0, auto: true });
  });
  const { data: movs } = await sb.from('fz_efectivo_mov').select('*').eq('moneda_id', moneda.id).order('fecha');
  const manualRows = (movs || []).map(m => ({ ...m, auto: false }));
  const todas = [...autoRows, ...manualRows].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!mesFiltro) return todas;
  const mesStart = mesFiltro + '-01';
  const mesEnd = mesFiltro + '-31';
  const antes = todas.filter(r => r.fecha < mesStart);
  const delMes = todas.filter(r => r.fecha >= mesStart && r.fecha <= mesEnd);
  const saldoApertura = (Number(moneda.saldo_inicial) || 0) + antes.reduce((s,r)=>s+(Number(r.depositos)||0)-(Number(r.cargos)||0),0);
  return { saldoApertura, rows: delMes };
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
  const conceptosTarjetas = (conceptosQ.data || []).filter(c => c.categoria === 'tarjetas' || c.categoria === 'bancos');

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
  const [ledgerRes, subcuentas, mayores, facturasPend, cuentasBancoQ, monedasEfectivoQ] = await Promise.all([
    getMonedaLedgerRows(businessId, moneda, conceptosEfectivo, STATE.currentMonth),
    loadSubcuentas(businessId),
    loadCuentasMayor(businessId),
    sb.from('fz_proveedores').select('id,proveedor,factura,importe,importe_pagado,estatus,fecha').eq('business_id', businessId).order('proveedor').order('fecha').limit(5000).then(r => r.data || []),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
  ]);
  const { saldoApertura, rows: ledger } = ledgerRes;
  const traspasoCtx = { cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasEfectivoQ.data || [], origenTipo: 'efectivo', origenId: moneda.id, origenNombre: 'la caja ' + moneda.nombre, origenCorto: 'Caja — ' + moneda.nombre };
  let saldo = saldoApertura;
  const rowsHtml = ledger.map(r => {
    saldo += (Number(r.depositos) || 0) - (Number(r.cargos) || 0);
    if (r.auto) {
      return `<tr style="background:#f7f9fc;">
        <td>${fechaCorta(r.fecha)}</td>
        <td><em>${r.proveedor}</em> <span style="color:var(--muted);font-size:11px;">· auto</span></td>
        <td>${r.descripcion}</td>
        <td class="num">${fmtNum(r.cargos)}</td>
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

  const totalCargosMes = ledger.reduce((s,r)=>s+(Number(r.cargos)||0),0);
  const totalDepositosMes = ledger.reduce((s,r)=>s+(Number(r.depositos)||0),0);

  box.innerHTML = `
    <div class="card-head" style="margin-top:14px;">
      <span class="hint">Saldo al inicio de ${STATE.currentMonth}: ${fmtNum(saldoApertura)} ${moneda.nombre}</span>
      <button class="btn btn-ghost btn-sm" id="addMovBtnEfvo">+ Agregar movimiento (pago en efectivo)</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor / Concepto</th><th>Descripción</th><th>Cargos</th><th>Depósitos</th><th>Saldo</th><th>Tipo de salida</th><th>Detalle</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="9" class="empty">Sin movimientos todavía.</td></tr>`}</tbody>
        <tfoot><tr class="total-row"><td colspan="3">Total ${STATE.currentMonth}</td><td class="num">${fmtNum(totalCargosMes)}</td><td class="num">${fmtNum(totalDepositosMes)}</td><td colspan="4"></td></tr></tfoot>
      </table>
    </div>
  `;

  document.getElementById('addMovBtnEfvo').addEventListener('click', () => {
    openMovimientoModal({ tipo: 'efectivo', refId: moneda.id, businessId, onDone: () => renderMonedaLedger({ ...moneda }, businessId, conceptosEfectivo) });
  });
  wireSalidaCellHandlers(box, 'fz_efectivo_mov', () => renderMonedaLedger(moneda, businessId, conceptosEfectivo), traspasoCtx, facturasPend);
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
      const row = ledger.find(r => r.id === btn.dataset.id) || {};
      await confirmarYEliminarMovimiento('fz_efectivo_mov', { ...row, id: btn.dataset.id }, () => renderMonedaLedger(moneda, businessId, conceptosEfectivo));
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
    sb.from('fz_conceptos').select('*').eq('business_id', b.id).in('categoria', ['tarjetas','bancos']),
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
    const { data } = await sb.from('fz_conceptos').select('*').eq('business_id', businessId).in('categoria', ['tarjetas','bancos']);
    conceptosTarjetas = data || [];
  }
  const [ledgerRes, subcuentas, mayores, facturasPend, cuentasBancoQ, monedasEfectivoQ] = await Promise.all([
    getBancoLedgerRows(businessId, cuentaArr, conceptosTarjetas, STATE.currentMonth),
    loadSubcuentas(businessId),
    loadCuentasMayor(businessId),
    sb.from('fz_proveedores').select('id,proveedor,factura,importe,importe_pagado,estatus,fecha').eq('business_id', businessId).order('proveedor').order('fecha').limit(5000).then(r => r.data || []),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
  ]);
  const { saldoApertura, rows: ledger } = ledgerRes;
  const traspasoCtx = { cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasEfectivoQ.data || [], origenTipo: 'banco', origenId: cuentaId, origenNombre: 'el banco ' + (cuentaArr?.nombre || ''), origenCorto: 'Banco — ' + (cuentaArr?.nombre || '') };
  let saldo = saldoApertura;
  const rowsHtml = ledger.map(m => {
    saldo += (Number(m.depositos)||0) - (Number(m.cargos)||0);
    if (m.auto) {
      return `<tr style="background:#f7f9fc;">
        <td>${fechaCorta(m.fecha)}</td>
        <td><em>${m.descripcion}</em> <span style="color:var(--muted);font-size:11px;">· auto</span></td>
        <td>${m.concepto}</td>
        <td>—</td>
        <td class="num">${fmtNum(m.depositos)}</td>
        <td class="num">${fmtNum(m.cargos)}</td>
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

  const totalDepositosMes = ledger.reduce((s,m)=>s+(Number(m.depositos)||0),0);
  const totalCargosMes = ledger.reduce((s,m)=>s+(Number(m.cargos)||0),0);

  box.innerHTML = `
    <div class="card-head" style="margin-top:14px;">
      <span class="hint">Saldo al inicio de ${STATE.currentMonth}: ${fmt(saldoApertura)}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" id="importMovBtn">📥 Importar movimientos (Excel)</button>
        <button class="btn btn-ghost btn-sm" id="addMovBtnBanco">+ Agregar movimiento</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Descripción</th><th>Concepto</th><th>Referencia</th><th>Depósitos</th><th>Cargos</th><th>Saldo</th><th>Tipo de salida</th><th>Detalle</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="10" class="empty">Sin movimientos.</td></tr>`}</tbody>
        <tfoot><tr class="total-row"><td colspan="4">Total ${STATE.currentMonth}</td><td class="num">${fmtNum(totalDepositosMes)}</td><td class="num">${fmtNum(totalCargosMes)}</td><td colspan="4"></td></tr></tfoot>
      </table>
    </div>
  `;

  document.getElementById('importMovBtn').addEventListener('click', () => openImportExcelModal('bancos_mov', businessId, () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas), cuentaId));
  document.getElementById('addMovBtnBanco').addEventListener('click', () => {
    openMovimientoModal({ tipo: 'banco', refId: cuentaId, businessId, onDone: () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas) });
  });
  wireSalidaCellHandlers(box, 'fz_bancos_mov', () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas), traspasoCtx, facturasPend);
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
      const row = ledger.find(r => r.id === btn.dataset.id) || {};
      await confirmarYEliminarMovimiento('fz_bancos_mov', { ...row, id: btn.dataset.id }, () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas));
    });
  });
}

/* ============================================================
   PROVEEDORES
   ============================================================ */
let STATE_provFiltro = 'Todos';
let STATE_provExpandido = null;

async function renderProveedores() {
  const el = document.getElementById('sec-proveedores');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const scrollY = window.scrollY;
  const [provQ, catalogo, cuentasBancoQ, monedasQ] = await Promise.all([
    sb.from('fz_proveedores').select('*').eq('business_id', b.id).order('fecha', { ascending: false }),
    loadProveedoresCatalogo(b.id),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).eq('activo', true),
  ]);
  if (provQ.error) { el.innerHTML = `<div class="empty">Error: ${provQ.error.message}</div>`; return; }
  const all = provQ.data || [];
  const opcionesPagoDesde = [
    ...(cuentasBancoQ.data || []).map(c => ({ value: 'banco:' + c.id, label: 'Banco — ' + c.nombre })),
    ...(monedasQ.data || []).map(m => ({ value: 'efectivo:' + m.id, label: 'Caja — ' + m.nombre })),
  ];
  const saldoPend = (p) => Number(p.importe) - Number(p.importe_pagado || 0);
  const pendiente = all.filter(p => p.estatus === 'Pendiente' || p.estatus === 'Parcial').reduce((s,p)=>s+saldoPend(p),0);
  const pagado = all.filter(p => p.estatus === 'Pagado').reduce((s,p)=>s+(Number(p.importe)||0),0);
  const rows = STATE_provFiltro === 'Todos' ? all : all.filter(p => p.estatus === STATE_provFiltro);

  const pendientesTodas = all.filter(p => p.estatus === 'Pendiente' || p.estatus === 'Parcial');
  const porProveedorMap = {};
  pendientesTodas.forEach(p => {
    const key = p.proveedor || '(sin proveedor)';
    (porProveedorMap[key] = porProveedorMap[key] || []).push(p);
  });
  const resumenProveedores = Object.keys(porProveedorMap).map(nombre => ({
    nombre, facturas: porProveedorMap[nombre].sort((a,c)=>a.fecha.localeCompare(c.fecha)),
    total: porProveedorMap[nombre].reduce((s,f)=>s+saldoPend(f),0),
  })).sort((a,b) => b.total - a.total);

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total pendiente</div><div class="value num red">${fmt(pendiente)}</div></div>
      <div class="kpi"><div class="label">Total pagado (histórico)</div><div class="value num green">${fmt(pagado)}</div></div>
      <div class="kpi"><div class="label">Facturas registradas</div><div class="value">${all.length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Adeudo por proveedor</h3><span class="hint">Clic en un proveedor para ver sus facturas pendientes (incluye créditos a favor, en verde)</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Proveedor</th><th>Facturas pendientes</th><th>Total adeudado</th></tr></thead>
          <tbody>
            ${resumenProveedores.length ? resumenProveedores.map(p => `
              <tr class="prov-resumen-row" data-prov="${p.nombre}" style="cursor:pointer;">
                <td>${STATE_provExpandido===p.nombre?'▾':'▸'} ${p.nombre}</td>
                <td>${p.facturas.length}</td>
                <td class="num" style="font-weight:700;color:${p.total<0?'var(--green)':'var(--red)'};">${fmt(p.total)}</td>
              </tr>
              ${STATE_provExpandido===p.nombre ? `<tr><td colspan="3" style="padding:0 0 10px 0;background:#f7f9fc;">
                <table style="width:100%;">
                  <thead><tr><th style="padding-left:24px;">Fecha</th><th>Factura</th><th>Saldo</th></tr></thead>
                  <tbody>${p.facturas.map(f => `<tr><td style="padding-left:24px;">${f.fecha}</td><td>${f.factura||'s/f'}${f.estatus==='Parcial'?' (parcial)':''}</td><td class="num" style="color:${saldoPend(f)<0?'var(--green)':'inherit'};">${fmt(saldoPend(f))}</td></tr>`).join('')}</tbody>
                </table>
              </td></tr>` : ''}
            `).join('') : `<tr><td colspan="3" class="empty">No hay adeudos pendientes.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Cuentas por pagar</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="openProveedoresCatBtn">⚙ Catálogo de proveedores</button>
          <button class="btn btn-ghost btn-sm" id="openCuentasBtnProv">⚙ Catálogo de cuentas</button>
          <button class="btn btn-ghost btn-sm" id="importFacturasBtn">📥 Importar facturas (Excel)</button>
          <button class="btn btn-ghost btn-sm" id="provisionarPropinasBtn">🔄 Poner al día propinas</button>
          <button class="btn btn-gold btn-sm" id="addProvBtn">+ Agregar factura</button>
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Al marcar "Pagado" y elegir de dónde, se crea/actualiza automáticamente el movimiento real en esa cuenta (y se descuenta su saldo).</p>
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
  document.getElementById('provisionarPropinasBtn').addEventListener('click', () => provisionarPropinasHistoricas(b.id, renderProveedores));
  el.querySelectorAll('.prov-tab').forEach(t => t.addEventListener('click', () => { STATE_provFiltro = t.dataset.f; renderProveedores(); }));
  el.querySelectorAll('.prov-resumen-row').forEach(tr => tr.addEventListener('click', () => {
    STATE_provExpandido = STATE_provExpandido === tr.dataset.prov ? null : tr.dataset.prov;
    renderProveedores();
  }));
  el.querySelectorAll('.prov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      let val = inp.value;
      if (field === 'importe') val = Number(val) || 0;
      if ((field === 'fecha' || field === 'fecha_pago') && val === '') val = null;
      const payload = { [field]: val };
      if (field === 'proveedor_id') {
        const c = catalogo.find(x => x.id === val);
        payload.proveedor = c ? c.nombre : '';
      }
      if (field === 'estatus') {
        const factura = all.find(x => x.id === inp.dataset.id);
        const importe = Number(factura?.importe) || 0;
        if (val === 'Pagado') {
          payload.importe_pagado = importe;
          if (!factura?.fecha_pago) payload.fecha_pago = todayStr();
        } else if (val === 'Pendiente') {
          payload.importe_pagado = 0;
          payload.fecha_pago = null;
          payload.pagado_desde = null;
          payload.pagado_desde_tipo = null;
          payload.pagado_desde_cuenta_id = null;
        } else if (val === 'Parcial') {
          const actual = Number(factura?.importe_pagado) || 0;
          const respuesta = prompt(`¿Cuánto se ha pagado de esta factura (de ${fmt(importe)})?`, actual || '');
          if (respuesta === null) { renderProveedores(); return; }
          const monto = Math.max(0, Math.min(importe, Number(respuesta) || 0));
          payload.importe_pagado = monto;
          if (!factura?.fecha_pago) payload.fecha_pago = todayStr();
        }
      }
      const { error } = await sb.from('fz_proveedores').update(payload).eq('id', inp.dataset.id);
      if (error) { toast('Error guardando: ' + error.message, 'error'); return; }
      if (field === 'estatus') await syncPagoProveedor(b.id, inp.dataset.id);
      renderProveedores();
    });
  });
  el.querySelectorAll('.prov-pagodesde').forEach(sel => {
    sel.addEventListener('change', async () => {
      const [tipo, cuentaId] = sel.value ? sel.value.split(':') : [null, null];
      const opt = opcionesPagoDesde.find(o => o.value === sel.value);
      await sb.from('fz_proveedores').update({
        pagado_desde: opt ? opt.label : null,
        pagado_desde_tipo: tipo,
        pagado_desde_cuenta_id: cuentaId || null,
      }).eq('id', sel.dataset.id);
      await syncPagoProveedor(b.id, sel.dataset.id);
      renderProveedores();
    });
  });
  el.querySelectorAll('.prov-del').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    const { error } = await sb.from('fz_proveedores').delete().eq('id', btn.dataset.id);
    if (error) { toast('No se pudo eliminar: ' + error.message, 'error'); return; }
    renderProveedores();
  }));
  el.querySelectorAll('.prov-desglosar').forEach(btn => btn.addEventListener('click', () => openDesgloseModal(b.id, btn.dataset.id, renderProveedores)));
  window.scrollTo(0, scrollY);
}

async function syncPagoProveedor(businessId, facturaId) {
  const { data: factura, error: eFactura } = await sb.from('fz_proveedores').select('*').eq('id', facturaId).single();
  if (eFactura) { toast('Error leyendo la factura: ' + eFactura.message, 'error'); return; }
  if (!factura) return;
  const [bmQ, emQ] = await Promise.all([
    sb.from('fz_bancos_mov').select('*').eq('business_id', businessId).eq('tipo_salida', 'proveedor'),
    sb.from('fz_efectivo_mov').select('*').eq('business_id', businessId).eq('tipo_salida', 'proveedor'),
  ]);
  const movesUnicos = [
    ...(bmQ.data || []).filter(m => facturaIdsDe(m).length === 1 && facturaIdsDe(m)[0] === facturaId).map(m => ({ ...m, _t: 'fz_bancos_mov' })),
    ...(emQ.data || []).filter(m => facturaIdsDe(m).length === 1 && facturaIdsDe(m)[0] === facturaId).map(m => ({ ...m, _t: 'fz_efectivo_mov' })),
  ];

  if (factura.estatus !== 'Pagado' || !factura.pagado_desde_tipo || !factura.pagado_desde_cuenta_id) {
    for (const m of movesUnicos) await sb.from(m._t).delete().eq('id', m.id);
    return;
  }

  const yaCorrecta = movesUnicos.find(m => factura.pagado_desde_tipo === 'banco'
    ? (m._t === 'fz_bancos_mov' && m.cuenta_id === factura.pagado_desde_cuenta_id)
    : (m._t === 'fz_efectivo_mov' && m.moneda_id === factura.pagado_desde_cuenta_id));
  for (const m of movesUnicos) { if (m.id !== yaCorrecta?.id) await sb.from(m._t).delete().eq('id', m.id); }

  if (yaCorrecta) {
    const { error } = await sb.from(yaCorrecta._t).update({ cargos: factura.importe, fecha: factura.fecha_pago || todayStr() }).eq('id', yaCorrecta.id);
    if (error) toast('Error actualizando el movimiento del pago: ' + error.message, 'error');
  } else {
    const payload = {
      business_id: businessId, fecha: factura.fecha_pago || todayStr(), cargos: factura.importe, depositos: 0,
      tipo_salida: 'proveedor', proveedor_factura_id: facturaId, proveedor_factura_ids: [facturaId],
      descripcion: `Pago factura ${factura.factura || 's/f'} — ${factura.proveedor}`,
    };
    const { error } = factura.pagado_desde_tipo === 'banco'
      ? await sb.from('fz_bancos_mov').insert({ ...payload, cuenta_id: factura.pagado_desde_cuenta_id, concepto: 'Pago a proveedor' })
      : await sb.from('fz_efectivo_mov').insert({ ...payload, moneda_id: factura.pagado_desde_cuenta_id, proveedor: factura.proveedor });
    if (error) toast('Error creando el movimiento del pago: ' + error.message, 'error');
  }
}

function provRowHtml(p, catalogo, opcionesPagoDesde) {
  const desgloseTotal = desgloseLineas(p.desglose).reduce((s,l)=>s+(Number(l.monto)||0),0);
  const desgloseOk = Math.abs(desgloseTotal - (Number(p.importe)||0)) < 1 && desgloseTotal > 0;
  const esCredito = Number(p.importe) < 0;
  const saldoPendiente = Number(p.importe) - Number(p.importe_pagado || 0);
  return `<tr style="${esCredito?'background:#f2fbf5;':''}">
    <td><input class="cell prov-cell" type="date" value="${p.fecha}" data-id="${p.id}" data-field="fecha"></td>
    <td><select class="cell prov-cell" data-id="${p.id}" data-field="proveedor_id" style="min-width:220px;">
      <option value="">${p.proveedor || '— elegir —'}</option>
      ${catalogo.map(c => `<option value="${c.id}" ${p.proveedor_id===c.id?'selected':''}>${c.razon_social ? c.razon_social + ' — ' : ''}${c.nombre_comercial || c.nombre}</option>`).join('')}
    </select></td>
    <td><input class="cell prov-cell" type="text" value="${p.factura||''}" data-id="${p.id}" data-field="factura"></td>
    <td>
      <input class="cell prov-cell num" type="number" step="0.01" value="${p.importe ?? 0}" data-id="${p.id}" data-field="importe">
      ${esCredito ? `<div style="font-size:10.5px;color:var(--green);margin-top:2px;">crédito a favor</div>` : (Number(p.importe_pagado)>0 && p.estatus!=='Pagado' ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px;">pagado ${fmt(p.importe_pagado)} · pendiente ${fmt(saldoPendiente)}</div>` : '')}
    </td>
    <td><button class="btn btn-ghost btn-sm prov-desglosar" data-id="${p.id}" style="color:${desgloseOk?'var(--green)':(desgloseTotal>0?'var(--red)':'var(--muted)')};">${desgloseTotal>0?fmt(desgloseTotal):'Desglosar'}</button></td>
    <td><select class="cell prov-cell" data-id="${p.id}" data-field="estatus">
      <option ${p.estatus==='Pendiente'?'selected':''}>Pendiente</option>
      <option ${p.estatus==='Parcial'?'selected':''}>Parcial</option>
      <option ${p.estatus==='Pagado'?'selected':''}>Pagado</option>
    </select></td>
    <td><input class="cell prov-cell" type="date" value="${p.fecha_pago||''}" data-id="${p.id}" data-field="fecha_pago"></td>
    <td><select class="cell prov-pagodesde" data-id="${p.id}" style="min-width:150px;">
      <option value="">— sin especificar —</option>
      ${opcionesPagoDesde.map(o => `<option value="${o.value}" ${(p.pagado_desde_tipo && (p.pagado_desde_tipo+':'+p.pagado_desde_cuenta_id)===o.value)?'selected':''}>${o.label}</option>`).join('')}
    </select></td>
    <td><button class="row-del prov-del" data-id="${p.id}">✕</button></td>
  </tr>`;
}

/* ============================================================
   P&L — ESTADO DE RESULTADOS
   ============================================================ */
let STATE_plVista = 'mensual'; // 'mensual' | 'acumulado' | 'anual'
let STATE_plDetalleAbierto = null; // subcuenta id cuyo detalle está desplegado

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

async function getPolizaLineasParaCuenta(businessId, tipo, refId) {
  const { data: lineas } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('cuenta_tipo', tipo).eq('cuenta_ref_id', refId);
  if (!lineas || !lineas.length) return [];
  const polizaIds = [...new Set(lineas.map(l => l.poliza_id))];
  const { data: polizas } = await sb.from('fz_polizas').select('id,fecha,concepto,numero').in('id', polizaIds);
  const polizaMap = Object.fromEntries((polizas || []).map(p => [p.id, p]));
  return lineas.map(l => ({ ...l, poliza: polizaMap[l.poliza_id] })).filter(l => l.poliza);
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
    desgloseLineas(f.desglose).forEach(linea => {
      porSubcuenta[linea.subcuenta_id] = (porSubcuenta[linea.subcuenta_id] || 0) + (Number(linea.monto) || 0);
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
      .map(s => ({ id: s.id, nombre: s.nombre, monto: porSubcuenta[s.id] || 0 }))
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
      .map(s => ({ id: s.id, nombre: s.nombre, monto: porSubcuenta[s.id] || 0 }))
      .filter(s => s.monto);
    return { nombre: m.nombre, subs, subtotal: subs.reduce((s,x)=>s+x.monto,0) };
  }).filter(m => m.subtotal);
  return { porMayor, total: porMayor.reduce((s,m)=>s+m.subtotal,0) };
}

/* ---------- Detalle de transacciones que forman el total de una subcuenta (clic para auditar) ---------- */
async function getDetalleGastoSubcuenta(businessId, periodo, subcuentaId) {
  const { start, end, mesStart, mesEnd } = periodo;
  const filas = [];

  const [facturasQ, bmQ, emQ, plGastosQ, lineasPolizaQ] = await Promise.all([
    sb.from('fz_proveedores').select('*').eq('business_id', businessId).gte('fecha', start).lte('fecha', end),
    sb.from('fz_bancos_mov').select('*').eq('business_id', businessId).eq('tipo_salida', 'gasto').eq('subcuenta_id', subcuentaId).gte('fecha', start).lte('fecha', end),
    sb.from('fz_efectivo_mov').select('*').eq('business_id', businessId).eq('tipo_salida', 'gasto').eq('subcuenta_id', subcuentaId).gte('fecha', start).lte('fecha', end),
    sb.from('fz_pl_gastos').select('*').eq('business_id', businessId).eq('subcuenta_id', subcuentaId).gte('mes', mesStart).lte('mes', mesEnd),
    sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('subcuenta_id', subcuentaId).eq('cuenta_tipo', 'subcuenta'),
  ]);

  (facturasQ.data || []).forEach(f => {
    desgloseLineas(f.desglose).forEach(linea => {
      if (linea.subcuenta_id === subcuentaId && Number(linea.monto)) {
        const pago = f.estatus === 'Pagado' ? (f.pagado_desde || 'Pagado') : (f.estatus === 'Parcial' ? `Parcial · ${f.pagado_desde || 'sin especificar'}` : 'Pendiente de pago');
        filas.push({ fecha: f.fecha, proveedor: f.proveedor || '(sin proveedor)', concepto: linea.descripcion || f.factura || '(factura)', importe: Number(linea.monto), pago });
      }
    });
  });
  (bmQ.data || []).forEach(m => filas.push({ fecha: m.fecha, proveedor: m.descripcion || '(movimiento bancario)', concepto: m.concepto || '—', importe: Number(m.cargos) || 0, pago: 'Banco' }));
  (emQ.data || []).forEach(m => filas.push({ fecha: m.fecha, proveedor: m.proveedor || '(movimiento efectivo)', concepto: m.descripcion || '—', importe: Number(m.cargos) || 0, pago: 'Efectivo' }));
  (plGastosQ.data || []).forEach(g => filas.push({ fecha: g.mes + '-01', proveedor: 'Ajuste manual', concepto: g.descripcion || '—', importe: Number(g.monto) || 0, pago: 'Ajuste manual' }));

  const lineasPoliza = lineasPolizaQ.data || [];
  if (lineasPoliza.length) {
    const polizaIds = [...new Set(lineasPoliza.map(l => l.poliza_id))];
    const { data: polizasInfo } = await sb.from('fz_polizas').select('id,fecha,numero,concepto').in('id', polizaIds).gte('fecha', start).lte('fecha', end);
    const polizaMap = Object.fromEntries((polizasInfo || []).map(p => [p.id, p]));
    lineasPoliza.forEach(l => {
      const p = polizaMap[l.poliza_id];
      if (!p) return;
      const monto = (Number(l.cargo) || 0) - (Number(l.abono) || 0);
      if (monto) filas.push({ fecha: p.fecha, proveedor: `Póliza #${p.numero ?? ''}`, concepto: l.descripcion || p.concepto || '—', importe: monto, pago: 'Póliza de diario' });
    });
  }

  return filas.sort((a,b) => a.fecha.localeCompare(b.fecha));
}

async function getDetalleIngresoSubcuenta(businessId, periodo, subcuentaId) {
  const { start, end } = periodo;
  const { data: lineasPoliza } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('subcuenta_id', subcuentaId).eq('cuenta_tipo', 'subcuenta');
  if (!lineasPoliza || !lineasPoliza.length) return [];
  const polizaIds = [...new Set(lineasPoliza.map(l => l.poliza_id))];
  const { data: polizasInfo } = await sb.from('fz_polizas').select('id,fecha,numero,concepto').in('id', polizaIds).gte('fecha', start).lte('fecha', end);
  const polizaMap = Object.fromEntries((polizasInfo || []).map(p => [p.id, p]));
  const filas = [];
  lineasPoliza.forEach(l => {
    const p = polizaMap[l.poliza_id];
    if (!p) return;
    const monto = (Number(l.abono) || 0) - (Number(l.cargo) || 0);
    if (monto) filas.push({ fecha: p.fecha, proveedor: `Póliza #${p.numero ?? ''}`, concepto: l.descripcion || p.concepto || '—', importe: monto, pago: 'Póliza de diario' });
  });
  return filas.sort((a,b) => a.fecha.localeCompare(b.fecha));
}

function detalleSubcuentaHtml(filas, colspan) {
  if (!filas.length) return `<tr><td colspan="${colspan}" style="padding-left:34px;color:var(--muted);font-size:12px;">Sin movimientos detallados para este período.</td></tr>`;
  return `<tr><td colspan="${colspan}" style="padding:0 0 8px 34px;">
    <table style="width:100%;">
      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Importe</th><th>Cómo se pagó</th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td>${fechaCorta(f.fecha)}</td>
        <td>${f.proveedor}</td>
        <td>${f.concepto}</td>
        <td class="num">${fmt(f.importe)}</td>
        <td>${f.pago}</td>
      </tr>`).join('')}</tbody>
    </table>
  </td></tr>`;
}

function plTagsHtml() {
  return `<div class="tag-row">
    <div class="tag ${STATE_plVista==='mensual'?'active':''}" id="plTabMensual">Mensual</div>
    <div class="tag ${STATE_plVista==='acumulado'?'active':''}" id="plTabAcumulado">Acumulado</div>
    <div class="tag ${STATE_plVista==='anual'?'active':''}" id="plTabAnual">Todos los meses</div>
  </div>`;
}
function wirePLTags(el) {
  el.querySelector('#plTabMensual').addEventListener('click', () => { STATE_plVista = 'mensual'; renderPL(); });
  el.querySelector('#plTabAcumulado').addEventListener('click', () => { STATE_plVista = 'acumulado'; renderPL(); });
  el.querySelector('#plTabAnual').addEventListener('click', () => { STATE_plVista = 'anual'; renderPL(); });
}

async function renderPLAnual(el, b) {
  el.innerHTML = plTagsHtml() + `<div class="empty">Calculando el año completo…</div>`;
  wirePLTags(el);

  const year = STATE.currentMonth.slice(0, 4);
  const [conceptosVenta, conceptos, subcuentas, mayores, conceptosSistema] = await Promise.all([
    loadConceptosVenta(b.id), loadConceptos(b.id), loadSubcuentas(b.id), loadCuentasMayor(b.id), loadConceptosSistema(b.id),
  ]);
  const porCatPL = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), bancos: conceptos.filter(c=>c.categoria==='bancos'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  const mayoresGasto = mayores.filter(m => m.tipo === 'gasto');
  const mesesYm = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const mesesLabel = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const datos = [];
  for (const ym of mesesYm) {
    const periodo = periodoPL(ym, 'mensual');
    const { data: v } = await sb.from('fz_ventas').select('*').eq('business_id', b.id).gte('fecha', periodo.start).lte('fecha', periodo.end);
    const ventas = v || [];
    const ingresosPorConcepto = conceptosVenta.map(c => ventas.reduce((s,r)=>s+(Number((r.venta_data||{})[c.id])||0),0));
    const totalIngresosVentas = conceptosVenta.reduce((s,c,idx)=>s+(c.tipo==='resta'?-ingresosPorConcepto[idx]:ingresosPorConcepto[idx]),0);
    const gastosOperativos = ventas.reduce((s,r)=>s+(Number(r.gastos)||0),0);
    let diffPeriodo = 0;
    ventas.forEach(r => { diffPeriodo += computeRowDiffs(r, conceptosVenta, porCatPL, conceptosSistema).difTotal; });
    const faltanteCaja = diffPeriodo>0?diffPeriodo:0;
    const sobranteCaja = diffPeriodo<0?-diffPeriodo:0;
    const gClas = await computeGastosClasificados(b.id, periodo, subcuentas, mayores);
    const iPoliza = await computeIngresosPoliza(b.id, periodo, subcuentas, mayores);
    const totalIngresosFinal = totalIngresosVentas + sobranteCaja + iPoliza.total;
    const gastosTotales = gastosOperativos + gClas.totalClasificado + gClas.sinClasificar + faltanteCaja;
    const utilidad = totalIngresosFinal - gastosTotales;
    datos.push({ ym, ingresosPorConcepto, sobranteCaja, iPolizaTotal: iPoliza.total, totalIngresosFinal, gastosOperativos, faltanteCaja, gClas, gastosTotales, utilidad });
  }

  const sum = arr => arr.reduce((s,x)=>s+x,0);
  const filaHtml = (label, valores, opts={}) => `<tr class="${opts.total?'total-row':''}" style="${opts.bg?'background:#f7f9fc;':''}${opts.indent?'':''}">
    <td style="${opts.indent?'padding-left:22px;':''}${opts.italic?'font-style:italic;color:var(--muted);':''}${opts.bold?'font-weight:700;':''}">${label}</td>
    ${valores.map(v => `<td class="num" style="${opts.color?`color:${opts.color};`:''}">${fmt(v)}</td>`).join('')}
    <td class="num" style="font-weight:700;${opts.color?`color:${opts.color};`:''}">${fmt(sum(valores))}</td>
  </tr>`;

  const filasIngreso = conceptosVenta.map((c, idx) => filaHtml(
    c.nombre + (c.tipo==='resta'?' (descuento)':''),
    datos.map(d => d.ingresosPorConcepto[idx]),
    { color: c.tipo==='resta' ? 'var(--red)' : null }
  )).join('');
  const filaSobrante = datos.some(d=>d.sobranteCaja) ? filaHtml('Sobrante de caja (conciliación)', datos.map(d=>d.sobranteCaja), { color:'var(--green)' }) : '';
  const filaPoliza = datos.some(d=>d.iPolizaTotal) ? filaHtml('Ingresos por póliza', datos.map(d=>d.iPolizaTotal)) : '';
  const filaTotalIngresos = filaHtml('Total ingresos', datos.map(d=>d.totalIngresosFinal), { total:true });

  const filaGastosOp = filaHtml('Gastos operativos (sin clasificar, Ventas)', datos.map(d=>d.gastosOperativos));
  const filaFaltante = datos.some(d=>d.faltanteCaja) ? filaHtml('Faltante de caja (conciliación)', datos.map(d=>d.faltanteCaja), { color:'var(--red)' }) : '';
  const filasMayor = mayoresGasto.map(m => filaHtml(m.nombre, datos.map(d => d.gClas.porMayor.find(pm=>pm.nombre===m.nombre)?.subtotal || 0), { bold:true, bg:true })).join('');
  const filaSinClasificar = datos.some(d=>d.gClas.sinClasificar) ? filaHtml('Otros gastos sin subcuenta', datos.map(d=>d.gClas.sinClasificar)) : '';
  const filaTotalGastos = filaHtml('Total gastos', datos.map(d=>d.gastosTotales), { total:true });

  const filaUtilidad = filaHtml('Utilidad / Pérdida', datos.map(d=>d.utilidad), { total:true, color: sum(datos.map(d=>d.utilidad))>=0?'var(--green)':'var(--red)' });
  const margenRow = `<tr><td style="font-style:italic;color:var(--muted);">Margen</td>${datos.map(d=>`<td class="num">${d.totalIngresosFinal?((d.utilidad/d.totalIngresosFinal*100).toFixed(0)+'%'):'—'}</td>`).join('')}<td class="num">—</td></tr>`;

  el.innerHTML = plTagsHtml() + `
    <div class="card">
      <div class="card-head"><h3>P&L — Todos los meses de ${year}</h3><button class="btn btn-ghost btn-sm" id="openCuentasBtnPLAnual">⚙ Catálogo de cuentas</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Concepto</th>${mesesLabel.map(m=>`<th>${m}</th>`).join('')}<th>Acumulado</th></tr></thead>
          <tbody>
            <tr style="background:#f7f9fc;"><td colspan="14" style="font-weight:700;">Ingresos</td></tr>
            ${filasIngreso}
            ${filaSobrante}
            ${filaPoliza}
            ${filaTotalIngresos}
            <tr style="background:#f7f9fc;"><td colspan="14" style="font-weight:700;">Gastos</td></tr>
            ${filaGastosOp}
            ${filaFaltante}
            ${filasMayor}
            ${filaSinClasificar}
            ${filaTotalGastos}
            ${filaUtilidad}
            ${margenRow}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('openCuentasBtnPLAnual').addEventListener('click', () => openCuentasModal(b.id, () => renderPLAnual(el, b)));
}

async function renderPL() {
  const el = document.getElementById('sec-pl');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  if (STATE_plVista === 'anual') { await renderPLAnual(el, b); return; }
  const scrollY = window.scrollY;
  const periodo = periodoPL(STATE.currentMonth, STATE_plVista);

  const [ventasQ, conceptosVenta, conceptos, subcuentas, mayores, conceptosSistema] = await Promise.all([
    sb.from('fz_ventas').select('*').eq('business_id', b.id).gte('fecha', periodo.start).lte('fecha', periodo.end),
    loadConceptosVenta(b.id),
    loadConceptos(b.id),
    loadSubcuentas(b.id),
    loadCuentasMayor(b.id),
    loadConceptosSistema(b.id),
  ]);
  const v = ventasQ.data || [];
  const ingresosPorConcepto = conceptosVenta.map(c => ({
    nombre: c.nombre, tipo: c.tipo,
    monto: v.reduce((s, r) => s + (Number((r.venta_data || {})[c.id]) || 0), 0),
  }));
  const totalIngresosVentas = ingresosPorConcepto.reduce((s, i) => s + (i.tipo === 'resta' ? -i.monto : i.monto), 0);
  const gastosOperativos = v.reduce((s,r)=>s+(Number(r.gastos)||0),0);

  // Faltantes / sobrantes de caja detectados en la conciliación de Ventas
  const porCatPL = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), bancos: conceptos.filter(c=>c.categoria==='bancos'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  let diffPeriodo = 0;
  v.forEach(r => { diffPeriodo += computeRowDiffs(r, conceptosVenta, porCatPL, conceptosSistema).difTotal; });
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

  let detalleGastoHtml = '', detalleIngresoHtml = '';
  if (STATE_plDetalleAbierto) {
    const esGasto = gClas.porMayor.some(m => m.subs.some(s => s.id === STATE_plDetalleAbierto));
    const esIngreso = iPoliza.porMayor.some(m => m.subs.some(s => s.id === STATE_plDetalleAbierto));
    if (esGasto) detalleGastoHtml = detalleSubcuentaHtml(await getDetalleGastoSubcuenta(b.id, periodo, STATE_plDetalleAbierto), 3);
    else if (esIngreso) detalleIngresoHtml = detalleSubcuentaHtml(await getDetalleIngresoSubcuenta(b.id, periodo, STATE_plDetalleAbierto), 2);
  }

  el.innerHTML = `
    ${plTagsHtml()}
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
            ${m.subs.map(s => `<tr class="pl-subcuenta-row" data-subcuenta="${s.id}" style="cursor:pointer;"><td style="padding-left:22px;">${STATE_plDetalleAbierto===s.id?'▾':'▸'} ${s.nombre}</td><td class="num">${fmt(s.monto)}</td></tr>${STATE_plDetalleAbierto===s.id?detalleIngresoHtml:''}`).join('')}
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
            ${m.subs.map(s => `<tr class="pl-subcuenta-row" data-subcuenta="${s.id}" style="cursor:pointer;"><td style="padding-left:22px;">${STATE_plDetalleAbierto===s.id?'▾':'▸'} ${s.nombre}</td><td class="num">${fmt(s.monto)}</td><td></td></tr>${STATE_plDetalleAbierto===s.id?detalleGastoHtml:''}`).join('')}
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
          <thead><tr><th>Mes</th><th>Subcuenta</th><th>Descripción</th><th>Monto</th><th></th></tr></thead>
          <tbody>
            ${gClas.gastosManuales.map(g => `<tr>
              <td>${g.mes}</td>
              <td><select class="cell gasto-cell" data-id="${g.id}" data-field="subcuenta_id">
                <option value="">— sin subcuenta —</option>
                ${subcuentas.map(s => { const mm = mayores.find(x=>x.id===s.cuenta_mayor_id); return `<option value="${s.id}" ${g.subcuenta_id===s.id?'selected':''}>${mm?mm.nombre+' › ':''}${s.nombre}</option>`; }).join('')}
              </select></td>
              <td><input class="cell gasto-cell" type="text" placeholder="Ej. Cloro, Servilletas" value="${g.descripcion||''}" data-id="${g.id}" data-field="descripcion"></td>
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

  wirePLTags(el);
  el.querySelectorAll('.pl-subcuenta-row').forEach(tr => tr.addEventListener('click', () => {
    STATE_plDetalleAbierto = STATE_plDetalleAbierto === tr.dataset.subcuenta ? null : tr.dataset.subcuenta;
    renderPL();
  }));
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
  window.scrollTo(0, scrollY);
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
  const { data } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).order('created_at');
  return data || [];
}

async function renderPolizas() {
  const el = document.getElementById('sec-polizas');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const scrollY = window.scrollY;

  const [polizas, lineas, subcuentas, mayores, cuentasBancoQ, monedasQ] = await Promise.all([
    loadPolizas(b.id), loadTodasLasLineas(b.id), loadSubcuentas(b.id), loadCuentasMayor(b.id),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).eq('activo', true),
  ]);
  const cuentasBanco = cuentasBancoQ.data || [];
  const monedasEfectivo = monedasQ.data || [];

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
          <button class="btn btn-ghost btn-sm" id="importPolizasBtn">📥 Importar pólizas (Excel)</button>
          <button class="btn btn-gold btn-sm" id="addPolizaBtn">+ Nueva póliza</button>
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Cada línea puede afectar una cuenta contable (Catálogo de cuentas) o directamente una cuenta bancaria / caja de efectivo real — en ese caso el cargo/abono también se refleja en el saldo de Bancos o Efectivo. El Excel de pólizas debe tener columnas: Fecha, Concepto, Subcuenta, Descripción, Cargo, Abono — las filas con la misma Fecha y Concepto se agrupan en una sola póliza.</p>
      ${subcuentas.length === 0 ? `<div class="empty">Aún no tienes cuentas en el catálogo. Crea al menos una (de cualquier tipo) para poder registrar pólizas.</div>` : ''}
      <div id="polizasList">
        ${polizas.length === 0 ? `<div class="empty">Sin pólizas todavía.</div>` : polizas.map(p => polizaCardHtml(p, lineas.filter(l=>l.poliza_id===p.id), subcuentas, mayores, cuentasBanco, monedasEfectivo)).join('')}
      </div>
    </div>
  `;

  document.getElementById('openCuentasBtnPolizas').addEventListener('click', () => openCuentasModal(b.id, renderPolizas));
  document.getElementById('importPolizasBtn').addEventListener('click', () => openImportExcelModal('polizas', b.id, renderPolizas));
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
  window.scrollTo(0, scrollY);
}

function polizaCardHtml(p, lineasPoliza, subcuentas, mayores, cuentasBanco, monedasEfectivo) {
  const totalCargo = lineasPoliza.reduce((s,l)=>s+(Number(l.cargo)||0),0);
  const totalAbono = lineasPoliza.reduce((s,l)=>s+(Number(l.abono)||0),0);
  const diff = totalCargo - totalAbono;
  const cuadrada = Math.abs(diff) < 0.01;
  const cuentaCellsHtml = (l) => {
    const tipo = l.cuenta_tipo || 'subcuenta';
    const tipoSelect = `<select class="cell linea-tipo" data-id="${l.id}">
      <option value="subcuenta" ${tipo==='subcuenta'?'selected':''}>Cuenta contable</option>
      <option value="banco" ${tipo==='banco'?'selected':''}>Banco</option>
      <option value="efectivo" ${tipo==='efectivo'?'selected':''}>Efectivo</option>
    </select>`;
    let cuentaSelect;
    if (tipo === 'banco') {
      cuentaSelect = `<select class="cell linea-cuenta" data-id="${l.id}" data-tipo="banco">
        <option value="">— elegir cuenta bancaria —</option>
        ${cuentasBanco.map(c => `<option value="${c.id}" ${l.cuenta_ref_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
      </select>`;
    } else if (tipo === 'efectivo') {
      cuentaSelect = `<select class="cell linea-cuenta" data-id="${l.id}" data-tipo="efectivo">
        <option value="">— elegir caja —</option>
        ${monedasEfectivo.map(m => `<option value="${m.id}" ${l.cuenta_ref_id===m.id?'selected':''}>${m.nombre}</option>`).join('')}
      </select>`;
    } else {
      cuentaSelect = `<select class="cell linea-cuenta" data-id="${l.id}" data-tipo="subcuenta">
        <option value="">— elegir subcuenta —</option>
        ${subcuentas.map(s => { const m = mayores.find(x=>x.id===s.cuenta_mayor_id); return `<option value="${s.id}" ${l.subcuenta_id===s.id?'selected':''}>${m?m.nombre+' › ':''}${s.nombre}</option>`; }).join('')}
      </select>`;
    }
    return `<td>${tipoSelect}</td><td>${cuentaSelect}</td>`;
  };
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
          <thead><tr><th>Tipo</th><th>Cuenta</th><th>Descripción</th><th>Cargo</th><th>Abono</th><th></th></tr></thead>
          <tbody>
            ${lineasPoliza.map(l => `<tr>
              ${cuentaCellsHtml(l)}
              <td><input class="cell linea-cell" type="text" value="${l.descripcion||''}" data-id="${l.id}" data-field="descripcion"></td>
              <td><input class="cell linea-cell num" type="number" step="0.01" value="${l.cargo ?? 0}" data-id="${l.id}" data-field="cargo"></td>
              <td><input class="cell linea-cell num" type="number" step="0.01" value="${l.abono ?? 0}" data-id="${l.id}" data-field="abono"></td>
              <td><button class="row-del linea-del" data-id="${l.id}">✕</button></td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="3">Totales</td>
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
  el.querySelectorAll('.linea-tipo').forEach(sel => sel.addEventListener('change', async () => {
    const { error } = await sb.from('fz_polizas_lineas').update({ cuenta_tipo: sel.value, subcuenta_id: null, cuenta_ref_id: null }).eq('id', sel.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    renderPolizas();
  }));
  el.querySelectorAll('.linea-cuenta').forEach(sel => sel.addEventListener('change', async () => {
    const tipo = sel.dataset.tipo;
    const payload = tipo === 'subcuenta' ? { subcuenta_id: sel.value || null, cuenta_ref_id: null } : { cuenta_ref_id: sel.value || null, subcuenta_id: null };
    const { error } = await sb.from('fz_polizas_lineas').update(payload).eq('id', sel.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    renderPolizas();
  }));
  el.querySelectorAll('.linea-cell').forEach(inp => inp.addEventListener('change', async () => {
    const field = inp.dataset.field;
    const val = field === 'descripcion' ? (inp.value || null) : (Number(inp.value) || 0);
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
