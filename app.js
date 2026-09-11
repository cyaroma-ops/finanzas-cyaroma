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
  esAdministrador: false,
  negociosPermitidos: null, // null = sin restricción (propietario); array de ids = restringido
};

/* ---------- Utilidades ---------- */
const fmt = (n) => {
  n = Number(n) || 0;
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
};
const fmtNum = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };
const fmtInputVal = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leerMonto = (v) => Number(String(v).replace(/,/g, '')) || 0;
function wireInputsMoneda(container) {
  container.querySelectorAll('.num-fmt').forEach(el => {
    el.addEventListener('focus', function () {
      const v = leerMonto(this.value);
      this.value = v === 0 ? '' : v;
      this.select();
    });
    el.addEventListener('blur', function () {
      this.value = fmtInputVal(leerMonto(this.value));
    });
  });
}
const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end };
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const sumarDias = (fechaStr, dias) => {
  const d = new Date(fechaStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
};
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

/* ---------- Auditoría: registrar quién crea/edita/elimina qué ---------- */
async function registrarAuditoria(businessId, accion, modulo, descripcion) {
  try {
    const { error } = await sb.from('fz_auditoria').insert({
      business_id: businessId, usuario_email: STATE.user?.email || null,
      accion, modulo, descripcion,
    });
    if (error) toast('No se pudo registrar en Auditoría: ' + error.message, 'error');
  } catch (e) {
    toast('No se pudo registrar en Auditoría: ' + (e?.message || e), 'error');
  }
}

/* ---------- Adjuntos (PDF/imagen) en Proveedores, Bancos, Efectivo, Pólizas ---------- */
const ADJUNTOS_BUCKET = 'adjuntos';
const ADJUNTOS_MAX_MB = 5;
const ADJUNTOS_EXT_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png'];
const TABLA_MODULO_LABEL = { fz_proveedores: 'Proveedores', fz_bancos_mov: 'Bancos', fz_efectivo_mov: 'Efectivo', fz_polizas: 'Pólizas' };

async function subirAdjunto(tabla, registroId, businessId, file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ADJUNTOS_EXT_PERMITIDAS.includes(ext)) { toast('Solo se permiten archivos PDF, JPG o PNG.', 'error'); return null; }
  if (file.size > ADJUNTOS_MAX_MB * 1024 * 1024) { toast(`El archivo pesa más de ${ADJUNTOS_MAX_MB} MB. Comprímelo o usa uno más ligero.`, 'error'); return null; }
  const nombreLimpio = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${businessId}/${tabla}/${registroId}/${Date.now()}_${nombreLimpio}`;
  const { error } = await sb.storage.from(ADJUNTOS_BUCKET).upload(path, file, { upsert: false });
  if (error) { toast('Error subiendo el archivo: ' + error.message, 'error'); return null; }
  return { path, nombre: file.name };
}
async function verAdjunto(path, nombre) {
  const { data, error } = await sb.storage.from(ADJUNTOS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) { toast('No se pudo abrir el archivo.', 'error'); return; }
  const ext = (path.split('.').pop() || '').toLowerCase();
  const esImagen = ['jpg','jpeg','png'].includes(ext);
  const body = document.getElementById('adjuntoPreviewBody');
  body.innerHTML = esImagen
    ? `<div style="display:flex;align-items:center;justify-content:center;min-height:100%;padding:20px;"><img src="${data.signedUrl}" style="max-width:100%;max-height:70vh;box-shadow:0 4px 20px rgba(0,0,0,.15);border-radius:6px;"></div>`
    : `<iframe src="${data.signedUrl}" style="width:100%;height:100%;border:none;min-height:70vh;"></iframe>`;
  document.getElementById('adjuntoPreviewNombre').textContent = nombre || 'Adjunto';
  document.getElementById('adjuntoPreviewDescargar').href = data.signedUrl;
  document.getElementById('adjuntoPreviewOverlay').style.display = 'block';
  document.getElementById('adjuntoPreviewDrawer').style.display = 'flex';
}
function cerrarPreviewAdjunto() {
  document.getElementById('adjuntoPreviewOverlay').style.display = 'none';
  document.getElementById('adjuntoPreviewDrawer').style.display = 'none';
  document.getElementById('adjuntoPreviewBody').innerHTML = '';
  if (STATE_adjuntosModalCtx) document.getElementById('modalAdjuntos').classList.add('show');
}
document.getElementById('adjuntoPreviewCerrar').addEventListener('click', cerrarPreviewAdjunto);
document.getElementById('adjuntoPreviewOverlay').addEventListener('click', cerrarPreviewAdjunto);
async function cargarAdjuntos(tabla, registroId) {
  const { data } = await sb.from('fz_adjuntos').select('*').eq('tabla', tabla).eq('registro_id', registroId).order('created_at');
  return data || [];
}
async function contarAdjuntosPorRegistro(tabla, registroIds) {
  if (!registroIds.length) return {};
  const { data } = await sb.from('fz_adjuntos').select('registro_id').eq('tabla', tabla).in('registro_id', registroIds);
  const conteo = {};
  (data || []).forEach(r => { conteo[r.registro_id] = (conteo[r.registro_id] || 0) + 1; });
  return conteo;
}
function adjuntosCellHtml(conteo, registroId) {
  const n = conteo || 0;
  return `<button class="btn btn-ghost btn-sm adjuntos-abrir-btn" data-id="${registroId}" style="font-size:11.5px;padding:3px 9px;white-space:nowrap;">${n ? n + (n===1?' archivo':' archivos') : 'Adjuntar'}</button>`;
}
function wireAdjuntosHandlers(container, tabla, businessId, onDone) {
  container.querySelectorAll('.adjuntos-abrir-btn').forEach(btn => {
    btn.addEventListener('click', () => abrirModalAdjuntos(tabla, btn.dataset.id, businessId, onDone));
  });
}
let STATE_adjuntosModalCtx = null;
async function abrirModalAdjuntos(tabla, registroId, businessId, onDone) {
  STATE_adjuntosModalCtx = { tabla, registroId, businessId, onDone };
  document.getElementById('modalAdjuntos').classList.add('show');
  await renderModalAdjuntosList();
}
async function renderModalAdjuntosList() {
  const { tabla, registroId } = STATE_adjuntosModalCtx;
  const box = document.getElementById('adjuntosModalList');
  box.innerHTML = `<p class="empty">Cargando…</p>`;
  const adjuntos = await cargarAdjuntos(tabla, registroId);
  box.innerHTML = adjuntos.length ? adjuntos.map(a => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:1px solid var(--line);font-size:13px;">
      <a href="#" class="adjuntos-ver-item" data-path="${a.archivo_path}" title="${a.archivo_nombre}" style="color:var(--navy-1);text-decoration:underline;max-width:270px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.archivo_nombre}</a>
      <button class="row-del adjuntos-del-item" data-id="${a.id}" data-path="${a.archivo_path}" style="font-size:14px;flex-shrink:0;">✕</button>
    </div>`).join('') : `<p class="empty" style="padding:6px 0 14px;">Aún no hay archivos adjuntos.</p>`;
  box.querySelectorAll('.adjuntos-ver-item').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('modalAdjuntos').classList.remove('show');
    verAdjunto(a.dataset.path, a.title);
  }));
  box.querySelectorAll('.adjuntos-del-item').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Quitar este archivo adjunto?')) return;
    await sb.storage.from(ADJUNTOS_BUCKET).remove([btn.dataset.path]);
    await sb.from('fz_adjuntos').delete().eq('id', btn.dataset.id);
    registrarAuditoria(STATE_adjuntosModalCtx.businessId, 'editar', TABLA_MODULO_LABEL[tabla] || tabla, 'Quitó archivo adjunto');
    await renderModalAdjuntosList();
    if (STATE_adjuntosModalCtx.onDone) STATE_adjuntosModalCtx.onDone();
  }));
}
document.getElementById('adjuntosModalInput').addEventListener('change', async () => {
  const { tabla, registroId, businessId } = STATE_adjuntosModalCtx;
  const input = document.getElementById('adjuntosModalInput');
  const files = Array.from(input.files);
  for (const file of files) {
    const subido = await subirAdjunto(tabla, registroId, businessId, file);
    if (subido) {
      const { error } = await sb.from('fz_adjuntos').insert({ business_id: businessId, tabla, registro_id: registroId, archivo_path: subido.path, archivo_nombre: subido.nombre });
      if (!error) registrarAuditoria(businessId, 'editar', TABLA_MODULO_LABEL[tabla] || tabla, `Adjuntó archivo "${subido.nombre}"`);
    }
  }
  input.value = '';
  await renderModalAdjuntosList();
  if (STATE_adjuntosModalCtx.onDone) STATE_adjuntosModalCtx.onDone();
});
document.getElementById('cerrarModalAdjuntos').addEventListener('click', () => {
  document.getElementById('modalAdjuntos').classList.remove('show');
  STATE_adjuntosModalCtx = null;
});

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
async function requiereCodigoMFA() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}
function mostrarPasoMFA() {
  document.getElementById('loginStep1').style.display = 'none';
  document.getElementById('loginStep2').style.display = 'block';
  document.getElementById('mfaCodeInput').value = '';
  document.getElementById('mfaCodeError').textContent = '';
  document.getElementById('mfaCodeInput').focus();
}
async function checkSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    STATE.user = data.session.user;
    if (await requiereCodigoMFA()) { mostrarPasoMFA(); return; }
    await boot();
  }
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('togglePassBtn').addEventListener('click', () => {
  const inp = document.getElementById('loginPass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});
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
  if (await requiereCodigoMFA()) { mostrarPasoMFA(); return; }
  await boot();
}

async function verificarCodigoMFA() {
  const code = document.getElementById('mfaCodeInput').value.trim();
  const errEl = document.getElementById('mfaCodeError');
  errEl.textContent = '';
  if (!code || code.length < 6) { errEl.textContent = 'Ingresa el código de 6 dígitos.'; return; }
  const { data: factors } = await sb.auth.mfa.listFactors();
  const factor = (factors?.totp || []).find(f => f.status === 'verified');
  if (!factor) { errEl.textContent = 'No se encontró tu método de verificación.'; return; }
  const btn = document.getElementById('mfaVerifyBtn');
  btn.textContent = 'Verificando...'; btn.disabled = true;
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  btn.textContent = 'Verificar'; btn.disabled = false;
  if (error) { errEl.textContent = 'Código incorrecto. Intenta de nuevo.'; return; }
  await boot();
}
document.getElementById('mfaVerifyBtn').addEventListener('click', verificarCodigoMFA);
document.getElementById('mfaCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') verificarCodigoMFA(); });
document.getElementById('mfaCancelBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  document.getElementById('loginStep2').style.display = 'none';
  document.getElementById('loginStep1').style.display = 'block';
});

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
  STATE.esAdministrador = !!row.es_administrador;
  STATE.nombreUsuario = row.nombre || null;
  STATE.rolUsuario = row.rol || null;
  if (!STATE.esAdministrador) {
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
  document.getElementById('sidebarUserName').textContent = STATE.nombreUsuario || STATE.user.email.split('@')[0];
  const rolEl = document.getElementById('sidebarUserRole');
  rolEl.textContent = STATE.esAdministrador ? 'Administrador' : '';
  rolEl.style.display = STATE.esAdministrador ? '' : 'none';
  document.getElementById('monthPicker').value = STATE.currentMonth;

  await loadBusinesses();
  setupNav();
  setupBizControls();
  setupUsuariosControls();
  setupMfaControls();

  document.getElementById('monthPicker').addEventListener('change', (e) => {
    STATE.currentMonth = e.target.value;
    STATE_plRangoDesde = ''; STATE_plRangoHasta = '';
    renderCurrentSection();
  });

  renderCurrentSection();
}

/* ---------- USUARIOS AUTORIZADOS ---------- */
function setupUsuariosControls() {
  // El botón de abrir este modal ahora vive en Configuración (ver renderConfiguracion),
  // que llama a openUsuariosModal() directamente.
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
    const esAdministrador = document.getElementById('newUsuarioPropietario').checked;
    if (!email) { toast('Escribe un correo.', 'error'); return; }
    const { error } = await sb.from('fz_usuarios_autorizados').insert({ email, nombre: nombre || null, es_administrador: esAdministrador });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newUsuarioEmail').value = '';
    document.getElementById('newUsuarioNombre').value = '';
    document.getElementById('newUsuarioPropietario').checked = false;
    renderUsuariosList();
  };
}
let STATE_usuarioEditando = new Set();
async function renderUsuariosList() {
  const [usuarios, todosNegocios] = await Promise.all([loadUsuariosAutorizados(), loadTodosNegociosSinFiltro()]);
  const box = document.getElementById('usuariosList');
  if (!usuarios.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Sin usuarios autorizados todavía.</div>`; return; }

  const bloques = await Promise.all(usuarios.map(async u => {
    const negociosDe = u.es_administrador ? [] : await loadUsuarioNegocios(u.email);
    const editando = STATE_usuarioEditando.has(u.id);
    return `
    <div style="padding:14px 6px;border-bottom:1px solid var(--line);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="min-width:0;">
          <strong style="font-size:14.5px;">${u.nombre || u.email}</strong>${u.email.toLowerCase()===STATE.user.email.toLowerCase()?' <span style="color:var(--muted);font-size:11px;">(tú)</span>':''}
          ${u.nombre ? `<div style="color:var(--muted);font-size:12px;margin-top:2px;">${u.email}</div>` : ''}
          <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">
            <span class="badge ${u.es_administrador?'pag':''}" ${!u.es_administrador?'style="background:#eef1f6;color:var(--muted);"':''}>${etiquetaRol(u.es_administrador, u.rol)}</span>
            <span class="badge ${u.activo!==false?'pag':'pend'}">${u.activo!==false?'Activo':'Inactivo'}</span>
          </div>
        </div>
        <div style="flex-shrink:0;">
          <button class="btn btn-ghost btn-sm usuario-editar-btn" data-id="${u.id}">${editando?'Listo':'Editar'}</button>
        </div>
      </div>
      ${editando ? `
        <div style="margin-top:10px;padding:12px 14px;background:#fff8ec;border:1px solid #f0e0bd;border-radius:8px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">⚠ Estos cambios afectan qué puede ver y hacer esta persona en el sistema.</div>
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:${u.es_administrador?'0':'12px'};">
            <label style="display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;">
              <input type="checkbox" class="usuario-propietario" data-id="${u.id}" ${u.es_administrador?'checked':''}> Es administrador (ve todos los negocios)
            </label>
            <label style="display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;">
              <input type="checkbox" class="usuario-activo" data-id="${u.id}" ${u.activo!==false?'checked':''}> Activo (puede entrar)
            </label>
          </div>
          ${!u.es_administrador ? `
            <div style="margin-bottom:12px;">
              <label style="font-size:11.5px;color:var(--muted);display:block;margin-bottom:5px;">Rol (solo para identificarlo, no cambia lo que puede ver o hacer):</label>
              <select class="cell usuario-rol" data-id="${u.id}" style="max-width:200px;">
                <option value="propietario" ${u.rol==='propietario'?'selected':''}>Propietario</option>
                <option value="socio" ${u.rol==='socio'?'selected':''}>Socio</option>
                <option value="gerencia" ${(!u.rol||u.rol==='gerencia')?'selected':''}>Gerencia</option>
              </select>
            </div>
            <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">Negocios que puede ver:</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px 16px;margin-bottom:12px;">
              ${todosNegocios.map(n => `
                <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;">
                  <input type="checkbox" class="usuario-negocio" data-email="${u.email}" data-negocio="${n.id}" ${negociosDe.includes(n.id)?'checked':''}> ${n.name}
                </label>`).join('') || '<span style="font-size:12px;color:var(--muted);">Aún no hay negocios creados.</span>'}
            </div>` : ''}
          <button class="btn btn-ghost btn-sm usuario-del" data-id="${u.id}" style="color:var(--red);">Quitar acceso a este usuario</button>
        </div>` : ''}
    </div>`;
  }));
  box.innerHTML = bloques.join('');

  box.querySelectorAll('.usuario-editar-btn').forEach(btn => btn.addEventListener('click', () => {
    if (STATE_usuarioEditando.has(btn.dataset.id)) STATE_usuarioEditando.delete(btn.dataset.id);
    else STATE_usuarioEditando.add(btn.dataset.id);
    renderUsuariosList();
  }));
  box.querySelectorAll('.usuario-rol').forEach(sel => sel.addEventListener('change', async () => {
    await sb.from('fz_usuarios_autorizados').update({ rol: sel.value }).eq('id', sel.dataset.id);
    renderUsuariosList();
  }));
  box.querySelectorAll('.usuario-propietario').forEach(chk => chk.addEventListener('change', async () => {
    if (!confirm(chk.checked ? '¿Convertir a esta persona en administrador? Podrá ver TODOS los negocios y el dashboard consolidado.' : '¿Quitarle el rol de administrador a esta persona?')) { chk.checked = !chk.checked; return; }
    await sb.from('fz_usuarios_autorizados').update({ es_administrador: chk.checked }).eq('id', chk.dataset.id);
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
    if (!confirm('¿Seguro que quieres quitarle el acceso a este usuario? Ya no podrá entrar a Finanzas.')) return;
    await sb.from('fz_usuarios_autorizados').delete().eq('id', btn.dataset.id);
    STATE_usuarioEditando.delete(btn.dataset.id);
    renderUsuariosList();
  }));
}

/* ---------- NEGOCIOS ---------- */
async function loadBusinesses() {
  const { data, error } = await sb.from('businesses').select('*').order('name');
  if (error) { toast('Error cargando negocios: ' + error.message, 'error'); return; }
  let todos = data || [];
  if (!STATE.esAdministrador && Array.isArray(STATE.negociosPermitidos)) {
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
    if (STATE.currentSection === 'negocios') renderNegocios();
  });
  document.getElementById('cancelEditBiz').addEventListener('click', () => {
    document.getElementById('modalEditBiz').classList.remove('show');
  });
  document.getElementById('saveEditBiz').addEventListener('click', async () => {
    const bizId = document.getElementById('modalEditBiz').dataset.bizId;
    const name = document.getElementById('editBizName').value.trim();
    const razon_social = document.getElementById('editBizRazonSocial').value.trim() || null;
    if (!name) { toast('Escribe el nombre comercial.', 'error'); return; }
    const { error } = await sb.from('businesses').update({ name, razon_social }).eq('id', bizId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('modalEditBiz').classList.remove('show');
    await loadBusinesses();
    renderBizSelect();
    if (STATE.currentBusinessId === bizId) document.getElementById('bizSelect').value = bizId;
    updateTopbar();
    toast('Perfil del negocio actualizado.');
    if (STATE.currentSection === 'negocios') renderNegocios();
  });
}
function abrirEditarNegocio(negocio) {
  document.getElementById('editBizName').value = negocio.name || '';
  document.getElementById('editBizRazonSocial').value = negocio.razon_social || '';
  document.getElementById('modalEditBiz').dataset.bizId = negocio.id;
  document.getElementById('modalEditBiz').classList.add('show');
}

/* ---------- Autenticación de dos pasos (2FA / MFA) ---------- */
function setupMfaControls() {
  document.getElementById('cancelMfaModal').addEventListener('click', () => {
    document.getElementById('modalMfa').classList.remove('show');
  });
}

async function renderModalMfa() {
  const body = document.getElementById('mfaModalBody');
  body.innerHTML = `<p class="empty">Cargando…</p>`;
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) { body.innerHTML = `<p style="color:var(--red);">Error: ${error.message}</p>`; return; }

  const verificado = (data.totp || []).find(f => f.status === 'verified');
  if (verificado) {
    body.innerHTML = `
      <p style="font-size:13.5px;color:var(--muted);margin-bottom:16px;">La autenticación de dos pasos ya está <strong style="color:var(--green);">activada</strong> en tu cuenta. Cada vez que inicies sesión, se te pedirá también el código de tu app de autenticación.</p>
      <button class="btn btn-ghost" id="mfaDesactivarBtn" style="color:var(--red);width:100%;">Desactivar autenticación de dos pasos</button>
    `;
    document.getElementById('mfaDesactivarBtn').addEventListener('click', async () => {
      if (!confirm('¿Seguro que deseas desactivar la autenticación de dos pasos? Tu cuenta quedará protegida solo con tu contraseña.')) return;
      const { error } = await sb.auth.mfa.unenroll({ factorId: verificado.id });
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      toast('Autenticación de dos pasos desactivada.');
      renderModalMfa();
    });
    return;
  }

  // limpiar factores a medio configurar (de intentos anteriores sin terminar)
  const sinVerificar = (data.totp || []).filter(f => f.status !== 'verified');
  for (const f of sinVerificar) { await sb.auth.mfa.unenroll({ factorId: f.id }); }

  const { data: enrollData, error: enrollError } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Finanzas CYA Roma ' + Date.now() });
  if (enrollError) { body.innerHTML = `<p style="color:var(--red);">Error: ${enrollError.message}</p>`; return; }
  const qr = enrollData.totp.qr_code;
  const qrHtml = qr.startsWith('data:') ? `<img src="${qr}" style="width:180px;height:180px;">`
    : qr.trim().startsWith('<svg') ? qr
    : `<img src="data:image/svg+xml;utf8,${encodeURIComponent(qr)}" style="width:180px;height:180px;">`;

  body.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">1. Escanea este código con tu app de autenticación (Google Authenticator, Authy, etc.)</p>
    <div style="text-align:center;margin-bottom:14px;">${qrHtml}</div>
    <p style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:16px;word-break:break-all;">O ingresa este código manualmente:<br><strong>${enrollData.totp.secret}</strong></p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:8px;">2. Ingresa el código de 6 dígitos que te muestre la app:</p>
    <div class="field">
      <input type="text" id="mfaEnrollCode" placeholder="000000" inputmode="numeric" maxlength="6" style="text-align:center;letter-spacing:6px;font-size:18px;">
    </div>
    <div class="login-error" id="mfaEnrollError"></div>
    <button class="btn btn-gold" id="mfaEnrollVerifyBtn" style="width:100%;">Activar</button>
  `;
  document.getElementById('mfaEnrollVerifyBtn').addEventListener('click', async () => {
    const code = document.getElementById('mfaEnrollCode').value.trim();
    const errEl = document.getElementById('mfaEnrollError');
    if (!code || code.length < 6) { errEl.textContent = 'Ingresa el código de 6 dígitos.'; return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code });
    if (error) { errEl.textContent = 'Código incorrecto. Intenta de nuevo.'; return; }
    toast('¡Autenticación de dos pasos activada!');
    renderModalMfa();
  });
}

/* ---------- NAVEGACIÓN ---------- */
const SECTION_META = {
  dashboard: { title: 'Dashboard', sub: 'Vista consolidada de todos los negocios', showMonth: true, needsBiz: false },
  ventas: { title: 'Ventas', sub: '', showMonth: true, needsBiz: true },
  efectivo: { title: 'Efectivo & Divisas', sub: '', showMonth: true, needsBiz: true },
  bancos: { title: 'Bancos', sub: '', showMonth: true, needsBiz: true },
  proveedores: { title: 'Proveedores', sub: '', showMonth: false, needsBiz: true },
  clientes: { title: 'Clientes', sub: '', showMonth: false, needsBiz: true },
  pl: { title: 'Estado de Resultados', sub: '', showMonth: true, needsBiz: true },
  flujo: { title: 'Flujo de Efectivo', sub: '', showMonth: false, needsBiz: true },
  polizas: { title: 'Pólizas de Diario', sub: '', showMonth: false, needsBiz: true },
  balance: { title: 'Balance General', sub: 'Al día de hoy', showMonth: false, needsBiz: true },
  catalogo: { title: 'Catálogo de Cuentas', sub: 'Estructura contable: cuenta mayor › subcuenta › sub-subcuenta', showMonth: false, needsBiz: true },
  auditoria: { title: 'Auditoría', sub: 'Quién creó, editó o eliminó cada registro', showMonth: false, needsBiz: true },
  negocios: { title: 'Negocios', sub: 'Alta y perfil de cada negocio del grupo', showMonth: false, needsBiz: false },
  configuracion: { title: 'Configuración', sub: '', showMonth: false, needsBiz: false },
};
// Estas viven "dentro" de Configuración: ya no tienen su propio ítem en el menú principal,
// pero conservan su sección y su función de render tal cual, solo cambia cómo se llega ahí.
const SECCIONES_EN_CONFIGURACION = ['catalogo', 'auditoria', 'negocios'];
function marcarNavActivo(seccion) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const seccionNav = SECCIONES_EN_CONFIGURACION.includes(seccion) ? 'configuracion' : seccion;
  const item = document.querySelector(`.nav-item[data-section="${seccionNav}"]`);
  if (item) item.classList.add('active');
}

function cerrarMenuMovil() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      STATE.currentSection = item.dataset.section;
      localStorage.setItem('finanzas_ultima_seccion', item.dataset.section);
      marcarNavActivo(item.dataset.section);
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('sec-' + STATE.currentSection).classList.add('active');
      updateTopbar();
      renderCurrentSection();
      cerrarMenuMovil();
    });
  });
  // Al entrar no cargamos el Dashboard consolidado automáticamente (es lo más lento,
  // calcula todos los negocios) — abrimos la última sección que usaste, o Ventas por default.
  const guardada = localStorage.getItem('finanzas_ultima_seccion');
  const seccionInicial = (guardada && SECTION_META[guardada]) ? guardada : 'ventas';
  STATE.currentSection = seccionInicial;
  marcarNavActivo(seccionInicial);
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + seccionInicial).classList.add('active');

  document.getElementById('menuToggleBtn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', cerrarMenuMovil);
}

const SECCIONES_IMPRIMIBLES = ['efectivo', 'bancos', 'pl', 'flujo', 'balance', 'proveedores'];

function updateTopbar() {
  const meta = SECTION_META[STATE.currentSection];
  const b = biz();
  const titulo = meta.title + (meta.needsBiz && b ? ' — ' + b.name : '');
  document.getElementById('pageTitle').textContent = titulo;
  document.getElementById('pageSub').textContent = STATE.currentSection === 'dashboard'
    ? (STATE.esAdministrador ? 'Vista consolidada de todos los negocios' : (STATE.businesses.length > 1 ? 'Vista consolidada de tus negocios' : 'Tu negocio'))
    : meta.sub;
  document.getElementById('monthPicker').style.display = meta.showMonth ? 'block' : 'none';

  const printBtn = document.getElementById('printBtn');
  const printOrientacion = document.getElementById('printOrientacion');
  if (SECCIONES_IMPRIMIBLES.includes(STATE.currentSection)) {
    printBtn.style.display = 'inline-flex';
    printOrientacion.style.display = 'inline-flex';
    if (STATE.currentSection === 'pl') {
      printOrientacion.value = (STATE_plVista === 'anual') ? 'landscape' : 'portrait';
    }
    printBtn.onclick = () => {
      document.body.dataset.printSection = STATE.currentSection;
      let tituloImpresion = titulo;
      if (STATE.currentSection === 'pl') {
        tituloImpresion = 'Estado de Resultados' + (b ? ' — ' + b.name : '');
      } else if (STATE.currentSection === 'proveedores') {
        if (STATE_provVista === 'directorio') tituloImpresion = 'Directorio de Proveedores — Saldos Pendientes' + (b ? ' · ' + b.name : '');
        else if (STATE_provVista === 'detalle') tituloImpresion = `Estado de Cuenta — ${STATE_provDetalleNombre}` + (b ? ' · ' + b.name : '');
        else tituloImpresion = 'Cuentas por Pagar — Facturas' + (b ? ' · ' + b.name : '');
      }
      const mesLegible = MESES_LARGO[Number(STATE.currentMonth.slice(5,7)) - 1] + ' ' + STATE.currentMonth.slice(0,4);
      document.getElementById('printTitle').textContent = tituloImpresion;
      document.getElementById('printSub').textContent = `${STATE.nombreUsuario ? STATE.nombreUsuario + ' · ' : ''}${meta.showMonth ? mesLegible + ' · ' : ''}Impreso el ${new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' })}`;
      document.getElementById('printOrientationStyle').textContent = `@media print { @page { size: ${printOrientacion.value}; margin: 12mm 12mm 20mm 12mm; @bottom-center { content: "Página " counter(page) " de " counter(pages); font-size: 9px; color: #999; } } }`;
      window.print();
    };
  } else {
    printBtn.style.display = 'none';
    printOrientacion.style.display = 'none';
  }
}

async function renderCurrentSection() {
  updateTopbar();
  const s = STATE.currentSection;
  if (s === 'dashboard') return renderDashboard();
  if (s === 'ventas') return renderVentas();
  if (s === 'efectivo') return renderEfectivo();
  if (s === 'bancos') return renderBancos();
  if (s === 'proveedores') return renderProveedores();
  if (s === 'clientes') return renderClientes();
  if (s === 'pl') return renderPL();
  if (s === 'flujo') return renderFlujo();
  if (s === 'polizas') return renderPolizas();
  if (s === 'balance') return renderBalanceGeneral();
  if (s === 'catalogo') return renderCatalogoCuentas();
  if (s === 'auditoria') return renderAuditoria();
  if (s === 'negocios') return renderNegocios();
  if (s === 'configuracion') return renderConfiguracion();
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

async function computeMonedaSaldo(businessId, moneda, conceptosEfectivo, hastaFecha) {
  const concepts = conceptosParaMoneda(moneda, conceptosEfectivo);
  const [ventasQ, movsQ, polizaLineas] = await Promise.all([
    concepts.length ? sb.from('fz_ventas').select('recon_data,fecha').eq('business_id', businessId) : Promise.resolve({ data: [] }),
    sb.from('fz_efectivo_mov').select('depositos,cargos,fecha').eq('moneda_id', moneda.id),
    getPolizaLineasParaCuenta(businessId, 'efectivo', moneda.id, hastaFecha),
  ]);
  let autoDepositos = 0;
  (ventasQ.data || []).filter(v => !hastaFecha || v.fecha <= hastaFecha).forEach(v => {
    concepts.forEach(concepto => {
      const entry = (v.recon_data || {})[concepto.id];
      if (entry) autoDepositos += Number(entry.monto) || 0; // valor en la moneda tal cual, sin convertir
    });
  });
  const manualNet = (movsQ.data || []).filter(m => !hastaFecha || m.fecha <= hastaFecha).reduce((s, m) => s + (Number(m.depositos) || 0) - (Number(m.cargos) || 0), 0);
  const polizaNet = polizaLineas.reduce((s, l) => s + (Number(l.cargo) || 0) - (Number(l.abono) || 0), 0);
  return (Number(moneda.saldo_inicial) || 0) + autoDepositos + manualNet + polizaNet;
}

/* ---------- Vinculación Tarjetas (Ventas) → Cuenta bancaria ---------- */
function conceptosParaBanco(cuenta, conceptosTarjetas) {
  return conceptosTarjetas.filter(c => c.banco_cuenta_id === cuenta.id);
}
async function computeBancoSaldo(businessId, cuenta, conceptosTarjetas, hastaFecha) {
  const concepts = conceptosParaBanco(cuenta, conceptosTarjetas);
  const [ventasQ, movsQ, polizaLineas] = await Promise.all([
    concepts.length ? sb.from('fz_ventas').select('recon_data,fecha').eq('business_id', businessId) : Promise.resolve({ data: [] }),
    sb.from('fz_bancos_mov').select('depositos,cargos,fecha').eq('cuenta_id', cuenta.id),
    getPolizaLineasParaCuenta(businessId, 'banco', cuenta.id, hastaFecha),
  ]);
  let autoDepositos = 0;
  (ventasQ.data || []).filter(v => !hastaFecha || v.fecha <= hastaFecha).forEach(v => {
    concepts.forEach(concepto => {
      const entry = (v.recon_data || {})[concepto.id];
      if (entry) autoDepositos += Number(entry.monto) || 0;
    });
  });
  const manualNet = (movsQ.data || []).filter(m => !hastaFecha || m.fecha <= hastaFecha).reduce((s, m) => s + (Number(m.depositos) || 0) - (Number(m.cargos) || 0), 0);
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
  const { data: movs } = await sb.from('fz_bancos_mov').select('*').eq('cuenta_id', cuenta.id).order('fecha').order('created_at');
  const manualRows = (movs || []).map(m => ({ ...m, auto: false }));
  const todas = [...autoRows, ...manualRows].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.created_at||'').localeCompare(b.created_at||''));
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
  const efectivoDetalle = await Promise.all(monedas.map(async m => {
    const saldo = await computeMonedaSaldo(businessId, m, conceptosEfectivo);
    return { id: m.id, nombre: m.nombre, saldo, tc: m.tc_reporte, pesoEquiv: saldo * (Number(m.tc_reporte) || 1) };
  }));
  const efectivoTotal = efectivoDetalle.reduce((s,d)=>s+d.pesoEquiv,0);

  const cuentas = cuentasQ.data || [];
  const bancosDetalle = await Promise.all(cuentas.map(async c => {
    const saldo = await computeBancoSaldo(businessId, c, conceptosTarjetas);
    return { id: c.id, nombre: c.nombre, saldo, activo: c.activo !== false };
  }));
  const bancosTotal = bancosDetalle.filter(d=>d.activo).reduce((s,d)=>s+d.saldo,0);

  const prov = provQ.data || [];
  const proveedoresPendientes = prov.filter(p => p.estatus === 'Pendiente' || p.estatus === 'Parcial').reduce((s, p) => s + (Number(p.importe) - Number(p.importe_pagado || 0)), 0);

  const [subcuentas, mayores] = await Promise.all([loadSubcuentas(businessId), loadCuentasMayor(businessId)]);
  const otrosPasivosCalc = await Promise.all(mayores.filter(m => m.tipo === 'pasivo').map(async m => {
    const r = await computeSaldoCuentaMayorPolizas(businessId, m.id, subcuentas, 'haber');
    return { nombre: m.nombre, monto: r.total };
  }));
  const otrosPasivosDetalle = otrosPasivosCalc.filter(d => Math.abs(d.monto) > 0.004);
  const otrosPasivosTotal = otrosPasivosDetalle.reduce((s,x)=>s+x.monto,0);

  const posicionNeta = efectivoTotal + bancosTotal - proveedoresPendientes - otrosPasivosTotal;

  const periodoMes = { start, end, mesStart: ym, mesEnd: ym };
  const [gClasMes, gCostosMes] = await Promise.all([
    computeGastosClasificados(businessId, periodoMes, subcuentas, mayores),
    computeGastosClasificados(businessId, periodoMes, subcuentas, mayores, 'costo'),
  ]);
  const gastosTotalMes = gastosOperativosMes + gClasMes.totalClasificado + gClasMes.sinClasificar + gCostosMes.totalClasificado;

  return { ventasMes, gastosOperativosMes, gastosTotalMes, efectivoTotal, efectivoDetalle, bancosTotal, bancosDetalle, proveedoresPendientes, otrosPasivosDetalle, otrosPasivosTotal, posicionNeta };
}

/* ============================================================
   DASHBOARD CONSOLIDADO
   ============================================================ */
let dashChart1 = null, dashChart2 = null;

async function renderDashboard() {
  const el = document.getElementById('sec-dashboard');
  el.innerHTML = `<div class="empty">Calculando resumen de todos los negocios…</div>`;

  const activos = STATE.businesses.filter(b => b.active !== false);
  const rows = await Promise.all(activos.map(async b => {
    const s = await computeBusinessSummary(b.id, STATE.currentMonth);
    return { biz: b, ...s };
  }));

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

    <div class="grid-2" style="align-items:stretch;">
      <div class="card">
        <div class="card-head">
          <h3>Ventas del mes por negocio</h3>
          <span class="hint">${STATE.currentMonth}</span>
        </div>
        <div style="height:240px;"><canvas id="chartVentasNegocio"></canvas></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Composición de liquidez</h3>
          <span class="hint">Efvo. vs. Bancos vs. Prov.</span>
        </div>
        <div style="max-width:220px;height:200px;margin:0 auto;"><canvas id="chartComposicion"></canvas></div>
      </div>
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
      <div class="kpi"><div class="label">Gastos capturados en Ventas</div><div class="value num red">${fmt(gastosMes)}</div></div>
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
          <button class="btn btn-ghost btn-sm" id="descargarPlantillaBtn">Descargar plantilla</button>
          <button class="btn btn-ghost btn-sm" id="importVentasBtn">Importar ventas (Excel)</button>
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
      const val = field === 'fecha' ? inp.value : leerMonto(inp.value);
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
      vd[conceptoId] = leerMonto(inp.value);
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
      sd[conceptoId] = leerMonto(inp.value);
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
      const montoVal = leerMonto(inp.value);
      rd[conceptoId] = { ...(rd[conceptoId] || {}), [field]: montoVal };
      const { error: e4 } = await sb.from('fz_ventas').update({ recon_data: rd }).eq('id', ventaId);
      if (e4) { toast('Error guardando: ' + e4.message, 'error'); return; }
      if (field === 'monto') {
        const concepto = conceptos.find(c => c.id === conceptoId);
        if (concepto && concepto.categoria === 'propinas') {
          await provisionarPropina(b.id, ventaId, concepto, montoVal, row.fecha);
        }
      }
      renderVentas();
    });
  });
  wireInputsMoneda(el);
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
  const cellForVenta = (c) => `<td><input class="cell vd-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(vd[c.id])}" data-venta-id="${r.id}" data-concepto="${c.id}"></td>`;
  const cellForSistema = (c) => `<td><input class="cell sistema-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(sd[c.id])}" data-venta-id="${r.id}" data-concepto="${c.id}"></td>`;
  const cellForRecon = (c) => {
    const entry = rd[c.id] || {};
    if (c.es_moneda) {
      return `<td><div style="display:flex;flex-direction:column;gap:2px;">
        <input class="cell recon-cell num num-fmt" type="text" inputmode="decimal" placeholder="monto" value="${entry.monto != null ? fmtInputVal(entry.monto) : ''}" data-venta-id="${r.id}" data-concepto="${c.id}" data-field="monto" style="width:70px;">
        <input class="cell recon-cell num num-fmt" type="text" inputmode="decimal" placeholder="TC" value="${entry.tc != null ? fmtInputVal(entry.tc) : ''}" data-venta-id="${r.id}" data-concepto="${c.id}" data-field="tc" style="width:70px;color:var(--muted);font-size:11.5px;">
      </div></td>`;
    }
    return `<td><input class="cell recon-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(entry.monto)}" data-venta-id="${r.id}" data-concepto="${c.id}" data-field="monto"></td>`;
  };
  const { totalEfvo, totalTarj, totalBancos, totalCxc, totalProp, difEfvo, difTarj, difTotal } = computeRowDiffs(r, conceptosVenta, porCat, conceptosSistema);
  const colorDif = (v) => Math.abs(v) < 1 ? 'inherit' : 'var(--red)';
  return `<tr>
    <td><input class="cell ventas-cell" type="date" value="${r.fecha}" data-id="${r.id}" data-field="fecha"></td>
    ${conceptosVenta.map(cellForVenta).join('')}
    <td class="num" style="font-weight:700;">${fmt(total)}</td>
    ${conceptosSistema.length ? conceptosSistema.map(cellForSistema).join('') : SISTEMA_COLS.map(([k]) => `<td><input class="cell ventas-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(r[k])}" data-id="${r.id}" data-field="${k}"></td>`).join('')}
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
async function moverOrdenLista(tabla, items, idx, direccion, onDone) {
  const otroIdx = idx + direccion;
  if (otroIdx < 0 || otroIdx >= items.length) return;
  const nuevos = [...items];
  [nuevos[idx], nuevos[otroIdx]] = [nuevos[otroIdx], nuevos[idx]];
  await Promise.all(nuevos.map((item, i) => sb.from(tabla).update({ orden: i }).eq('id', item.id)));
  onDone();
}
function botonesOrdenHtml(idx, total, claseBase) {
  return `<span style="display:inline-flex;flex-direction:column;margin-right:6px;">
    <button class="${claseBase}-subir" data-idx="${idx}" title="Subir" style="border:none;background:none;color:${idx===0?'#ccc':'var(--muted)'};cursor:${idx===0?'default':'pointer'};font-size:11px;line-height:1;padding:0;" ${idx===0?'disabled':''}>▲</button>
    <button class="${claseBase}-bajar" data-idx="${idx}" title="Bajar" style="border:none;background:none;color:${idx===total-1?'#ccc':'var(--muted)'};cursor:${idx===total-1?'default':'pointer'};font-size:11px;line-height:1;padding:0;" ${idx===total-1?'disabled':''}>▼</button>
  </span>`;
}

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
    const existentes = await loadConceptosVenta(businessId);
    const { error } = await sb.from('fz_conceptos_venta').insert({ business_id: businessId, nombre, tipo, orden: existentes.length });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newConceptoVentaNombre').value = '';
    renderVentaConceptosList(businessId);
  };
}
function opcionesSubcuentasIngreso(subcuentas, mayores, selectedId) {
  const mayoresIngreso = mayores.filter(m => m.tipo === 'ingreso');
  const partes = mayoresIngreso.map(m => {
    const construirNivel = (padreId, nivel) => subcuentas.filter(s => s.cuenta_mayor_id === m.id && (s.subcuenta_padre_id || null) === padreId)
      .flatMap(s => [
        `<option value="${s.id}" ${selectedId===s.id?'selected':''}>${'—'.repeat(nivel)} ${s.nombre}</option>`,
        ...construirNivel(s.id, nivel + 1),
      ]);
    const opts = construirNivel(null, 0);
    return opts.length ? `<optgroup label="${m.nombre}">${opts.join('')}</optgroup>` : '';
  }).join('');
  return partes;
}
async function renderVentaConceptosList(businessId) {
  const [conceptos, subcuentas, mayores] = await Promise.all([loadConceptosVenta(businessId), loadSubcuentas(businessId), loadCuentasMayor(businessId)]);
  const box = document.getElementById('conceptosVentaList');
  if (!conceptos.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Aún no hay categorías. Agrega la primera abajo (ej. Alimentos, Bebidas, Daypass...).</div>`; return; }
  const hayCatalogoIngreso = mayores.some(m => m.tipo === 'ingreso');
  box.innerHTML = conceptos.map((c, idx) => `
    <div style="padding:8px 4px;border-bottom:1px solid var(--line);">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;">${botonesOrdenHtml(idx, conceptos.length, 'cv-orden')}<div><strong>${c.nombre}</strong> <span style="color:var(--muted);font-size:12px;">— ${c.tipo === 'resta' ? 'Resta (ej. descuentos)' : 'Suma'}</span></div></div>
        <button class="row-del conceptoventa-del" data-id="${c.id}" style="font-size:16px;">✕</button>
      </div>
      ${hayCatalogoIngreso ? `<div style="margin:6px 0 0 26px;">
        <select class="cell cv-vinculo" data-id="${c.id}" style="font-size:12px;max-width:280px;">
          <option value="">— sin agrupar en el Estado de Resultados —</option>
          ${opcionesSubcuentasIngreso(subcuentas, mayores, c.subcuenta_vinculada_id)}
        </select>
      </div>` : ''}
    </div>`).join('');
  box.querySelectorAll('.cv-orden-subir').forEach(btn => btn.addEventListener('click', () => moverOrdenLista('fz_conceptos_venta', conceptos, Number(btn.dataset.idx), -1, () => renderVentaConceptosList(businessId))));
  box.querySelectorAll('.cv-orden-bajar').forEach(btn => btn.addEventListener('click', () => moverOrdenLista('fz_conceptos_venta', conceptos, Number(btn.dataset.idx), 1, () => renderVentaConceptosList(businessId))));
  box.querySelectorAll('.cv-vinculo').forEach(sel => sel.addEventListener('change', async () => {
    const { error } = await sb.from('fz_conceptos_venta').update({ subcuenta_vinculada_id: sel.value || null }).eq('id', sel.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Agrupación guardada.');
  }));
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

/* ---------- Jerarquía de cuentas: Mayor > Subcuenta > Sub-subcuenta ---------- */
function subcuentasRaiz(mayorId, subcuentas) {
  return subcuentas.filter(s => s.cuenta_mayor_id === mayorId && !s.subcuenta_padre_id);
}
function subcuentasHijas(subcuentaId, subcuentas) {
  return subcuentas.filter(s => s.subcuenta_padre_id === subcuentaId);
}
function subcuentaIdsDescendientes(subcuentaId, subcuentas) {
  const hijas = subcuentasHijas(subcuentaId, subcuentas);
  return hijas.flatMap(h => [h.id, ...subcuentaIdsDescendientes(h.id, subcuentas)]);
}
function opcionesMoverSubcuenta(s, subcuentas) {
  const excluidos = new Set([s.id, ...subcuentaIdsDescendientes(s.id, subcuentas)]);
  const candidatos = subcuentas.filter(x => x.cuenta_mayor_id === s.cuenta_mayor_id && !excluidos.has(x.id));
  const construirNivel = (padreId, nivel) => candidatos.filter(x => (x.subcuenta_padre_id || null) === padreId)
    .flatMap(x => [
      `<option value="${x.id}" ${s.subcuenta_padre_id===x.id?'selected':''}>${'—'.repeat(nivel)} ${x.nombre}</option>`,
      ...construirNivel(x.id, nivel + 1),
    ]);
  return `<option value="">— nivel superior (dentro de su cuenta mayor) —</option>` + construirNivel(null, 0).join('');
}
function rutaSubcuenta(subcuenta, subcuentas, mayores) {
  const partes = [subcuenta.nombre];
  let actual = subcuenta;
  while (actual.subcuenta_padre_id) {
    const padre = subcuentas.find(s => s.id === actual.subcuenta_padre_id);
    if (!padre) break;
    partes.unshift(padre.nombre);
    actual = padre;
  }
  const mayor = mayores.find(m => m.id === subcuenta.cuenta_mayor_id);
  if (mayor) partes.unshift(mayor.nombre);
  return partes.join(' › ');
}
function opcionesSubcuentaHtml(subcuentas, mayores, selectedId) {
  // construye <option> indentados por nivel, agrupados por cuenta mayor, en orden jerárquico
  const porMayor = mayores.map(m => {
    const construirNivel = (padreId, nivel) => {
      return subcuentas.filter(s => s.cuenta_mayor_id === m.id && (s.subcuenta_padre_id || null) === padreId)
        .flatMap(s => [
          `<option value="${s.id}" ${selectedId===s.id?'selected':''}>${'—'.repeat(nivel)} ${s.nombre}</option>`,
          ...construirNivel(s.id, nivel + 1),
        ]);
    };
    const opts = construirNivel(null, 0);
    return opts.length ? `<optgroup label="${m.nombre}">${opts.join('')}</optgroup>` : '';
  }).join('');
  return porMayor;
}

/* ============================================================
   CATÁLOGO DE CUENTAS — página completa (menú)
   ============================================================ */
let STATE_ccEditando = new Set();
/* ============================================================
   AUDITORÍA — bitácora de quién crea/edita/elimina qué
   ============================================================ */
let STATE_audFiltroTexto = '';
let STATE_audFiltroUsuario = '';
let STATE_audFiltroAccion = '';

/* ============================================================
   NEGOCIOS — alta y perfil (nombre comercial + razón social)
   ============================================================ */
const TABLAS_RESPALDO = [
  { nombre: 'Ventas', tabla: 'fz_ventas' },
  { nombre: 'Bancos_Cuentas', tabla: 'fz_bancos_cuentas' },
  { nombre: 'Bancos_Movimientos', tabla: 'fz_bancos_mov' },
  { nombre: 'Efectivo_Monedas', tabla: 'fz_efectivo_monedas' },
  { nombre: 'Efectivo_Movimientos', tabla: 'fz_efectivo_mov' },
  { nombre: 'Proveedores_Facturas', tabla: 'fz_proveedores' },
  { nombre: 'Proveedores_Pagos', tabla: 'fz_pagos_aplicados' },
  { nombre: 'Polizas', tabla: 'fz_polizas' },
  { nombre: 'Polizas_Lineas', tabla: 'fz_polizas_lineas' },
  { nombre: 'Catalogo_CuentasMayor', tabla: 'fz_cuentas_mayor' },
  { nombre: 'Catalogo_Subcuentas', tabla: 'fz_subcuentas' },
  { nombre: 'Conceptos_Venta', tabla: 'fz_conceptos_venta' },
  { nombre: 'Conceptos_EfvoBancos', tabla: 'fz_conceptos' },
  { nombre: 'PL_AjustesManuales', tabla: 'fz_pl_gastos' },
];

async function obtenerDatosRespaldo(businessId) {
  const datos = {};
  for (const t of TABLAS_RESPALDO) {
    const { data, error } = await sb.from(t.tabla).select('*').eq('business_id', businessId);
    if (error) { console.error('Error respaldando ' + t.tabla, error); datos[t.nombre] = []; }
    else datos[t.nombre] = data || [];
  }
  return datos;
}
function aplanarFila(fila) {
  const plano = {};
  Object.entries(fila).forEach(([k, v]) => {
    plano[k] = (v && typeof v === 'object') ? JSON.stringify(v) : v;
  });
  return plano;
}
function descargarArchivo(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function descargarRespaldoExcel(businessId, nombreNegocio) {
  toast('Generando respaldo, un momento…');
  const datos = await obtenerDatosRespaldo(businessId);
  const wb = XLSX.utils.book_new();
  Object.entries(datos).forEach(([nombreHoja, filas]) => {
    const ws = filas.length ? XLSX.utils.json_to_sheet(filas.map(aplanarFila)) : XLSX.utils.aoa_to_sheet([['(sin datos)']]);
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja.slice(0, 31));
  });
  const nombreArchivo = `Respaldo ${nombreNegocio} - ${todayStr()}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
  registrarAuditoria(businessId, 'exportar', 'Negocios', `Descargó respaldo en Excel de "${nombreNegocio}"`);
}
async function descargarRespaldoJSON(businessId, nombreNegocio) {
  toast('Generando respaldo, un momento…');
  const datos = await obtenerDatosRespaldo(businessId);
  const paquete = { negocio: nombreNegocio, business_id: businessId, generado: new Date().toISOString(), datos };
  const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' });
  descargarArchivo(blob, `Respaldo ${nombreNegocio} - ${todayStr()}.json`);
  registrarAuditoria(businessId, 'exportar', 'Negocios', `Descargó respaldo en JSON de "${nombreNegocio}"`);
}

function agregarBotonVolverConfig(el) {
  el.insertAdjacentHTML('afterbegin', `<button class="btn btn-ghost btn-sm volver-config-btn" style="margin-bottom:14px;">← Configuración</button>`);
  const btn = el.querySelector('.volver-config-btn');
  if (btn) btn.addEventListener('click', () => irASeccion('configuracion'));
}
function tarjetaConfigHtml(id, titulo, descripcion) {
  return `<div class="config-card" id="${id}" style="cursor:pointer;border:1.5px solid var(--line);border-radius:10px;padding:18px;">
    <strong style="color:var(--navy-1);font-size:14.5px;">${titulo}</strong>
    <p style="font-size:12.5px;color:var(--muted);margin-top:6px;">${descripcion}</p>
  </div>`;
}
async function renderConfiguracion() {
  const el = document.getElementById('sec-configuracion');
  const b = biz();
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
      ${tarjetaConfigHtml('cfgCatalogo', 'Catálogo de Cuentas', b ? `Cuenta mayor, subcuentas y su estructura contable para ${b.name}.` : 'Selecciona un negocio para configurar su catálogo.')}
      ${STATE.esAdministrador ? tarjetaConfigHtml('cfgNegocios', 'Negocios (todos)', 'Alta, edición y respaldo de cada negocio del grupo.') : ''}
      ${tarjetaConfigHtml('cfgAuditoria', 'Auditoría', b ? `Quién creó, editó o eliminó cada registro en ${b.name}.` : 'Selecciona un negocio para ver su auditoría.')}
      ${STATE.esAdministrador ? tarjetaConfigHtml('cfgUsuarios', 'Usuarios autorizados', 'Quién puede entrar a Finanzas y a qué negocios.') : ''}
      ${STATE.esAdministrador ? tarjetaConfigHtml('cfgMfa', 'Autenticación de dos pasos', 'Protege tu cuenta con un código adicional al iniciar sesión.') : ''}
    </div>
  `;
  const ir = (idBtn, seccion) => { const e = document.getElementById(idBtn); if (e) e.addEventListener('click', () => irASeccion(seccion)); };
  ir('cfgCatalogo', 'catalogo');
  ir('cfgNegocios', 'negocios');
  ir('cfgAuditoria', 'auditoria');
  const usuariosBtn = document.getElementById('cfgUsuarios');
  if (usuariosBtn) usuariosBtn.addEventListener('click', openUsuariosModal);
  const mfaBtn = document.getElementById('cfgMfa');
  if (mfaBtn) mfaBtn.addEventListener('click', async () => {
    document.getElementById('modalMfa').classList.add('show');
    await renderModalMfa();
  });
}

async function renderNegocios() {
  const el = document.getElementById('sec-negocios');
  const negocios = STATE.businesses || [];

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>Negocios del grupo</h3>
        <button class="btn btn-gold btn-sm" id="negociosAddBtn">+ Agregar negocio</button>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">El respaldo descarga toda la información de ese negocio (Ventas, Bancos, Efectivo, Proveedores, Pólizas, Catálogo de Cuentas) — cada negocio se descarga por separado.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre comercial</th><th>Razón social</th><th>Estatus</th><th>Respaldo</th><th></th></tr></thead>
          <tbody>
            ${negocios.length ? negocios.map(n => `<tr>
              <td>${n.name}</td>
              <td>${n.razon_social || '<span style="color:var(--muted);">— sin capturar —</span>'}</td>
              <td>${n.active !== false ? '<span class="badge pag">Activo</span>' : '<span class="badge pend">Inactivo</span>'}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost btn-sm negocio-respaldo-excel" data-id="${n.id}" data-nombre="${(n.name||'').replace(/"/g,'&quot;')}">Excel</button>
                <button class="btn btn-ghost btn-sm negocio-respaldo-json" data-id="${n.id}" data-nombre="${(n.name||'').replace(/"/g,'&quot;')}">JSON</button>
              </td>
              <td><button class="btn btn-ghost btn-sm negocio-editar" data-id="${n.id}">Editar</button></td>
            </tr>`).join('') : `<tr><td colspan="5" class="empty">Aún no hay negocios registrados.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  agregarBotonVolverConfig(el);

  document.getElementById('negociosAddBtn').addEventListener('click', () => {
    document.getElementById('newBizName').value = '';
    document.getElementById('modalBiz').classList.add('show');
  });
  el.querySelectorAll('.negocio-editar').forEach(btn => btn.addEventListener('click', () => {
    const negocio = negocios.find(n => n.id === btn.dataset.id);
    if (negocio) abrirEditarNegocio(negocio);
  }));
  el.querySelectorAll('.negocio-respaldo-excel').forEach(btn => btn.addEventListener('click', () => descargarRespaldoExcel(btn.dataset.id, btn.dataset.nombre)));
  el.querySelectorAll('.negocio-respaldo-json').forEach(btn => btn.addEventListener('click', () => descargarRespaldoJSON(btn.dataset.id, btn.dataset.nombre)));
}

async function renderAuditoria() {
  const el = document.getElementById('sec-auditoria');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const scrollY = window.scrollY;

  const { data, error } = await sb.from('fz_auditoria').select('*').eq('business_id', b.id).order('created_at', { ascending: false }).limit(500);
  if (error) { el.innerHTML = `<div class="empty">Error: ${error.message}</div>`; return; }
  const todos = data || [];
  const usuarios = [...new Set(todos.map(a => a.usuario_email).filter(Boolean))].sort();

  const texto = STATE_audFiltroTexto.trim().toLowerCase();
  const filtrados = todos.filter(a => {
    if (STATE_audFiltroUsuario && a.usuario_email !== STATE_audFiltroUsuario) return false;
    if (STATE_audFiltroAccion && a.accion !== STATE_audFiltroAccion) return false;
    if (texto && !(a.descripcion||'').toLowerCase().includes(texto) && !(a.modulo||'').toLowerCase().includes(texto)) return false;
    return true;
  });

  const ACCION_LABEL = { crear: 'Creó', editar: 'Editó', eliminar: 'Eliminó' };

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Registros (últimos 500)</div><div class="value">${todos.length}</div></div>
      <div class="kpi"><div class="label">Creaciones</div><div class="value num green">${todos.filter(a=>a.accion==='crear').length}</div></div>
      <div class="kpi"><div class="label">Ediciones</div><div class="value num">${todos.filter(a=>a.accion==='editar').length}</div></div>
      <div class="kpi"><div class="label">Eliminaciones</div><div class="value num red">${todos.filter(a=>a.accion==='eliminar').length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Bitácora de actividad — ${b.name}</h3></div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:12px;">Por ahora se registran acciones en Pólizas de Diario, Proveedores, y eliminaciones de movimientos en Bancos/Efectivo. Se irá ampliando a más módulos.</p>
      <div class="grid-3" style="margin-bottom:12px;">
        <div class="field" style="margin-bottom:0;">
          <label>Buscar</label>
          <input type="text" id="audBuscar" placeholder="Ej. póliza, factura..." value="${STATE_audFiltroTexto}">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Usuario</label>
          <select id="audUsuario">
            <option value="">— todos —</option>
            ${usuarios.map(u => `<option value="${u}" ${STATE_audFiltroUsuario===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Acción</label>
          <select id="audAccion">
            <option value="">— todas —</option>
            <option value="crear" ${STATE_audFiltroAccion==='crear'?'selected':''}>Creó</option>
            <option value="editar" ${STATE_audFiltroAccion==='editar'?'selected':''}>Editó</option>
            <option value="eliminar" ${STATE_audFiltroAccion==='eliminar'?'selected':''}>Eliminó</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Detalle</th></tr></thead>
          <tbody>
            ${filtrados.length ? filtrados.map(a => `<tr>
              <td>${new Date(a.created_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' })}</td>
              <td>${a.usuario_email || '—'}</td>
              <td>${ACCION_LABEL[a.accion] || a.accion}</td>
              <td>${a.modulo}</td>
              <td>${a.descripcion || ''}</td>
            </tr>`).join('') : `<tr><td colspan="5" class="empty">Sin registros que coincidan.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  agregarBotonVolverConfig(el);

  document.getElementById('audBuscar').addEventListener('input', (e) => { STATE_audFiltroTexto = e.target.value; renderAuditoria(); });
  document.getElementById('audUsuario').addEventListener('change', (e) => { STATE_audFiltroUsuario = e.target.value; renderAuditoria(); });
  document.getElementById('audAccion').addEventListener('change', (e) => { STATE_audFiltroAccion = e.target.value; renderAuditoria(); });
  window.scrollTo(0, scrollY);
}

async function renderCatalogoCuentas() {
  const el = document.getElementById('sec-catalogo');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const scrollY = window.scrollY;
  const [mayores, subcuentas, cuentasBancoQ, monedasQ, conceptosVenta] = await Promise.all([
    loadCuentasMayor(b.id), loadSubcuentas(b.id),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).order('nombre'),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).order('orden'),
    loadConceptosVenta(b.id),
  ]);
  const cuentasBanco = cuentasBancoQ.data || [];
  const monedasEfectivo = monedasQ.data || [];

  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Nueva cuenta mayor</h3></div>
      <div class="grid-3">
        <div class="field" style="margin-bottom:0;">
          <label>Nombre</label>
          <input type="text" id="ccNuevaMayorNombre" placeholder="Ej. Acreedores, Activos Fijos">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Tipo</label>
          <select id="ccNuevaMayorTipo">
            <option value="activo">Activo</option>
            <option value="pasivo">Pasivo</option>
            <option value="capital">Capital</option>
            <option value="ingreso">Ingreso</option>
            <option value="costo">Costo de Ventas</option>
            <option value="gasto">Gasto</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0;display:flex;align-items:flex-end;">
          <button class="btn btn-gold" id="ccSaveMayor" style="width:100%;">+ Agregar cuenta mayor</button>
        </div>
      </div>
      <div class="field" id="ccVinculoWrap" style="display:none;max-width:340px;">
        <label>Vincular a categoría de venta (para calcular % de costo)</label>
        <select id="ccNuevaMayorVinculo">
          <option value="">— sin vincular —</option>
          ${conceptosVenta.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-top:-4px;">Al crearla se agrega automáticamente una subcuenta con el mismo nombre, lista para usarse en Pólizas de Diario. Puedes agregarle más subcuentas abajo si necesitas desglosarla.</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>Nueva subcuenta</h3></div>
      <div class="grid-3">
        <div class="field" style="margin-bottom:0;">
          <label>Cuenta mayor</label>
          <select id="ccNuevaSubMayor"></select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Anidar bajo (opcional)</label>
          <select id="ccNuevaSubPadre"><option value="">— nivel superior —</option></select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Nombre</label>
          <input type="text" id="ccNuevaSubNombre" placeholder="Ej. Mantenimiento y conservación">
        </div>
      </div>
      <button class="btn btn-gold btn-sm" id="ccSaveSub">+ Agregar subcuenta</button>
      <p style="font-size:11.5px;color:var(--muted);margin-top:10px;">Ejemplo de 3 niveles: Gastos de Operación › Mantenimiento y conservación › Reparación de freidoras.</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>Bancos y Efectivo</h3><span class="hint">Se administran en sus propios módulos</span></div>
      <div class="grid-2">
        <div>
          <div style="font-weight:700;font-size:12.5px;color:var(--navy-1);margin-bottom:6px;">Cuentas bancarias</div>
          ${cuentasBanco.map(c => `<div style="display:flex;justify-content:space-between;padding:5px 4px;border-bottom:1px solid var(--line);font-size:13px;"><span>${c.nombre}${c.activo===false?' (inactiva)':''}</span></div>`).join('') || `<div class="empty" style="padding:8px;">Aún no hay cuentas bancarias.</div>`}
        </div>
        <div>
          <div style="font-weight:700;font-size:12.5px;color:var(--navy-1);margin-bottom:6px;">Cajas de efectivo</div>
          ${monedasEfectivo.map(m => `<div style="display:flex;justify-content:space-between;padding:5px 4px;border-bottom:1px solid var(--line);font-size:13px;"><span>${m.nombre}${m.activo===false?' (inactiva)':''}</span></div>`).join('') || `<div class="empty" style="padding:8px;">Aún no hay cajas de efectivo.</div>`}
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-top:10px;">Para agregar o editar cuentas bancarias ve a "Bancos"; para cajas de efectivo ve a "Efectivo & Divisas".</p>
    </div>

    ${['activo','pasivo','capital','ingreso','costo','gasto'].map(tipo => {
      const mayoresTipo = mayores.filter(m => m.tipo === tipo);
      if (!mayoresTipo.length) return '';
      return `<div class="card">
        <div class="card-head"><h3>${TIPO_CUENTA_LABEL[tipo]}</h3></div>
        <div id="ccList-${tipo}"></div>
      </div>`;
    }).join('') || `<div class="empty">Aún no has creado cuentas mayor de Activo, Pasivo, Capital, Ingreso o Gasto. Usa el formulario de arriba.</div>`}
  `;
  agregarBotonVolverConfig(el);

  const filaSubHtml = (s, nivel) => {
    const editando = STATE_ccEditando.has(s.id);
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px 6px ${16 + nivel*18}px;border-bottom:1px solid var(--line);font-size:13px;flex-wrap:wrap;">
      ${nivel>0?'<span style="color:var(--muted);">—</span>':''}
      ${editando ? `
        <input class="cell cc-sub-nombre" type="text" value="${s.nombre}" data-id="${s.id}" style="flex:1;min-width:120px;">
        <select class="cell cc-sub-padre" data-id="${s.id}" style="min-width:200px;">${opcionesMoverSubcuenta(s, subcuentas)}</select>
        <button class="btn btn-ghost btn-sm cc-sub-save" data-id="${s.id}">Guardar</button>
      ` : `
        <span style="flex:1;min-width:0;">${s.nombre}</span>
        <button class="btn btn-ghost btn-sm cc-sub-editar" data-id="${s.id}">Editar</button>
        ${nivel===0 ? `<button class="btn btn-ghost btn-sm cc-sub-promover" data-id="${s.id}" data-mayor="${s.cuenta_mayor_id}" title="Convierte esta subcuenta en su propia cuenta mayor, con todo y lo que tenga adentro">Promover a cuenta mayor</button>` : ''}
      `}
      <button class="row-del cc-sub-del" data-id="${s.id}" style="font-size:14px;">Eliminar</button>
    </div>
    ${subcuentasHijas(s.id, subcuentas).map(h => filaSubHtml(h, nivel+1)).join('')}`;
  };

  ['activo','pasivo','capital','ingreso','costo','gasto'].forEach(tipo => {
    const box = document.getElementById('ccList-' + tipo);
    if (!box) return;
    const mayoresTipo = mayores.filter(m => m.tipo === tipo);
    box.innerHTML = mayoresTipo.map((m, idx) => {
      const editando = STATE_ccEditando.has(m.id);
      return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;background:#f7f9fc;border-radius:7px;flex-wrap:wrap;">
          ${botonesOrdenHtml(idx, mayoresTipo.length, 'cc-mayor-orden')}
          ${editando ? `
            <input class="cell cc-mayor-nombre" type="text" value="${m.nombre}" data-id="${m.id}" style="flex:1;min-width:0;font-weight:700;">
            <select class="cell cc-mayor-tipo" data-id="${m.id}" style="width:auto;">
              <option value="activo" ${m.tipo==='activo'?'selected':''}>Activo</option>
              <option value="pasivo" ${m.tipo==='pasivo'?'selected':''}>Pasivo</option>
              <option value="capital" ${m.tipo==='capital'?'selected':''}>Capital</option>
              <option value="ingreso" ${m.tipo==='ingreso'?'selected':''}>Ingreso</option>
              <option value="costo" ${m.tipo==='costo'?'selected':''}>Costo de Ventas</option>
              <option value="gasto" ${m.tipo==='gasto'?'selected':''}>Gasto</option>
            </select>
            ${m.tipo==='costo' ? `<select class="cell cc-mayor-vinculo" data-id="${m.id}" style="width:auto;min-width:180px;">
              <option value="">— sin vincular a venta —</option>
              ${conceptosVenta.map(c => `<option value="${c.id}" ${m.concepto_venta_vinculado_id===c.id?'selected':''}>% vs ${c.nombre}</option>`).join('')}
            </select>` : ''}
            <button class="btn btn-ghost btn-sm cc-mayor-save" data-id="${m.id}">Guardar</button>
          ` : `
            <strong style="flex:1;min-width:0;">${m.nombre}</strong>
            ${m.concepto_venta_vinculado_id ? `<span style="font-size:11px;color:var(--muted);">(% vs ${conceptosVenta.find(c=>c.id===m.concepto_venta_vinculado_id)?.nombre||''})</span>` : ''}
            <button class="btn btn-ghost btn-sm cc-mayor-editar" data-id="${m.id}">Editar</button>
          `}
          <button class="row-del cc-mayor-del" data-id="${m.id}" style="font-size:15px;">Eliminar</button>
        </div>
        ${subcuentasRaiz(m.id, subcuentas).map(s => filaSubHtml(s, 0)).join('') || `<div style="padding:6px 4px 6px 16px;color:var(--muted);font-size:12px;">Sin subcuentas todavía.</div>`}
      </div>`;
    }).join('');
    box.querySelectorAll('.cc-mayor-orden-subir').forEach(btn => btn.addEventListener('click', () => moverOrdenLista('fz_cuentas_mayor', mayoresTipo, Number(btn.dataset.idx), -1, () => renderCatalogoCuentas())));
    box.querySelectorAll('.cc-mayor-orden-bajar').forEach(btn => btn.addEventListener('click', () => moverOrdenLista('fz_cuentas_mayor', mayoresTipo, Number(btn.dataset.idx), 1, () => renderCatalogoCuentas())));
  });

  const actualizarSubPadre = () => {
    const mayorId = document.getElementById('ccNuevaSubMayor').value;
    const sel = document.getElementById('ccNuevaSubPadre');
    const construirNivel = (padreId, nivel) => subcuentas.filter(s => s.cuenta_mayor_id === mayorId && (s.subcuenta_padre_id || null) === padreId)
      .flatMap(s => [`<option value="${s.id}">${'—'.repeat(nivel)} ${s.nombre}</option>`, ...construirNivel(s.id, nivel + 1)]);
    sel.innerHTML = `<option value="">— nivel superior —</option>` + construirNivel(null, 0).join('');
  };
  document.getElementById('ccNuevaSubMayor').innerHTML = mayores.map(m => `<option value="${m.id}">${m.nombre} (${TIPO_CUENTA_LABEL[m.tipo]})</option>`).join('') || `<option value="">— crea una cuenta mayor primero —</option>`;
  actualizarSubPadre();
  document.getElementById('ccNuevaSubMayor').addEventListener('change', actualizarSubPadre);
  const toggleVinculo = () => {
    document.getElementById('ccVinculoWrap').style.display = document.getElementById('ccNuevaMayorTipo').value === 'costo' ? 'block' : 'none';
  };
  document.getElementById('ccNuevaMayorTipo').addEventListener('change', toggleVinculo);
  toggleVinculo();

  document.getElementById('ccSaveMayor').addEventListener('click', async () => {
    const nombre = document.getElementById('ccNuevaMayorNombre').value.trim();
    const tipo = document.getElementById('ccNuevaMayorTipo').value;
    const vinculo = tipo === 'costo' ? (document.getElementById('ccNuevaMayorVinculo').value || null) : null;
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const cantidadEnTipo = mayores.filter(m => m.tipo === tipo).length;
    const { data: nuevaMayor, error } = await sb.from('fz_cuentas_mayor').insert({ business_id: b.id, nombre, tipo, orden: cantidadEnTipo, concepto_venta_vinculado_id: vinculo }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    const { error: e2 } = await sb.from('fz_subcuentas').insert({ business_id: b.id, cuenta_mayor_id: nuevaMayor.id, nombre, orden: 0 });
    if (e2) toast('La cuenta mayor se creó, pero hubo un error creando su subcuenta por default: ' + e2.message, 'error');
    else toast('Cuenta mayor creada, ya lista para usarse en Pólizas de Diario.');
    renderCatalogoCuentas();
  });
  document.getElementById('ccSaveSub').addEventListener('click', async () => {
    const cuenta_mayor_id = document.getElementById('ccNuevaSubMayor').value;
    const subcuenta_padre_id = document.getElementById('ccNuevaSubPadre').value || null;
    const nombre = document.getElementById('ccNuevaSubNombre').value.trim();
    if (!cuenta_mayor_id) { toast('Primero crea una cuenta mayor.', 'error'); return; }
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const { error } = await sb.from('fz_subcuentas').insert({ business_id: b.id, cuenta_mayor_id, subcuenta_padre_id, nombre, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    renderCatalogoCuentas();
  });
  el.querySelectorAll('.cc-mayor-editar').forEach(btn => btn.addEventListener('click', () => {
    STATE_ccEditando.add(btn.dataset.id);
    renderCatalogoCuentas();
  }));
  el.querySelectorAll('.cc-sub-editar').forEach(btn => btn.addEventListener('click', () => {
    STATE_ccEditando.add(btn.dataset.id);
    renderCatalogoCuentas();
  }));
  el.querySelectorAll('.cc-sub-promover').forEach(btn => btn.addEventListener('click', async () => {
    const sub = subcuentas.find(s => s.id === btn.dataset.id);
    if (!sub) return;
    const mayorActual = mayores.find(m => m.id === btn.dataset.mayor);
    const nombre = prompt('¿Cómo se llamará la nueva cuenta mayor?', sub.nombre);
    if (!nombre || !nombre.trim()) return;
    if (!confirm(`Se creará la cuenta mayor "${nombre.trim()}" (tipo ${TIPO_CUENTA_LABEL[mayorActual?.tipo]||''}), y "${sub.nombre}" junto con todo lo que tenga adentro se moverá ahí. No se borra ni se pierde ninguna transacción ya capturada. ¿Continuar?`)) return;
    const { data: nuevaMayor, error } = await sb.from('fz_cuentas_mayor').insert({ business_id: b.id, nombre: nombre.trim(), tipo: mayorActual?.tipo || 'costo', orden: mayores.filter(m=>m.tipo===(mayorActual?.tipo||'costo')).length }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    const idsAMover = [sub.id, ...subcuentaIdsDescendientes(sub.id, subcuentas)];
    const { error: e2 } = await sb.from('fz_subcuentas').update({ cuenta_mayor_id: nuevaMayor.id }).in('id', idsAMover);
    if (e2) { toast('Error moviendo la subcuenta: ' + e2.message, 'error'); return; }
    await sb.from('fz_subcuentas').update({ subcuenta_padre_id: null }).eq('id', sub.id);
    registrarAuditoria(b.id, 'editar', 'Catálogo de Cuentas', `"${sub.nombre}" promovida a cuenta mayor independiente`);
    toast(`"${nombre.trim()}" ya es su propia cuenta mayor. Ahora puedes vincularla a una categoría de venta si aplica.`);
    renderCatalogoCuentas();
  }));
  el.querySelectorAll('.cc-mayor-save').forEach(btn => btn.addEventListener('click', async () => {
    const inp = el.querySelector(`.cc-mayor-nombre[data-id="${btn.dataset.id}"]`);
    const selTipo = el.querySelector(`.cc-mayor-tipo[data-id="${btn.dataset.id}"]`);
    const selVinculo = el.querySelector(`.cc-mayor-vinculo[data-id="${btn.dataset.id}"]`);
    const payload = { nombre: inp.value.trim() };
    if (selTipo) payload.tipo = selTipo.value;
    payload.concepto_venta_vinculado_id = (selTipo && selTipo.value === 'costo' && selVinculo) ? (selVinculo.value || null) : null;
    const { error } = await sb.from('fz_cuentas_mayor').update(payload).eq('id', btn.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    STATE_ccEditando.delete(btn.dataset.id);
    registrarAuditoria(biz()?.id, 'editar', 'Catálogo de Cuentas', `Cuenta "${payload.nombre}" → tipo ${TIPO_CUENTA_LABEL[payload.tipo]||payload.tipo}`);
    toast('Guardado.');
    renderCatalogoCuentas();
  }));
  el.querySelectorAll('.cc-sub-save').forEach(btn => btn.addEventListener('click', async () => {
    const inp = el.querySelector(`.cc-sub-nombre[data-id="${btn.dataset.id}"]`);
    const selPadre = el.querySelector(`.cc-sub-padre[data-id="${btn.dataset.id}"]`);
    const nuevoPadreId = selPadre ? (selPadre.value || null) : undefined;
    const payload = { nombre: inp.value.trim() };
    if (nuevoPadreId !== undefined) payload.subcuenta_padre_id = nuevoPadreId;
    const { error } = await sb.from('fz_subcuentas').update(payload).eq('id', btn.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    STATE_ccEditando.delete(btn.dataset.id);
    registrarAuditoria(biz()?.id, 'editar', 'Catálogo de Cuentas', `Subcuenta "${payload.nombre}" reubicada`);
    toast('Guardado.');
    renderCatalogoCuentas();
  }));
  el.querySelectorAll('.cc-mayor-del').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta cuenta mayor y todas sus subcuentas?')) return;
    const { error } = await sb.from('fz_cuentas_mayor').delete().eq('id', btn.dataset.id);
    if (error) { toast('No se puede eliminar: ya tiene movimientos registrados con alguna de sus subcuentas.', 'error'); return; }
    STATE_ccEditando.delete(btn.dataset.id);
    renderCatalogoCuentas();
  }));
  el.querySelectorAll('.cc-sub-del').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta subcuenta? (si tiene sub-subcuentas anidadas, también se eliminan)')) return;
    const { error } = await sb.from('fz_subcuentas').delete().eq('id', btn.dataset.id);
    if (error) { toast('No se puede eliminar: ya tiene movimientos registrados.', 'error'); return; }
    STATE_ccEditando.delete(btn.dataset.id);
    renderCatalogoCuentas();
  }));
  window.scrollTo(0, scrollY);
}

async function openCuentasModal(businessId, onClose) {
  await renderCuentasList(businessId);
  document.getElementById('modalCuentas').classList.add('show');
  document.getElementById('closeCuentas').onclick = () => { document.getElementById('modalCuentas').classList.remove('show'); if (onClose) onClose(); };
  document.getElementById('saveCuentaMayor').onclick = async () => {
    const nombre = document.getElementById('newCuentaMayorNombre').value.trim();
    const tipo = document.getElementById('newCuentaMayorTipo').value;
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const { data: nuevaMayor, error } = await sb.from('fz_cuentas_mayor').insert({ business_id: businessId, nombre, tipo, orden: 99 }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('fz_subcuentas').insert({ business_id: businessId, cuenta_mayor_id: nuevaMayor.id, nombre, orden: 0 });
    document.getElementById('newCuentaMayorNombre').value = '';
    renderCuentasList(businessId);
  };
  document.getElementById('newSubcuentaMayor').addEventListener('change', () => actualizarSelectSubcuentaPadre(businessId));
  document.getElementById('saveSubcuenta').onclick = async () => {
    const cuenta_mayor_id = document.getElementById('newSubcuentaMayor').value;
    const subcuenta_padre_id = document.getElementById('newSubcuentaPadre').value || null;
    const nombre = document.getElementById('newSubcuentaNombre').value.trim();
    if (!cuenta_mayor_id) { toast('Primero crea una cuenta mayor.', 'error'); return; }
    if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
    const { error } = await sb.from('fz_subcuentas').insert({ business_id: businessId, cuenta_mayor_id, subcuenta_padre_id, nombre, orden: 99 });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('newSubcuentaNombre').value = '';
    renderCuentasList(businessId);
  };
}
async function actualizarSelectSubcuentaPadre(businessId) {
  const mayorId = document.getElementById('newSubcuentaMayor').value;
  const subcuentas = await loadSubcuentas(businessId);
  const sel = document.getElementById('newSubcuentaPadre');
  const construirNivel = (padreId, nivel) => subcuentas.filter(s => s.cuenta_mayor_id === mayorId && (s.subcuenta_padre_id || null) === padreId)
    .flatMap(s => [`<option value="${s.id}">${'—'.repeat(nivel)} ${s.nombre}</option>`, ...construirNivel(s.id, nivel + 1)]);
  sel.innerHTML = `<option value="">— nivel superior —</option>` + construirNivel(null, 0).join('');
}
const ROL_LABEL = { propietario: 'Propietario', socio: 'Socio', gerencia: 'Gerencia' };
function etiquetaRol(esAdministrador, rol) {
  if (esAdministrador) return 'Administrador';
  return ROL_LABEL[rol] || 'Gerencia';
}
const TIPO_CUENTA_LABEL = { activo: 'Activo', pasivo: 'Pasivo', capital: 'Capital', ingreso: 'Ingreso', costo: 'Costo de Ventas', gasto: 'Gasto' };
async function renderCuentasList(businessId) {
  const [mayores, subcuentas] = await Promise.all([loadCuentasMayor(businessId), loadSubcuentas(businessId)]);
  const box = document.getElementById('cuentasMayorList');
  const sel = document.getElementById('newSubcuentaMayor');
  sel.innerHTML = mayores.map(m => `<option value="${m.id}">${m.nombre} (${TIPO_CUENTA_LABEL[m.tipo]||m.tipo})</option>`).join('') || `<option value="">— crea una cuenta mayor primero —</option>`;
  await actualizarSelectSubcuentaPadre(businessId);

  if (!mayores.length) { box.innerHTML = `<div class="empty" style="padding:16px;">Aún no hay cuentas mayor. Crea la primera abajo.</div>`; return; }
  const filaSubHtml = (s, nivel) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 4px 5px ${16 + nivel*18}px;border-bottom:1px solid var(--line);font-size:13px;">
      <span>${nivel>0?'— ':''}${s.nombre}</span>
      <button class="row-del sub-del" data-id="${s.id}" style="font-size:14px;">✕</button>
    </div>
    ${subcuentasHijas(s.id, subcuentas).map(h => filaSubHtml(h, nivel+1)).join('')}`;
  box.innerHTML = mayores.map(m => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;background:#f7f9fc;border-radius:7px;">
        <strong>${m.nombre}</strong>
        <span style="display:flex;align-items:center;gap:10px;">
          <span class="tag" style="cursor:default;padding:2px 10px;font-size:11px;">${TIPO_CUENTA_LABEL[m.tipo]||m.tipo}</span>
          <button class="row-del mayor-del" data-id="${m.id}" style="font-size:15px;">✕</button>
        </span>
      </div>
      ${subcuentasRaiz(m.id, subcuentas).map(s => filaSubHtml(s, 0)).join('') || `<div style="padding:5px 4px 5px 16px;color:var(--muted);font-size:12px;">Sin subcuentas todavía.</div>`}
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
    if (!confirm('¿Eliminar esta subcuenta? (si tiene sub-subcuentas anidadas, también se eliminan)')) return;
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

let STATE_desgloseEditandoIdx = null;

async function openDesgloseModal(businessId, facturaId, onClose) {
  const subcuentas = await loadSubcuentas(businessId);
  const mayores = await loadCuentasMayor(businessId);
  const sel = document.getElementById('newDesgloseSubcuenta');
  sel.innerHTML = opcionesSubcuentaHtml(subcuentas, mayores, null) || `<option value="">— crea subcuentas primero en Catálogo de Cuentas —</option>`;

  STATE_desgloseEditandoIdx = null;
  limpiarFormDesglose();
  await renderDesgloseList(businessId, facturaId, subcuentas, mayores);
  document.getElementById('modalDesglose').classList.add('show');
  document.getElementById('closeDesglose').onclick = () => { document.getElementById('modalDesglose').classList.remove('show'); if (onClose) onClose(); };

  const importeInp = document.getElementById('newDesgloseImporte');
  const ivaInp = document.getElementById('newDesgloseIva');
  const montoInp = document.getElementById('newDesgloseMonto');

  const sumarImporteIva = () => {
    const importe = leerMonto(importeInp.value);
    const iva = leerMonto(ivaInp.value);
    if (importe || iva) montoInp.value = (importe + iva) ? fmtInputVal(importe + iva) : '';
  };
  importeInp.addEventListener('input', sumarImporteIva);
  ivaInp.addEventListener('input', sumarImporteIva);
  importeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ivaInp.focus(); ivaInp.select(); } });
  ivaInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarLineaDesglose(businessId, facturaId, subcuentas, mayores); } });
  montoInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarLineaDesglose(businessId, facturaId, subcuentas, mayores); } });

  document.getElementById('addDesgloseLinea').onclick = () => guardarLineaDesglose(businessId, facturaId, subcuentas, mayores);
  document.getElementById('cancelarEdicionDesglose').onclick = () => {
    STATE_desgloseEditandoIdx = null;
    limpiarFormDesglose();
  };
}

function actualizarUiModoDesglose() {
  document.getElementById('desgloseEditandoAviso').style.display = STATE_desgloseEditandoIdx !== null ? 'block' : 'none';
  document.getElementById('cancelarEdicionDesglose').style.display = STATE_desgloseEditandoIdx !== null ? 'inline-flex' : 'none';
  document.getElementById('addDesgloseLinea').textContent = STATE_desgloseEditandoIdx !== null ? 'Guardar cambios' : '+ Agregar línea';
}
function limpiarFormDesglose() {
  document.getElementById('newDesgloseImporte').value = '';
  document.getElementById('newDesgloseIva').value = '';
  document.getElementById('newDesgloseMonto').value = '';
  document.getElementById('newDesgloseDescripcion').value = '';
  actualizarUiModoDesglose();
}

async function guardarLineaDesglose(businessId, facturaId, subcuentas, mayores) {
  const subId = document.getElementById('newDesgloseSubcuenta').value;
  const importe = leerMonto(document.getElementById('newDesgloseImporte').value);
  const iva = leerMonto(document.getElementById('newDesgloseIva').value);
  const montoDirecto = leerMonto(document.getElementById('newDesgloseMonto').value);
  const monto = montoDirecto || (importe + iva);
  const descripcion = document.getElementById('newDesgloseDescripcion').value.trim() || null;
  if (!subId || !monto) { toast('Selecciona subcuenta y captura un monto (o Importe + IVA).', 'error'); return; }
  const { data: fRow } = await sb.from('fz_proveedores').select('desglose').eq('id', facturaId).single();
  const lineas = desgloseLineas(fRow?.desglose);
  const nuevaLinea = { subcuenta_id: subId, monto, descripcion, importe: importe || null, iva: iva || null };
  if (STATE_desgloseEditandoIdx !== null) lineas[STATE_desgloseEditandoIdx] = nuevaLinea;
  else lineas.push(nuevaLinea);
  await sb.from('fz_proveedores').update({ desglose: lineas }).eq('id', facturaId);
  STATE_desgloseEditandoIdx = null;
  limpiarFormDesglose();
  renderDesgloseList(businessId, facturaId, subcuentas, mayores);
}
async function renderDesgloseList(businessId, facturaId, subcuentas, mayores) {
  const { data: fRow } = await sb.from('fz_proveedores').select('*').eq('id', facturaId).single();
  const lineas = desgloseLineas(fRow?.desglose);
  const box = document.getElementById('desgloseList');
  const totalAsignado = lineas.reduce((s,l)=>s+Number(l.monto||0),0);
  document.getElementById('desgloseTotales').innerHTML = `Factura: ${fmt(fRow?.importe||0)} &nbsp;|&nbsp; Asignado: <span style="color:${Math.abs(totalAsignado-(fRow?.importe||0))<1?'var(--green)':'var(--red)'}">${fmt(totalAsignado)}</span>`;
  box.innerHTML = lineas.map((linea, idx) => {
    const sub = subcuentas.find(s=>s.id===linea.subcuenta_id);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 4px;border-bottom:1px solid var(--line);font-size:13px;gap:8px;">
      <div style="min-width:0;">
        <div>${sub ? rutaSubcuenta(sub, subcuentas, mayores) : '(subcuenta eliminada)'}</div>
        ${linea.descripcion ? `<div style="color:var(--muted);font-size:11.5px;">${linea.descripcion}</div>` : ''}
        ${(linea.importe || linea.iva) ? `<div style="color:var(--muted);font-size:11px;">Importe ${fmt(linea.importe||0)} + IVA ${fmt(linea.iva||0)}</div>` : ''}
      </div>
      <span style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <strong>${fmt(linea.monto)}</strong>
        <button class="btn btn-ghost btn-sm desglose-editar" data-idx="${idx}" style="padding:3px 8px;font-size:11.5px;">Editar</button>
        <button class="row-del desglose-del" data-idx="${idx}" style="font-size:14px;">✕</button>
      </span>
    </div>`;
  }).join('') || `<div class="empty" style="padding:10px;">Sin líneas todavía.</div>`;
  box.querySelectorAll('.desglose-editar').forEach(btn => btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.idx);
    const linea = lineas[idx];
    STATE_desgloseEditandoIdx = idx;
    document.getElementById('newDesgloseSubcuenta').value = linea.subcuenta_id || '';
    document.getElementById('newDesgloseImporte').value = linea.importe ? fmtInputVal(linea.importe) : '';
    document.getElementById('newDesgloseIva').value = linea.iva ? fmtInputVal(linea.iva) : '';
    document.getElementById('newDesgloseMonto').value = fmtInputVal(linea.monto);
    document.getElementById('newDesgloseDescripcion').value = linea.descripcion || '';
    actualizarUiModoDesglose();
  }));
  box.querySelectorAll('.desglose-del').forEach(btn => btn.addEventListener('click', async () => {
    const idx = Number(btn.dataset.idx);
    const nuevas = lineas.filter((_,i)=>i!==idx);
    await sb.from('fz_proveedores').update({ desglose: nuevas }).eq('id', facturaId);
    if (STATE_desgloseEditandoIdx === idx) { STATE_desgloseEditandoIdx = null; limpiarFormDesglose(); }
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]/g, ''); // quita espacios, barras, guiones, puntuación
}
function buscarColumna(row, candidatos) {
  const claves = Object.keys(row).map(k => ({ original: k, norm: normalizarEncabezado(k) }));
  for (const c of candidatos) {
    const cNorm = normalizarEncabezado(c);
    let found = claves.find(x => x.norm === cNorm); // 1) coincidencia exacta
    if (!found) found = claves.find(x => x.norm.includes(cNorm)); // 2) coincidencia parcial (ej. columna combinada "Proveedor / Concepto")
    if (found) return row[found.original];
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

      } else if (tipo === 'efectivo_mov') {
        const monedaId = extra;
        if (!monedaId) { toast('Selecciona primero una caja de efectivo.', 'error'); return; }
        const payload = rows.map(r => ({
          business_id: businessId,
          moneda_id: monedaId,
          fecha: parseFechaExcel(buscarColumna(r, ['fecha'])),
          proveedor: String(buscarColumna(r, ['proveedor', 'concepto']) || '').trim() || null,
          descripcion: String(buscarColumna(r, ['descripcion', 'descripción']) || '').trim() || null,
          factura: String(buscarColumna(r, ['factura', 'referencia']) || '').trim() || null,
          depositos: Number(buscarColumna(r, ['depositos', 'depósitos', 'abono', 'abonos'])) || 0,
          cargos: Number(buscarColumna(r, ['cargos', 'cargo'])) || 0,
          tipo_salida: 'otro',
        })).filter(m => m.depositos || m.cargos);
        if (!payload.length) { toast('No se encontraron filas válidas (revisa las columnas Depósitos/Cargos).', 'error'); return; }
        const { error } = await sb.from('fz_efectivo_mov').insert(payload);
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
          const lineasPayload = grupos[key].map((r, idx) => {
            const subNombre = String(buscarColumna(r, ['subcuenta']) || '').trim();
            const sub = subcuentas.find(s => s.nombre.trim().toLowerCase() === subNombre.toLowerCase());
            return {
              business_id: businessId, poliza_id: nuevaPoliza.id,
              subcuenta_id: sub ? sub.id : null,
              descripcion: String(buscarColumna(r, ['descripcion', 'descripción']) || '').trim() || null,
              cargo: Number(buscarColumna(r, ['cargo'])) || 0,
              abono: Number(buscarColumna(r, ['abono'])) || 0,
              orden: idx,
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
        ${conceptosVenta.map(c => `<div class="field" style="margin-bottom:8px;"><label>${c.nombre}${c.tipo==='resta'?' (descuento)':''}</label><input type="text" inputmode="decimal" class="vd-venta num-fmt" data-id="${c.id}" value="0.00"></div>`).join('')}
      </div>` : `<div class="empty" style="margin:12px 0;">Este negocio no tiene categorías de venta configuradas.</div>`}

    <h4 style="margin:16px 0 8px;color:var(--navy-1);font-family:'Cormorant Garamond',serif;font-size:18px;">Sistema</h4>
    <div class="grid-2">
      ${conceptosSistema.length ? conceptosSistema.map(c => `<div class="field"><label>${c.nombre} (sistema)</label><input type="text" inputmode="decimal" class="vd-sistema num-fmt" data-id="${c.id}" value="0.00"></div>`).join('') : `
        <div class="field"><label>Efectivo (sistema)</label><input type="text" inputmode="decimal" class="num-fmt" id="vdEfectivoSistema" value="0.00"></div>
        <div class="field"><label>Tarjetas (sistema)</label><input type="text" inputmode="decimal" class="num-fmt" id="vdTarjetasSistema" value="0.00"></div>
        <div class="field"><label>CxC (sistema)</label><input type="text" inputmode="decimal" class="num-fmt" id="vdCxc" value="0.00"></div>
      `}
      <div class="field"><label>Gastos del día</label><input type="text" inputmode="decimal" class="num-fmt" id="vdGastos" value="0.00"></div>
    </div>

    ${['efectivo','tarjetas','bancos','cxc','propinas'].filter(cat => porCat[cat].length).map(cat => `
      <h4 style="margin:16px 0 8px;color:var(--navy-1);font-family:'Cormorant Garamond',serif;font-size:18px;">${CAT_LABEL[cat]} recibido</h4>
      <div class="grid-2">
        ${porCat[cat].map(c => `
          <div class="field" style="margin-bottom:8px;">
            <label>${c.nombre}${c.es_moneda?' (+ TC)':''}</label>
            <input type="text" inputmode="decimal" class="vd-recon num-fmt" data-id="${c.id}" value="0.00">
            ${c.es_moneda ? `<input type="text" inputmode="decimal" class="vd-recon-tc num-fmt" data-id="${c.id}" placeholder="Tipo de cambio" style="margin-top:5px;">` : ''}
          </div>`).join('')}
      </div>`).join('')}
  `;

  document.getElementById('modalVentaDia').classList.add('show');
  wireInputsMoneda(form);
  document.getElementById('closeVentaDia').onclick = () => document.getElementById('modalVentaDia').classList.remove('show');
  document.getElementById('saveVentaDia').onclick = async () => {
    const fecha = document.getElementById('vdFecha').value || todayStr();
    const venta_data = {};
    form.querySelectorAll('.vd-venta').forEach(inp => { venta_data[inp.dataset.id] = leerMonto(inp.value); });
    const recon_data = {};
    form.querySelectorAll('.vd-recon').forEach(inp => {
      const monto = leerMonto(inp.value);
      const tcInput = form.querySelector(`.vd-recon-tc[data-id="${inp.dataset.id}"]`);
      recon_data[inp.dataset.id] = tcInput ? { monto, tc: leerMonto(tcInput.value) } : { monto };
    });
    const payload = {
      business_id: businessId, fecha, venta_data,
      gastos: leerMonto(document.getElementById('vdGastos').value),
      recon_data,
    };
    if (conceptosSistema.length) {
      const sistema_data = {};
      form.querySelectorAll('.vd-sistema').forEach(inp => { sistema_data[inp.dataset.id] = leerMonto(inp.value); });
      payload.sistema_data = sistema_data;
    } else {
      payload.efectivo_sistema = leerMonto(document.getElementById('vdEfectivoSistema').value);
      payload.tarjetas_sistema = leerMonto(document.getElementById('vdTarjetasSistema').value);
      payload.cxc = leerMonto(document.getElementById('vdCxc').value);
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
  const idsAfectadosCliente = facturaIdsClienteDe(row);
  if (row.tipo_salida === 'proveedor' && idsAfectados.length) {
    const ok = confirm(`Este movimiento tiene un pago aplicado a ${idsAfectados.length} factura(s) de Proveedores. Al eliminarlo, se revertirá ese pago (regresarán a Pendiente/Parcial según corresponda). ¿Continuar?`);
    if (!ok) return;
    const montoMovimiento = Number(row.cargos) > 0 ? Number(row.cargos) : Number(row.depositos) || 0;
    await revertirPagoAFacturas(idsAfectados, montoMovimiento);
  }
  if (row.tipo_entrada === 'cliente' && idsAfectadosCliente.length) {
    const ok = confirm(`Este movimiento tiene un cobro aplicado a ${idsAfectadosCliente.length} factura(s) de Clientes. Al eliminarlo, se revertirá ese cobro (regresarán a Pendiente/Parcial según corresponda). ¿Continuar?`);
    if (!ok) return;
    await revertirCobroPorOrigen(table, row.id);
  }
  await sb.from(table).delete().eq('id', row.id);
  const modulo = table === 'fz_bancos_mov' ? 'Bancos' : 'Efectivo';
  const monto = Number(row.cargos) > 0 ? Number(row.cargos) : Number(row.depositos) || 0;
  registrarAuditoria(row.business_id, 'eliminar', modulo, `Movimiento ${row.fecha} · ${row.descripcion||row.proveedor||''} · ${fmt(monto)}${idsAfectados.length?' (revirtió '+idsAfectados.length+' factura(s) de proveedor)':''}${idsAfectadosCliente.length?' (revirtió '+idsAfectadosCliente.length+' factura(s) de cliente)':''}`);
  onDone();
}

async function revertirCobroPorOrigen(origenTabla, origenId) {
  const { data: cobros } = await sb.from('fz_cobros_aplicados').select('*').eq('origen_tabla', origenTabla).eq('origen_id', origenId);
  for (const cobro of (cobros || [])) {
    const { data: f } = await sb.from('fz_facturas_clientes').select('total,importe_pagado').eq('id', cobro.factura_id).single();
    if (f) {
      const nuevoPagado = Math.max(0, Number(f.importe_pagado||0) - Number(cobro.monto||0));
      const nuevoEstatus = nuevoPagado <= 0.004 ? 'Pendiente' : (nuevoPagado >= Number(f.total) - 0.01 ? 'Pagado' : 'Parcial');
      await sb.from('fz_facturas_clientes').update({ importe_pagado: nuevoPagado, estatus: nuevoEstatus }).eq('id', cobro.factura_id);
    }
  }
  await sb.from('fz_cobros_aplicados').delete().eq('origen_tabla', origenTabla).eq('origen_id', origenId);
}

async function aplicarPagoFacturas(idsSeleccionados, montoDisponibleInicial, fechaMov, businessId, origenInfo) {
  // Si este movimiento ya tenía un desglose guardado (se está editando qué facturas cubre),
  // primero revertimos esos montos exactos, para no duplicar ni dejar basura de la vez anterior.
  if (origenInfo.origen_tabla && origenInfo.origen_id) {
    const { data: previos } = await sb.from('fz_pagos_aplicados').select('*').eq('origen_tabla', origenInfo.origen_tabla).eq('origen_id', origenInfo.origen_id);
    for (const prev of (previos || [])) {
      const { data: fPrev } = await sb.from('fz_proveedores').select('importe,importe_pagado').eq('id', prev.factura_id).single();
      if (fPrev) {
        const nuevoPagado = Math.max(0, Number(fPrev.importe_pagado || 0) - Number(prev.monto || 0));
        const nuevoEstatus = nuevoPagado <= 0.004 ? 'Pendiente' : (nuevoPagado >= Number(fPrev.importe) - 0.01 ? 'Pagado' : 'Parcial');
        await sb.from('fz_proveedores').update({ importe_pagado: nuevoPagado, estatus: nuevoEstatus }).eq('id', prev.factura_id);
      }
    }
    await sb.from('fz_pagos_aplicados').delete().eq('origen_tabla', origenInfo.origen_tabla).eq('origen_id', origenInfo.origen_id);
  }

  if (!idsSeleccionados.length) return { idsAfectados: [], creadoCredito: false, sobrante: 0 };
  const { data: facturas } = await sb.from('fz_proveedores').select('*').in('id', idsSeleccionados);
  if (!facturas || !facturas.length) return { idsAfectados: [], creadoCredito: false, sobrante: 0 };

  const creditos = facturas.filter(f => Number(f.importe) < 0).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const reales = facturas.filter(f => Number(f.importe) >= 0).sort((a,b)=>a.fecha.localeCompare(b.fecha));

  let disponible = montoDisponibleInicial + creditos.reduce((s,c)=>s+Math.abs(Number(c.importe)),0);
  const idsAfectados = [];
  const registrarPago = async (facturaId, monto) => {
    if (!origenInfo.origen_tabla || !origenInfo.origen_id || !monto) return;
    await sb.from('fz_pagos_aplicados').insert({ business_id: businessId, factura_id: facturaId, monto, origen_tabla: origenInfo.origen_tabla, origen_id: origenInfo.origen_id, fecha: fechaMov });
  };

  for (const c of creditos) {
    await sb.from('fz_proveedores').update({ estatus: 'Pagado', fecha_pago: fechaMov }).eq('id', c.id);
    idsAfectados.push(c.id);
    await registrarPago(c.id, Math.abs(Number(c.importe)));
  }

  for (const f of reales) {
    if (disponible <= 0.009) break;
    const saldoPendiente = Number(f.importe) - Number(f.importe_pagado || 0);
    if (saldoPendiente <= 0.009) continue;
    const aplicar = Math.min(disponible, saldoPendiente);
    const nuevoPagado = Number(f.importe_pagado || 0) + aplicar;
    const nuevoEstatus = nuevoPagado >= Number(f.importe) - 0.01 ? 'Pagado' : 'Parcial';
    const { error: errAplicar } = await sb.from('fz_proveedores').update({
      importe_pagado: nuevoPagado, estatus: nuevoEstatus, fecha_pago: fechaMov,
      pagado_desde: origenInfo.pagado_desde, pagado_desde_tipo: origenInfo.pagado_desde_tipo, pagado_desde_cuenta_id: origenInfo.pagado_desde_cuenta_id,
    }).eq('id', f.id);
    if (errAplicar) { toast('Error aplicando pago a "' + (f.factura || f.proveedor) + '": ' + errAplicar.message, 'error'); continue; }
    idsAfectados.push(f.id);
    disponible -= aplicar;
    await registrarPago(f.id, aplicar);
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

async function aplicarCobroFacturas(idsSeleccionados, montoDisponibleInicial, fecha, businessId, origenInfo) {
  // Si este movimiento ya tenía un desglose de cobro guardado (se está editando la selección),
  // primero revertimos esos montos exactos.
  if (origenInfo.origen_tabla && origenInfo.origen_id) {
    const { data: previos } = await sb.from('fz_cobros_aplicados').select('*').eq('origen_tabla', origenInfo.origen_tabla).eq('origen_id', origenInfo.origen_id);
    for (const prev of (previos || [])) {
      const { data: fPrev } = await sb.from('fz_facturas_clientes').select('total,importe_pagado').eq('id', prev.factura_id).single();
      if (fPrev) {
        const nuevoPagado = Math.max(0, Number(fPrev.importe_pagado || 0) - Number(prev.monto || 0));
        const nuevoEstatus = nuevoPagado <= 0.004 ? 'Pendiente' : (nuevoPagado >= Number(fPrev.total) - 0.01 ? 'Pagado' : 'Parcial');
        await sb.from('fz_facturas_clientes').update({ importe_pagado: nuevoPagado, estatus: nuevoEstatus }).eq('id', prev.factura_id);
      }
    }
    await sb.from('fz_cobros_aplicados').delete().eq('origen_tabla', origenInfo.origen_tabla).eq('origen_id', origenInfo.origen_id);
  }

  if (!idsSeleccionados.length) return { idsAfectados: [] };
  const { data: facturas } = await sb.from('fz_facturas_clientes').select('*').in('id', idsSeleccionados);
  if (!facturas || !facturas.length) return { idsAfectados: [] };

  let disponible = montoDisponibleInicial;
  const idsAfectados = [];
  for (const f of facturas.sort((a,b) => a.fecha.localeCompare(b.fecha))) {
    if (disponible <= 0.009) break;
    const saldoPendiente = Number(f.total) - Number(f.importe_pagado || 0);
    if (saldoPendiente <= 0.009) continue;
    const aplicar = Math.min(disponible, saldoPendiente);
    const nuevoPagado = Number(f.importe_pagado || 0) + aplicar;
    const nuevoEstatus = nuevoPagado >= Number(f.total) - 0.01 ? 'Pagado' : 'Parcial';
    const { error } = await sb.from('fz_facturas_clientes').update({ importe_pagado: nuevoPagado, estatus: nuevoEstatus, fecha_pago: fecha }).eq('id', f.id);
    if (error) { toast('Error aplicando cobro a factura #' + f.folio + ': ' + error.message, 'error'); continue; }
    idsAfectados.push(f.id);
    disponible -= aplicar;
    if (origenInfo.origen_tabla && origenInfo.origen_id) {
      await sb.from('fz_cobros_aplicados').insert({ business_id: businessId, factura_id: f.id, monto: aplicar, origen_tabla: origenInfo.origen_tabla, origen_id: origenInfo.origen_id, fecha });
    }
  }
  return { idsAfectados, sobrante: disponible };
}

function openFacturasCobroModal(rowId, table, facturasClientesPend, onDone) {
  (async () => {
    const { data: row } = await sb.from(table).select('*').eq('id', rowId).single();
    const idsActuales = new Set(facturaIdsClienteDe(row || {}));
    const montoMovimiento = Number(row?.depositos) || 0;
    const opciones = facturasClientesPend.filter(f => f.estatus !== 'Pagado' || idsActuales.has(f.id));
    const porCliente = {};
    opciones.forEach(f => {
      const key = f.clienteNombre || '(sin cliente)';
      (porCliente[key] = porCliente[key] || []).push(f);
    });
    Object.values(porCliente).forEach(lista => lista.sort((a,b) => a.fecha.localeCompare(b.fecha)));
    const box = document.getElementById('facturasPagoList');
    const nombresCliente = Object.keys(porCliente).sort((a,b)=>a.localeCompare(b));
    document.querySelector('#modalFacturasPago h3').textContent = 'Elegir facturas a cobrar';
    document.querySelector('#modalFacturasPago p').textContent = 'Marca todas las que se cobren con este depósito. Se marcarán como "Pagado" al aplicar.';
    box.innerHTML = nombresCliente.map(cli => `
      <div class="factura-provgroup" data-prov="${cli.toLowerCase()}" style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:12.5px;color:var(--navy-1);margin-bottom:4px;">${cli}</div>
        ${porCliente[cli].map(f => {
          const saldo = Number(f.total) - Number(f.importe_pagado||0);
          return `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--line);font-size:13px;cursor:pointer;">
            <input type="checkbox" class="factura-check" value="${f.id}" data-importe="${saldo}" ${idsActuales.has(f.id)?'checked':''}>
            <span>${f.fecha} · Factura #${f.folio} · ${fmt(saldo)}${f.estatus==='Parcial'?' (parcial, de '+fmt(f.total)+')':''}${f.estatus==='Pagado'?' (ya pagada)':''}</span>
          </label>`;
        }).join('')}
      </div>`).join('') || `<div class="empty">No hay facturas pendientes de cobro.</div>`;

    const selectProv = document.getElementById('facturasPagoSelectProv');
    const buscarProv = document.getElementById('facturasPagoBuscarProv');
    selectProv.innerHTML = `<option value="">— todos los clientes —</option>` + nombresCliente.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join('');
    buscarProv.placeholder = '🔎 Buscar cliente…';
    buscarProv.value = '';
    const aplicarFiltro = () => {
      const porTexto = buscarProv.value.trim().toLowerCase();
      const porSelect = selectProv.value;
      box.querySelectorAll('.factura-provgroup').forEach(grp => {
        const nombre = grp.dataset.prov;
        const pasaTexto = !porTexto || nombre.includes(porTexto);
        const pasaSelect = !porSelect || nombre === porSelect;
        grp.style.display = (pasaTexto && pasaSelect) ? '' : 'none';
      });
    };
    buscarProv.oninput = () => { selectProv.value = ''; aplicarFiltro(); };
    selectProv.onchange = () => { buscarProv.value = ''; aplicarFiltro(); };

    const actualizarResumen = () => {
      const marcadas = Array.from(box.querySelectorAll('.factura-check:checked'));
      const totalSeleccionado = marcadas.reduce((s,c) => s + (Number(c.dataset.importe) || 0), 0);
      const diferencia = montoMovimiento - totalSeleccionado;
      const cuadra = Math.abs(diferencia) < 0.01;
      document.getElementById('facturasPagoResumen').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span>Monto del depósito</span><strong>${fmt(montoMovimiento)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span>Total seleccionado (${marcadas.length})</span><strong>${fmt(totalSeleccionado)}</strong></div>
        <div style="display:flex;justify-content:space-between;color:${cuadra?'var(--green)':'var(--muted)'};font-weight:700;"><span>${cuadra?'✓ Cuadra exacto':(diferencia>0?'Si aplicas, sobrará sin asignar':'Si aplicas, quedará pendiente/parcial')}</span><span>${cuadra?'':fmt(Math.abs(diferencia))}</span></div>
      `;
    };
    box.querySelectorAll('.factura-check').forEach(chk => chk.addEventListener('change', actualizarResumen));
    actualizarResumen();

    document.getElementById('modalFacturasPago').classList.add('show');
    document.getElementById('closeFacturasPago').onclick = () => document.getElementById('modalFacturasPago').classList.remove('show');
    document.getElementById('applyFacturasPago').onclick = async () => {
      const idsSeleccionados = Array.from(box.querySelectorAll('.factura-check:checked')).map(c => c.value);
      const { idsAfectados } = await aplicarCobroFacturas(idsSeleccionados, montoMovimiento, row?.fecha || todayStr(), row.business_id, {
        origen_tabla: table, origen_id: rowId,
      });
      const { error: e1 } = await sb.from(table).update({ cliente_factura_ids: idsAfectados, cliente_factura_id: idsAfectados[0] || null }).eq('id', rowId);
      if (e1) { toast('Error al guardar: ' + e1.message, 'error'); return; }
      if (idsAfectados.length) toast(`${idsAfectados.length} factura(s) actualizada(s).`);
      document.getElementById('modalFacturasPago').classList.remove('show');
      onDone();
    };
  })();
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
    document.querySelector('#modalFacturasPago h3').textContent = 'Elegir facturas a pagar';
    document.querySelector('#modalFacturasPago p').textContent = 'Marca todas las que se paguen con este movimiento. Se marcarán como "Pagado" al aplicar.';
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
    buscarProv.placeholder = '🔎 Buscar proveedor…';
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
        origen_tabla: table, origen_id: rowId,
      });
      const { error: e1 } = await sb.from(table).update({ proveedor_factura_ids: idsAfectados, proveedor_factura_id: idsAfectados[0] || null }).eq('id', rowId);
      if (e1) { toast('Error al guardar: ' + e1.message, 'error'); return; }
      if (idsAfectados.length) toast(`${idsAfectados.length} registro(s) actualizado(s)${creadoCredito ? ' · se generó un crédito a favor' : ''}.`);
      document.getElementById('modalFacturasPago').classList.remove('show');
      onDone();
    };
  })();
}

async function loadFacturasClientesPendConNombre(businessId) {
  const [facturasQ, clientesQ] = await Promise.all([
    sb.from('fz_facturas_clientes').select('id,folio,total,importe_pagado,estatus,fecha,cliente_id').eq('business_id', businessId).order('fecha'),
    loadClientes(businessId),
  ]);
  const nombreCliente = Object.fromEntries(clientesQ.map(c => [c.id, c.razon_social || c.nombre_comercial]));
  return (facturasQ.data || []).map(f => ({ ...f, clienteNombre: nombreCliente[f.cliente_id] || '(cliente eliminado)' }));
}

function facturaIdsClienteDe(r) {
  if (Array.isArray(r.cliente_factura_ids) && r.cliente_factura_ids.length) return r.cliente_factura_ids;
  if (r.cliente_factura_id) return [r.cliente_factura_id];
  return [];
}
function entradaCellsHtml(r, facturasClientesPend, prefix) {
  if (r.tipo_salida === 'traspaso') {
    return `<td data-entrada-tipo-cell="${r.id}"><span style="color:var(--muted);">Traspaso</span></td><td data-entrada-detalle-cell="${r.id}">—</td>`;
  }
  const tipo = r.tipo_entrada || 'otro';
  const tipoSelect = `<select class="cell entrada-tipo" data-id="${r.id}">
    <option value="otro" ${tipo==='otro'?'selected':''}>Sin clasificar</option>
    <option value="cliente" ${tipo==='cliente'?'selected':''}>Cobro de cliente</option>
  </select>`;
  let detalle = '—';
  if (tipo === 'cliente') {
    const idsVinculados = facturaIdsClienteDe(r);
    detalle = `<button class="btn btn-ghost btn-sm entrada-abrir-facturas" data-id="${r.id}">${idsVinculados.length ? idsVinculados.length + ' factura(s)' : 'Elegir facturas'}</button>`;
  }
  return `<td data-entrada-tipo-cell="${r.id}">${tipoSelect}</td><td data-entrada-detalle-cell="${r.id}">${detalle}</td>`;
}
function wireEntradaCellHandlers(container, table, onChange, facturasClientesPend, ledger, prefix) {
  const reemplazarCeldasDeFila = (rowId) => {
    if (!ledger) { onChange(); return; }
    const rowObj = ledger.find(x => x.id === rowId);
    if (!rowObj) { onChange(); return; }
    const tr = container.querySelector(`[data-entrada-tipo-cell="${rowId}"]`)?.closest('tr');
    if (!tr) { onChange(); return; }
    const nuevoHtml = entradaCellsHtml(rowObj, facturasClientesPend, prefix);
    const tempRow = document.createElement('tr');
    tempRow.innerHTML = nuevoHtml;
    const tipoCellVieja = tr.querySelector(`[data-entrada-tipo-cell="${rowId}"]`);
    const detalleCellVieja = tr.querySelector(`[data-entrada-detalle-cell="${rowId}"]`);
    const [nuevaTipoCell, nuevaDetalleCell] = Array.from(tempRow.children);
    if (tipoCellVieja) tipoCellVieja.replaceWith(nuevaTipoCell);
    if (detalleCellVieja) detalleCellVieja.replaceWith(nuevaDetalleCell);
    wireEntradaCellHandlers(tr, table, onChange, facturasClientesPend, ledger, prefix);
    const foco = nuevaDetalleCell.querySelector('select, button');
    if (foco) foco.focus();
  };
  container.querySelectorAll('.entrada-tipo').forEach(sel => sel.addEventListener('change', async () => {
    const { error } = await sb.from(table).update({ tipo_entrada: sel.value, cliente_factura_id: null, cliente_factura_ids: [] }).eq('id', sel.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (ledger) {
      const rowObj = ledger.find(x => x.id === sel.dataset.id);
      if (rowObj) { rowObj.tipo_entrada = sel.value; rowObj.cliente_factura_id = null; rowObj.cliente_factura_ids = []; }
    }
    reemplazarCeldasDeFila(sel.dataset.id);
  }));
  container.querySelectorAll('.entrada-abrir-facturas').forEach(btn => btn.addEventListener('click', () => {
    openFacturasCobroModal(btn.dataset.id, table, facturasClientesPend, onChange);
  }));
}

let STATE_movArchivosPendientes = [];
function renderMovAdjuntoPendiente() {
  const box = document.getElementById('movAdjuntoCell');
  const pendientes = STATE_movArchivosPendientes;
  box.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
    ${pendientes.map((f, i) => `<span style="font-size:12px;color:var(--navy-1);background:#f7f9fc;border-radius:5px;padding:2px 6px;">${f.name} <button class="quitar-mov-adjunto-pendiente" data-idx="${i}" style="border:none;background:none;color:var(--red);cursor:pointer;">✕</button></span>`).join('')}
    <label style="font-size:12px;color:var(--navy-3);text-decoration:underline;cursor:pointer;">${pendientes.length?'+ Agregar otro':'Adjuntar'} (se sube al guardar)<input type="file" accept=".pdf,.jpg,.jpeg,.png" class="mov-adjunto-pendiente-input" style="display:none;"></label>
  </span>`;
  const input = box.querySelector('.mov-adjunto-pendiente-input');
  if (input) input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ADJUNTOS_EXT_PERMITIDAS.includes(ext)) { toast('Solo se permiten archivos PDF, JPG o PNG.', 'error'); return; }
    if (file.size > ADJUNTOS_MAX_MB * 1024 * 1024) { toast(`El archivo pesa más de ${ADJUNTOS_MAX_MB} MB.`, 'error'); return; }
    STATE_movArchivosPendientes.push(file);
    renderMovAdjuntoPendiente();
  });
  box.querySelectorAll('.quitar-mov-adjunto-pendiente').forEach(btn => btn.addEventListener('click', () => {
    STATE_movArchivosPendientes.splice(Number(btn.dataset.idx), 1);
    renderMovAdjuntoPendiente();
  }));
}
async function openMovimientoModal(contexto, movimientoExistente) {
  const modal = document.getElementById('modalMovimiento');
  document.getElementById('modalMovimientoTitulo').textContent = movimientoExistente ? 'Editar movimiento' : 'Agregar movimiento';
  document.getElementById('movFecha').value = movimientoExistente?.fecha || todayStr();
  document.getElementById('movCampo1').value = movimientoExistente?.proveedor || '';
  document.getElementById('movConcepto').value = movimientoExistente?.concepto || '';
  document.getElementById('movReferencia').value = movimientoExistente?.referencia || '';
  document.getElementById('movDescripcion').value = movimientoExistente?.descripcion || '';
  document.getElementById('movCargos').value = movimientoExistente?.cargos || 0;
  document.getElementById('movDepositos').value = movimientoExistente?.depositos || 0;
  document.getElementById('movSubcuentaWrap').style.display = 'none';
  document.getElementById('movFacturasWrap').style.display = 'none';
  document.getElementById('movFacturasClienteWrap').style.display = 'none';
  document.getElementById('deleteMovimiento').style.display = movimientoExistente ? '' : 'none';

  if (contexto.tipo === 'efectivo') {
    document.getElementById('movLabel1').textContent = 'Proveedor';
    document.getElementById('movCampo1').placeholder = 'Ej. Distribuidora de Bebidas';
    document.getElementById('movConceptoWrap').style.display = 'none';
    document.getElementById('movReferenciaWrap').style.display = 'none';
  } else {
    document.getElementById('movLabel1').textContent = 'Proveedor';
    document.getElementById('movCampo1').placeholder = 'Ej. Distribuidora de Bebidas';
    document.getElementById('movConceptoWrap').style.display = 'block';
    document.getElementById('movReferenciaWrap').style.display = 'block';
  }

  // Datos para clasificar (subcuentas y facturas pendientes) y para el nombre de "pagado desde"
  const [subcuentas, mayores, facturasPend, cuentaInfo, facturasClientesPend] = await Promise.all([
    loadSubcuentas(contexto.businessId),
    loadCuentasMayor(contexto.businessId),
    sb.from('fz_proveedores').select('id,proveedor,fecha,factura,importe,importe_pagado,estatus').eq('business_id', contexto.businessId).order('fecha', { ascending: false }).limit(5000).then(r => r.data || []),
    contexto.tipo === 'efectivo'
      ? sb.from('fz_efectivo_monedas').select('nombre').eq('id', contexto.refId).single().then(r => r.data)
      : sb.from('fz_bancos_cuentas').select('nombre').eq('id', contexto.refId).single().then(r => r.data),
    loadFacturasClientesPendConNombre(contexto.businessId),
  ]);
  const origenCorto = contexto.tipo === 'efectivo' ? 'Caja — ' + (cuentaInfo?.nombre || '') : 'Banco — ' + (cuentaInfo?.nombre || '');

  document.getElementById('movSubcuenta').innerHTML = `<option value="">— elegir subcuenta —</option>` +
    opcionesSubcuentaHtml(subcuentas, mayores, movimientoExistente?.subcuenta_id || null);

  const idsProvYaVinculados = movimientoExistente ? facturaIdsDe(movimientoExistente) : [];
  const pendientes = facturasPend.filter(f => f.estatus !== 'Pagado' || idsProvYaVinculados.includes(f.id));
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
          <input type="checkbox" class="mov-factura-check" value="${f.id}" data-importe="${saldo}" ${idsProvYaVinculados.includes(f.id)?'checked':''}>
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

  // Espejo, del lado de clientes: facturas pendientes de cobro
  const idsClienteYaVinculados = movimientoExistente ? facturaIdsClienteDe(movimientoExistente) : [];
  const pendientesCliente = facturasClientesPend.filter(f => f.estatus !== 'Pagado' || idsClienteYaVinculados.includes(f.id));
  const porClienteMov = {};
  pendientesCliente.forEach(f => { const key = f.clienteNombre || '(sin cliente)'; (porClienteMov[key] = porClienteMov[key] || []).push(f); });
  Object.values(porClienteMov).forEach(lista => lista.sort((a,b) => a.fecha.localeCompare(b.fecha)));
  const nombresClienteMov = Object.keys(porClienteMov).sort((a,b)=>a.localeCompare(b));
  const movFacturasClienteBox = document.getElementById('movFacturasClienteList');
  movFacturasClienteBox.innerHTML = nombresClienteMov.map(cli => `
    <div class="factura-provgroup" data-prov="${cli.toLowerCase()}" style="margin-bottom:8px;">
      <div style="font-weight:700;font-size:12px;color:var(--navy-1);">${cli}</div>
      ${porClienteMov[cli].map(f => {
        const saldo = Number(f.total) - Number(f.importe_pagado||0);
        return `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:12.5px;cursor:pointer;">
          <input type="checkbox" class="mov-factura-cliente-check" value="${f.id}" data-importe="${saldo}" ${idsClienteYaVinculados.includes(f.id)?'checked':''}>
          <span>${f.fecha} · Factura #${f.folio} · ${fmt(saldo)}${f.estatus==='Parcial'?' (parcial)':''}</span>
        </label>`;
      }).join('')}
    </div>`).join('') || `<div class="empty" style="padding:8px;">No hay facturas pendientes de cobro.</div>`;

  const movSelectCliente = document.getElementById('movFacturasClienteSelect');
  const movBuscarCliente = document.getElementById('movFacturasClienteBuscar');
  movSelectCliente.innerHTML = `<option value="">— todos los clientes —</option>` + nombresClienteMov.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join('');
  movBuscarCliente.value = '';
  const aplicarFiltroClienteMov = () => {
    const porTexto = movBuscarCliente.value.trim().toLowerCase();
    const porSelect = movSelectCliente.value;
    movFacturasClienteBox.querySelectorAll('.factura-provgroup').forEach(grp => {
      const nombre = grp.dataset.prov;
      const pasaTexto = !porTexto || nombre.includes(porTexto);
      const pasaSelect = !porSelect || nombre === porSelect;
      grp.style.display = (pasaTexto && pasaSelect) ? '' : 'none';
    });
  };
  movBuscarCliente.oninput = () => { movSelectCliente.value = ''; aplicarFiltroClienteMov(); };
  movSelectCliente.onchange = () => { movBuscarCliente.value = ''; aplicarFiltroClienteMov(); };

  const actualizarResumenMovFacturasCliente = () => {
    const marcadas = Array.from(document.querySelectorAll('.mov-factura-cliente-check:checked'));
    const totalSeleccionado = marcadas.reduce((s,c)=>s+(Number(c.dataset.importe)||0),0);
    const montoMovimiento = Number(document.getElementById('movDepositos').value) || 0;
    const diferencia = montoMovimiento - totalSeleccionado;
    const cuadra = Math.abs(diferencia) < 0.01;
    document.getElementById('movFacturasClienteResumen').innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Depósito capturado</span><strong>${fmt(montoMovimiento)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Total seleccionado (${marcadas.length})</span><strong>${fmt(totalSeleccionado)}</strong></div>
      <div style="display:flex;justify-content:space-between;color:${cuadra?'var(--green)':'var(--muted)'};font-weight:700;"><span>${cuadra?'✓ Cuadra exacto':(diferencia>0?'Sobrará sin asignar':'Quedará pendiente/parcial')}</span><span>${cuadra?'':fmt(Math.abs(diferencia))}</span></div>
    `;
  };
  document.querySelectorAll('.mov-factura-cliente-check').forEach(chk => chk.addEventListener('change', actualizarResumenMovFacturasCliente));
  document.getElementById('movDepositos').oninput = actualizarResumenMovFacturasCliente;
  actualizarResumenMovFacturasCliente();

  // El tipo disponible depende de si se capturó Cargo (sale) o Depósito (entra) —
  // "Gasto"/"Pago a proveedor" solo aplican a cargos; "Cobro de cliente" solo a depósitos.
  const tipoInicial = movimientoExistente
    ? (movimientoExistente.tipo_entrada === 'cliente' ? 'cliente' : (movimientoExistente.tipo_salida || 'otro'))
    : 'otro';
  document.getElementById('movTipoSalida').value = tipoInicial;
  const actualizarOpcionesTipo = () => {
    const esDeposito = (Number(document.getElementById('movDepositos').value) || 0) > (Number(document.getElementById('movCargos').value) || 0);
    const sel = document.getElementById('movTipoSalida');
    const valorActual = sel.value;
    document.getElementById('movTipoLabel').textContent = esDeposito ? 'Tipo de entrada' : 'Tipo de salida';
    sel.innerHTML = esDeposito
      ? `<option value="otro">Sin clasificar</option><option value="cliente">Cobro de cliente</option>`
      : `<option value="otro">Sin clasificar</option><option value="gasto">Gasto</option><option value="proveedor">Pago a proveedor</option>`;
    sel.value = ['otro','cliente','gasto','proveedor'].includes(valorActual) && Array.from(sel.options).some(o=>o.value===valorActual) ? valorActual : 'otro';
  };
  document.getElementById('movCargos').addEventListener('input', actualizarOpcionesTipo);
  document.getElementById('movDepositos').addEventListener('input', actualizarOpcionesTipo);
  actualizarOpcionesTipo();

  const actualizarVisibilidadDetalle = () => {
    const val = document.getElementById('movTipoSalida').value;
    document.getElementById('movSubcuentaWrap').style.display = val === 'gasto' ? 'block' : 'none';
    document.getElementById('movFacturasWrap').style.display = val === 'proveedor' ? 'block' : 'none';
    document.getElementById('movFacturasClienteWrap').style.display = val === 'cliente' ? 'block' : 'none';
  };
  document.getElementById('movTipoSalida').onchange = actualizarVisibilidadDetalle;
  document.getElementById('movTipoSalida').oninput = actualizarVisibilidadDetalle;
  actualizarVisibilidadDetalle();

  const movAdjuntoWrap = document.getElementById('movAdjuntoWrap');
  const tablaAdjunto = contexto.tipo === 'efectivo' ? 'fz_efectivo_mov' : 'fz_bancos_mov';
  movAdjuntoWrap.style.display = '';
  if (movimientoExistente) {
    const conteo = await contarAdjuntosPorRegistro(tablaAdjunto, [movimientoExistente.id]);
    document.getElementById('movAdjuntoCell').innerHTML = adjuntosCellHtml(conteo[movimientoExistente.id], movimientoExistente.id);
    wireAdjuntosHandlers(document.getElementById('movAdjuntoCell'), tablaAdjunto, contexto.businessId, () => {});
  } else {
    STATE_movArchivosPendientes = [];
    renderMovAdjuntoPendiente();
  }

  modal.classList.add('show');
  document.getElementById('closeMovimiento').onclick = () => modal.classList.remove('show');
  document.getElementById('saveMovimiento').onclick = async () => {
    const fecha = document.getElementById('movFecha').value || todayStr();
    const cargos = Number(document.getElementById('movCargos').value) || 0;
    const depositos = Number(document.getElementById('movDepositos').value) || 0;
    const descripcion = document.getElementById('movDescripcion').value || null;
    const tipoElegido = document.getElementById('movTipoSalida').value;
    if (!cargos && !depositos) { toast('Escribe un monto en Cargos o Depósitos.', 'error'); return; }
    const esClasifCliente = tipoElegido === 'cliente';
    const idsFacturas = tipoElegido === 'proveedor' ? Array.from(document.querySelectorAll('.mov-factura-check:checked')).map(c => c.value) : [];
    const idsFacturasCliente = esClasifCliente ? Array.from(document.querySelectorAll('.mov-factura-cliente-check:checked')).map(c => c.value) : [];
    const tipoSalida = esClasifCliente ? 'otro' : tipoElegido;
    const tipoEntrada = esClasifCliente ? 'cliente' : 'otro';
    let payload, table;
    if (contexto.tipo === 'efectivo') {
      table = 'fz_efectivo_mov';
      payload = { business_id: contexto.businessId, moneda_id: contexto.refId, fecha, proveedor: document.getElementById('movCampo1').value || null, descripcion, cargos, depositos, tipo_salida: tipoSalida, tipo_entrada: tipoEntrada };
    } else {
      table = 'fz_bancos_mov';
      payload = { business_id: contexto.businessId, cuenta_id: contexto.refId, fecha, proveedor: document.getElementById('movCampo1').value || null, concepto: document.getElementById('movConcepto').value || null, referencia: document.getElementById('movReferencia').value || null, descripcion, cargos, depositos, tipo_salida: tipoSalida, tipo_entrada: tipoEntrada };
    }
    payload.subcuenta_id = tipoElegido === 'gasto' ? (document.getElementById('movSubcuenta').value || null) : null;

    const movId = movimientoExistente ? movimientoExistente.id : null;
    let nuevoMov;
    if (movId) {
      const { error } = await sb.from(table).update(payload).eq('id', movId);
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      nuevoMov = { id: movId };
    } else {
      const { data, error } = await sb.from(table).insert(payload).select().single();
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      nuevoMov = data;
      for (const file of STATE_movArchivosPendientes) {
        const subido = await subirAdjunto(table, nuevoMov.id, contexto.businessId, file);
        if (subido) await sb.from('fz_adjuntos').insert({ business_id: contexto.businessId, tabla: table, registro_id: nuevoMov.id, archivo_path: subido.path, archivo_nombre: subido.nombre });
      }
      STATE_movArchivosPendientes = [];
    }

    // Al editar, siempre revisamos ambos lados (aunque no haya nada nuevo que aplicar) para
    // revertir correctamente si el movimiento cambió de clasificación o dejó de tener facturas.
    let creadoCredito = false;
    if (movId || tipoElegido === 'proveedor') {
      const montoDisponible = cargos > 0 ? cargos : depositos;
      const resultado = await aplicarPagoFacturas(idsFacturas, montoDisponible, fecha, contexto.businessId, {
        pagado_desde: origenCorto,
        pagado_desde_tipo: contexto.tipo === 'efectivo' ? 'efectivo' : 'banco',
        pagado_desde_cuenta_id: contexto.refId,
        origen_tabla: table, origen_id: nuevoMov.id,
      });
      creadoCredito = resultado.creadoCredito;
      await sb.from(table).update({ proveedor_factura_ids: resultado.idsAfectados, proveedor_factura_id: resultado.idsAfectados[0] || null }).eq('id', nuevoMov.id);
      if (idsFacturas.length) toast(`${idsFacturas.length} factura(s) procesada(s)${creadoCredito ? ' · se generó un crédito a favor' : ''}.`);
    }
    if (movId || esClasifCliente) {
      const resultado = await aplicarCobroFacturas(idsFacturasCliente, depositos, fecha, contexto.businessId, {
        origen_tabla: table, origen_id: nuevoMov.id,
      });
      if (resultado.idsAfectados.length) toast(`${resultado.idsAfectados.length} factura(s) cobrada(s).`);
      await sb.from(table).update({ cliente_factura_ids: resultado.idsAfectados, cliente_factura_id: resultado.idsAfectados[0] || null }).eq('id', nuevoMov.id);
    }

    registrarAuditoria(contexto.businessId, movId ? 'editar' : 'crear', contexto.tipo === 'efectivo' ? 'Efectivo' : 'Bancos', `Movimiento ${fecha} · ${descripcion||payload.proveedor||''} · ${fmt(cargos>0?cargos:depositos)}`);
    modal.classList.remove('show');
    toast(movId ? 'Movimiento actualizado.' : 'Movimiento agregado.');
    if (contexto.onDone) contexto.onDone();
  };
  document.getElementById('deleteMovimiento').onclick = async () => {
    if (!movimientoExistente) return;
    const table = contexto.tipo === 'efectivo' ? 'fz_efectivo_mov' : 'fz_bancos_mov';
    await confirmarYEliminarMovimiento(table, { ...movimientoExistente, business_id: contexto.businessId }, () => {
      modal.classList.remove('show');
      if (contexto.onDone) contexto.onDone();
    });
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
    return `<td data-salida-tipo-cell="${r.id}"><span style="color:var(--muted);">Traspaso</span></td><td data-salida-detalle-cell="${r.id}">—</td>`;
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
    const subActual = subcuentas.find(s => s.id === r.subcuenta_id);
    const labelActual = subActual ? rutaSubcuenta(subActual, subcuentas, mayores) : '';
    detalle = `<input class="cell salida-detalle-buscar" list="datalistGastoSubcuentas" data-id="${r.id}" value="${labelActual.replace(/"/g,'&quot;')}" placeholder="Escribe para buscar…">`;
  } else if (tipo === 'proveedor') {
    const idsVinculados = facturaIdsDe(r);
    detalle = `<button class="btn btn-ghost btn-sm salida-abrir-facturas" data-id="${r.id}">${idsVinculados.length ? '' + idsVinculados.length + ' factura(s)' : 'Elegir facturas'}</button>`;
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
  return `<td data-salida-tipo-cell="${r.id}">${tipoSelect}</td><td data-salida-detalle-cell="${r.id}">${detalle}</td>`;
}
function sinClasificarBannerHtml(count, total) {
  if (!count) return '';
  return `<div class="card" style="background:#fff8ec;border:1px solid #f0d99a;margin-bottom:12px;padding:12px 16px;">
    <strong style="color:#8a6d1f;">${count} cargo(s) sin clasificar este mes</strong>
    <span style="color:var(--muted);"> — suman ${fmt(total)}. Ve a la columna "Tipo de salida" para clasificarlos.</span>
  </div>`;
}
function facturaIdsDe(r) {
  if (Array.isArray(r.proveedor_factura_ids) && r.proveedor_factura_ids.length) return r.proveedor_factura_ids;
  if (r.proveedor_factura_id) return [r.proveedor_factura_id];
  return [];
}

function wireSalidaCellHandlers(container, table, onChange, traspasoCtx, facturasPend, subcuentas, mayores, ledger, prefix, actualizarResumen) {
  const reemplazarCeldasDeFila = (rowId) => {
    if (!ledger) { onChange(); return; }
    const rowObj = ledger.find(x => x.id === rowId);
    if (!rowObj) { onChange(); return; }
    const tr = container.querySelector(`[data-salida-tipo-cell="${rowId}"]`)?.closest('tr');
    if (!tr) { onChange(); return; }
    const nuevoHtml = salidaCellsHtml(rowObj, subcuentas, mayores, facturasPend, prefix, traspasoCtx);
    const tempRow = document.createElement('tr');
    tempRow.innerHTML = nuevoHtml;
    const tipoCellVieja = tr.querySelector(`[data-salida-tipo-cell="${rowId}"]`);
    const detalleCellVieja = tr.querySelector(`[data-salida-detalle-cell="${rowId}"]`);
    const [nuevaTipoCell, nuevaDetalleCell] = Array.from(tempRow.children);
    if (tipoCellVieja) tipoCellVieja.replaceWith(nuevaTipoCell);
    if (detalleCellVieja) detalleCellVieja.replaceWith(nuevaDetalleCell);
    wireSalidaCellHandlers(tr, table, onChange, traspasoCtx, facturasPend, subcuentas, mayores, ledger, prefix, actualizarResumen);
    if (actualizarResumen) actualizarResumen();
    const foco = nuevaDetalleCell.querySelector('select, input');
    if (foco) foco.focus();
  };
  container.querySelectorAll('.salida-tipo').forEach(sel => sel.addEventListener('change', async () => {
    const { error } = await sb.from(table).update({ tipo_salida: sel.value, subcuenta_id: null, proveedor_factura_id: null, proveedor_factura_ids: [] }).eq('id', sel.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (ledger) {
      const rowObj = ledger.find(x => x.id === sel.dataset.id);
      if (rowObj) { rowObj.tipo_salida = sel.value; rowObj.subcuenta_id = null; rowObj.proveedor_factura_id = null; rowObj.proveedor_factura_ids = []; }
    }
    reemplazarCeldasDeFila(sel.dataset.id);
  }));
  container.querySelectorAll('.salida-detalle').forEach(sel => sel.addEventListener('change', async () => {
    const field = sel.dataset.field;
    const { error } = await sb.from(table).update({ [field]: sel.value || null }).eq('id', sel.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (ledger) { const rowObj = ledger.find(x => x.id === sel.dataset.id); if (rowObj) rowObj[field] = sel.value || null; }
    reemplazarCeldasDeFila(sel.dataset.id);
  }));
  container.querySelectorAll('.salida-detalle-buscar').forEach(inp => inp.addEventListener('change', async () => {
    const texto = inp.value.trim();
    if (!texto) {
      const { error } = await sb.from(table).update({ subcuenta_id: null }).eq('id', inp.dataset.id);
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      if (ledger) { const rowObj = ledger.find(x => x.id === inp.dataset.id); if (rowObj) rowObj.subcuenta_id = null; }
      reemplazarCeldasDeFila(inp.dataset.id);
      return;
    }
    const match = (subcuentas || []).find(s => rutaSubcuenta(s, subcuentas, mayores) === texto);
    if (!match) { toast('No se encontró esa cuenta. Elige una de la lista que aparece al escribir.', 'error'); reemplazarCeldasDeFila(inp.dataset.id); return; }
    const { error } = await sb.from(table).update({ subcuenta_id: match.id }).eq('id', inp.dataset.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (ledger) { const rowObj = ledger.find(x => x.id === inp.dataset.id); if (rowObj) rowObj.subcuenta_id = match.id; }
    reemplazarCeldasDeFila(inp.dataset.id);
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
  const { data: movs } = await sb.from('fz_efectivo_mov').select('*').eq('moneda_id', moneda.id).order('fecha').order('created_at');
  const manualRows = (movs || []).map(m => ({ ...m, auto: false }));
  const todas = [...autoRows, ...manualRows].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.created_at||'').localeCompare(b.created_at||''));
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
            <td class="num"><input class="cell tc-reporte-cell" type="text" inputmode="decimal" value="${m.tc_reporte}" data-id="${m.id}" style="width:75px;color:var(--muted);"></td>
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
          <button class="btn btn-ghost btn-sm" id="traspasoBtnEfvo">Transferir</button>
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
      const val = leerMonto(inp.value) || 1;
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
  const scrollY = window.scrollY;
  const activo = document.activeElement;
  let foco = null;
  if (activo && box && box.contains(activo)) {
    foco = {
      clases: Array.from(activo.classList), id: activo.dataset.id || null,
      campo: activo.dataset.field || null,
      selStart: typeof activo.selectionStart === 'number' ? activo.selectionStart : null,
      selEnd: typeof activo.selectionEnd === 'number' ? activo.selectionEnd : null,
    };
  }
  const [ledgerRes, subcuentas, mayores, facturasPend, cuentasBancoQ, monedasEfectivoQ, facturasClientesPend] = await Promise.all([
    getMonedaLedgerRows(businessId, moneda, conceptosEfectivo, STATE.currentMonth),
    loadSubcuentas(businessId),
    loadCuentasMayor(businessId),
    sb.from('fz_proveedores').select('id,proveedor,factura,importe,importe_pagado,estatus,fecha').eq('business_id', businessId).order('proveedor').order('fecha').limit(5000).then(r => r.data || []),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
    loadFacturasClientesPendConNombre(businessId),
  ]);
  const { saldoApertura, rows: ledger } = ledgerRes;
  const traspasoCtx = { cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasEfectivoQ.data || [], origenTipo: 'efectivo', origenId: moneda.id, origenNombre: 'la caja ' + moneda.nombre, origenCorto: 'Caja — ' + moneda.nombre };
  let saldo = saldoApertura;
  const conteoAdjuntosEfvo = await contarAdjuntosPorRegistro('fz_efectivo_mov', ledger.filter(r => !r.auto).map(r => r.id));
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
        <td></td>
      </tr>`;
    }
    return `<tr>
      <td><input class="cell mov-cell" type="date" value="${r.fecha}" data-id="${r.id}" data-field="fecha"></td>
      <td><input class="cell mov-cell" type="text" value="${r.proveedor||''}" data-id="${r.id}" data-field="proveedor"></td>
      <td><input class="cell mov-cell" type="text" value="${r.descripcion||''}" data-id="${r.id}" data-field="descripcion"></td>
      <td><input class="cell mov-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(r.cargos)}" data-id="${r.id}" data-field="cargos"></td>
      <td><input class="cell mov-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(r.depositos)}" data-id="${r.id}" data-field="depositos"></td>
      <td class="num" style="font-weight:700;">${fmtNum(saldo)}</td>
      <td style="position:relative;">
        <button class="btn btn-ghost btn-sm mov-menu-btn" data-id="${r.id}" style="padding:5px 12px;">⋯</button>
        <div class="mov-menu-dropdown" data-menu="${r.id}" style="display:none;position:absolute;right:8px;top:100%;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.14);z-index:20;min-width:120px;overflow:hidden;">
          <button class="mov-editar" data-id="${r.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;">Editar</button>
          <button class="mov-del" data-id="${r.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--red);border-top:1px solid var(--line);">Eliminar</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const totalCargosMes = ledger.reduce((s,r)=>s+(Number(r.cargos)||0),0);
  const totalDepositosMes = ledger.reduce((s,r)=>s+(Number(r.depositos)||0),0);
  const sinClasificar = ledger.filter(r => !r.auto && (r.tipo_salida || 'otro') === 'otro' && (Number(r.cargos)||0) > 0);
  const totalSinClasificar = sinClasificar.reduce((s,r)=>s+(Number(r.cargos)||0),0);
  const datalistSubcuentas = `<datalist id="datalistGastoSubcuentas">${subcuentas.map(s => `<option value="${rutaSubcuenta(s, subcuentas, mayores).replace(/"/g,'&quot;')}">`).join('')}</datalist>`;

  box.innerHTML = `
    ${datalistSubcuentas}
    <div id="sinClasificarBannerEfvo">${sinClasificarBannerHtml(sinClasificar.length, totalSinClasificar)}</div>
    <div class="card-head" style="margin-top:14px;">
      <span class="hint">Saldo al inicio de ${STATE.currentMonth}: ${fmtNum(saldoApertura)} ${moneda.nombre}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" id="importMovBtnEfvo">Importar movimientos (Excel)</button>
        <button class="btn btn-ghost btn-sm" id="addMovBtnEfvo">+ Agregar movimiento (pago en efectivo)</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Descripción</th><th>Cargos</th><th>Depósitos</th><th>Saldo</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="10" class="empty">Sin movimientos todavía.</td></tr>`}</tbody>
        <tfoot><tr class="total-row"><td colspan="3">Total ${STATE.currentMonth}</td><td class="num">${fmtNum(totalCargosMes)}</td><td class="num">${fmtNum(totalDepositosMes)}</td><td colspan="5"></td></tr></tfoot>
      </table>
    </div>
  `;

  document.getElementById('importMovBtnEfvo').addEventListener('click', () => openImportExcelModal('efectivo_mov', businessId, () => renderMonedaLedger(moneda, businessId, conceptosEfectivo), moneda.id));
  document.getElementById('addMovBtnEfvo').addEventListener('click', () => {
    openMovimientoModal({ tipo: 'efectivo', refId: moneda.id, businessId, onDone: () => renderMonedaLedger({ ...moneda }, businessId, conceptosEfectivo) });
  });
  wireInputsMoneda(box);
  box.querySelectorAll('.mov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      const val = (field === 'fecha' || field === 'proveedor' || field === 'descripcion' || field === 'factura') ? inp.value : leerMonto(inp.value);
      await sb.from('fz_efectivo_mov').update({ [field]: val }).eq('id', inp.dataset.id);
      renderMonedaLedger(moneda, businessId, conceptosEfectivo);
    });
  });
  box.querySelectorAll('.mov-menu-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = box.querySelector(`.mov-menu-dropdown[data-menu="${btn.dataset.id}"]`);
    const abierto = dropdown.style.display === 'block';
    box.querySelectorAll('.mov-menu-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = abierto ? 'none' : 'block';
  }));
  document.addEventListener('click', () => box.querySelectorAll('.mov-menu-dropdown').forEach(d => d.style.display = 'none'));
  box.querySelectorAll('.mov-editar').forEach(btn => btn.addEventListener('click', () => {
    const row = ledger.find(r => r.id === btn.dataset.id);
    if (!row) return;
    openMovimientoModal({ tipo: 'efectivo', businessId, refId: moneda.id, onDone: () => renderMonedaLedger(moneda, businessId, conceptosEfectivo) }, row);
  }));
  box.querySelectorAll('.mov-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = ledger.find(r => r.id === btn.dataset.id) || {};
      await confirmarYEliminarMovimiento('fz_efectivo_mov', { ...row, id: btn.dataset.id }, () => renderMonedaLedger(moneda, businessId, conceptosEfectivo));
    });
  });

  if (foco && foco.id) {
    const candidatos = Array.from(box.querySelectorAll(`[data-id="${foco.id}"]`)).filter(c => foco.clases.every(cl => c.classList.contains(cl)));
    const elegido = candidatos.find(c => (c.dataset.field || null) === foco.campo) || candidatos[0];
    if (elegido) {
      elegido.focus();
      if (foco.selStart !== null && elegido.setSelectionRange) {
        try { elegido.setSelectionRange(foco.selStart, foco.selEnd); } catch (e) {}
      }
      elegido.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      window.scrollTo(0, scrollY);
    }
  } else {
    window.scrollTo(0, scrollY);
  }
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
          <button class="btn btn-ghost btn-sm" id="traspasoBtnBanco">Transferir</button>
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
  const scrollY = window.scrollY;
  const activo = document.activeElement;
  let foco = null;
  if (activo && box && box.contains(activo)) {
    foco = {
      clases: Array.from(activo.classList), id: activo.dataset.id || null,
      campo: activo.dataset.field || null,
      selStart: typeof activo.selectionStart === 'number' ? activo.selectionStart : null,
      selEnd: typeof activo.selectionEnd === 'number' ? activo.selectionEnd : null,
    };
  }
  const cuentaQ = await sb.from('fz_bancos_cuentas').select('*').eq('id', cuentaId).single();
  const cuentaArr = cuentaQ.data;
  if (!conceptosTarjetas) {
    const { data } = await sb.from('fz_conceptos').select('*').eq('business_id', businessId).in('categoria', ['tarjetas','bancos']);
    conceptosTarjetas = data || [];
  }
  const [ledgerRes, subcuentas, mayores, facturasPend, cuentasBancoQ, monedasEfectivoQ, facturasClientesPend] = await Promise.all([
    getBancoLedgerRows(businessId, cuentaArr, conceptosTarjetas, STATE.currentMonth),
    loadSubcuentas(businessId),
    loadCuentasMayor(businessId),
    sb.from('fz_proveedores').select('id,proveedor,factura,importe,importe_pagado,estatus,fecha').eq('business_id', businessId).order('proveedor').order('fecha').limit(5000).then(r => r.data || []),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
    loadFacturasClientesPendConNombre(businessId),
  ]);
  const { saldoApertura, rows: ledger } = ledgerRes;
  const traspasoCtx = { cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasEfectivoQ.data || [], origenTipo: 'banco', origenId: cuentaId, origenNombre: 'el banco ' + (cuentaArr?.nombre || ''), origenCorto: 'Banco — ' + (cuentaArr?.nombre || '') };
  let saldo = saldoApertura;
  const conteoAdjuntosBanco = await contarAdjuntosPorRegistro('fz_bancos_mov', ledger.filter(m => !m.auto).map(m => m.id));
  const rowsHtml = ledger.map(m => {
    saldo += (Number(m.depositos)||0) - (Number(m.cargos)||0);
    if (m.auto) {
      return `<tr style="background:#f7f9fc;">
        <td>${fechaCorta(m.fecha)}</td>
        <td><em>${m.proveedor||''}</em> <span style="color:var(--muted);font-size:11px;">· auto</span></td>
        <td>${m.descripcion}</td>
        <td class="num">${fmtNum(m.depositos)}</td>
        <td class="num">${fmtNum(m.cargos)}</td>
        <td class="num" style="font-weight:700;">${fmt(saldo)}</td>
        <td></td>
      </tr>`;
    }
    return `<tr>
      <td><input class="cell mov-cell" type="date" value="${m.fecha}" data-id="${m.id}" data-field="fecha"></td>
      <td><input class="cell mov-cell" type="text" value="${m.proveedor||''}" data-id="${m.id}" data-field="proveedor"></td>
      <td><input class="cell mov-cell" type="text" value="${m.descripcion||''}" data-id="${m.id}" data-field="descripcion"></td>
      <td><input class="cell mov-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(m.depositos)}" data-id="${m.id}" data-field="depositos"></td>
      <td><input class="cell mov-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(m.cargos)}" data-id="${m.id}" data-field="cargos"></td>
      <td class="num" style="font-weight:700;">${fmt(saldo)}</td>
      <td style="position:relative;">
        <button class="btn btn-ghost btn-sm mov-menu-btn" data-id="${m.id}" style="padding:5px 12px;">⋯</button>
        <div class="mov-menu-dropdown" data-menu="${m.id}" style="display:none;position:absolute;right:8px;top:100%;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.14);z-index:20;min-width:120px;overflow:hidden;">
          <button class="mov-editar" data-id="${m.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;">Editar</button>
          <button class="mov-del" data-id="${m.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--red);border-top:1px solid var(--line);">Eliminar</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const totalDepositosMes = ledger.reduce((s,m)=>s+(Number(m.depositos)||0),0);
  const totalCargosMes = ledger.reduce((s,m)=>s+(Number(m.cargos)||0),0);
  const sinClasificar = ledger.filter(m => !m.auto && (m.tipo_salida || 'otro') === 'otro' && (Number(m.cargos)||0) > 0);
  const totalSinClasificar = sinClasificar.reduce((s,m)=>s+(Number(m.cargos)||0),0);
  const datalistSubcuentas = `<datalist id="datalistGastoSubcuentas">${subcuentas.map(s => `<option value="${rutaSubcuenta(s, subcuentas, mayores).replace(/"/g,'&quot;')}">`).join('')}</datalist>`;

  box.innerHTML = `
    ${datalistSubcuentas}
    <div id="sinClasificarBannerBanco">${sinClasificarBannerHtml(sinClasificar.length, totalSinClasificar)}</div>
    <div class="card-head" style="margin-top:14px;">
      <span class="hint">Saldo al inicio de ${STATE.currentMonth}: ${fmt(saldoApertura)}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" id="importMovBtn">Importar movimientos (Excel)</button>
        <button class="btn btn-ghost btn-sm" id="addMovBtnBanco">+ Agregar movimiento</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Descripción</th><th>Depósitos</th><th>Cargos</th><th>Saldo</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="11" class="empty">Sin movimientos.</td></tr>`}</tbody>
        <tfoot><tr class="total-row"><td colspan="4">Total ${STATE.currentMonth}</td><td class="num">${fmtNum(totalDepositosMes)}</td><td class="num">${fmtNum(totalCargosMes)}</td><td colspan="5"></td></tr></tfoot>
      </table>
    </div>
  `;

  document.getElementById('importMovBtn').addEventListener('click', () => openImportExcelModal('bancos_mov', businessId, () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas), cuentaId));
  document.getElementById('addMovBtnBanco').addEventListener('click', () => {
    openMovimientoModal({ tipo: 'banco', refId: cuentaId, businessId, onDone: () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas) });
  });
  wireInputsMoneda(box);
  box.querySelectorAll('.mov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      const val = (field === 'fecha' || field === 'descripcion' || field === 'concepto' || field === 'referencia') ? inp.value : leerMonto(inp.value);
      await sb.from('fz_bancos_mov').update({ [field]: val }).eq('id', inp.dataset.id);
      renderBancoLedger(cuentaId, businessId, conceptosTarjetas);
    });
  });
  box.querySelectorAll('.mov-menu-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = box.querySelector(`.mov-menu-dropdown[data-menu="${btn.dataset.id}"]`);
    const abierto = dropdown.style.display === 'block';
    box.querySelectorAll('.mov-menu-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = abierto ? 'none' : 'block';
  }));
  document.addEventListener('click', () => box.querySelectorAll('.mov-menu-dropdown').forEach(d => d.style.display = 'none'));
  box.querySelectorAll('.mov-editar').forEach(btn => btn.addEventListener('click', () => {
    const row = ledger.find(r => r.id === btn.dataset.id);
    if (!row) return;
    openMovimientoModal({ tipo: 'banco', businessId, refId: cuentaId, onDone: () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas) }, row);
  }));
  box.querySelectorAll('.mov-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = ledger.find(r => r.id === btn.dataset.id) || {};
      await confirmarYEliminarMovimiento('fz_bancos_mov', { ...row, id: btn.dataset.id }, () => renderBancoLedger(cuentaId, businessId, conceptosTarjetas));
    });
  });

  if (foco && foco.id) {
    const candidatos = Array.from(box.querySelectorAll(`[data-id="${foco.id}"]`)).filter(c => foco.clases.every(cl => c.classList.contains(cl)));
    const elegido = candidatos.find(c => (c.dataset.field || null) === foco.campo) || candidatos[0];
    if (elegido) {
      elegido.focus();
      if (foco.selStart !== null && elegido.setSelectionRange) {
        try { elegido.setSelectionRange(foco.selStart, foco.selEnd); } catch (e) {}
      }
      elegido.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      window.scrollTo(0, scrollY);
    }
  } else {
    window.scrollTo(0, scrollY);
  }
}

/* ============================================================
   PROVEEDORES
   ============================================================ */
let STATE_provFiltro = 'Pendiente';
let STATE_provExpandido = null;

let STATE_provVista = 'directorio'; // 'facturas' | 'directorio' | 'detalle'
let STATE_provDetalleKey = null;
let STATE_provDetalleNombre = '';

function claveProveedor(f) {
  return f.proveedor_id ? `id:${f.proveedor_id}` : `name:${f.proveedor || '(sin proveedor)'}`;
}

function provTabsHtml() {
  return `<div class="tag-row" style="margin-bottom:14px;">
    <div class="tag ${STATE_provVista==='facturas'?'active':''}" id="provTabFacturas">Facturas</div>
    <div class="tag ${STATE_provVista==='directorio'||STATE_provVista==='detalle'?'active':''}" id="provTabDirectorio">Directorio de proveedores</div>
  </div>`;
}
function wireProvTabs(el) {
  document.getElementById('provTabFacturas').addEventListener('click', () => { STATE_provVista = 'facturas'; renderProveedores(); });
  document.getElementById('provTabDirectorio').addEventListener('click', () => { STATE_provVista = 'directorio'; renderProveedores(); });
}

async function renderProveedores() {
  const el = document.getElementById('sec-proveedores');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }

  if (STATE_provVista === 'directorio') { await renderDirectorioProveedores(el, b); return; }
  if (STATE_provVista === 'detalle') { await renderProveedorDetalle(el, b); return; }

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
  const conteoAdjuntosProv = await contarAdjuntosPorRegistro('fz_proveedores', rows.map(p => p.id));

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
    ${provTabsHtml()}
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
          <button class="btn btn-ghost btn-sm" id="importFacturasBtn">Importar facturas (Excel)</button>
          <button class="btn btn-ghost btn-sm" id="provisionarPropinasBtn">Poner al día propinas</button>
          <button class="btn btn-gold btn-sm" id="addProvBtn">+ Agregar factura</button>
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Al marcar "Pagado" y elegir de dónde, se crea/actualiza automáticamente el movimiento real en esa cuenta (y se descuenta su saldo).</p>
      <div class="tag-row">
        ${['Pendiente','Todos','Pagado'].map(f => `<div class="tag prov-tab ${STATE_provFiltro===f?'active':''}" data-f="${f}">${f}</div>`).join('')}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Importe</th><th>Desglose</th><th>Estatus</th><th>Fecha pago</th><th>Pagado desde</th><th>Adjunto</th><th></th></tr></thead>
          <tbody>
            ${rows.map(p => provRowHtml(p, catalogo, opcionesPagoDesde, conteoAdjuntosProv[p.id], all)).join('') || `<tr><td colspan="9" class="empty">Sin registros.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('addProvBtn').addEventListener('click', async () => {
    await openModalFacturaProveedor(null, b.id, catalogo, opcionesPagoDesde);
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
  wireInputsMoneda(el);
  el.querySelectorAll('.prov-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      let val = inp.value;
      if (field === 'importe') val = leerMonto(val);
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
      if (field === 'estatus') {
        await syncPagoProveedor(b.id, inp.dataset.id);
        const factura = all.find(x => x.id === inp.dataset.id);
        registrarAuditoria(b.id, 'editar', 'Proveedores', `${factura?.proveedor||'(sin proveedor)'} · factura ${factura?.factura||'s/f'} · estatus → ${val}`);
      }
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
  el.querySelectorAll('.prov-menu-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = el.querySelector(`.prov-menu-dropdown[data-menu="${btn.dataset.id}"]`);
    const abierto = dropdown.style.display === 'block';
    el.querySelectorAll('.prov-menu-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = abierto ? 'none' : 'block';
  }));
  document.addEventListener('click', () => el.querySelectorAll('.prov-menu-dropdown').forEach(d => d.style.display = 'none'));
  el.querySelectorAll('.prov-editar').forEach(btn => btn.addEventListener('click', async () => {
    const info = all.find(x => x.id === btn.dataset.id);
    if (info) await openModalFacturaProveedor(info, b.id, catalogo, opcionesPagoDesde);
  }));
  el.querySelectorAll('.prov-del').forEach(btn => btn.addEventListener('click', async () => {
    const r = await eliminarFacturaProveedorConCascada(btn.dataset.id, b.id);
    if (r.ok) renderProveedores();
  }));
  el.querySelectorAll('.prov-desglosar').forEach(btn => btn.addEventListener('click', async () => {
    const info = all.find(x => x.id === btn.dataset.id);
    if (info) await openModalFacturaProveedor(info, b.id, catalogo, opcionesPagoDesde);
  }));
  wireAdjuntosHandlers(el, 'fz_proveedores', b.id, renderProveedores);
  wireProvTabs(el);
  window.scrollTo(0, scrollY);
}

async function verDesglosePago(origenTabla, origenId, businessId) {
  const nombreTabla = origenTabla === 'fz_bancos_mov' ? 'Banco' : 'Efectivo';
  const { data: mov } = await sb.from(origenTabla).select('*').eq('id', origenId).single();
  if (!mov) return;
  document.getElementById('modalPagosFactura').classList.add('show');
  document.getElementById('pagosFacturaTitulo').textContent = `Pago desde ${nombreTabla}`;
  const info = document.getElementById('pagosFacturaInfo');
  const list = document.getElementById('pagosFacturaList');
  info.innerHTML = `${fechaCorta(mov.fecha)} · ${mov.descripcion || mov.concepto || mov.proveedor || ''} · Importe total <strong>${fmt(mov.cargos)}</strong> <button class="btn btn-ghost btn-sm" id="pagosFacturaAbrirMov" style="font-size:11px;padding:3px 8px;margin-left:6px;">Abrir movimiento ↗</button>`;
  document.getElementById('pagosFacturaAbrirMov').onclick = () => {
    document.getElementById('modalPagosFactura').classList.remove('show');
    abrirOrigenDesdeDetalle({ tipo: origenTabla==='fz_bancos_mov'?'bancos':'efectivo', id: mov.id, cuentaId: mov.cuenta_id, monedaId: mov.moneda_id, fecha: mov.fecha }, businessId);
  };
  list.innerHTML = `<p class="empty">Cargando…</p>`;

  const { data: pagos } = await sb.from('fz_pagos_aplicados').select('*').eq('origen_tabla', origenTabla).eq('origen_id', origenId);
  if (!pagos || !pagos.length) {
    // Pago de antes de este rastreo: no tenemos el desglose exacto guardado
    const idsFacturas = facturaIdsDe(mov);
    const { data: facturasViejas } = idsFacturas.length ? await sb.from('fz_proveedores').select('*').in('id', idsFacturas) : { data: [] };
    list.innerHTML = (facturasViejas && facturasViejas.length) ? `
      <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Este pago se registró antes de guardar el desglose exacto por factura — se listan las facturas que cubrió, sin el monto exacto de cada una.</p>
      <table style="width:100%;">
        <thead><tr><th>Factura</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${facturasViejas.map(f => `<tr><td>${f.factura||'s/f'} — ${f.proveedor||''}</td><td>${fechaCorta(f.fecha)}</td><td><button class="btn btn-ghost btn-sm pagos-ver-factura" data-id="${f.id}" style="font-size:11px;padding:3px 8px;">Ver factura</button></td></tr>`).join('')}</tbody>
      </table>` : `<p class="empty" style="padding:10px 0;">No se encontró ninguna factura vinculada a este pago.</p>`;
  } else {
    const facturaIds = pagos.map(p => p.factura_id);
    const { data: facturas } = await sb.from('fz_proveedores').select('*').in('id', facturaIds);
    const facturaMap = Object.fromEntries((facturas || []).map(f => [f.id, f]));
    list.innerHTML = `
      <table style="width:100%;">
        <thead><tr><th>Factura</th><th>Vencimiento</th><th>Importe original</th><th>Pago aplicado</th></tr></thead>
        <tbody>${pagos.map(p => {
          const f = facturaMap[p.factura_id];
          return `<tr>
            <td>${f?.factura || 's/f'}${f ? ' — ' + (f.proveedor||'') : ''}</td>
            <td>${f ? fechaCorta(f.fecha) : ''}</td>
            <td class="num">${f ? fmt(f.importe) : ''}</td>
            <td class="num" style="font-weight:600;">${fmt(p.monto)}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr class="total-row"><td colspan="3">Total aplicado</td><td class="num">${fmt(pagos.reduce((s,p)=>s+Number(p.monto||0),0))}</td></tr></tfoot>
      </table>
    `;
  }
  list.querySelectorAll('.pagos-ver-factura').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById('modalPagosFactura').classList.remove('show');
    STATE_provVista = 'facturas';
    abrirOrigenDesdeDetalle({ tipo: 'proveedor', id: btn.dataset.id }, businessId);
  }));
}
document.getElementById('cerrarModalPagosFactura').addEventListener('click', () => {
  document.getElementById('modalPagosFactura').classList.remove('show');
});

async function renderDirectorioProveedores(el, b) {
  const scrollY = window.scrollY;
  const [{ data: all }, { data: catalogo }] = await Promise.all([
    sb.from('fz_proveedores').select('*').eq('business_id', b.id),
    sb.from('fz_proveedores_catalogo').select('*').eq('business_id', b.id),
  ]);
  const catalogoMap = Object.fromEntries((catalogo || []).map(c => [c.id, c]));
  const nombreProveedor = (f) => {
    const c = f.proveedor_id ? catalogoMap[f.proveedor_id] : null;
    if (c) return c.razon_social ? `${c.razon_social}${c.nombre_comercial ? ' — ' + c.nombre_comercial : ''}` : (c.nombre_comercial || c.nombre || f.proveedor || '(sin proveedor)');
    return f.proveedor || '(sin proveedor)';
  };
  const grupos = {};
  (all || []).forEach(f => {
    const key = claveProveedor(f);
    if (!grupos[key]) grupos[key] = { key, nombre: nombreProveedor(f), facturado: 0, pagado: 0, cantidad: 0 };
    grupos[key].facturado += Number(f.importe) || 0;
    grupos[key].pagado += Number(f.importe_pagado) || 0;
    grupos[key].cantidad += 1;
  });
  const lista = Object.values(grupos).map(g => ({ ...g, pendiente: g.facturado - g.pagado })).sort((a,b) => b.pendiente - a.pendiente);

  el.innerHTML = `
    ${provTabsHtml()}
    <div class="card">
      <div class="card-head"><h3>Directorio de proveedores</h3><span class="hint">Clic en un proveedor para ver todo su historial</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Proveedor</th><th>No. facturas</th><th>Total facturado</th><th>Total pagado</th><th>Saldo pendiente</th></tr></thead>
          <tbody>
            ${lista.length ? lista.map(g => `<tr class="prov-dir-row" data-key="${g.key}" style="cursor:pointer;">
              <td>${g.nombre}</td>
              <td>${g.cantidad}</td>
              <td class="num">${fmt(g.facturado)}</td>
              <td class="num">${fmt(g.pagado)}</td>
              <td class="num" style="font-weight:700;">${fmtSigno(-g.pendiente)}</td>
            </tr>`).join('') : `<tr><td colspan="5" class="empty">Aún no hay proveedores registrados.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  wireProvTabs(el);
  el.querySelectorAll('.prov-dir-row').forEach(tr => tr.addEventListener('click', () => {
    STATE_provDetalleKey = tr.dataset.key;
    STATE_provVista = 'detalle';
    renderProveedores();
  }));
  window.scrollTo(0, scrollY);
}

async function getTransaccionesProveedor(businessId, facturas) {
  const facturaIds = facturas.map(f => f.id);
  const transacciones = [];

  facturas.forEach(f => {
    transacciones.push({
      fecha: f.fecha, tipo: 'Factura', numero: f.factura || 's/f', monto: Number(f.importe) || 0,
      origen: { tipo: 'proveedor', id: f.id, fecha: f.fecha },
    });
  });

  const { data: lineasPago } = facturaIds.length
    ? await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('cuenta_tipo', 'proveedor').in('proveedor_factura_id', facturaIds)
    : { data: [] };
  const polizaIds = [...new Set((lineasPago || []).map(l => l.poliza_id))];
  const { data: polizasInfo } = polizaIds.length ? await sb.from('fz_polizas').select('id,fecha,numero').in('id', polizaIds) : { data: [] };
  const polizaMap = Object.fromEntries((polizasInfo || []).map(p => [p.id, p]));
  (lineasPago || []).forEach(l => {
    const p = polizaMap[l.poliza_id];
    if (!p) return;
    if (!(Number(l.cargo) > 0.004)) return; // sin cargo real no es un pago (ej. la línea de abono que originó la provisión)
    transacciones.push({
      fecha: p.fecha, tipo: 'Pago — Póliza de diario', numero: `#${p.numero ?? ''}`, monto: -(Number(l.cargo) || 0),
      origen: { tipo: 'poliza', id: p.id, fecha: p.fecha },
    });
  });

  const [bmQ, emQ] = await Promise.all([
    sb.from('fz_bancos_mov').select('*').eq('business_id', businessId).eq('tipo_salida', 'proveedor'),
    sb.from('fz_efectivo_mov').select('*').eq('business_id', businessId).eq('tipo_salida', 'proveedor'),
  ]);
  (bmQ.data || []).forEach(m => {
    if (!facturaIdsDe(m).some(id => facturaIds.includes(id))) return;
    transacciones.push({
      fecha: m.fecha, tipo: 'Pago — Banco', numero: m.concepto || m.descripcion || '—', monto: -(Number(m.cargos) || 0),
      origen: { tipo: 'bancos', id: m.id, cuentaId: m.cuenta_id, fecha: m.fecha },
    });
  });
  (emQ.data || []).forEach(m => {
    if (!facturaIdsDe(m).some(id => facturaIds.includes(id))) return;
    transacciones.push({
      fecha: m.fecha, tipo: 'Pago — Efectivo', numero: m.descripcion || m.proveedor || '—', monto: -(Number(m.cargos) || 0),
      origen: { tipo: 'efectivo', id: m.id, monedaId: m.moneda_id, fecha: m.fecha },
    });
  });

  transacciones.sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.tipo==='Factura'?-1:1));
  let saldo = 0;
  transacciones.forEach(t => { saldo += t.monto; t.saldoAcumulado = saldo; });
  return transacciones.reverse(); // más reciente primero, como en QuickBooks
}

async function renderProveedorDetalle(el, b) {
  const key = STATE_provDetalleKey;
  if (!key) { STATE_provVista = 'directorio'; return renderProveedores(); }
  const [{ data: all }, { data: catalogo }] = await Promise.all([
    sb.from('fz_proveedores').select('*').eq('business_id', b.id),
    sb.from('fz_proveedores_catalogo').select('*').eq('business_id', b.id),
  ]);
  const catalogoMap = Object.fromEntries((catalogo || []).map(c => [c.id, c]));
  const facturas = (all || []).filter(f => claveProveedor(f) === key);
  const primeraFactura = facturas[0];
  const catMatch = primeraFactura?.proveedor_id ? catalogoMap[primeraFactura.proveedor_id] : null;
  const nombre = catMatch
    ? (catMatch.razon_social ? `${catMatch.razon_social}${catMatch.nombre_comercial ? ' — ' + catMatch.nombre_comercial : ''}` : (catMatch.nombre_comercial || catMatch.nombre || primeraFactura?.proveedor))
    : (primeraFactura?.proveedor || '(sin proveedor)');
  STATE_provDetalleNombre = nombre;
  const totalFacturado = facturas.reduce((s,f) => s + (Number(f.importe)||0), 0);
  const totalPagado = facturas.reduce((s,f) => s + (Number(f.importe_pagado)||0), 0);
  const pendiente = totalFacturado - totalPagado;
  const transacciones = await getTransaccionesProveedor(b.id, facturas);

  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="provDetalleVolver" style="margin-bottom:14px;">← Volver al directorio</button>
    <div class="kpi-grid" style="margin-bottom:14px;">
      <div class="kpi"><div class="label">Total facturado</div><div class="value num">${fmt(totalFacturado)}</div></div>
      <div class="kpi"><div class="label">Total pagado</div><div class="value num green">${fmt(totalPagado)}</div></div>
      <div class="kpi"><div class="label">Saldo pendiente</div><div class="value num ${pendiente>0.004?'red':'green'}">${fmt(pendiente)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>${nombre}</h3><span class="hint">Todas las transacciones, más reciente primero</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Referencia</th><th>Monto</th><th>Saldo</th><th></th></tr></thead>
          <tbody>
            ${transacciones.length ? transacciones.map(t => `<tr>
              <td>${fechaCorta(t.fecha)}</td>
              <td>${t.tipo}</td>
              <td>${t.numero}</td>
              <td class="num ${t.monto<0?'red':''}">${t.monto<0?'-':''}${fmt(Math.abs(t.monto))}</td>
              <td class="num" style="font-weight:600;">${fmtNeg(t.saldoAcumulado)}</td>
              <td><button class="btn btn-ghost btn-sm ${t.origen.tipo==='proveedor'?'ver-factura-btn':(t.origen.tipo==='bancos'||t.origen.tipo==='efectivo'?'ver-desglose-pago-btn':'abrir-origen-btn')}" data-origen='${JSON.stringify(t.origen).replace(/'/g,'&apos;')}' style="font-size:11px;padding:3px 8px;">Ver / Editar</button></td>
            </tr>`).join('') : `<tr><td colspan="6" class="empty">Sin transacciones.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('provDetalleVolver').addEventListener('click', () => { STATE_provVista = 'directorio'; renderProveedores(); });
  el.querySelectorAll('.abrir-origen-btn').forEach(btn => btn.addEventListener('click', () => {
    const origen = JSON.parse(btn.dataset.origen.replace(/&apos;/g, "'"));
    abrirOrigenDesdeDetalle(origen, b.id);
  }));
  el.querySelectorAll('.ver-factura-btn').forEach(btn => btn.addEventListener('click', () => {
    const origen = JSON.parse(btn.dataset.origen.replace(/&apos;/g, "'"));
    STATE_provVista = 'facturas';
    irASeccion('proveedores').then(() => resaltarFilaPorId(origen.id));
  }));
  el.querySelectorAll('.ver-desglose-pago-btn').forEach(btn => btn.addEventListener('click', () => {
    const origen = JSON.parse(btn.dataset.origen.replace(/&apos;/g, "'"));
    const tabla = origen.tipo === 'bancos' ? 'fz_bancos_mov' : 'fz_efectivo_mov';
    verDesglosePago(tabla, origen.id, b.id);
  }));
}

/* ============================================================
   CLIENTES (Cuentas por Cobrar) — Etapa 1: Catálogo + Directorio
   ============================================================ */
const REGIMENES_FISCALES_SAT = [
  { c: '601', n: 'General de Ley Personas Morales' },
  { c: '603', n: 'Personas Morales con Fines no Lucrativos' },
  { c: '605', n: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { c: '606', n: 'Arrendamiento' },
  { c: '607', n: 'Régimen de Enajenación o Adquisición de Bienes' },
  { c: '608', n: 'Demás ingresos' },
  { c: '610', n: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { c: '611', n: 'Ingresos por Dividendos (socios y accionistas)' },
  { c: '612', n: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { c: '614', n: 'Ingresos por intereses' },
  { c: '615', n: 'Régimen de los ingresos por obtención de premios' },
  { c: '616', n: 'Sin obligaciones fiscales' },
  { c: '620', n: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { c: '621', n: 'Incorporación Fiscal' },
  { c: '622', n: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { c: '623', n: 'Opcional para Grupos de Sociedades' },
  { c: '624', n: 'Coordinados' },
  { c: '625', n: 'Actividades Empresariales con ingresos por Plataformas Tecnológicas' },
  { c: '626', n: 'Régimen Simplificado de Confianza (RESICO)' },
  { c: '628', n: 'Hidrocarburos' },
  { c: '629', n: 'Regímenes Fiscales Preferentes y Empresas Multinacionales' },
  { c: '630', n: 'Enajenación de acciones en bolsa de valores' },
];
const ESTADOS_MX = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua',
  'Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero',
  'Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro',
  'Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala',
  'Veracruz','Yucatán','Zacatecas',
];
const TIPOS_SOCIEDAD = [
  'Persona Física',
  'S.A. de C.V. (Sociedad Anónima de Capital Variable)',
  'S. de R.L. de C.V. (Sociedad de Responsabilidad Limitada de Capital Variable)',
  'S.A.B. de C.V. (Sociedad Anónima Bursátil de Capital Variable)',
  'S.C. (Sociedad Civil)',
  'A.C. (Asociación Civil)',
  'S.A.P.I. de C.V. (Sociedad Anónima Promotora de Inversión)',
  'Cooperativa',
  'Otro',
];

async function loadClientes(businessId) {
  const { data } = await sb.from('fz_clientes').select('*').eq('business_id', businessId).eq('activo', true);
  return data || [];
}
async function loadProductosServicios(businessId) {
  const { data } = await sb.from('fz_productos_servicios').select('*').eq('business_id', businessId).eq('activo', true).order('nombre');
  return data || [];
}
async function computeSaldoCliente(clienteId) {
  const { data } = await sb.from('fz_facturas_clientes').select('total,importe_pagado').eq('cliente_id', clienteId);
  return (data || []).reduce((s, f) => s + (Number(f.total) || 0) - (Number(f.importe_pagado) || 0), 0);
}
// Antes de dejar eliminar un cliente, hay que confirmar que no tenga facturas u
// otros movimientos ya registrados. Etapa 1 todavía no tiene Facturas de clientes,
// así que por ahora esto siempre permite eliminar — se conecta de verdad en la
// Etapa 2/3 (revisando fz_facturas_clientes u la tabla que se use).
async function clienteTieneMovimientos(clienteId) {
  const { count } = await sb.from('fz_facturas_clientes').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId);
  return (count || 0) > 0;
}

let STATE_clienteOrden = 'nombre'; // 'nombre' | 'saldo'
let STATE_clienteEditandoId = null;

let STATE_clientesVista = 'directorio'; // 'directorio' | 'facturas' | 'detalle' | 'ordenes'
let STATE_clienteDetalleId = null;
function clientesTabsHtml() {
  return `<div class="tag-row" style="margin-bottom:14px;">
    <div class="tag ${STATE_clientesVista==='directorio'?'active':''}" id="clientesTabDirectorio">Directorio</div>
    <div class="tag ${STATE_clientesVista==='facturas'?'active':''}" id="clientesTabFacturas">Facturas</div>
    <div class="tag ${STATE_clientesVista==='ordenes'?'active':''}" id="clientesTabOrdenes">Órdenes de venta</div>
  </div>`;
}
function wireClientesTabs() {
  document.getElementById('clientesTabDirectorio').addEventListener('click', () => { STATE_clientesVista = 'directorio'; renderClientes(); });
  document.getElementById('clientesTabFacturas').addEventListener('click', () => { STATE_clientesVista = 'facturas'; renderClientes(); });
  document.getElementById('clientesTabOrdenes').addEventListener('click', () => { STATE_clientesVista = 'ordenes'; renderClientes(); });
}

const STATE_recurrentesRevisadas = new Set();
async function renderClientes() {
  const el = document.getElementById('sec-clientes');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  if (!STATE_recurrentesRevisadas.has(b.id)) {
    STATE_recurrentesRevisadas.add(b.id);
    const generadas = await generarFacturasRecurrentesSiCorresponde(b.id);
    if (generadas) toast(`${generadas} factura(s) recurrente(s) se generaron automáticamente.`);
  }
  if (STATE_clientesVista === 'facturas') { await renderFacturasClientes(el, b); return; }
  if (STATE_clientesVista === 'detalle') { await renderClienteDetalle(el, b); return; }
  if (STATE_clientesVista === 'ordenes') { await renderOrdenesVenta(el, b); return; }
  await renderDirectorioClientes(el, b);
}

async function renderClienteDetalle(el, b) {
  const cliente = (await loadClientes(b.id)).find(c => c.id === STATE_clienteDetalleId);
  if (!cliente) { STATE_clientesVista = 'directorio'; return renderClientes(); }
  const { data: facturas } = await sb.from('fz_facturas_clientes').select('*').eq('cliente_id', cliente.id).order('folio', { ascending: false });
  const lista = facturas || [];
  const totalFacturado = lista.reduce((s,f)=>s+(Number(f.total)||0),0);
  const totalPagado = lista.reduce((s,f)=>s+(Number(f.importe_pagado)||0),0);
  const pendiente = totalFacturado - totalPagado;

  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="clienteDetalleVolver" style="margin-bottom:14px;">← Volver al directorio</button>
    <div class="kpi-grid" style="margin-bottom:14px;">
      <div class="kpi"><div class="label">Total facturado</div><div class="value num">${fmt(totalFacturado)}</div></div>
      <div class="kpi"><div class="label">Total pagado</div><div class="value num green">${fmt(totalPagado)}</div></div>
      <div class="kpi"><div class="label">Saldo pendiente</div><div class="value num ${pendiente>0.004?'red':'green'}">${fmt(pendiente)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>${cliente.razon_social || cliente.nombre_comercial}</h3>${cliente.razon_social ? `<span class="hint">${cliente.nombre_comercial}</span>` : ''}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Total</th><th>Pagado</th><th>Pendiente</th><th>Estatus</th><th>Fiscal</th><th></th></tr></thead>
          <tbody>
            ${lista.length ? lista.map(f => {
              const pend = Number(f.total) - Number(f.importe_pagado||0);
              return `<tr>
                <td>#${f.folio}</td>
                <td>${fechaCorta(f.fecha)}</td>
                <td class="num">${f.moneda==='USD'?'US':''}${fmt(f.total)}</td>
                <td class="num">${fmt(f.importe_pagado||0)}</td>
                <td class="num">${fmtNeg(pend)}</td>
                <td><span class="badge ${f.estatus==='Pagado'?'pag':'pend'}">${f.estatus}</span></td>
                <td>${ESTATUS_FISCAL_BADGE[f.estatus_fiscal] || ESTATUS_FISCAL_BADGE.no_aplica}</td>
                ${facturaMenuHtml(f.id)}
              </tr>`;
            }).join('') : `<tr><td colspan="8" class="empty">Este cliente aún no tiene facturas.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('clienteDetalleVolver').addEventListener('click', () => { STATE_clientesVista = 'directorio'; renderClientes(); });
  wireFacturaMenu(el, b.id, () => renderClienteDetalle(el, b));
}

async function renderDirectorioClientes(el, b) {
  const scrollY = window.scrollY;

  const clientes = await loadClientes(b.id);
  const conSaldo = await Promise.all(clientes.map(async c => ({ ...c, saldo: await computeSaldoCliente(c.id) })));
  const ordenados = [...conSaldo].sort((a, b2) => {
    if (STATE_clienteOrden === 'saldo') return b2.saldo - a.saldo;
    return (a.nombre_comercial || '').localeCompare(b2.nombre_comercial || '');
  });

  // Resumen general: por cobrar, vencido, cobrado este mes, pendientes de facturar fiscalmente
  const { data: todasFacturas } = await sb.from('fz_facturas_clientes').select('total,importe_pagado,fecha_vencimiento,fecha_pago,estatus_fiscal,moneda,tipo_cambio').eq('business_id', b.id);
  const hoy = todayStr();
  const mesActual = STATE.currentMonth;
  let totalPorCobrar = 0, totalVencido = 0, cobradoEsteMes = 0, pendientesFiscal = 0;
  (todasFacturas || []).forEach(f => {
    const tc = f.moneda === 'USD' ? (Number(f.tipo_cambio) || 1) : 1;
    const pendiente = ((Number(f.total) || 0) - (Number(f.importe_pagado) || 0)) * tc;
    if (pendiente > 0.004) {
      totalPorCobrar += pendiente;
      if (f.fecha_vencimiento && f.fecha_vencimiento < hoy) totalVencido += pendiente;
    }
    if (f.fecha_pago && f.fecha_pago.slice(0,7) === mesActual) cobradoEsteMes += (Number(f.importe_pagado) || 0) * tc;
    if (f.estatus_fiscal === 'pendiente') pendientesFiscal++;
  });

  el.innerHTML = `
    ${clientesTabsHtml()}
    <div class="kpi-grid" style="margin-bottom:14px;">
      <div class="kpi"><div class="label">Total por cobrar</div><div class="value num">${fmt(totalPorCobrar)}</div></div>
      <div class="kpi"><div class="label">Vencido</div><div class="value num ${totalVencido>0.004?'red':''}">${fmt(totalVencido)}</div></div>
      <div class="kpi"><div class="label">Cobrado este mes</div><div class="value num green">${fmt(cobradoEsteMes)}</div></div>
      <div class="kpi"><div class="label">Pendientes de facturar</div><div class="value ${pendientesFiscal>0?'red':''}">${pendientesFiscal}</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Clientes</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <div style="position:relative;">
            <button class="btn btn-gold btn-sm" id="nuevaTransaccionBtn">+ Nueva transacción</button>
            <div id="nuevaTransaccionDropdown" style="display:none;position:absolute;left:0;top:100%;margin-top:4px;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.14);z-index:20;min-width:180px;overflow:hidden;">
              <button class="nt-factura" style="display:block;width:100%;text-align:left;padding:10px 14px;border:none;background:none;cursor:pointer;font-size:13px;">Factura</button>
              <button class="nt-orden" style="display:block;width:100%;text-align:left;padding:10px 14px;border:none;background:none;cursor:pointer;font-size:13px;border-top:1px solid var(--line);">Orden de venta</button>
              <button class="nt-pago" style="display:block;width:100%;text-align:left;padding:10px 14px;border:none;background:none;cursor:pointer;font-size:13px;border-top:1px solid var(--line);">Registrar un pago</button>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" id="openProductosBtn">⚙ Productos y Servicios</button>
          <button class="btn btn-ghost btn-sm" id="addClienteBtn">+ Agregar cliente</button>
        </div>
      </div>
      <div class="tag-row" style="margin-bottom:12px;">
        <div class="tag ${STATE_clienteOrden==='nombre'?'active':''}" id="clienteOrdenNombre">Ordenar por nombre</div>
        <div class="tag ${STATE_clienteOrden==='saldo'?'active':''}" id="clienteOrdenSaldo">Ordenar por saldo (Open Balance)</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Razón social</th><th>Nombre comercial</th><th>Teléfono</th><th>Moneda / TC</th><th>Open Balance</th><th></th></tr></thead>
          <tbody>
            ${ordenados.length ? ordenados.map(c => `<tr class="cliente-fila" data-id="${c.id}" style="cursor:pointer;">
              <td>${c.razon_social || '<span style="color:var(--muted);">—</span>'}</td>
              <td><strong>${c.nombre_comercial}</strong></td>
              <td>${c.telefono || '<span style="color:var(--muted);">—</span>'}</td>
              <td>${c.moneda}${c.moneda==='USD' ? ' · ' + fmtNum(c.tipo_cambio) : ''}</td>
              <td class="num" style="font-weight:700;">${fmt(c.saldo)}</td>
              <td style="position:relative;">
                <button class="btn btn-ghost btn-sm cliente-menu-btn" data-id="${c.id}" style="padding:5px 12px;">⋯</button>
                <div class="cliente-menu-dropdown" data-menu="${c.id}" style="display:none;position:absolute;right:8px;top:100%;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.14);z-index:20;min-width:130px;overflow:hidden;">
                  <button class="cliente-editar" data-id="${c.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;">Editar</button>
                  <button class="cliente-del" data-id="${c.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--red);border-top:1px solid var(--line);">Eliminar</button>
                </div>
              </td>
            </tr>`).join('') : `<tr><td colspan="6" class="empty">Aún no tienes clientes registrados. Usa "+ Agregar cliente".</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('clienteOrdenNombre').addEventListener('click', () => { STATE_clienteOrden = 'nombre'; renderClientes(); });
  document.getElementById('clienteOrdenSaldo').addEventListener('click', () => { STATE_clienteOrden = 'saldo'; renderClientes(); });
  document.getElementById('addClienteBtn').addEventListener('click', () => openModalCliente(null));
  document.getElementById('openProductosBtn').addEventListener('click', () => openModalProductos(b.id));
  document.getElementById('nuevaTransaccionBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('nuevaTransaccionDropdown');
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', () => { const dd = document.getElementById('nuevaTransaccionDropdown'); if (dd) dd.style.display = 'none'; });
  el.querySelector('.nt-factura').addEventListener('click', () => openModalFactura(null, b.id));
  el.querySelector('.nt-orden').addEventListener('click', () => openModalOrden(null, b.id));
  el.querySelector('.nt-pago').addEventListener('click', () => abrirElegirFacturaCobro(b.id));
  el.querySelectorAll('.cliente-fila').forEach(tr => tr.addEventListener('click', (e) => {
    if (e.target.closest('.cliente-menu-btn') || e.target.closest('.cliente-menu-dropdown')) return;
    STATE_clienteDetalleId = tr.dataset.id;
    STATE_clientesVista = 'detalle';
    renderClientes();
  }));
  el.querySelectorAll('.cliente-menu-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = el.querySelector(`.cliente-menu-dropdown[data-menu="${btn.dataset.id}"]`);
    const abierto = dropdown.style.display === 'block';
    el.querySelectorAll('.cliente-menu-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = abierto ? 'none' : 'block';
  }));
  document.addEventListener('click', () => el.querySelectorAll('.cliente-menu-dropdown').forEach(d => d.style.display = 'none'));
  el.querySelectorAll('.cliente-editar').forEach(btn => btn.addEventListener('click', () => {
    const c = clientes.find(x => x.id === btn.dataset.id);
    if (c) openModalCliente(c);
  }));
  el.querySelectorAll('.cliente-del').forEach(btn => btn.addEventListener('click', async () => {
    const tieneMovimientos = await clienteTieneMovimientos(btn.dataset.id);
    if (tieneMovimientos) {
      toast('Este cliente ya tiene facturas o movimientos registrados — no se puede eliminar. Puedes desactivarlo en su lugar si ya no lo usas.', 'error');
      return;
    }
    if (!confirm('¿Desea usted eliminar a este cliente? Esta acción no se puede deshacer.')) return;
    await sb.from('fz_clientes').delete().eq('id', btn.dataset.id);
    registrarAuditoria(b.id, 'eliminar', 'Clientes', clientes.find(x => x.id === btn.dataset.id)?.nombre_comercial || '');
    renderClientes();
  }));
  wireClientesTabs();
  window.scrollTo(0, scrollY);
}

function openModalCliente(cliente) {
  STATE_clienteEditandoId = cliente ? cliente.id : null;
  document.getElementById('modalClienteTitulo').textContent = cliente ? 'Editar cliente' : 'Agregar cliente';
  document.getElementById('clienteNombreComercial').value = cliente?.nombre_comercial || '';
  document.getElementById('clienteRazonSocial').value = cliente?.razon_social || '';
  const selTipoSoc = document.getElementById('clienteTipoSociedad');
  selTipoSoc.innerHTML = `<option value="">— sin especificar —</option>` + TIPOS_SOCIEDAD.map(t => `<option value="${t}" ${cliente?.tipo_sociedad===t?'selected':''}>${t}</option>`).join('');
  document.getElementById('clienteRfc').value = cliente?.rfc || '';
  const selRegimen = document.getElementById('clienteRegimenFiscal');
  selRegimen.innerHTML = `<option value="">— sin especificar —</option>` + REGIMENES_FISCALES_SAT.map(r => `<option value="${r.c}" ${cliente?.regimen_fiscal===r.c?'selected':''}>${r.c} — ${r.n}</option>`).join('');
  const selEstado = document.getElementById('clienteEstado');
  selEstado.innerHTML = `<option value="">— sin especificar —</option>` + ESTADOS_MX.map(e => `<option value="${e}" ${cliente?.estado===e?'selected':''}>${e}</option>`).join('');
  document.getElementById('clienteCp').value = cliente?.codigo_postal || '';
  document.getElementById('clienteCalle').value = cliente?.calle || '';
  document.getElementById('clienteMunicipio').value = cliente?.municipio || '';
  document.getElementById('clienteNumExt').value = cliente?.numero_exterior || '';
  document.getElementById('clienteNumInt').value = cliente?.numero_interior || '';
  document.getElementById('clienteColonia').value = cliente?.colonia || '';
  document.getElementById('clienteLocalidad').value = cliente?.localidad || '';
  document.getElementById('clienteTelefono').value = cliente?.telefono || '';
  document.getElementById('clienteBancoNombre').value = cliente?.banco_nombre || '';
  document.getElementById('clienteBancoCuenta').value = cliente?.banco_cuenta || '';
  document.getElementById('clienteBancoClabe').value = cliente?.banco_clabe || '';
  document.getElementById('clienteBancoTarjeta').value = cliente?.banco_tarjeta || '';
  document.getElementById('clienteMoneda').value = cliente?.moneda || 'MXN';
  document.getElementById('clienteTc').value = fmtInputVal(cliente?.tipo_cambio || 1);
  document.getElementById('clienteTcWrap').style.display = (cliente?.moneda === 'USD') ? '' : 'none';
  document.getElementById('modalCliente').classList.add('show');
}
document.getElementById('clienteMoneda').addEventListener('change', (e) => {
  document.getElementById('clienteTcWrap').style.display = e.target.value === 'USD' ? '' : 'none';
});
document.getElementById('closeModalCliente').addEventListener('click', () => {
  document.getElementById('modalCliente').classList.remove('show');
});
document.getElementById('saveModalCliente').addEventListener('click', async () => {
  const b = biz();
  if (!b) return;
  const nombre_comercial = document.getElementById('clienteNombreComercial').value.trim();
  if (!nombre_comercial) { toast('Escribe al menos el nombre comercial.', 'error'); return; }
  const payload = {
    business_id: b.id,
    nombre_comercial,
    razon_social: document.getElementById('clienteRazonSocial').value.trim() || null,
    tipo_sociedad: document.getElementById('clienteTipoSociedad').value || null,
    rfc: document.getElementById('clienteRfc').value.trim() || null,
    regimen_fiscal: document.getElementById('clienteRegimenFiscal').value || null,
    codigo_postal: document.getElementById('clienteCp').value.trim() || null,
    calle: document.getElementById('clienteCalle').value.trim() || null,
    numero_exterior: document.getElementById('clienteNumExt').value.trim() || null,
    numero_interior: document.getElementById('clienteNumInt').value.trim() || null,
    colonia: document.getElementById('clienteColonia').value.trim() || null,
    localidad: document.getElementById('clienteLocalidad').value.trim() || null,
    municipio: document.getElementById('clienteMunicipio').value.trim() || null,
    estado: document.getElementById('clienteEstado').value || null,
    telefono: document.getElementById('clienteTelefono').value.trim() || null,
    banco_nombre: document.getElementById('clienteBancoNombre').value.trim() || null,
    banco_cuenta: document.getElementById('clienteBancoCuenta').value.trim() || null,
    banco_clabe: document.getElementById('clienteBancoClabe').value.trim() || null,
    banco_tarjeta: document.getElementById('clienteBancoTarjeta').value.trim() || null,
    moneda: document.getElementById('clienteMoneda').value,
    tipo_cambio: leerMonto(document.getElementById('clienteTc').value) || 1,
  };
  let error;
  if (STATE_clienteEditandoId) {
    ({ error } = await sb.from('fz_clientes').update(payload).eq('id', STATE_clienteEditandoId));
  } else {
    ({ error } = await sb.from('fz_clientes').insert(payload));
  }
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  registrarAuditoria(b.id, STATE_clienteEditandoId ? 'editar' : 'crear', 'Clientes', nombre_comercial);
  document.getElementById('modalCliente').classList.remove('show');
  renderClientes();
});

async function openModalProductos(businessId) {
  await renderProductosList(businessId);
  document.getElementById('modalProductos').classList.add('show');
  const subSel = document.getElementById('newProductoSubcuenta');
  const [subcuentas, mayores] = await Promise.all([loadSubcuentas(businessId), loadCuentasMayor(businessId)]);
  subSel.innerHTML = opcionesSubcuentasIngreso(subcuentas, mayores, null) || '<option value="">— crea al menos una subcuenta dentro de tu cuenta mayor de Ingreso —</option>';
}
async function renderProductosList(businessId) {
  const productos = await loadProductosServicios(businessId);
  const [subcuentas, mayores] = await Promise.all([loadSubcuentas(businessId), loadCuentasMayor(businessId)]);
  const nombreSubcuenta = (id) => subcuentas.find(s => s.id === id)?.nombre || '(sin clasificar)';
  const box = document.getElementById('productosList');
  box.innerHTML = productos.length ? productos.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 4px;border-bottom:1px solid var(--line);">
      <div style="min-width:0;">
        <strong style="font-size:13.5px;">${p.nombre}</strong>${p.precio ? ` <span style="color:var(--muted);font-size:12px;">— ${fmt(p.precio)}</span>` : ''}
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">${nombreSubcuenta(p.subcuenta_id)}${p.descripcion ? ' · ' + p.descripcion : ''}</div>
      </div>
      <button class="row-del producto-del" data-id="${p.id}" style="font-size:15px;flex-shrink:0;">✕</button>
    </div>`).join('') : `<div class="empty" style="padding:14px;">Aún no tienes productos o servicios dados de alta.</div>`;
  box.querySelectorAll('.producto-del').forEach(btn => btn.addEventListener('click', async () => {
    await sb.from('fz_productos_servicios').update({ activo: false }).eq('id', btn.dataset.id);
    renderProductosList(businessId);
  }));
}
document.getElementById('closeModalProductos').addEventListener('click', () => {
  document.getElementById('modalProductos').classList.remove('show');
  renderClientes();
});
document.getElementById('saveModalProducto').addEventListener('click', async () => {
  const b = biz();
  if (!b) return;
  const nombre = document.getElementById('newProductoNombre').value.trim();
  if (!nombre) { toast('Escribe un nombre.', 'error'); return; }
  const subcuenta_id = document.getElementById('newProductoSubcuenta').value || null;
  const payload = {
    business_id: b.id, nombre,
    descripcion: document.getElementById('newProductoDescripcion').value.trim() || null,
    precio: leerMonto(document.getElementById('newProductoPrecio').value) || 0,
    subcuenta_id,
  };
  const { error } = await sb.from('fz_productos_servicios').insert(payload);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  document.getElementById('newProductoNombre').value = '';
  document.getElementById('newProductoPrecio').value = '';
  document.getElementById('newProductoDescripcion').value = '';
  registrarAuditoria(b.id, 'crear', 'Productos y Servicios', nombre);
  renderProductosList(b.id);
});

/* ---------- Facturas recurrentes: generación automática ---------- */
async function generarFacturasRecurrentesSiCorresponde(businessId) {
  const hoy = todayStr();
  const { data: recurrentes } = await sb.from('fz_facturas_clientes').select('*').eq('business_id', businessId).eq('es_recurrente', true).lte('proxima_generacion', hoy);
  if (!recurrentes || !recurrentes.length) return 0;
  let generadas = 0;
  for (const orig of recurrentes) {
    const folio = await siguienteFolio(businessId, 'factura_cliente');
    const diasVencimiento = orig.fecha_vencimiento ? (new Date(orig.fecha_vencimiento) - new Date(orig.fecha)) / 86400000 : null;
    const payload = {
      business_id: businessId, cliente_id: orig.cliente_id, folio, fecha: hoy,
      fecha_vencimiento: diasVencimiento !== null ? sumarDias(hoy, diasVencimiento) : null,
      moneda: orig.moneda, tipo_cambio: orig.tipo_cambio,
      subtotal: orig.subtotal, aplica_iva: orig.aplica_iva, iva_porcentaje: orig.iva_porcentaje, iva_monto: orig.iva_monto, total: orig.total,
      estatus_fiscal: 'no_aplica', notas: orig.notas, estatus: 'Pendiente', importe_pagado: 0,
      es_recurrente: false, origen_recurrente_id: orig.id,
    };
    const { data: nueva, error } = await sb.from('fz_facturas_clientes').insert(payload).select().single();
    if (error || !nueva) continue;
    const { data: lineasOrig } = await sb.from('fz_facturas_clientes_lineas').select('*').eq('factura_id', orig.id);
    if (lineasOrig && lineasOrig.length) {
      await sb.from('fz_facturas_clientes_lineas').insert(lineasOrig.map(l => ({
        factura_id: nueva.id, business_id: businessId, producto_id: l.producto_id, descripcion: l.descripcion,
        cantidad: l.cantidad, precio_unitario: l.precio_unitario, subcuenta_id: l.subcuenta_id, importe: l.importe, orden: l.orden,
      })));
    }
    await sb.from('fz_facturas_clientes').update({ proxima_generacion: sumarDias(orig.proxima_generacion, orig.frecuencia_dias) }).eq('id', orig.id);
    registrarAuditoria(businessId, 'crear', 'Facturas de clientes', `Factura #${folio} generada automáticamente (recurrente de la #${orig.folio})`);
    generadas++;
  }
  return generadas;
}

async function abrirElegirFacturaCobro(businessId) {
  const pendientes = (await loadFacturasClientesPendConNombre(businessId)).filter(f => f.estatus !== 'Pagado');
  const [cuentasBancoQ, monedasQ] = await Promise.all([
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
  ]);
  const selCuenta = document.getElementById('elegirFacturaCobroCuenta');
  selCuenta.innerHTML = `<option value="manual">Ingreso directo (sin registrar en Banco/Efectivo)</option>`
    + (cuentasBancoQ.data||[]).map(c => `<option value="banco:${c.id}">Banco — ${c.nombre}</option>`).join('')
    + (monedasQ.data||[]).map(m => `<option value="efectivo:${m.id}">Efectivo — ${m.nombre}</option>`).join('');
  document.getElementById('elegirFacturaCobroFecha').value = todayStr();
  document.getElementById('elegirFacturaCobroMonto').value = '';

  const box = document.getElementById('elegirFacturaCobroList');
  const buscar = document.getElementById('elegirFacturaCobroBuscar');
  const porCliente = {};
  pendientes.forEach(f => { (porCliente[f.clienteNombre] = porCliente[f.clienteNombre] || []).push(f); });
  Object.values(porCliente).forEach(lista => lista.sort((a,b) => a.fecha.localeCompare(b.fecha)));
  const nombresCliente = Object.keys(porCliente).sort((a,b)=>a.localeCompare(b));

  const actualizarResumen = () => {
    const marcadas = Array.from(box.querySelectorAll('.efc-check:checked'));
    const totalSeleccionado = marcadas.reduce((s,c) => s + (Number(c.dataset.importe) || 0), 0);
    const montoIngresado = leerMonto(document.getElementById('elegirFacturaCobroMonto').value) || 0;
    const diferencia = montoIngresado - totalSeleccionado;
    const cuadra = Math.abs(diferencia) < 0.01;
    document.getElementById('elegirFacturaCobroResumen').innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span>Monto a aplicar</span><strong>${fmt(montoIngresado)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span>Total seleccionado (${marcadas.length})</span><strong>${fmt(totalSeleccionado)}</strong></div>
      <div style="display:flex;justify-content:space-between;color:${cuadra?'var(--green)':'var(--muted)'};font-weight:700;"><span>${cuadra?'✓ Cuadra exacto':(diferencia>0?'Sobrará sin asignar':'Quedará pendiente/parcial')}</span><span>${cuadra?'':fmt(Math.abs(diferencia))}</span></div>
    `;
  };

  const renderLista = () => {
    const texto = buscar.value.trim().toLowerCase();
    box.innerHTML = nombresCliente.map(cli => {
      const facturasCli = porCliente[cli].filter(f => !texto || cli.toLowerCase().includes(texto) || String(f.folio).includes(texto));
      if (!facturasCli.length) return '';
      return `<div style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:12.5px;color:var(--navy-1);margin-bottom:4px;">${cli}</div>
        ${facturasCli.map(f => {
          const saldo = Number(f.total) - Number(f.importe_pagado||0);
          return `<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--line);font-size:13px;cursor:pointer;">
            <input type="checkbox" class="efc-check" value="${f.id}" data-importe="${saldo}">
            <span>${f.fecha} · Factura #${f.folio}${f.estatus==='Parcial'?' (parcial)':''} · ${fmt(saldo)}</span>
          </label>`;
        }).join('')}
      </div>`;
    }).join('') || `<div class="empty" style="padding:14px;">No hay facturas pendientes de cobro.</div>`;
    box.querySelectorAll('.efc-check').forEach(chk => chk.addEventListener('change', actualizarResumen));
    actualizarResumen();
  };
  buscar.value = '';
  buscar.oninput = renderLista;
  document.getElementById('elegirFacturaCobroMonto').oninput = actualizarResumen;
  renderLista();
  document.getElementById('modalElegirFacturaCobro').classList.add('show');
}
document.getElementById('aplicarElegirFacturaCobro').addEventListener('click', async () => {
  const b = biz();
  if (!b) return;
  const idsSeleccionados = Array.from(document.querySelectorAll('.efc-check:checked')).map(c => c.value);
  if (!idsSeleccionados.length) { toast('Marca al menos una factura.', 'error'); return; }
  const monto = leerMonto(document.getElementById('elegirFacturaCobroMonto').value);
  if (!monto || monto <= 0) { toast('Escribe el monto a aplicar.', 'error'); return; }
  const fecha = document.getElementById('elegirFacturaCobroFecha').value || todayStr();
  const destino = document.getElementById('elegirFacturaCobroCuenta').value;

  let origen_tabla = 'manual', origen_id = null;
  if (destino !== 'manual') {
    const [tipo, refId] = destino.split(':');
    const tabla = tipo === 'banco' ? 'fz_bancos_mov' : 'fz_efectivo_mov';
    const payload = tipo === 'banco'
      ? { business_id: b.id, cuenta_id: refId, fecha, concepto: 'Cobro a clientes', descripcion: '', depositos: monto, cargos: 0, tipo_entrada: 'cliente' }
      : { business_id: b.id, moneda_id: refId, fecha, proveedor: '', descripcion: 'Cobro a clientes', depositos: monto, cargos: 0, tipo_entrada: 'cliente' };
    const { data: mov, error } = await sb.from(tabla).insert(payload).select().single();
    if (error) { toast('Error creando el movimiento: ' + error.message, 'error'); return; }
    origen_tabla = tabla; origen_id = mov.id;
  }

  const resultado = await aplicarCobroFacturas(idsSeleccionados, monto, fecha, b.id, { origen_tabla, origen_id });
  if (origen_id) await sb.from(origen_tabla).update({ cliente_factura_ids: resultado.idsAfectados, cliente_factura_id: resultado.idsAfectados[0] || null }).eq('id', origen_id);
  if (resultado.idsAfectados.length) toast(`${resultado.idsAfectados.length} factura(s) actualizada(s).`);
  document.getElementById('modalElegirFacturaCobro').classList.remove('show');
});
document.getElementById('closeElegirFacturaCobro').addEventListener('click', () => {
  document.getElementById('modalElegirFacturaCobro').classList.remove('show');
});

/* ---------- Facturas de clientes ---------- */
function facturaMenuHtml(facturaId) {
  return `<td style="position:relative;">
    <button class="btn btn-ghost btn-sm factura-menu-btn" data-id="${facturaId}" style="padding:5px 12px;">⋯</button>
    <div class="factura-menu-dropdown" data-menu="${facturaId}" style="display:none;position:absolute;right:8px;top:100%;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.14);z-index:20;min-width:160px;overflow:hidden;">
      <button class="factura-modificar" data-id="${facturaId}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;">Modificar</button>
      <button class="factura-cobrar" data-id="${facturaId}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;border-top:1px solid var(--line);">Recibir un pago</button>
      <button class="factura-pdf" data-id="${facturaId}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;border-top:1px solid var(--line);">Descargar PDF</button>
      <button class="factura-eliminar" data-id="${facturaId}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--red);border-top:1px solid var(--line);">Eliminar</button>
    </div>
  </td>`;
}
function wireFacturaMenu(el, businessId, onDone) {
  el.querySelectorAll('.factura-menu-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = el.querySelector(`.factura-menu-dropdown[data-menu="${btn.dataset.id}"]`);
    const abierto = dropdown.style.display === 'block';
    el.querySelectorAll('.factura-menu-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = abierto ? 'none' : 'block';
  }));
  document.addEventListener('click', () => el.querySelectorAll('.factura-menu-dropdown').forEach(d => d.style.display = 'none'));
  el.querySelectorAll('.factura-modificar').forEach(btn => btn.addEventListener('click', async () => {
    const { data: f } = await sb.from('fz_facturas_clientes').select('*').eq('id', btn.dataset.id).single();
    if (f) openModalFactura(f, businessId);
  }));
  el.querySelectorAll('.factura-cobrar').forEach(btn => btn.addEventListener('click', async () => {
    const { data: f } = await sb.from('fz_facturas_clientes').select('*').eq('id', btn.dataset.id).single();
    if (f) {
      await openModalFactura(f, businessId);
      document.getElementById('facturaCobrosSection').scrollIntoView({ block: 'center', behavior: 'smooth' });
      document.getElementById('cobroMonto').focus();
    }
  }));
  el.querySelectorAll('.factura-pdf').forEach(btn => btn.addEventListener('click', async () => {
    await descargarFacturaPDF(btn.dataset.id, businessId);
  }));
  el.querySelectorAll('.factura-eliminar').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Desea usted eliminar esta factura? Si tiene cobros aplicados, también se revertirán (incluyendo los movimientos de banco/efectivo que se hayan creado). Esta acción no se puede deshacer.')) return;
    await eliminarFacturaCliente(btn.dataset.id, businessId);
    onDone();
  }));
}
async function descargarFacturaPDF(facturaId, businessId) {
  const [{ data: factura }, { data: lineas }] = await Promise.all([
    sb.from('fz_facturas_clientes').select('*').eq('id', facturaId).single(),
    sb.from('fz_facturas_clientes_lineas').select('*').eq('factura_id', facturaId).order('orden'),
  ]);
  if (!factura) { toast('No se encontró la factura.', 'error'); return; }
  const [cliente, productos] = await Promise.all([
    loadClientes(businessId).then(cs => cs.find(c => c.id === factura.cliente_id)),
    loadProductosServicios(businessId),
  ]);
  const nombreProducto = (id) => productos.find(p => p.id === id)?.nombre || '';
  const negocio = biz();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const simbolo = factura.moneda === 'USD' ? 'US$' : '$';
  const fmtPdf = (n) => simbolo + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Encabezado
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(10, 31, 61);
  doc.text(negocio?.razon_social || negocio?.name || 'Finanzas', margin, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(102, 112, 133);
  if (negocio?.razon_social && negocio?.name && negocio.razon_social !== negocio.name) doc.text(negocio.name, margin, 72);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(185, 138, 46);
  doc.text('FACTURA', pageW - margin, 56, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(26, 43, 69);
  doc.text(`Folio: #${factura.folio}`, pageW - margin, 74, { align: 'right' });
  doc.text(`Fecha: ${fechaCorta(factura.fecha)}`, pageW - margin, 90, { align: 'right' });
  if (factura.fecha_vencimiento) doc.text(`Vence: ${fechaCorta(factura.fecha_vencimiento)}`, pageW - margin, 106, { align: 'right' });

  doc.setDrawColor(223, 228, 234); doc.line(margin, 118, pageW - margin, 118);

  // Datos del cliente
  let y = 144;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(102, 112, 133);
  doc.text('FACTURAR A', margin, y);
  y += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(26, 43, 69);
  doc.text(cliente?.razon_social || cliente?.nombre_comercial || 'Cliente', margin, y);
  y += 15;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 70, 90);
  if (cliente?.razon_social && cliente?.nombre_comercial && cliente.razon_social !== cliente.nombre_comercial) { doc.text(cliente.nombre_comercial, margin, y); y += 14; }
  if (cliente?.rfc) { doc.text(`RFC: ${cliente.rfc}`, margin, y); y += 14; }
  const domicilio = [cliente?.calle, cliente?.numero_exterior, cliente?.colonia, cliente?.municipio, cliente?.estado, cliente?.codigo_postal].filter(Boolean).join(', ');
  if (domicilio) { doc.text(domicilio, margin, y, { maxWidth: pageW - margin*2 }); y += 14; }

  y += 12;

  // Tabla de líneas
  const filas = (lineas || []).map(l => [
    nombreProducto(l.producto_id) || '—',
    l.descripcion || '',
    fmtNum(l.cantidad),
    fmtPdf(l.precio_unitario),
    fmtPdf(l.importe),
  ]);
  doc.autoTable({
    startY: y,
    head: [['Producto/Servicio', 'Descripción', 'Cantidad', 'Precio unit.', 'Importe']],
    body: filas,
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 10, textColor: [26,43,69], cellPadding: 8 },
    headStyles: { fillColor: [10,31,61], textColor: [255,255,255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 110 }, 2: { halign: 'right', cellWidth: 60 }, 3: { halign: 'right', cellWidth: 80 }, 4: { halign: 'right', cellWidth: 80 } },
    alternateRowStyles: { fillColor: [247,249,252] },
  });

  let finalY = doc.lastAutoTable.finalY + 20;
  const totalesX = pageW - margin - 180;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 70, 90);
  doc.text('Subtotal', totalesX, finalY); doc.text(fmtPdf(factura.subtotal), pageW - margin, finalY, { align: 'right' });
  finalY += 16;
  if (factura.aplica_iva) {
    doc.text(`IVA (${fmtNum(factura.iva_porcentaje)}%)`, totalesX, finalY); doc.text(fmtPdf(factura.iva_monto), pageW - margin, finalY, { align: 'right' });
    finalY += 16;
  }
  doc.setDrawColor(10,31,61); doc.line(totalesX, finalY, pageW - margin, finalY);
  finalY += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(10,31,61);
  doc.text('Total', totalesX, finalY); doc.text(fmtPdf(factura.total), pageW - margin, finalY, { align: 'right' });

  finalY += 30;
  const pendiente = Number(factura.total) - Number(factura.importe_pagado || 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.setTextColor(...(factura.estatus === 'Pagado' ? [30,122,61] : [180,60,40]));
  doc.text(`Estatus: ${factura.estatus}${pendiente > 0.004 ? ' · Pendiente: ' + fmtPdf(pendiente) : ''}`, margin, finalY);

  if (factura.notas) {
    finalY += 24;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(102, 112, 133);
    doc.text('Notas:', margin, finalY);
    doc.text(factura.notas, margin, finalY + 13, { maxWidth: pageW - margin*2 });
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150, 158, 171);
  doc.text('Este documento es un comprobante de control interno y no sustituye, por sí mismo, un CFDI timbrado ante el SAT.', margin, doc.internal.pageSize.getHeight() - 36);

  doc.save(`Factura ${factura.folio} - ${cliente?.nombre_comercial || 'cliente'}.pdf`);
}

async function descargarOrdenPDF(ordenId, businessId) {
  const [{ data: orden }, { data: lineas }] = await Promise.all([
    sb.from('fz_ordenes_venta').select('*').eq('id', ordenId).single(),
    sb.from('fz_ordenes_venta_lineas').select('*').eq('orden_id', ordenId).order('orden'),
  ]);
  if (!orden) { toast('No se encontró la orden.', 'error'); return; }
  const [cliente, productos] = await Promise.all([
    loadClientes(businessId).then(cs => cs.find(c => c.id === orden.cliente_id)),
    loadProductosServicios(businessId),
  ]);
  const nombreProducto = (id) => productos.find(p => p.id === id)?.nombre || '';
  const negocio = biz();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const simbolo = orden.moneda === 'USD' ? 'US$' : '$';
  const fmtPdf = (n) => simbolo + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(10, 31, 61);
  doc.text(negocio?.razon_social || negocio?.name || 'Finanzas', margin, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(102, 112, 133);
  if (negocio?.razon_social && negocio?.name && negocio.razon_social !== negocio.name) doc.text(negocio.name, margin, 72);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(185, 138, 46);
  doc.text('ORDEN DE VENTA', pageW - margin, 56, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(26, 43, 69);
  doc.text(`Folio: #${orden.folio}`, pageW - margin, 74, { align: 'right' });
  doc.text(`Fecha: ${fechaCorta(orden.fecha)}`, pageW - margin, 90, { align: 'right' });

  doc.setDrawColor(223, 228, 234); doc.line(margin, 118, pageW - margin, 118);

  let y = 144;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(102, 112, 133);
  doc.text('CLIENTE', margin, y);
  y += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(26, 43, 69);
  doc.text(cliente?.razon_social || cliente?.nombre_comercial || 'Cliente', margin, y);
  y += 15;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 70, 90);
  if (cliente?.razon_social && cliente?.nombre_comercial && cliente.razon_social !== cliente.nombre_comercial) { doc.text(cliente.nombre_comercial, margin, y); y += 14; }
  if (cliente?.rfc) { doc.text(`RFC: ${cliente.rfc}`, margin, y); y += 14; }

  y += 12;

  const filas = (lineas || []).map(l => [
    nombreProducto(l.producto_id) || '—',
    l.descripcion || '',
    fmtNum(l.cantidad),
    fmtPdf(l.precio_unitario),
    fmtPdf(l.importe),
  ]);
  doc.autoTable({
    startY: y,
    head: [['Producto/Servicio', 'Descripción', 'Cantidad', 'Precio unit.', 'Importe']],
    body: filas,
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 10, textColor: [26,43,69], cellPadding: 8 },
    headStyles: { fillColor: [10,31,61], textColor: [255,255,255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 110 }, 2: { halign: 'right', cellWidth: 60 }, 3: { halign: 'right', cellWidth: 80 }, 4: { halign: 'right', cellWidth: 80 } },
    alternateRowStyles: { fillColor: [247,249,252] },
  });

  let finalY = doc.lastAutoTable.finalY + 20;
  const totalesX = pageW - margin - 180;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 70, 90);
  doc.text('Subtotal', totalesX, finalY); doc.text(fmtPdf(orden.subtotal), pageW - margin, finalY, { align: 'right' });
  finalY += 16;
  if (orden.aplica_iva) {
    doc.text(`IVA (${fmtNum(orden.iva_porcentaje)}%)`, totalesX, finalY); doc.text(fmtPdf(orden.iva_monto), pageW - margin, finalY, { align: 'right' });
    finalY += 16;
  }
  doc.setDrawColor(10,31,61); doc.line(totalesX, finalY, pageW - margin, finalY);
  finalY += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(10,31,61);
  doc.text('Total', totalesX, finalY); doc.text(fmtPdf(orden.total), pageW - margin, finalY, { align: 'right' });

  finalY += 30;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(102, 112, 133);
  doc.text(`Estatus: ${orden.estatus}`, margin, finalY);

  if (orden.notas) {
    finalY += 24;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(102, 112, 133);
    doc.text('Notas:', margin, finalY);
    doc.text(orden.notas, margin, finalY + 13, { maxWidth: pageW - margin*2 });
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150, 158, 171);
  doc.text('Este documento es una orden de venta — un compromiso previo a la factura, no un comprobante fiscal.', margin, doc.internal.pageSize.getHeight() - 36);

  doc.save(`Orden ${orden.folio} - ${cliente?.nombre_comercial || 'cliente'}.pdf`);
}

async function eliminarFacturaProveedorConCascada(facturaId, businessId) {
  const { data: info } = await sb.from('fz_proveedores').select('proveedor,factura,importe,origen_poliza_id').eq('id', facturaId).single();
  if (!info) return { ok: false };
  if (info.origen_poliza_id) {
    const { data: poliza } = await sb.from('fz_polizas').select('numero,fecha,concepto').eq('id', info.origen_poliza_id).single();
    const seguir = confirm(
      `Esta factura nació de la Póliza de Diario #${poliza?.numero ?? ''} (${poliza?.fecha || ''}). ` +
      `Al eliminarla, también se eliminará esa póliza completa (todas sus líneas), ya que sin la provisión ` +
      `la póliza dejaría de cuadrar. ¿Deseas continuar?`
    );
    if (!seguir) return { ok: false, cancelado: true };
    await sb.from('fz_polizas').delete().eq('id', info.origen_poliza_id); // borra sus líneas en cascada
    registrarAuditoria(businessId, 'eliminar', 'Pólizas', `Póliza #${poliza?.numero ?? ''} eliminada junto con la factura de ${info.proveedor}`);
  } else {
    if (!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) return { ok: false, cancelado: true };
  }
  await sb.from('fz_adjuntos').delete().eq('tabla', 'fz_proveedores').eq('registro_id', facturaId);
  const { error } = await sb.from('fz_proveedores').delete().eq('id', facturaId);
  if (error) { toast('No se pudo eliminar: ' + error.message, 'error'); return { ok: false }; }
  registrarAuditoria(businessId, 'eliminar', 'Proveedores', `${info.proveedor||'(sin proveedor)'} · factura ${info.factura||'s/f'} · ${fmt(info.importe||0)}`);
  return { ok: true };
}

async function eliminarFacturaCliente(facturaId, businessId) {
  const { data: cobros } = await sb.from('fz_cobros_aplicados').select('*').eq('factura_id', facturaId);
  for (const c of (cobros || [])) {
    if (c.origen_tabla !== 'manual' && c.origen_id) {
      await sb.from(c.origen_tabla).delete().eq('id', c.origen_id);
    }
  }
  await sb.from('fz_cobros_aplicados').delete().eq('factura_id', facturaId);
  await sb.from('fz_facturas_clientes_lineas').delete().eq('factura_id', facturaId);
  const { data: f } = await sb.from('fz_facturas_clientes').select('folio').eq('id', facturaId).single();
  await sb.from('fz_facturas_clientes').delete().eq('id', facturaId);
  registrarAuditoria(businessId, 'eliminar', 'Facturas de clientes', `Factura #${f?.folio ?? ''} eliminada`);
}

const ESTATUS_FISCAL_BADGE = {
  no_aplica: '<span style="color:var(--muted);font-size:12px;">— No aplica —</span>',
  pendiente: '<span class="badge pend">Pendiente de facturar</span>',
  facturada: '<span class="badge pag">Ya facturada</span>',
};
async function siguienteFolio(businessId, tipo) {
  const { data } = await sb.from('fz_folios_contador').select('siguiente').eq('business_id', businessId).eq('tipo', tipo).maybeSingle();
  if (data) {
    await sb.from('fz_folios_contador').update({ siguiente: data.siguiente + 1 }).eq('business_id', businessId).eq('tipo', tipo);
    return data.siguiente;
  }
  await sb.from('fz_folios_contador').insert({ business_id: businessId, tipo, siguiente: 2 });
  return 1;
}

async function renderFacturasClientes(el, b) {
  const scrollY = window.scrollY;
  const [facturas, clientes] = await Promise.all([
    sb.from('fz_facturas_clientes').select('*').eq('business_id', b.id).order('folio', { ascending: false }).then(r => r.data || []),
    loadClientes(b.id),
  ]);
  const nombreCliente = (id) => clientes.find(c => c.id === id)?.nombre_comercial || '(cliente eliminado)';

  el.innerHTML = `
    ${clientesTabsHtml()}
    <div class="card">
      <div class="card-head">
        <h3>Facturas de clientes</h3>
        <button class="btn btn-gold btn-sm" id="addFacturaBtn">+ Nueva factura</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Estatus</th><th>¿Se factura?</th><th></th></tr></thead>
          <tbody>
            ${facturas.length ? facturas.map(f => `<tr>
              <td>#${f.folio}</td>
              <td>${fechaCorta(f.fecha)}</td>
              <td>${nombreCliente(f.cliente_id)}</td>
              <td class="num" style="font-weight:700;">${f.moneda==='USD'?'US':''}${fmt(f.total)}</td>
              <td class="num">${fmt(f.importe_pagado||0)}</td>
              <td><span class="badge ${f.estatus==='Pagado'?'pag':'pend'}">${f.estatus}</span></td>
              <td>${ESTATUS_FISCAL_BADGE[f.estatus_fiscal] || ESTATUS_FISCAL_BADGE.no_aplica}</td>
              ${facturaMenuHtml(f.id)}
            </tr>`).join('') : `<tr><td colspan="8" class="empty">Aún no hay facturas. Usa "+ Nueva factura".</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('addFacturaBtn').addEventListener('click', () => openModalFactura(null, b.id));
  wireFacturaMenu(el, b.id, () => renderFacturasClientes(el, b));
  wireClientesTabs();
  window.scrollTo(0, scrollY);
}

let STATE_facturaLineas = [];
let STATE_facturaEditandoId = null;
let STATE_facturaCatalogos = { clientes: [], productos: [], subcuentas: [], mayores: [] };

async function openModalFactura(factura, businessId) {
  STATE_facturaEditandoId = factura ? factura.id : null;
  const [clientes, productos, subcuentas, mayores] = await Promise.all([
    loadClientes(businessId), loadProductosServicios(businessId), loadSubcuentas(businessId), loadCuentasMayor(businessId),
  ]);
  STATE_facturaCatalogos = { clientes, productos, subcuentas, mayores };

  document.getElementById('modalFacturaTitulo').textContent = factura ? `Factura #${factura.folio}` : 'Nueva factura';
  const selCliente = document.getElementById('facturaCliente');
  selCliente.innerHTML = clientes.map(c => `<option value="${c.id}" ${factura?.cliente_id===c.id?'selected':''}>${c.razon_social || c.nombre_comercial}</option>`).join('') || '<option value="">— crea un cliente primero —</option>';
  const actualizarNombreComercial = () => {
    const c = clientes.find(x => x.id === selCliente.value);
    document.getElementById('facturaNombreComercial').value = c?.nombre_comercial || '';
  };
  selCliente.onchange = actualizarNombreComercial;
  actualizarNombreComercial();
  document.getElementById('facturaFecha').value = factura?.fecha || todayStr();
  document.getElementById('facturaVencimiento').value = factura?.fecha_vencimiento || '';
  document.getElementById('facturaAplicaIva').checked = factura ? !!factura.aplica_iva : true;
  document.getElementById('facturaIvaPorcentaje').value = factura?.iva_porcentaje ?? 16;
  document.getElementById('facturaEstatusFiscal').value = factura?.estatus_fiscal || 'no_aplica';
  document.getElementById('facturaFolioFiscal').value = factura?.folio_fiscal || '';
  document.getElementById('facturaFolioFiscalWrap').style.display = factura?.estatus_fiscal === 'facturada' ? '' : 'none';
  document.getElementById('facturaEsRecurrente').checked = !!factura?.es_recurrente;
  document.getElementById('facturaFrecuencia').value = factura?.frecuencia_dias || 30;
  document.getElementById('facturaFrecuenciaWrap').style.display = factura?.es_recurrente ? '' : 'none';
  document.getElementById('facturaNotas').value = factura?.notas || '';

  const cobrosSection = document.getElementById('facturaCobrosSection');
  if (factura) {
    cobrosSection.style.display = '';
    document.getElementById('cobroFecha').value = todayStr();
    document.getElementById('cobroMonto').value = fmtInputVal(Math.max(0, Number(factura.total) - Number(factura.importe_pagado||0)));
    const [cuentasBancoQ, monedasQ] = await Promise.all([
      sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
      sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
    ]);
    const selCuenta = document.getElementById('cobroCuenta');
    selCuenta.innerHTML = `<option value="manual">Ingreso directo (sin registrar en Banco/Efectivo)</option>`
      + (cuentasBancoQ.data||[]).map(c => `<option value="banco:${c.id}">Banco — ${c.nombre}</option>`).join('')
      + (monedasQ.data||[]).map(m => `<option value="efectivo:${m.id}">Efectivo — ${m.nombre}</option>`).join('');
    await renderCobrosList(businessId, factura.id);
  } else {
    cobrosSection.style.display = 'none';
  }

  if (factura) {
    const { data: lineas } = await sb.from('fz_facturas_clientes_lineas').select('*').eq('factura_id', factura.id).order('orden');
    STATE_facturaLineas = (lineas || []).map(l => ({ ...l, _tmpId: l.id }));
  } else {
    STATE_facturaLineas = [{ _tmpId: 'tmp_' + Date.now(), producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, subcuenta_id: null }];
  }
  renderFacturaLineas();
  document.getElementById('modalFactura').classList.add('show');
}

function renderFacturaLineas() {
  const body = document.getElementById('facturaLineasBody');
  const { productos } = STATE_facturaCatalogos;
  body.innerHTML = STATE_facturaLineas.map((l, idx) => `
    <tr>
      <td>
        <select class="cell factura-linea-producto" data-idx="${idx}" style="min-width:160px;">
          <option value="">— manual —</option>
          ${productos.map(p => `<option value="${p.id}" ${l.producto_id===p.id?'selected':''}>${p.nombre}</option>`).join('')}
        </select>
      </td>
      <td><input class="cell factura-linea-desc" data-idx="${idx}" type="text" value="${(l.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Descripción"></td>
      <td><input class="cell factura-linea-cant" data-idx="${idx}" type="text" inputmode="decimal" value="${l.cantidad||1}"></td>
      <td><input class="cell factura-linea-precio" data-idx="${idx}" type="text" inputmode="decimal" value="${fmtInputVal(l.precio_unitario||0)}"></td>
      <td class="num">${fmt((Number(l.cantidad)||0) * (Number(l.precio_unitario)||0))}</td>
      <td><button class="row-del factura-linea-del" data-idx="${idx}">✕</button></td>
    </tr>`).join('');

  body.querySelectorAll('.factura-linea-producto').forEach(sel => sel.addEventListener('change', () => {
    const idx = Number(sel.dataset.idx);
    const p = productos.find(x => x.id === sel.value);
    if (p) {
      STATE_facturaLineas[idx].producto_id = p.id;
      STATE_facturaLineas[idx].descripcion = p.descripcion || '';
      STATE_facturaLineas[idx].precio_unitario = Number(p.precio) || 0;
      STATE_facturaLineas[idx].subcuenta_id = p.subcuenta_id;
    } else {
      STATE_facturaLineas[idx].producto_id = null;
      STATE_facturaLineas[idx].subcuenta_id = null;
    }
    renderFacturaLineas();
    actualizarTotalesFactura();
  }));
  body.querySelectorAll('.factura-linea-desc').forEach(inp => inp.addEventListener('input', () => {
    STATE_facturaLineas[Number(inp.dataset.idx)].descripcion = inp.value;
  }));
  body.querySelectorAll('.factura-linea-cant').forEach(inp => inp.addEventListener('input', () => {
    STATE_facturaLineas[Number(inp.dataset.idx)].cantidad = leerMonto(inp.value) || 0;
    renderFacturaLineas();
    actualizarTotalesFactura();
  }));
  body.querySelectorAll('.factura-linea-precio').forEach(inp => inp.addEventListener('input', () => {
    STATE_facturaLineas[Number(inp.dataset.idx)].precio_unitario = leerMonto(inp.value) || 0;
    renderFacturaLineas();
    actualizarTotalesFactura();
  }));
  body.querySelectorAll('.factura-linea-del').forEach(btn => btn.addEventListener('click', () => {
    STATE_facturaLineas.splice(Number(btn.dataset.idx), 1);
    renderFacturaLineas();
    actualizarTotalesFactura();
  }));
  actualizarTotalesFactura();
}
document.getElementById('facturaAgregarLinea').addEventListener('click', () => {
  STATE_facturaLineas.push({ _tmpId: 'tmp_' + Date.now() + Math.random(), producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, subcuenta_id: null });
  renderFacturaLineas();
});
function actualizarTotalesFactura() {
  const subtotal = STATE_facturaLineas.reduce((s, l) => s + (Number(l.cantidad)||0) * (Number(l.precio_unitario)||0), 0);
  const aplicaIva = document.getElementById('facturaAplicaIva').checked;
  const ivaPct = Number(document.getElementById('facturaIvaPorcentaje').value) || 0;
  const ivaMonto = aplicaIva ? subtotal * ivaPct / 100 : 0;
  document.getElementById('facturaSubtotalTxt').textContent = fmt(subtotal);
  document.getElementById('facturaIvaTxt').textContent = fmt(ivaMonto);
  document.getElementById('facturaTotalTxt').textContent = fmt(subtotal + ivaMonto);
}
document.getElementById('facturaAplicaIva').addEventListener('change', actualizarTotalesFactura);
document.getElementById('facturaIvaPorcentaje').addEventListener('input', actualizarTotalesFactura);
document.getElementById('facturaEstatusFiscal').addEventListener('change', (e) => {
  document.getElementById('facturaFolioFiscalWrap').style.display = e.target.value === 'facturada' ? '' : 'none';
});
document.getElementById('facturaEsRecurrente').addEventListener('change', (e) => {
  document.getElementById('facturaFrecuenciaWrap').style.display = e.target.checked ? '' : 'none';
});
document.getElementById('closeModalFactura').addEventListener('click', () => {
  document.getElementById('modalFactura').classList.remove('show');
});
async function renderCobrosList(businessId, facturaId) {
  const { data: cobros } = await sb.from('fz_cobros_aplicados').select('*').eq('factura_id', facturaId).order('fecha');
  const box = document.getElementById('facturaCobrosList');
  const etiquetaOrigen = (o) => o === 'fz_bancos_mov' ? 'Banco' : o === 'fz_efectivo_mov' ? 'Efectivo' : 'Directo';
  box.innerHTML = (cobros && cobros.length) ? cobros.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px;">
      <span>${fechaCorta(c.fecha)} · ${etiquetaOrigen(c.origen_tabla)}</span>
      <span style="display:flex;align-items:center;gap:10px;"><strong>${fmt(c.monto)}</strong><button class="row-del cobro-del" data-id="${c.id}" style="font-size:14px;">✕</button></span>
    </div>`).join('') : `<p class="empty" style="padding:6px 0;">Aún no hay cobros registrados para esta factura.</p>`;
  box.querySelectorAll('.cobro-del').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Quitar este cobro? Esto también revierte el movimiento de banco/efectivo si se creó uno.')) return;
    await eliminarCobro(businessId, btn.dataset.id, facturaId);
    await renderCobrosList(businessId, facturaId);
  }));
}

async function eliminarCobro(businessId, cobroId, facturaId) {
  const { data: cobro } = await sb.from('fz_cobros_aplicados').select('*').eq('id', cobroId).single();
  if (!cobro) return;
  if (cobro.origen_tabla !== 'manual' && cobro.origen_id) {
    await sb.from(cobro.origen_tabla).delete().eq('id', cobro.origen_id);
  }
  await sb.from('fz_cobros_aplicados').delete().eq('id', cobroId);
  const { data: f } = await sb.from('fz_facturas_clientes').select('total,importe_pagado').eq('id', facturaId).single();
  if (f) {
    const nuevoPagado = Math.max(0, Number(f.importe_pagado||0) - Number(cobro.monto||0));
    const nuevoEstatus = nuevoPagado <= 0.004 ? 'Pendiente' : (nuevoPagado >= Number(f.total) - 0.01 ? 'Pagado' : 'Parcial');
    await sb.from('fz_facturas_clientes').update({ importe_pagado: nuevoPagado, estatus: nuevoEstatus }).eq('id', facturaId);
  }
}

document.getElementById('registrarCobroBtn').addEventListener('click', async () => {
  const b = biz();
  if (!b || !STATE_facturaEditandoId) return;
  const facturaId = STATE_facturaEditandoId;
  const fecha = document.getElementById('cobroFecha').value || todayStr();
  const monto = leerMonto(document.getElementById('cobroMonto').value);
  if (!monto || monto <= 0) { toast('Escribe un monto válido.', 'error'); return; }
  const destino = document.getElementById('cobroCuenta').value;

  const { data: factura } = await sb.from('fz_facturas_clientes').select('*').eq('id', facturaId).single();
  if (!factura) return;
  const cliente = STATE_facturaCatalogos.clientes.find(c => c.id === factura.cliente_id);

  let origen_tabla = 'manual', origen_id = null;
  if (destino !== 'manual') {
    const [tipo, refId] = destino.split(':');
    const tabla = tipo === 'banco' ? 'fz_bancos_mov' : 'fz_efectivo_mov';
    const payload = tipo === 'banco'
      ? { business_id: b.id, cuenta_id: refId, fecha, concepto: `Cobro factura #${factura.folio}`, descripcion: cliente?.nombre_comercial || '', depositos: monto, cargos: 0 }
      : { business_id: b.id, moneda_id: refId, fecha, proveedor: cliente?.nombre_comercial || '', descripcion: `Cobro factura #${factura.folio}`, depositos: monto, cargos: 0 };
    const { data: mov, error } = await sb.from(tabla).insert(payload).select().single();
    if (error) { toast('Error creando el movimiento: ' + error.message, 'error'); return; }
    origen_tabla = tabla; origen_id = mov.id;
  }

  const { error: errCobro } = await sb.from('fz_cobros_aplicados').insert({ business_id: b.id, factura_id: facturaId, monto, origen_tabla, origen_id, fecha });
  if (errCobro) { toast('Error: ' + errCobro.message, 'error'); return; }

  const nuevoPagado = Number(factura.importe_pagado||0) + monto;
  const nuevoEstatus = nuevoPagado >= Number(factura.total) - 0.01 ? 'Pagado' : 'Parcial';
  await sb.from('fz_facturas_clientes').update({ importe_pagado: nuevoPagado, estatus: nuevoEstatus, fecha_pago: fecha }).eq('id', facturaId);

  registrarAuditoria(b.id, 'editar', 'Facturas de clientes', `Cobro de ${fmt(monto)} aplicado a factura #${factura.folio}`);
  toast('Cobro registrado.');
  document.getElementById('cobroMonto').value = '';
  await renderCobrosList(b.id, facturaId);
});

document.getElementById('saveModalFactura').addEventListener('click', async () => {
  const b = biz();
  if (!b) return;
  const cliente_id = document.getElementById('facturaCliente').value;
  if (!cliente_id) { toast('Elige un cliente.', 'error'); return; }
  const lineasValidas = STATE_facturaLineas.filter(l => ((l.descripcion||'').trim() || l.producto_id) && Number(l.cantidad) > 0);
  if (!lineasValidas.length) { toast('Agrega al menos una línea con descripción y cantidad.', 'error'); return; }

  const cliente = STATE_facturaCatalogos.clientes.find(c => c.id === cliente_id);
  const subtotal = lineasValidas.reduce((s, l) => s + (Number(l.cantidad)||0) * (Number(l.precio_unitario)||0), 0);
  const aplica_iva = document.getElementById('facturaAplicaIva').checked;
  const iva_porcentaje = Number(document.getElementById('facturaIvaPorcentaje').value) || 0;
  const iva_monto = aplica_iva ? subtotal * iva_porcentaje / 100 : 0;
  const es_recurrente = document.getElementById('facturaEsRecurrente').checked;
  const fecha = document.getElementById('facturaFecha').value || todayStr();
  const frecuencia_dias = es_recurrente ? Number(document.getElementById('facturaFrecuencia').value) : null;
  let facturaExistente = null;
  if (STATE_facturaEditandoId) {
    const { data } = await sb.from('fz_facturas_clientes').select('proxima_generacion').eq('id', STATE_facturaEditandoId).single();
    facturaExistente = data;
  }

  const payload = {
    business_id: b.id, cliente_id, fecha,
    fecha_vencimiento: document.getElementById('facturaVencimiento').value || null,
    moneda: cliente?.moneda || 'MXN', tipo_cambio: cliente?.tipo_cambio || 1,
    subtotal, aplica_iva, iva_porcentaje, iva_monto: iva_monto, total: subtotal + iva_monto,
    estatus_fiscal: document.getElementById('facturaEstatusFiscal').value,
    folio_fiscal: document.getElementById('facturaFolioFiscal').value.trim() || null,
    notas: document.getElementById('facturaNotas').value.trim() || null,
    es_recurrente,
    frecuencia_dias,
    proxima_generacion: es_recurrente ? (facturaExistente?.proxima_generacion || sumarDias(fecha, frecuencia_dias)) : null,
  };

  let facturaId = STATE_facturaEditandoId;
  if (facturaId) {
    const { error } = await sb.from('fz_facturas_clientes').update(payload).eq('id', facturaId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('fz_facturas_clientes_lineas').delete().eq('factura_id', facturaId);
  } else {
    payload.folio = await siguienteFolio(b.id, 'factura_cliente');
    payload.estatus = 'Pendiente';
    const { data, error } = await sb.from('fz_facturas_clientes').insert(payload).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    facturaId = data.id;
  }
  const lineasPayload = lineasValidas.map((l, i) => ({
    factura_id: facturaId, business_id: b.id, producto_id: l.producto_id || null,
    descripcion: l.descripcion, cantidad: Number(l.cantidad) || 0, precio_unitario: Number(l.precio_unitario) || 0,
    subcuenta_id: l.subcuenta_id || null, importe: (Number(l.cantidad)||0) * (Number(l.precio_unitario)||0), orden: i,
  }));
  const { error: errLineas } = await sb.from('fz_facturas_clientes_lineas').insert(lineasPayload);
  if (errLineas) { toast('Error guardando las líneas: ' + errLineas.message, 'error'); return; }

  registrarAuditoria(b.id, STATE_facturaEditandoId ? 'editar' : 'crear', 'Facturas de clientes', `Factura #${payload.folio ?? ''} — ${cliente?.nombre_comercial || ''}`);
  document.getElementById('modalFactura').classList.remove('show');
  STATE_facturaEditandoId = null;
  renderClientes();
});

/* ---------- Órdenes de venta ---------- */
async function renderOrdenesVenta(el, b) {
  const scrollY = window.scrollY;
  const [{ data: ordenes }, clientes] = await Promise.all([
    sb.from('fz_ordenes_venta').select('*').eq('business_id', b.id).order('folio', { ascending: false }),
    loadClientes(b.id),
  ]);
  const nombreCliente = (id) => clientes.find(c => c.id === id)?.nombre_comercial || '(cliente eliminado)';
  const ESTATUS_ORDEN_BADGE = {
    Pendiente: '<span class="badge pend">Pendiente</span>',
    Convertida: '<span class="badge pag">Convertida a factura</span>',
    Cancelada: '<span style="color:var(--muted);font-size:12px;">Cancelada</span>',
  };

  el.innerHTML = `
    ${clientesTabsHtml()}
    <div class="card">
      <div class="card-head">
        <h3>Órdenes de venta</h3>
        <button class="btn btn-gold btn-sm" id="addOrdenBtn">+ Nueva orden</button>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Se crean primero como orden; cuando el cliente confirma (entrega/cobro), se convierten en Factura con un clic.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estatus</th><th></th></tr></thead>
          <tbody>
            ${(ordenes||[]).length ? ordenes.map(o => `<tr>
              <td>#${o.folio}</td>
              <td>${fechaCorta(o.fecha)}</td>
              <td>${nombreCliente(o.cliente_id)}</td>
              <td class="num" style="font-weight:700;">${o.moneda==='USD'?'US':''}${fmt(o.total)}</td>
              <td>${ESTATUS_ORDEN_BADGE[o.estatus] || o.estatus}</td>
              <td><button class="btn btn-ghost btn-sm orden-ver" data-id="${o.id}">Ver / Editar</button></td>
            </tr>`).join('') : `<tr><td colspan="6" class="empty">Aún no hay órdenes de venta. Usa "+ Nueva orden".</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('addOrdenBtn').addEventListener('click', () => openModalOrden(null, b.id));
  el.querySelectorAll('.orden-ver').forEach(btn => btn.addEventListener('click', async () => {
    const { data: o } = await sb.from('fz_ordenes_venta').select('*').eq('id', btn.dataset.id).single();
    if (o) openModalOrden(o, b.id);
  }));
  wireClientesTabs();
  window.scrollTo(0, scrollY);
}

let STATE_ordenLineas = [];
let STATE_ordenEditandoId = null;
let STATE_ordenCatalogos = { clientes: [], productos: [] };

async function openModalOrden(orden, businessId) {
  STATE_ordenEditandoId = orden ? orden.id : null;
  const [clientes, productos] = await Promise.all([loadClientes(businessId), loadProductosServicios(businessId)]);
  STATE_ordenCatalogos = { clientes, productos };

  document.getElementById('modalOrdenTitulo').textContent = orden ? `Orden de venta #${orden.folio}` : 'Nueva orden de venta';
  const selCliente = document.getElementById('ordenCliente');
  selCliente.innerHTML = clientes.map(c => `<option value="${c.id}" ${orden?.cliente_id===c.id?'selected':''}>${c.razon_social || c.nombre_comercial}</option>`).join('') || '<option value="">— crea un cliente primero —</option>';
  const actualizarNombreComercial = () => {
    const c = clientes.find(x => x.id === selCliente.value);
    document.getElementById('ordenNombreComercial').value = c?.nombre_comercial || '';
  };
  selCliente.onchange = actualizarNombreComercial;
  actualizarNombreComercial();
  document.getElementById('ordenFecha').value = orden?.fecha || todayStr();
  document.getElementById('ordenAplicaIva').checked = orden ? !!orden.aplica_iva : true;
  document.getElementById('ordenIvaPorcentaje').value = orden?.iva_porcentaje ?? 16;
  document.getElementById('ordenNotas').value = orden?.notas || '';

  const esConvertida = orden?.estatus === 'Convertida';
  document.getElementById('convertirOrdenBtn').style.display = (orden && !esConvertida) ? '' : 'none';
  document.getElementById('descargarOrdenPdfBtn').style.display = orden ? '' : 'none';
  document.getElementById('saveModalOrden').style.display = esConvertida ? 'none' : '';
  const aviso = document.getElementById('ordenConvertidaAviso');
  if (esConvertida) { aviso.style.display = ''; aviso.textContent = '✓ Esta orden ya fue convertida en factura — solo lectura.'; }
  else aviso.style.display = 'none';
  ['ordenCliente','ordenFecha','ordenAplicaIva','ordenIvaPorcentaje','ordenNotas','ordenAgregarLinea'].forEach(id => {
    document.getElementById(id).disabled = esConvertida;
  });

  if (orden) {
    const { data: lineas } = await sb.from('fz_ordenes_venta_lineas').select('*').eq('orden_id', orden.id).order('orden');
    STATE_ordenLineas = (lineas || []).map(l => ({ ...l, _tmpId: l.id }));
  } else {
    STATE_ordenLineas = [{ _tmpId: 'tmp_' + Date.now(), producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, subcuenta_id: null }];
  }
  renderOrdenLineas(esConvertida);
  document.getElementById('modalOrden').classList.add('show');
}

function renderOrdenLineas(soloLectura) {
  const body = document.getElementById('ordenLineasBody');
  const { productos } = STATE_ordenCatalogos;
  body.innerHTML = STATE_ordenLineas.map((l, idx) => `
    <tr>
      <td>
        <select class="cell orden-linea-producto" data-idx="${idx}" style="min-width:160px;" ${soloLectura?'disabled':''}>
          <option value="">— manual —</option>
          ${productos.map(p => `<option value="${p.id}" ${l.producto_id===p.id?'selected':''}>${p.nombre}</option>`).join('')}
        </select>
      </td>
      <td><input class="cell orden-linea-desc" data-idx="${idx}" type="text" value="${(l.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Descripción" ${soloLectura?'disabled':''}></td>
      <td><input class="cell orden-linea-cant" data-idx="${idx}" type="text" inputmode="decimal" value="${l.cantidad||1}" ${soloLectura?'disabled':''}></td>
      <td><input class="cell orden-linea-precio" data-idx="${idx}" type="text" inputmode="decimal" value="${fmtInputVal(l.precio_unitario||0)}" ${soloLectura?'disabled':''}></td>
      <td class="num">${fmt((Number(l.cantidad)||0) * (Number(l.precio_unitario)||0))}</td>
      <td>${soloLectura?'':`<button class="row-del orden-linea-del" data-idx="${idx}">✕</button>`}</td>
    </tr>`).join('');

  body.querySelectorAll('.orden-linea-producto').forEach(sel => sel.addEventListener('change', () => {
    const idx = Number(sel.dataset.idx);
    const p = productos.find(x => x.id === sel.value);
    if (p) {
      STATE_ordenLineas[idx].producto_id = p.id;
      STATE_ordenLineas[idx].descripcion = p.descripcion || '';
      STATE_ordenLineas[idx].precio_unitario = Number(p.precio) || 0;
      STATE_ordenLineas[idx].subcuenta_id = p.subcuenta_id;
    } else {
      STATE_ordenLineas[idx].producto_id = null;
      STATE_ordenLineas[idx].subcuenta_id = null;
    }
    renderOrdenLineas(soloLectura);
    actualizarTotalesOrden();
  }));
  body.querySelectorAll('.orden-linea-desc').forEach(inp => inp.addEventListener('input', () => {
    STATE_ordenLineas[Number(inp.dataset.idx)].descripcion = inp.value;
  }));
  body.querySelectorAll('.orden-linea-cant').forEach(inp => inp.addEventListener('input', () => {
    STATE_ordenLineas[Number(inp.dataset.idx)].cantidad = leerMonto(inp.value) || 0;
    renderOrdenLineas(soloLectura);
    actualizarTotalesOrden();
  }));
  body.querySelectorAll('.orden-linea-precio').forEach(inp => inp.addEventListener('input', () => {
    STATE_ordenLineas[Number(inp.dataset.idx)].precio_unitario = leerMonto(inp.value) || 0;
    renderOrdenLineas(soloLectura);
    actualizarTotalesOrden();
  }));
  body.querySelectorAll('.orden-linea-del').forEach(btn => btn.addEventListener('click', () => {
    STATE_ordenLineas.splice(Number(btn.dataset.idx), 1);
    renderOrdenLineas(soloLectura);
    actualizarTotalesOrden();
  }));
  actualizarTotalesOrden();
}
document.getElementById('ordenAgregarLinea').addEventListener('click', () => {
  STATE_ordenLineas.push({ _tmpId: 'tmp_' + Date.now() + Math.random(), producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, subcuenta_id: null });
  renderOrdenLineas(false);
});
function actualizarTotalesOrden() {
  const subtotal = STATE_ordenLineas.reduce((s, l) => s + (Number(l.cantidad)||0) * (Number(l.precio_unitario)||0), 0);
  const aplicaIva = document.getElementById('ordenAplicaIva').checked;
  const ivaPct = Number(document.getElementById('ordenIvaPorcentaje').value) || 0;
  const ivaMonto = aplicaIva ? subtotal * ivaPct / 100 : 0;
  document.getElementById('ordenSubtotalTxt').textContent = fmt(subtotal);
  document.getElementById('ordenIvaTxt').textContent = fmt(ivaMonto);
  document.getElementById('ordenTotalTxt').textContent = fmt(subtotal + ivaMonto);
}
document.getElementById('ordenAplicaIva').addEventListener('change', actualizarTotalesOrden);
document.getElementById('ordenIvaPorcentaje').addEventListener('input', actualizarTotalesOrden);
document.getElementById('closeModalOrden').addEventListener('click', () => {
  document.getElementById('modalOrden').classList.remove('show');
});
document.getElementById('saveModalOrden').addEventListener('click', async () => {
  const b = biz();
  if (!b) return;
  const cliente_id = document.getElementById('ordenCliente').value;
  if (!cliente_id) { toast('Elige un cliente.', 'error'); return; }
  const lineasValidas = STATE_ordenLineas.filter(l => ((l.descripcion||'').trim() || l.producto_id) && Number(l.cantidad) > 0);
  if (!lineasValidas.length) { toast('Agrega al menos una línea con descripción y cantidad.', 'error'); return; }

  const cliente = STATE_ordenCatalogos.clientes.find(c => c.id === cliente_id);
  const subtotal = lineasValidas.reduce((s, l) => s + (Number(l.cantidad)||0) * (Number(l.precio_unitario)||0), 0);
  const aplica_iva = document.getElementById('ordenAplicaIva').checked;
  const iva_porcentaje = Number(document.getElementById('ordenIvaPorcentaje').value) || 0;
  const iva_monto = aplica_iva ? subtotal * iva_porcentaje / 100 : 0;
  const fecha = document.getElementById('ordenFecha').value || todayStr();

  const payload = {
    business_id: b.id, cliente_id, fecha,
    moneda: cliente?.moneda || 'MXN', tipo_cambio: cliente?.tipo_cambio || 1,
    subtotal, aplica_iva, iva_porcentaje, iva_monto, total: subtotal + iva_monto,
    notas: document.getElementById('ordenNotas').value.trim() || null,
  };

  let ordenId = STATE_ordenEditandoId;
  if (ordenId) {
    const { error } = await sb.from('fz_ordenes_venta').update(payload).eq('id', ordenId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('fz_ordenes_venta_lineas').delete().eq('orden_id', ordenId);
  } else {
    payload.folio = await siguienteFolio(b.id, 'orden_venta');
    payload.estatus = 'Pendiente';
    const { data, error } = await sb.from('fz_ordenes_venta').insert(payload).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    ordenId = data.id;
  }
  const lineasPayload = lineasValidas.map((l, i) => ({
    orden_id: ordenId, business_id: b.id, producto_id: l.producto_id || null,
    descripcion: l.descripcion, cantidad: Number(l.cantidad) || 0, precio_unitario: Number(l.precio_unitario) || 0,
    subcuenta_id: l.subcuenta_id || null, importe: (Number(l.cantidad)||0) * (Number(l.precio_unitario)||0), orden: i,
  }));
  const { error: errLineas } = await sb.from('fz_ordenes_venta_lineas').insert(lineasPayload);
  if (errLineas) { toast('Error guardando las líneas: ' + errLineas.message, 'error'); return; }

  registrarAuditoria(b.id, STATE_ordenEditandoId ? 'editar' : 'crear', 'Órdenes de venta', `Orden #${payload.folio ?? ''} — ${cliente?.nombre_comercial || ''}`);
  document.getElementById('modalOrden').classList.remove('show');
  STATE_ordenEditandoId = null;
  renderClientes();
});
document.getElementById('descargarOrdenPdfBtn').addEventListener('click', async () => {
  const b = biz();
  if (b && STATE_ordenEditandoId) await descargarOrdenPDF(STATE_ordenEditandoId, b.id);
});
document.getElementById('convertirOrdenBtn').addEventListener('click', async () => {
  const b = biz();
  if (!b || !STATE_ordenEditandoId) return;
  if (!confirm('¿Convertir esta orden en Factura? Se creará una nueva factura con estos mismos datos, y la orden quedará marcada como Convertida.')) return;
  const { data: orden } = await sb.from('fz_ordenes_venta').select('*').eq('id', STATE_ordenEditandoId).single();
  const { data: lineasOrden } = await sb.from('fz_ordenes_venta_lineas').select('*').eq('orden_id', STATE_ordenEditandoId);
  if (!orden) return;

  const folio = await siguienteFolio(b.id, 'factura_cliente');
  const payload = {
    business_id: b.id, cliente_id: orden.cliente_id, folio, fecha: todayStr(),
    moneda: orden.moneda, tipo_cambio: orden.tipo_cambio,
    subtotal: orden.subtotal, aplica_iva: orden.aplica_iva, iva_porcentaje: orden.iva_porcentaje, iva_monto: orden.iva_monto, total: orden.total,
    estatus_fiscal: 'no_aplica', notas: orden.notas, estatus: 'Pendiente', importe_pagado: 0,
  };
  const { data: nuevaFactura, error } = await sb.from('fz_facturas_clientes').insert(payload).select().single();
  if (error) { toast('Error al crear la factura: ' + error.message, 'error'); return; }
  if (lineasOrden && lineasOrden.length) {
    await sb.from('fz_facturas_clientes_lineas').insert(lineasOrden.map(l => ({
      factura_id: nuevaFactura.id, business_id: b.id, producto_id: l.producto_id, descripcion: l.descripcion,
      cantidad: l.cantidad, precio_unitario: l.precio_unitario, subcuenta_id: l.subcuenta_id, importe: l.importe, orden: l.orden,
    })));
  }
  await sb.from('fz_ordenes_venta').update({ estatus: 'Convertida', factura_id: nuevaFactura.id }).eq('id', STATE_ordenEditandoId);
  registrarAuditoria(b.id, 'crear', 'Facturas de clientes', `Factura #${folio} generada al convertir la Orden #${orden.folio}`);
  toast(`Convertida — se creó la Factura #${folio}.`);
  document.getElementById('modalOrden').classList.remove('show');
  STATE_ordenEditandoId = null;
  renderClientes();
});

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

let STATE_provArchivosPendientes = [];
let STATE_facturaProveedorEditandoId = null;
function renderFpAdjuntoPendiente() {
  const box = document.getElementById('fpAdjuntoCell');
  const pendientes = STATE_provArchivosPendientes;
  box.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
    ${pendientes.map((f, i) => `<span style="font-size:12px;color:var(--navy-1);background:#f7f9fc;border-radius:5px;padding:2px 6px;">${f.name} <button class="quitar-fp-adjunto-pendiente" data-idx="${i}" style="border:none;background:none;color:var(--red);cursor:pointer;">✕</button></span>`).join('')}
    <label style="font-size:12px;color:var(--navy-3);text-decoration:underline;cursor:pointer;">${pendientes.length?'+ Agregar otro':'Adjuntar'} (se sube al guardar)<input type="file" accept=".pdf,.jpg,.jpeg,.png" class="fp-adjunto-pendiente-input" style="display:none;"></label>
  </span>`;
  const input = box.querySelector('.fp-adjunto-pendiente-input');
  if (input) input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ADJUNTOS_EXT_PERMITIDAS.includes(ext)) { toast('Solo se permiten archivos PDF, JPG o PNG.', 'error'); return; }
    if (file.size > ADJUNTOS_MAX_MB * 1024 * 1024) { toast(`El archivo pesa más de ${ADJUNTOS_MAX_MB} MB.`, 'error'); return; }
    STATE_provArchivosPendientes.push(file);
    renderFpAdjuntoPendiente();
  });
  box.querySelectorAll('.quitar-fp-adjunto-pendiente').forEach(btn => btn.addEventListener('click', () => {
    STATE_provArchivosPendientes.splice(Number(btn.dataset.idx), 1);
    renderFpAdjuntoPendiente();
  }));
}

async function openModalFacturaProveedor(factura, businessId, catalogo, opcionesPagoDesde) {
  STATE_facturaProveedorEditandoId = factura ? factura.id : null;
  document.getElementById('modalFacturaProveedorTitulo').textContent = factura ? 'Editar factura de proveedor' : 'Nueva factura de proveedor';
  const selProv = document.getElementById('fpProveedor');
  selProv.innerHTML = `<option value="">${factura?.proveedor || '— elegir —'}</option>` +
    catalogo.map(c => `<option value="${c.id}" ${factura?.proveedor_id===c.id?'selected':''}>${c.razon_social ? c.razon_social + ' — ' : ''}${c.nombre_comercial || c.nombre}</option>`).join('');
  document.getElementById('fpFactura').value = factura?.factura || '';
  document.getElementById('fpFecha').value = factura?.fecha || todayStr();
  document.getElementById('fpImporte').value = fmtInputVal(factura?.importe || 0);
  document.getElementById('fpEstatus').value = factura?.estatus || 'Pendiente';
  document.getElementById('fpFechaPago').value = factura?.fecha_pago || '';
  const selPagado = document.getElementById('fpPagadoDesde');
  const valorPagadoDesde = factura?.pagado_desde_tipo ? (factura.pagado_desde_tipo + ':' + factura.pagado_desde_cuenta_id) : '';
  selPagado.innerHTML = `<option value="">— sin especificar —</option>` +
    opcionesPagoDesde.map(o => `<option value="${o.value}" ${valorPagadoDesde===o.value?'selected':''}>${o.label}</option>`).join('');
  document.getElementById('deleteFacturaProveedor').style.display = factura ? '' : 'none';

  const [subcuentas, mayores] = await Promise.all([loadSubcuentas(businessId), loadCuentasMayor(businessId)]);
  STATE_fpDesgloseCatalogos = { subcuentas, mayores };
  document.getElementById('fpDesgloseSubcuenta').innerHTML = opcionesSubcuentaHtml(subcuentas, mayores, null) || `<option value="">— crea subcuentas primero en Catálogo de Cuentas —</option>`;
  STATE_fpDesgloseLineas = desgloseLineas(factura?.desglose).map(l => ({ ...l }));
  STATE_fpDesgloseEditandoIdx = null;
  limpiarFormFpDesglose();
  renderFpDesgloseList();

  if (factura) {
    const conteo = await contarAdjuntosPorRegistro('fz_proveedores', [factura.id]);
    document.getElementById('fpAdjuntoCell').innerHTML = adjuntosCellHtml(conteo[factura.id], factura.id);
    wireAdjuntosHandlers(document.getElementById('fpAdjuntoCell'), 'fz_proveedores', businessId, () => {});
  } else {
    STATE_provArchivosPendientes = [];
    renderFpAdjuntoPendiente();
  }

  document.getElementById('modalFacturaProveedor').classList.add('show');
}
document.getElementById('closeFacturaProveedor').addEventListener('click', () => {
  document.getElementById('modalFacturaProveedor').classList.remove('show');
});

let STATE_fpDesgloseLineas = [];
let STATE_fpDesgloseEditandoIdx = null;
let STATE_fpDesgloseCatalogos = { subcuentas: [], mayores: [] };
function nombreSubcuentaFp(id) {
  const s = STATE_fpDesgloseCatalogos.subcuentas.find(x => x.id === id);
  return s ? s.nombre : '(cuenta eliminada)';
}
function renderFpDesgloseList() {
  const box = document.getElementById('fpDesgloseList');
  const total = STATE_fpDesgloseLineas.reduce((s,l)=>s+(Number(l.monto)||0),0);
  const importe = leerMonto(document.getElementById('fpImporte').value) || 0;
  const cuadra = Math.abs(total - importe) < 0.5;
  box.innerHTML = STATE_fpDesgloseLineas.map((l, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 2px;border-bottom:1px solid var(--line);font-size:12.5px;">
      <span>${nombreSubcuentaFp(l.subcuenta_id)}${l.descripcion?' — '+l.descripcion:''}</span>
      <span style="display:flex;align-items:center;gap:8px;">
        <strong>${fmt(l.monto)}</strong>
        <button class="fp-desglose-editar" data-idx="${i}" style="border:none;background:none;color:var(--navy-3);cursor:pointer;font-size:12px;text-decoration:underline;">Editar</button>
        <button class="fp-desglose-quitar" data-idx="${i}" style="border:none;background:none;color:var(--red);cursor:pointer;">✕</button>
      </span>
    </div>`).join('');
  document.getElementById('fpDesgloseResumen').innerHTML = `
    <div style="display:flex;justify-content:space-between;"><span>Importe de la factura</span><strong>${fmt(importe)}</strong></div>
    <div style="display:flex;justify-content:space-between;"><span>Total desglosado</span><strong>${fmt(total)}</strong></div>
    <div style="display:flex;justify-content:space-between;color:${cuadra?'var(--green)':'var(--muted)'};font-weight:700;"><span>${cuadra?'✓ Cuadra':'Diferencia'}</span><span>${cuadra?'':fmt(Math.abs(total-importe))}</span></div>
  `;
  box.querySelectorAll('.fp-desglose-editar').forEach(btn => btn.addEventListener('click', () => {
    const l = STATE_fpDesgloseLineas[Number(btn.dataset.idx)];
    STATE_fpDesgloseEditandoIdx = Number(btn.dataset.idx);
    document.getElementById('fpDesgloseSubcuenta').value = l.subcuenta_id;
    document.getElementById('fpDesgloseImporte').value = l.importe ? fmtInputVal(l.importe) : '';
    document.getElementById('fpDesgloseIva').value = l.iva ? fmtInputVal(l.iva) : '';
    document.getElementById('fpDesgloseMonto').value = fmtInputVal(l.monto);
    document.getElementById('fpDesgloseDescripcion').value = l.descripcion || '';
    document.getElementById('fpDesgloseEditandoAviso').style.display = '';
    document.getElementById('fpCancelarEdicionDesglose').style.display = '';
    document.getElementById('fpAgregarDesgloseLinea').textContent = 'Guardar cambios';
  }));
  box.querySelectorAll('.fp-desglose-quitar').forEach(btn => btn.addEventListener('click', () => {
    STATE_fpDesgloseLineas.splice(Number(btn.dataset.idx), 1);
    renderFpDesgloseList();
  }));
}
function limpiarFormFpDesglose() {
  document.getElementById('fpDesgloseImporte').value = '';
  document.getElementById('fpDesgloseIva').value = '';
  document.getElementById('fpDesgloseMonto').value = '';
  document.getElementById('fpDesgloseDescripcion').value = '';
  document.getElementById('fpDesgloseEditandoAviso').style.display = 'none';
  document.getElementById('fpCancelarEdicionDesglose').style.display = 'none';
  document.getElementById('fpAgregarDesgloseLinea').textContent = '+ Agregar línea';
}
document.getElementById('fpAgregarDesgloseLinea').addEventListener('click', () => {
  const subId = document.getElementById('fpDesgloseSubcuenta').value;
  const importe = leerMonto(document.getElementById('fpDesgloseImporte').value);
  const iva = leerMonto(document.getElementById('fpDesgloseIva').value);
  const montoDirecto = leerMonto(document.getElementById('fpDesgloseMonto').value);
  const monto = montoDirecto || (importe + iva);
  const descripcion = document.getElementById('fpDesgloseDescripcion').value.trim() || null;
  if (!subId || !monto) { toast('Selecciona subcuenta y captura un monto (o Importe + IVA).', 'error'); return; }
  const nuevaLinea = { subcuenta_id: subId, monto, descripcion, importe: importe || null, iva: iva || null };
  if (STATE_fpDesgloseEditandoIdx !== null) STATE_fpDesgloseLineas[STATE_fpDesgloseEditandoIdx] = nuevaLinea;
  else STATE_fpDesgloseLineas.push(nuevaLinea);
  STATE_fpDesgloseEditandoIdx = null;
  limpiarFormFpDesglose();
  renderFpDesgloseList();
});
document.getElementById('fpCancelarEdicionDesglose').addEventListener('click', () => {
  STATE_fpDesgloseEditandoIdx = null;
  limpiarFormFpDesglose();
});
const fpSumarImporteIva = () => {
  const importe = leerMonto(document.getElementById('fpDesgloseImporte').value);
  const iva = leerMonto(document.getElementById('fpDesgloseIva').value);
  if (importe || iva) document.getElementById('fpDesgloseMonto').value = fmtInputVal(importe + iva);
  renderFpDesgloseList();
};
document.getElementById('fpDesgloseImporte').addEventListener('input', fpSumarImporteIva);
document.getElementById('fpDesgloseIva').addEventListener('input', fpSumarImporteIva);
document.getElementById('fpDesgloseMonto').addEventListener('input', renderFpDesgloseList);
document.getElementById('fpImporte').addEventListener('input', renderFpDesgloseList);
document.getElementById('saveFacturaProveedor').addEventListener('click', async () => {
  const b = biz();
  if (!b) return;
  const proveedor_id = document.getElementById('fpProveedor').value || null;
  const catOption = document.getElementById('fpProveedor').selectedOptions[0];
  let proveedorTexto = proveedor_id ? catOption.textContent : (catOption?.textContent || 'Nuevo proveedor');
  if (!proveedor_id && proveedorTexto === '— elegir —') proveedorTexto = 'Nuevo proveedor';
  const payload = {
    business_id: b.id,
    proveedor_id,
    proveedor: proveedorTexto,
    factura: document.getElementById('fpFactura').value.trim() || null,
    fecha: document.getElementById('fpFecha').value || todayStr(),
    importe: leerMonto(document.getElementById('fpImporte').value) || 0,
    estatus: document.getElementById('fpEstatus').value,
    fecha_pago: document.getElementById('fpFechaPago').value || null,
    desglose: STATE_fpDesgloseLineas,
  };
  const pagadoDesde = document.getElementById('fpPagadoDesde').value;
  if (pagadoDesde) {
    const [tipo, cuentaId] = pagadoDesde.split(':');
    payload.pagado_desde_tipo = tipo;
    payload.pagado_desde_cuenta_id = cuentaId;
  } else {
    payload.pagado_desde_tipo = null;
    payload.pagado_desde_cuenta_id = null;
  }

  const idEditando = STATE_facturaProveedorEditandoId;
  let facturaId = idEditando;
  if (idEditando) {
    const { error } = await sb.from('fz_proveedores').update(payload).eq('id', idEditando);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { data, error } = await sb.from('fz_proveedores').insert(payload).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    facturaId = data.id;
    for (const file of STATE_provArchivosPendientes) {
      const subido = await subirAdjunto('fz_proveedores', facturaId, b.id, file);
      if (subido) await sb.from('fz_adjuntos').insert({ business_id: b.id, tabla: 'fz_proveedores', registro_id: facturaId, archivo_path: subido.path, archivo_nombre: subido.nombre });
    }
    STATE_provArchivosPendientes = [];
  }

  registrarAuditoria(b.id, idEditando ? 'editar' : 'crear', 'Proveedores', `${payload.proveedor} · factura ${payload.factura||'s/f'} · ${fmt(payload.importe)}`);
  document.getElementById('modalFacturaProveedor').classList.remove('show');
  STATE_facturaProveedorEditandoId = null;
  toast(idEditando ? 'Factura actualizada.' : 'Factura agregada.');
  renderProveedores();
});
document.getElementById('deleteFacturaProveedor').addEventListener('click', async () => {
  const b = biz();
  if (!b || !STATE_facturaProveedorEditandoId) return;
  const r = await eliminarFacturaProveedorConCascada(STATE_facturaProveedorEditandoId, b.id);
  if (!r.ok) return;
  document.getElementById('modalFacturaProveedor').classList.remove('show');
  STATE_facturaProveedorEditandoId = null;
  renderProveedores();
});

function provRowHtml(p, catalogo, opcionesPagoDesde, conteoAdjuntos, todasFacturas) {
  const desgloseTotal = desgloseLineas(p.desglose).reduce((s,l)=>s+(Number(l.monto)||0),0);
  const desgloseOk = Math.abs(desgloseTotal - (Number(p.importe)||0)) < 1 && desgloseTotal > 0;
  const esCredito = Number(p.importe) < 0;
  const saldoPendiente = Number(p.importe) - Number(p.importe_pagado || 0);
  const catMatch = p.proveedor_id ? catalogo.find(c => c.id === p.proveedor_id) : null;
  const nombreMostrado = catMatch
    ? (catMatch.razon_social ? `${catMatch.razon_social}${catMatch.nombre_comercial ? ' — ' + catMatch.nombre_comercial : ''}` : (catMatch.nombre_comercial || catMatch.nombre))
    : (p.proveedor || '(sin proveedor)');
  return `<tr style="${esCredito?'background:#f2fbf5;':''}">
    <td><input class="cell prov-cell" type="date" value="${p.fecha}" data-id="${p.id}" data-field="fecha"></td>
    <td>${nombreMostrado}</td>
    <td><input class="cell prov-cell" type="text" value="${p.factura||''}" data-id="${p.id}" data-field="factura"></td>
    <td>
      <input class="cell prov-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(p.importe)}" data-id="${p.id}" data-field="importe">
      ${esCredito ? `<div style="font-size:10.5px;color:var(--green);margin-top:2px;">crédito a favor</div>` : (Number(p.importe_pagado)>0 && p.estatus!=='Pagado' ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px;white-space:nowrap;">pagado ${fmt(p.importe_pagado)} · pendiente ${fmt(saldoPendiente)}</div>` : '')}
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
    <td>${adjuntosCellHtml(conteoAdjuntos, p.id)}</td>
    <td style="position:relative;">
      <button class="btn btn-ghost btn-sm prov-menu-btn" data-id="${p.id}" style="padding:5px 12px;">⋯</button>
      <div class="prov-menu-dropdown" data-menu="${p.id}" style="display:none;position:absolute;right:8px;top:100%;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.14);z-index:20;min-width:130px;overflow:hidden;">
        <button class="prov-editar" data-id="${p.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;">Editar factura</button>
        <button class="prov-del" data-id="${p.id}" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--red);border-top:1px solid var(--line);">Eliminar</button>
      </div>
    </td>
  </tr>`;
}

/* ============================================================
   P&L — ESTADO DE RESULTADOS
   ============================================================ */
let STATE_plVista = 'mensual'; // 'mensual' | 'acumulado' | 'anual'
let STATE_plRangoDesde = '';
let STATE_plRangoHasta = '';
let STATE_plAnualDesdeYm = ''; // 'YYYY-MM', vacío = enero del año actual
let STATE_plAnualHastaYm = ''; // 'YYYY-MM', vacío = diciembre del año actual
let STATE_plAnualModo = 'detalle'; // 'detalle' | 'ejecutivo'
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

async function getPolizaLineasParaCuenta(businessId, tipo, refId, hastaFecha) {
  const { data: lineas } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('cuenta_tipo', tipo).eq('cuenta_ref_id', refId);
  if (!lineas || !lineas.length) return [];
  const polizaIds = [...new Set(lineas.map(l => l.poliza_id))];
  const { data: polizas } = await sb.from('fz_polizas').select('id,fecha,concepto,numero').in('id', polizaIds);
  const polizaMap = Object.fromEntries((polizas || []).map(p => [p.id, p]));
  return lineas.map(l => ({ ...l, poliza: polizaMap[l.poliza_id] })).filter(l => l.poliza && (!hastaFecha || l.poliza.fecha <= hastaFecha));
}

function construirArbolSubcuenta(subcuentaId, subcuentas, porSubcuenta) {
  const sub = subcuentas.find(s => s.id === subcuentaId);
  const hijos = subcuentasHijas(subcuentaId, subcuentas).map(h => construirArbolSubcuenta(h.id, subcuentas, porSubcuenta));
  const propio = porSubcuenta[subcuentaId] || 0;
  const total = propio + hijos.reduce((s,h)=>s+h.total,0);
  return { id: subcuentaId, nombre: sub ? sub.nombre : '(eliminada)', propio, hijos, total };
}
function aplanarArbol(nodo) {
  return [nodo, ...nodo.hijos.flatMap(aplanarArbol)];
}

/* ============================================================
   BALANCE GENERAL — Activo = Pasivo + Capital
   ============================================================ */
async function computeSaldoCuentaMayorPolizas(businessId, cuentaMayorId, subcuentas, signoNormal, hastaFecha) {
  // signoNormal 'debe' (Activo): Cargo aumenta, Abono disminuye.
  // signoNormal 'haber' (Pasivo/Capital): Abono aumenta, Cargo disminuye.
  const subs = subcuentas.filter(s => s.cuenta_mayor_id === cuentaMayorId);
  if (!subs.length) return { subs: [], total: 0 };
  const subIds = new Set(subs.map(s => s.id));
  const [lineasQ, facturasQ] = await Promise.all([
    sb.from('fz_polizas_lineas').select('cargo,abono,subcuenta_id,poliza_id').eq('business_id', businessId).eq('cuenta_tipo', 'subcuenta').in('subcuenta_id', subs.map(s => s.id)),
    sb.from('fz_proveedores').select('fecha,desglose').eq('business_id', businessId),
  ]);
  let lineas = lineasQ.data || [];
  if (hastaFecha && lineas.length) {
    const polizaIds = [...new Set(lineas.map(l => l.poliza_id))];
    const { data: polizas } = await sb.from('fz_polizas').select('id,fecha').in('id', polizaIds).lte('fecha', hastaFecha);
    const idsValidos = new Set((polizas || []).map(p => p.id));
    lineas = lineas.filter(l => idsValidos.has(l.poliza_id));
  }
  const porSub = {};
  lineas.forEach(l => {
    const neto = signoNormal === 'debe' ? (Number(l.cargo) || 0) - (Number(l.abono) || 0) : (Number(l.abono) || 0) - (Number(l.cargo) || 0);
    porSub[l.subcuenta_id] = (porSub[l.subcuenta_id] || 0) + neto;
  });
  // Facturas de Proveedores desglosadas contra alguna de estas subcuentas también cuentan
  // (ej. una compra que se clasificó como Activo en vez de Gasto) — antes solo se veían
  // en Proveedores/P&L, nunca llegaban al Balance General.
  (facturasQ.data || []).filter(f => !hastaFecha || f.fecha <= hastaFecha).forEach(f => {
    desgloseLineas(f.desglose).forEach(linea => {
      if (subIds.has(linea.subcuenta_id) && Number(linea.monto)) {
        const monto = Number(linea.monto);
        porSub[linea.subcuenta_id] = (porSub[linea.subcuenta_id] || 0) + (signoNormal === 'debe' ? monto : -monto);
      }
    });
  });
  const raices = subcuentasRaiz(cuentaMayorId, subcuentas).map(s => construirArbolSubcuenta(s.id, subcuentas, porSub)).filter(s => Math.abs(s.total) > 0.004);
  return { subs: raices, total: raices.reduce((s,x)=>s+x.total,0) };
}

async function computeUtilidadAcumulada(businessId, hastaYm) {
  const year = hastaYm.slice(0,4);
  const periodo = { start: `${year}-01-01`, end: monthBounds(hastaYm).end, mesStart: `${year}-01`, mesEnd: hastaYm };
  const [conceptosVenta, conceptos, subcuentas, mayores, conceptosSistema, ventasQ] = await Promise.all([
    loadConceptosVenta(businessId), loadConceptos(businessId), loadSubcuentas(businessId), loadCuentasMayor(businessId), loadConceptosSistema(businessId),
    sb.from('fz_ventas').select('*').eq('business_id', businessId).gte('fecha', periodo.start).lte('fecha', periodo.end),
  ]);
  const v = ventasQ.data || [];
  const totalIngresosVentas = conceptosVenta.reduce((s,c) => {
    const monto = v.reduce((ss,r)=>ss+(Number((r.venta_data||{})[c.id])||0),0);
    return s + (c.tipo==='resta'?-monto:monto);
  }, 0);
  const gastosOperativos = v.reduce((s,r)=>s+(Number(r.gastos)||0),0);
  const porCatPL = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), bancos: conceptos.filter(c=>c.categoria==='bancos'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  let diffPeriodo = 0;
  v.forEach(r => { diffPeriodo += computeRowDiffs(r, conceptosVenta, porCatPL, conceptosSistema).difTotal; });
  const faltanteCaja = diffPeriodo>0?diffPeriodo:0;
  const sobranteCaja = diffPeriodo<0?-diffPeriodo:0;
  const gClas = await computeGastosClasificados(businessId, periodo, subcuentas, mayores);
  const gCostos = await computeGastosClasificados(businessId, periodo, subcuentas, mayores, 'costo');
  const iPoliza = await computeIngresosPoliza(businessId, periodo, subcuentas, mayores);
  const totalIngresosFinal = totalIngresosVentas + sobranteCaja + iPoliza.total;
  const gastosTotales = gastosOperativos + gClas.totalClasificado + gClas.sinClasificar + gCostos.totalClasificado + faltanteCaja;
  return totalIngresosFinal - gastosTotales;
}

function fmtNeg(n) {
  return Number(n) < 0 ? `<span style="color:var(--red);">${fmt(n)}</span>` : fmt(n);
}
function fmtSigno(n) {
  return `<span style="color:${Number(n)>=0?'var(--green)':'var(--red)'};">${fmt(n)}</span>`;
}
function filaArbolBalanceHtml(nodo, nivel, detalleAbiertoHtml) {
  const indent = 40 + (nivel - 1) * 18;
  const estilo = nivel === 1 ? 'font-weight:600;' : 'color:var(--muted);font-size:12.5px;';
  const abierto = STATE_balanceDetalleAbierto === nodo.id;
  let html = `<tr class="balance-subcuenta-row" data-subcuenta="${nodo.id}" style="cursor:pointer;"><td style="padding-left:${indent}px;${estilo}">${abierto?'▾':'▸'} ${nodo.nombre}</td><td class="num" style="${nivel === 1 ? 'font-weight:600;' : ''}">${fmtNeg(nodo.total)}</td></tr>`;
  if (abierto) html += detalleAbiertoHtml;
  nodo.hijos.forEach(h => { html += filaArbolBalanceHtml(h, nivel + 1, detalleAbiertoHtml); });
  return html;
}

let STATE_balanceHastaYm = '';
let STATE_balanceDetalleAbierto = null;

async function getDetallePolizasSubcuenta(businessId, subcuentaId, hastaFecha) {
  const [lineasQ, facturasQ] = await Promise.all([
    sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('cuenta_tipo', 'subcuenta').eq('subcuenta_id', subcuentaId),
    sb.from('fz_proveedores').select('*').eq('business_id', businessId),
  ]);
  const lineas = lineasQ.data || [];
  const filas = [];
  if (lineas.length) {
    const polizaIds = [...new Set(lineas.map(l => l.poliza_id))];
    const { data: polizas } = await sb.from('fz_polizas').select('id,fecha,numero,concepto').in('id', polizaIds);
    const polizaMap = Object.fromEntries((polizas || []).map(p => [p.id, p]));
    lineas.forEach(l => {
      const p = polizaMap[l.poliza_id];
      if (!p) return;
      if (hastaFecha && p.fecha > hastaFecha) return;
      const monto = (Number(l.cargo) || 0) - (Number(l.abono) || 0);
      if (monto) filas.push({ fecha: p.fecha, proveedor: `Póliza #${p.numero ?? ''}`, concepto: l.descripcion || p.concepto || '—', importe: monto, pago: 'Póliza de diario', origen: { tipo: 'poliza', id: p.id, fecha: p.fecha } });
    });
  }
  (facturasQ.data || []).filter(f => !hastaFecha || f.fecha <= hastaFecha).forEach(f => {
    desgloseLineas(f.desglose).forEach(linea => {
      if (linea.subcuenta_id === subcuentaId && Number(linea.monto)) {
        filas.push({ fecha: f.fecha, proveedor: f.proveedor || '(sin proveedor)', concepto: linea.descripcion || f.factura || '(factura)', importe: Number(linea.monto), pago: 'Factura de proveedor', origen: { tipo: 'proveedor', id: f.id, fecha: f.fecha } });
      }
    });
  });
  return filas.sort((a,b) => a.fecha.localeCompare(b.fecha));
}

async function renderBalanceGeneral() {
  const el = document.getElementById('sec-balance');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const scrollY = window.scrollY;

  const [subcuentas, mayores, monedasQ, cuentasQ, provQ, conceptosEfvoQ, conceptosTarjQ] = await Promise.all([
    loadSubcuentas(b.id), loadCuentasMayor(b.id),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).eq('activo', true),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).eq('activo', true),
    sb.from('fz_proveedores').select('id,fecha,importe,importe_pagado,estatus').eq('business_id', b.id),
    sb.from('fz_conceptos').select('*').eq('business_id', b.id).eq('categoria', 'efectivo'),
    sb.from('fz_conceptos').select('*').eq('business_id', b.id).in('categoria', ['tarjetas','bancos']),
  ]);
  const monedas = monedasQ.data || [];
  const cuentasBanco = cuentasQ.data || [];
  const conceptosEfectivo = conceptosEfvoQ.data || [];
  const conceptosTarjetas = conceptosTarjQ.data || [];

  const hastaYm = STATE_balanceHastaYm || STATE.currentMonth;
  const hastaFecha = monthBounds(hastaYm).end;
  const esHoy = hastaYm === STATE.currentMonth && hastaFecha >= todayStr();

  let totalEfectivo = 0;
  const detalleEfectivo = [];
  for (const m of monedas) {
    const saldo = await computeMonedaSaldo(b.id, m, conceptosEfectivo, hastaFecha);
    const pesoEquiv = saldo * (Number(m.tc_reporte) || 1);
    totalEfectivo += pesoEquiv;
    if (Math.abs(pesoEquiv) > 0.004) detalleEfectivo.push({ id: m.id, nombre: m.nombre, monto: pesoEquiv });
  }
  let totalBancos = 0;
  const detalleBancos = [];
  for (const c of cuentasBanco) {
    const saldo = await computeBancoSaldo(b.id, c, conceptosTarjetas, hastaFecha);
    totalBancos += saldo;
    if (Math.abs(saldo) > 0.004) detalleBancos.push({ id: c.id, nombre: c.nombre, monto: saldo });
  }

  const otrosActivos = [];
  for (const m of mayores.filter(m => m.tipo === 'activo')) {
    const r = await computeSaldoCuentaMayorPolizas(b.id, m.id, subcuentas, 'debe', hastaFecha);
    if (Math.abs(r.total) > 0.004) otrosActivos.push({ nombre: m.nombre, subs: r.subs, total: r.total });
  }
  const totalOtrosActivos = otrosActivos.reduce((s,x)=>s+x.total,0);

  const { data: facturasClientesData } = await sb.from('fz_facturas_clientes').select('total,importe_pagado,moneda,tipo_cambio').eq('business_id', b.id).lte('fecha', hastaFecha);
  const cuentasPorCobrar = (facturasClientesData || []).reduce((s,f) => {
    const tc = f.moneda === 'USD' ? (Number(f.tipo_cambio) || 1) : 1;
    return s + ((Number(f.total) || 0) - (Number(f.importe_pagado) || 0)) * tc;
  }, 0);

  const totalActivo = totalEfectivo + totalBancos + totalOtrosActivos + cuentasPorCobrar;

  const prov = (provQ.data || []).filter(p => p.fecha <= hastaFecha);
  const proveedoresPendiente = prov.filter(p => p.estatus === 'Pendiente' || p.estatus === 'Parcial').reduce((s,p)=>s+(Number(p.importe)-Number(p.importe_pagado||0)),0);

  const otrosPasivos = [];
  for (const m of mayores.filter(m => m.tipo === 'pasivo')) {
    const r = await computeSaldoCuentaMayorPolizas(b.id, m.id, subcuentas, 'haber', hastaFecha);
    if (Math.abs(r.total) > 0.004) otrosPasivos.push({ nombre: m.nombre, subs: r.subs, total: r.total });
  }
  const totalOtrosPasivos = otrosPasivos.reduce((s,x)=>s+x.total,0);
  const totalPasivo = proveedoresPendiente + totalOtrosPasivos;

  const cuentasCapital = [];
  for (const m of mayores.filter(m => m.tipo === 'capital')) {
    const r = await computeSaldoCuentaMayorPolizas(b.id, m.id, subcuentas, 'haber', hastaFecha);
    if (Math.abs(r.total) > 0.004) cuentasCapital.push({ nombre: m.nombre, subs: r.subs, total: r.total });
  }
  const totalCapitalCuentas = cuentasCapital.reduce((s,x)=>s+x.total,0);
  const utilidadAcumulada = await computeUtilidadAcumulada(b.id, hastaYm);
  const totalCapital = totalCapitalCuentas + utilidadAcumulada;

  const totalPasivoCapital = totalPasivo + totalCapital;
  const diferenciaCuadre = totalActivo - totalPasivoCapital;
  const cuadra = Math.abs(diferenciaCuadre) < 1;

  // Si hay una subcuenta con el detalle desplegado, traer sus movimientos de una vez
  let detalleAbiertoHtml = '';
  if (STATE_balanceDetalleAbierto) {
    const filasDetalle = await getDetallePolizasSubcuenta(b.id, STATE_balanceDetalleAbierto, hastaFecha);
    detalleAbiertoHtml = detalleSubcuentaHtml(filasDetalle, 2);
  }
  const filaArbolBalanceConDetalle = (nodo, nivel) => filaArbolBalanceHtml(nodo, nivel, detalleAbiertoHtml);

  el.innerHTML = `
    <div class="grid-3" style="margin-bottom:12px;max-width:340px;">
      <div class="field" style="margin-bottom:0;">
        <label>Ver balance al cierre de</label>
        <input type="month" id="balanceHastaMes" value="${hastaYm}">
      </div>
      <div class="field" style="margin-bottom:0;display:flex;align-items:flex-end;">
        ${!esHoy ? `<button class="btn btn-ghost btn-sm" id="balanceHastaHoy">✕ Ver a hoy</button>` : ''}
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total Activo</div><div class="value num">${fmt(totalActivo)}</div></div>
      <div class="kpi"><div class="label">Total Pasivo</div><div class="value num red">${fmt(totalPasivo)}</div></div>
      <div class="kpi"><div class="label">Total Capital</div><div class="value num ${totalCapital>=0?'green':'red'}">${fmt(totalCapital)}</div></div>
      <div class="kpi"><div class="label">¿Cuadra?</div><div class="value num ${cuadra?'green':'red'}">${cuadra ? '✓ Sí' : fmt(diferenciaCuadre)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Balance General — ${b.name}</h3><span class="hint">${esHoy ? 'Al día de hoy · ' + todayStr() : 'Al cierre de ' + MESES_LARGO[Number(hastaYm.slice(5,7))-1] + ' ' + hastaYm.slice(0,4)}</span></div>
      <table>
        <tbody>
          <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">ACTIVO</td></tr>
          <tr><td style="padding-left:22px;font-weight:600;">Efectivo y equivalentes</td><td class="num" style="font-weight:600;">${fmtNeg(totalEfectivo)}</td></tr>
          ${detalleEfectivo.map(d => `<tr class="balance-link-efectivo" data-id="${d.id}" style="cursor:pointer;"><td style="padding-left:40px;color:var(--muted);font-size:12.5px;">${d.nombre} ↗</td><td class="num">${fmtNeg(d.monto)}</td></tr>`).join('')}
          <tr><td style="padding-left:22px;font-weight:600;">Bancos</td><td class="num" style="font-weight:600;">${fmtNeg(totalBancos)}</td></tr>
          ${detalleBancos.map(d => `<tr class="balance-link-banco" data-id="${d.id}" style="cursor:pointer;"><td style="padding-left:40px;color:var(--muted);font-size:12.5px;">${d.nombre} ↗</td><td class="num">${fmtNeg(d.monto)}</td></tr>`).join('')}
          <tr class="balance-link-clientes" style="cursor:pointer;"><td style="padding-left:22px;font-weight:600;">Cuentas por cobrar (Clientes) ↗</td><td class="num" style="font-weight:600;">${fmtNeg(cuentasPorCobrar)}</td></tr>
          ${otrosActivos.map(m => `
            <tr><td style="padding-left:22px;font-weight:600;">${m.nombre}</td><td class="num" style="font-weight:600;">${fmtNeg(m.total)}</td></tr>
            ${m.subs.map(s => filaArbolBalanceConDetalle(s, 1)).join('')}
          `).join('')}
          <tr class="total-row"><td>Total Activo</td><td class="num">${fmtNeg(totalActivo)}</td></tr>

          <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">PASIVO</td></tr>
          <tr class="balance-link-proveedores" style="cursor:pointer;"><td style="padding-left:22px;font-weight:600;">Proveedores por pagar ↗</td><td class="num" style="font-weight:600;">${fmtNeg(proveedoresPendiente)}</td></tr>
          ${otrosPasivos.map(m => `
            <tr><td style="padding-left:22px;font-weight:600;">${m.nombre}</td><td class="num" style="font-weight:600;">${fmtNeg(m.total)}</td></tr>
            ${m.subs.map(s => filaArbolBalanceConDetalle(s, 1)).join('')}
          `).join('')}
          <tr class="total-row"><td>Total Pasivo</td><td class="num">${fmtNeg(totalPasivo)}</td></tr>

          <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">CAPITAL</td></tr>
          ${cuentasCapital.map(m => `
            <tr><td style="padding-left:22px;font-weight:600;">${m.nombre}</td><td class="num" style="font-weight:600;">${fmtNeg(m.total)}</td></tr>
            ${m.subs.map(s => filaArbolBalanceConDetalle(s, 1)).join('')}
          `).join('')}
          <tr><td style="padding-left:22px;">Utilidad acumulada del ejercicio ${hastaYm.slice(0,4)}</td><td class="num">${fmtSigno(utilidadAcumulada)}</td></tr>
          <tr class="total-row"><td>Total Capital</td><td class="num">${fmtSigno(totalCapital)}</td></tr>

          <tr class="total-row" style="border-top:2px solid var(--navy-1);"><td>Total Pasivo + Capital</td><td class="num">${fmtNeg(totalPasivoCapital)}</td></tr>
        </tbody>
      </table>
      <p style="font-size:11.5px;color:var(--muted);margin-top:12px;">Efectivo, Bancos y Proveedores se calculan en automático desde sus módulos. Las demás cuentas (Activos fijos, Acreedores, Capital, etc.) se alimentan desde Pólizas de Diario — usa el Catálogo de Cuentas para crearlas.</p>
    </div>
  `;
  document.getElementById('balanceHastaMes').addEventListener('change', (e) => { STATE_balanceHastaYm = e.target.value; renderBalanceGeneral(); });
  const hoyBtn = document.getElementById('balanceHastaHoy');
  if (hoyBtn) hoyBtn.addEventListener('click', () => { STATE_balanceHastaYm = ''; renderBalanceGeneral(); });
  el.querySelectorAll('.balance-subcuenta-row').forEach(tr => tr.addEventListener('click', () => {
    STATE_balanceDetalleAbierto = STATE_balanceDetalleAbierto === tr.dataset.subcuenta ? null : tr.dataset.subcuenta;
    renderBalanceGeneral();
  }));
  el.querySelectorAll('.abrir-origen-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const origen = JSON.parse(btn.dataset.origen.replace(/&apos;/g, "'"));
    abrirOrigenDesdeDetalle(origen, b.id);
  }));
  el.querySelectorAll('.balance-link-efectivo').forEach(tr => tr.addEventListener('click', () => {
    STATE_monedaAbierta = tr.dataset.id;
    irASeccion('efectivo');
  }));
  el.querySelectorAll('.balance-link-banco').forEach(tr => tr.addEventListener('click', () => {
    STATE_bancoCuentaAbierta = tr.dataset.id;
    irASeccion('bancos');
  }));
  const provLink = el.querySelector('.balance-link-proveedores');
  if (provLink) provLink.addEventListener('click', () => irASeccion('proveedores'));
  const clientesLink = el.querySelector('.balance-link-clientes');
  if (clientesLink) clientesLink.addEventListener('click', () => { STATE_clientesVista = 'directorio'; irASeccion('clientes'); });
  window.scrollTo(0, scrollY);
}

async function computeGastosClasificados(businessId, periodo, subcuentas, mayores, tipoFiltro = 'gasto') {
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
    else if (tipoFiltro === 'gasto') sinClasificar += Number(m.cargos) || 0;
  });
  const gastosManuales = plGastosQ.data || [];
  gastosManuales.forEach(g => {
    if (g.subcuenta_id) porSubcuenta[g.subcuenta_id] = (porSubcuenta[g.subcuenta_id] || 0) + (Number(g.monto) || 0);
    else if (tipoFiltro === 'gasto') sinClasificar += Number(g.monto) || 0;
  });
  lineasPoliza.forEach(l => {
    if (!l.subcuenta_id) return;
    const sub = subcuentas.find(s => s.id === l.subcuenta_id);
    const mayor = sub && mayores.find(m => m.id === sub.cuenta_mayor_id);
    if (mayor && (mayor.tipo === 'gasto' || mayor.tipo === 'costo')) {
      porSubcuenta[l.subcuenta_id] = (porSubcuenta[l.subcuenta_id] || 0) + ((Number(l.cargo)||0) - (Number(l.abono)||0));
    }
  });

  const porMayor = mayores.filter(m=>m.tipo===tipoFiltro).map(m => {
    const subs = subcuentasRaiz(m.id, subcuentas)
      .map(s => construirArbolSubcuenta(s.id, subcuentas, porSubcuenta))
      .filter(s => s.total);
    return { nombre: m.nombre, subs, subtotal: subs.reduce((s,x)=>s+x.total,0), conceptoVentaVinculadoId: m.concepto_venta_vinculado_id || null };
  }).filter(m => m.subtotal);

  const totalClasificado = porMayor.reduce((s,m)=>s+m.subtotal,0);
  return { porMayor, sinClasificar: tipoFiltro==='gasto' ? sinClasificar : 0, totalClasificado, gastosManuales: tipoFiltro==='gasto' ? gastosManuales : [] };
}

async function computeIngresosPoliza(businessId, periodo, subcuentas, mayores) {
  const [lineasPoliza, facturasClientes] = await Promise.all([
    getPolizasLineasPeriodo(businessId, periodo),
    sb.from('fz_facturas_clientes').select('id,moneda,tipo_cambio').eq('business_id', businessId).gte('fecha', periodo.start).lte('fecha', periodo.end).then(r => r.data || []),
  ]);
  const porSubcuenta = {};
  lineasPoliza.forEach(l => {
    if (!l.subcuenta_id) return;
    const sub = subcuentas.find(s => s.id === l.subcuenta_id);
    const mayor = sub && mayores.find(m => m.id === sub.cuenta_mayor_id);
    if (mayor && mayor.tipo === 'ingreso') {
      porSubcuenta[l.subcuenta_id] = (porSubcuenta[l.subcuenta_id] || 0) + ((Number(l.abono)||0) - (Number(l.cargo)||0));
    }
  });

  // Facturas de clientes clasificadas contra una cuenta de Ingreso (el IVA no cuenta como
  // ingreso propio, solo el importe de cada línea; se convierte a pesos si la factura es en USD).
  if (facturasClientes.length) {
    const tcPorFactura = Object.fromEntries(facturasClientes.map(f => [f.id, f.moneda === 'USD' ? (Number(f.tipo_cambio) || 1) : 1]));
    const { data: lineasFacturas } = await sb.from('fz_facturas_clientes_lineas').select('factura_id,subcuenta_id,importe').in('factura_id', facturasClientes.map(f => f.id));
    (lineasFacturas || []).forEach(l => {
      if (!l.subcuenta_id) return;
      const sub = subcuentas.find(s => s.id === l.subcuenta_id);
      const mayor = sub && mayores.find(m => m.id === sub.cuenta_mayor_id);
      if (mayor && mayor.tipo === 'ingreso') {
        const monto = (Number(l.importe) || 0) * (tcPorFactura[l.factura_id] || 1);
        porSubcuenta[l.subcuenta_id] = (porSubcuenta[l.subcuenta_id] || 0) + monto;
      }
    });
  }

  const porMayor = mayores.filter(m=>m.tipo==='ingreso').map(m => {
    const subs = subcuentasRaiz(m.id, subcuentas)
      .map(s => construirArbolSubcuenta(s.id, subcuentas, porSubcuenta))
      .filter(s => s.total);
    return { id: m.id, nombre: m.nombre, subs, subtotal: subs.reduce((s,x)=>s+x.total,0) };
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
        filas.push({ fecha: f.fecha, proveedor: f.proveedor || '(sin proveedor)', concepto: linea.descripcion || f.factura || '(factura)', importe: Number(linea.monto), pago, origen: { tipo: 'proveedor', id: f.id, fecha: f.fecha } });
      }
    });
  });
  (bmQ.data || []).forEach(m => filas.push({ fecha: m.fecha, proveedor: m.descripcion || '(movimiento bancario)', concepto: m.concepto || '—', importe: Number(m.cargos) || 0, pago: 'Banco', origen: { tipo: 'bancos', id: m.id, cuentaId: m.cuenta_id, fecha: m.fecha } }));
  (emQ.data || []).forEach(m => filas.push({ fecha: m.fecha, proveedor: m.proveedor || '(movimiento efectivo)', concepto: m.descripcion || '—', importe: Number(m.cargos) || 0, pago: 'Efectivo', origen: { tipo: 'efectivo', id: m.id, monedaId: m.moneda_id, fecha: m.fecha } }));
  (plGastosQ.data || []).forEach(g => filas.push({ fecha: g.mes + '-01', proveedor: 'Ajuste manual', concepto: g.descripcion || '—', importe: Number(g.monto) || 0, pago: 'Ajuste manual', origen: { tipo: 'ajuste', id: g.id, fecha: g.mes + '-01' } }));

  const lineasPoliza = lineasPolizaQ.data || [];
  if (lineasPoliza.length) {
    const polizaIds = [...new Set(lineasPoliza.map(l => l.poliza_id))];
    const { data: polizasInfo } = await sb.from('fz_polizas').select('id,fecha,numero,concepto').in('id', polizaIds).gte('fecha', start).lte('fecha', end);
    const polizaMap = Object.fromEntries((polizasInfo || []).map(p => [p.id, p]));
    lineasPoliza.forEach(l => {
      const p = polizaMap[l.poliza_id];
      if (!p) return;
      const monto = (Number(l.cargo) || 0) - (Number(l.abono) || 0);
      if (monto) filas.push({ fecha: p.fecha, proveedor: `Póliza #${p.numero ?? ''}`, concepto: l.descripcion || p.concepto || '—', importe: monto, pago: 'Póliza de diario', origen: { tipo: 'poliza', id: p.id, fecha: p.fecha } });
    });
  }

  return filas.sort((a,b) => a.fecha.localeCompare(b.fecha));
}

async function getDetalleIngresoSubcuenta(businessId, periodo, subcuentaId) {
  const { start, end } = periodo;
  const filas = [];

  const { data: lineasPoliza } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).eq('subcuenta_id', subcuentaId).eq('cuenta_tipo', 'subcuenta');
  if (lineasPoliza && lineasPoliza.length) {
    const polizaIds = [...new Set(lineasPoliza.map(l => l.poliza_id))];
    const { data: polizasInfo } = await sb.from('fz_polizas').select('id,fecha,numero,concepto').in('id', polizaIds).gte('fecha', start).lte('fecha', end);
    const polizaMap = Object.fromEntries((polizasInfo || []).map(p => [p.id, p]));
    lineasPoliza.forEach(l => {
      const p = polizaMap[l.poliza_id];
      if (!p) return;
      const monto = (Number(l.abono) || 0) - (Number(l.cargo) || 0);
      if (monto) filas.push({ fecha: p.fecha, proveedor: `Póliza #${p.numero ?? ''}`, concepto: l.descripcion || p.concepto || '—', importe: monto, pago: 'Póliza de diario', origen: { tipo: 'poliza', id: p.id, fecha: p.fecha } });
    });
  }

  const { data: lineasFactura } = await sb.from('fz_facturas_clientes_lineas').select('*').eq('business_id', businessId).eq('subcuenta_id', subcuentaId);
  if (lineasFactura && lineasFactura.length) {
    const facturaIds = [...new Set(lineasFactura.map(l => l.factura_id))];
    const { data: facturasInfo } = await sb.from('fz_facturas_clientes').select('id,fecha,folio,cliente_id,moneda,tipo_cambio').in('id', facturaIds).gte('fecha', start).lte('fecha', end);
    const facturaMap = Object.fromEntries((facturasInfo || []).map(f => [f.id, f]));
    const clienteIds = [...new Set((facturasInfo || []).map(f => f.cliente_id))];
    const { data: clientesInfo } = clienteIds.length ? await sb.from('fz_clientes').select('id,nombre_comercial').in('id', clienteIds) : { data: [] };
    const clienteMap = Object.fromEntries((clientesInfo || []).map(c => [c.id, c.nombre_comercial]));
    lineasFactura.forEach(l => {
      const f = facturaMap[l.factura_id];
      if (!f) return;
      const tc = f.moneda === 'USD' ? (Number(f.tipo_cambio) || 1) : 1;
      const monto = (Number(l.importe) || 0) * tc;
      if (monto) filas.push({ fecha: f.fecha, proveedor: `Factura #${f.folio} — ${clienteMap[f.cliente_id] || ''}`, concepto: l.descripcion || '—', importe: monto, pago: 'Factura de cliente', origen: { tipo: 'factura_cliente', id: f.id, fecha: f.fecha } });
    });
  }

  return filas.sort((a,b) => a.fecha.localeCompare(b.fecha));
}

function detalleSubcuentaHtml(filas, colspan) {
  if (!filas.length) return `<tr><td colspan="${colspan}" style="padding-left:34px;color:var(--muted);font-size:12px;">Sin movimientos detallados para este período.</td></tr>`;
  return `<tr><td colspan="${colspan}" style="padding:0 0 8px 34px;">
    <table style="width:100%;table-layout:fixed;">
      <colgroup>
        <col style="width:80px;"><col style="width:150px;"><col><col style="width:100px;"><col style="width:110px;"><col style="width:70px;">
      </colgroup>
      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Importe</th><th>Cómo se pagó</th><th></th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td style="white-space:nowrap;">${fechaCorta(f.fecha)}</td>
        <td style="white-space:normal;word-break:break-word;">${f.proveedor}</td>
        <td style="white-space:normal;word-break:break-word;">${f.concepto}</td>
        <td class="num" style="white-space:nowrap;">${fmt(f.importe)}</td>
        <td style="white-space:normal;">${f.pago}</td>
        <td style="white-space:nowrap;">${f.origen && f.origen.tipo !== 'ajuste' ? `<button class="btn btn-ghost btn-sm abrir-origen-btn" data-origen='${JSON.stringify(f.origen).replace(/'/g,'&apos;')}' style="font-size:11px;padding:3px 8px;">Abrir ↗</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>
  </td></tr>`;
}

async function irASeccion(nombreSeccion) {
  STATE.currentSection = nombreSeccion;
  localStorage.setItem('finanzas_ultima_seccion', nombreSeccion);
  marcarNavActivo(nombreSeccion);
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('sec-' + nombreSeccion);
  if (sec) sec.classList.add('active');
  await renderCurrentSection();
}

function resaltarFilaPorId(id, intentos) {
  intentos = intentos || 0;
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    const tr = el.closest('tr') || el;
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const original = tr.style.backgroundColor;
    tr.style.transition = 'background-color 0.4s';
    tr.style.backgroundColor = '#fff3cd';
    setTimeout(() => { tr.style.backgroundColor = original; }, 2200);
  } else if (intentos < 12) {
    setTimeout(() => resaltarFilaPorId(id, intentos + 1), 150);
  }
}

async function abrirOrigenDesdeDetalle(origen, businessId) {
  if (!origen) return;
  if (origen.tipo === 'poliza') {
    await openPolizaModal(origen.id, businessId);
    return;
  }
  if (origen.tipo === 'factura_cliente') {
    const { data: f } = await sb.from('fz_facturas_clientes').select('*').eq('id', origen.id).single();
    if (f) await openModalFactura(f, businessId);
    return;
  }
  if (origen.fecha) STATE.currentMonth = origen.fecha.slice(0, 7);
  if (origen.tipo === 'bancos') {
    STATE_bancoCuentaAbierta = origen.cuentaId;
    await irASeccion('bancos');
  } else if (origen.tipo === 'efectivo') {
    STATE_monedaAbierta = origen.monedaId;
    await irASeccion('efectivo');
  } else if (origen.tipo === 'proveedor') {
    await irASeccion('proveedores');
  } else {
    return;
  }
  resaltarFilaPorId(origen.id);
}


const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function estadoResultadosSubtitulo(periodo) {
  const año = STATE.currentMonth.slice(0,4);
  if (STATE_plVista === 'anual') {
    const desdeYm = STATE_plAnualDesdeYm || `${año}-01`;
    const hastaYm = STATE_plAnualHastaYm || `${año}-12`;
    if (!STATE_plAnualDesdeYm && !STATE_plAnualHastaYm) return `Estado de Resultados — Enero a Diciembre ${año}`;
    const mesDesde = MESES_LARGO[Number(desdeYm.slice(5,7)) - 1];
    const añoDesde = desdeYm.slice(0,4);
    const mesHasta = MESES_LARGO[Number(hastaYm.slice(5,7)) - 1];
    const añoHasta = hastaYm.slice(0,4);
    if (desdeYm === hastaYm) return `Estado de Resultados — ${mesDesde} ${añoDesde}`;
    return `Estado de Resultados — ${mesDesde}${añoDesde!==añoHasta?' '+añoDesde:''} a ${mesHasta} ${añoHasta}`;
  }
  if (STATE_plVista === 'acumulado') {
    const mesActual = MESES_LARGO[Number(STATE.currentMonth.slice(5,7)) - 1];
    return `Estado de Resultados — Enero a ${mesActual} ${año}`;
  }
  if (STATE_plRangoDesde && STATE_plRangoHasta) {
    const bDesde = monthBounds(STATE_plRangoDesde.slice(0,7));
    const bHasta = monthBounds(STATE_plRangoHasta.slice(0,7));
    const esRangoDeMesesCompletos = periodo.start === bDesde.start && periodo.end === bHasta.end;
    if (esRangoDeMesesCompletos) {
      const mesDesde = MESES_LARGO[Number(STATE_plRangoDesde.slice(5,7)) - 1];
      const añoDesde = STATE_plRangoDesde.slice(0,4);
      const mesHasta = MESES_LARGO[Number(STATE_plRangoHasta.slice(5,7)) - 1];
      const añoHasta = STATE_plRangoHasta.slice(0,4);
      if (STATE_plRangoDesde === STATE_plRangoHasta || (mesDesde === mesHasta && añoDesde === añoHasta)) return `Estado de Resultados — ${mesDesde} ${añoDesde}`;
      return `Estado de Resultados — ${mesDesde}${añoDesde!==añoHasta?' '+añoDesde:''} a ${mesHasta} ${añoHasta}`;
    }
    return `Estado de Resultados — Del ${fechaCorta(periodo.start)} al ${fechaCorta(periodo.end)}`;
  }
  const mesActual = MESES_LARGO[Number(STATE.currentMonth.slice(5,7)) - 1];
  return `Estado de Resultados — ${mesActual} ${año}`;
}
function plTagsHtml() {
  const { start, end } = monthBounds(STATE.currentMonth);
  return `<div class="tag-row">
    <div class="tag ${STATE_plVista==='mensual'?'active':''}" id="plTabMensual">Mensual</div>
    <div class="tag ${STATE_plVista==='acumulado'?'active':''}" id="plTabAcumulado">Acumulado</div>
    <div class="tag ${STATE_plVista==='anual'?'active':''}" id="plTabAnual">Todos los meses</div>
  </div>
  ${STATE_plVista==='mensual' ? `
    <div class="pl-controles-rango">
    <div class="grid-3" style="margin:10px 0 4px;max-width:560px;">
      <div class="field" style="margin-bottom:0;">
        <label>Del día</label>
        <input type="date" id="plRangoDesde" value="${STATE_plRangoDesde || start}">
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>Al día</label>
        <input type="date" id="plRangoHasta" value="${STATE_plRangoHasta || end}">
      </div>
      <div class="field" style="margin-bottom:0;display:flex;align-items:flex-end;">
        ${(STATE_plRangoDesde||STATE_plRangoHasta) ? `<button class="btn btn-ghost btn-sm" id="plRangoLimpiar">✕ Ver mes completo</button>` : ''}
      </div>
    </div>
    <p style="font-size:11.5px;color:var(--muted);margin:-2px 0 12px;">Puedes elegir un rango que abarque varios meses (ej. junio a julio) — no tiene que quedarse dentro de un solo mes.</p>
    </div>` : ''}
  ${STATE_plVista==='anual' ? `
    <div class="pl-controles-rango">
    <div class="grid-3" style="margin:10px 0 4px;max-width:560px;">
      <div class="field" style="margin-bottom:0;">
        <label>Desde el mes</label>
        <input type="month" id="plAnualDesde" value="${STATE_plAnualDesdeYm || STATE.currentMonth.slice(0,4)+'-01'}">
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>Hasta el mes</label>
        <input type="month" id="plAnualHasta" value="${STATE_plAnualHastaYm || STATE.currentMonth.slice(0,4)+'-12'}">
      </div>
      <div class="field" style="margin-bottom:0;display:flex;align-items:flex-end;">
        ${(STATE_plAnualDesdeYm||STATE_plAnualHastaYm) ? `<button class="btn btn-ghost btn-sm" id="plAnualLimpiar">✕ Ver año completo</button>` : ''}
      </div>
    </div>
    <p style="font-size:11.5px;color:var(--muted);margin:-2px 0 12px;">Por default muestra los 12 meses del año — acórtalo para ver solo algunos meses uno junto al otro (ej. Junio y Julio).</p>
    </div>` : ''}`;
}
function wirePLTags(el) {
  el.querySelector('#plTabMensual').addEventListener('click', () => { STATE_plVista = 'mensual'; STATE_plAnualDesdeYm=''; STATE_plAnualHastaYm=''; renderPL(); });
  el.querySelector('#plTabAcumulado').addEventListener('click', () => { STATE_plVista = 'acumulado'; STATE_plRangoDesde=''; STATE_plRangoHasta=''; STATE_plAnualDesdeYm=''; STATE_plAnualHastaYm=''; renderPL(); });
  el.querySelector('#plTabAnual').addEventListener('click', () => { STATE_plVista = 'anual'; STATE_plRangoDesde=''; STATE_plRangoHasta=''; renderPL(); });
  const rd = el.querySelector('#plRangoDesde');
  const rh = el.querySelector('#plRangoHasta');
  if (rd) rd.addEventListener('change', () => { STATE_plRangoDesde = rd.value; STATE_plRangoHasta = STATE_plRangoHasta || rh.value; renderPL(); });
  if (rh) rh.addEventListener('change', () => { STATE_plRangoHasta = rh.value; STATE_plRangoDesde = STATE_plRangoDesde || rd.value; renderPL(); });
  const limpiar = el.querySelector('#plRangoLimpiar');
  if (limpiar) limpiar.addEventListener('click', () => { STATE_plRangoDesde=''; STATE_plRangoHasta=''; renderPL(); });
  const pad = el.querySelector('#plAnualDesde');
  const pah = el.querySelector('#plAnualHasta');
  if (pad) pad.addEventListener('change', () => { STATE_plAnualDesdeYm = pad.value; STATE_plAnualHastaYm = STATE_plAnualHastaYm || pah.value; renderPL(); });
  if (pah) pah.addEventListener('change', () => { STATE_plAnualHastaYm = pah.value; STATE_plAnualDesdeYm = STATE_plAnualDesdeYm || pad.value; renderPL(); });
  const limpiarAnual = el.querySelector('#plAnualLimpiar');
  if (limpiarAnual) limpiarAnual.addEventListener('click', () => { STATE_plAnualDesdeYm=''; STATE_plAnualHastaYm=''; renderPL(); });
}

async function renderPLAnual(el, b) {
  el.innerHTML = plTagsHtml() + `<div class="empty">Calculando el año completo…</div>`;
  wirePLTags(el);

  const year = STATE.currentMonth.slice(0, 4);
  const desdeYm = STATE_plAnualDesdeYm || `${year}-01`;
  const hastaYm = STATE_plAnualHastaYm || `${year}-12`;
  const [conceptosVenta, conceptos, subcuentas, mayores, conceptosSistema] = await Promise.all([
    loadConceptosVenta(b.id), loadConceptos(b.id), loadSubcuentas(b.id), loadCuentasMayor(b.id), loadConceptosSistema(b.id),
  ]);
  const porCatPL = { efectivo: conceptos.filter(c=>c.categoria==='efectivo'), tarjetas: conceptos.filter(c=>c.categoria==='tarjetas'), bancos: conceptos.filter(c=>c.categoria==='bancos'), cxc: conceptos.filter(c=>c.categoria==='cxc'), propinas: conceptos.filter(c=>c.categoria==='propinas') };
  const mayoresGasto = mayores.filter(m => m.tipo === 'gasto');
  const mayoresCosto = mayores.filter(m => m.tipo === 'costo');
  const mesesYm = [];
  { // generar todos los YYYY-MM entre desdeYm y hastaYm (puede cruzar años)
    let [ay, am] = desdeYm.split('-').map(Number);
    const [by, bm] = hastaYm.split('-').map(Number);
    while (ay < by || (ay === by && am <= bm)) {
      mesesYm.push(`${ay}-${String(am).padStart(2,'0')}`);
      am++; if (am > 12) { am = 1; ay++; }
    }
  }
  const mesesLabel = mesesYm.map(ym => `${MESES_LARGO[Number(ym.slice(5,7))-1].slice(0,3)} ${ym.slice(2,4)}`);

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
    const gCostos = await computeGastosClasificados(b.id, periodo, subcuentas, mayores, 'costo');
    const iPoliza = await computeIngresosPoliza(b.id, periodo, subcuentas, mayores);
    const totalIngresosFinal = totalIngresosVentas + sobranteCaja + iPoliza.total;
    const utilidadBruta = totalIngresosFinal - gCostos.totalClasificado;
    const gastosTotales = gastosOperativos + gClas.totalClasificado + gClas.sinClasificar + faltanteCaja;
    const utilidad = utilidadBruta - gastosTotales;
    datos.push({ ym, ingresosPorConcepto, sobranteCaja, iPoliza, iPolizaTotal: iPoliza.total, totalIngresosFinal, gastosOperativos, faltanteCaja, gClas, gCostos, utilidadBruta, gastosTotales, utilidad });
  }

  const sum = arr => arr.reduce((s,x)=>s+x,0);
  const colorCelda = (v, opts) => opts.perValueColor ? `color:${Number(v)>=0?'var(--green)':'var(--red)'};` : (opts.color?`color:${opts.color};`:(Number(v)<0?'color:var(--red);':''));
  const filaHtml = (label, valores, opts={}) => `<tr class="${opts.total?'total-row':''}" style="${opts.bg?'background:#f7f9fc;':''}">
    <td style="${opts.indentPx?`padding-left:${opts.indentPx}px;`:(opts.indent?'padding-left:22px;':'')}${opts.italic?'font-style:italic;color:var(--muted);':''}${opts.bold?'font-weight:700;':''}">${label}</td>
    ${valores.map(v => `<td class="num" style="${colorCelda(v, opts)}">${fmt(v)}</td>`).join('')}
    <td class="num" style="font-weight:700;${colorCelda(sum(valores), opts)}">${fmt(sum(valores))}</td>
  </tr>`;

  // Desglose por subcuenta (y sub-subcuenta, con sangría) de un mayor específico, mes a mes
  function filasSubcuentasPorMayor(m, datosPorMayorFn) {
    const render = (sub, nivel) => {
      const valores = datos.map(d => {
        const mayorData = datosPorMayorFn(d);
        if (!mayorData) return 0;
        const nodo = mayorData.subs.flatMap(aplanarArbol).find(n => n.id === sub.id);
        return nodo ? nodo.total : 0;
      });
      const hijosHtml = subcuentasHijas(sub.id, subcuentas).map(h => render(h, nivel + 1)).join('');
      if (!valores.some(v => Math.abs(v) > 0.004) && !hijosHtml) return '';
      return filaHtml(sub.nombre, valores, { indentPx: 22 + nivel * 18, italic: true }) + hijosHtml;
    };
    return subcuentasRaiz(m.id, subcuentas).map(s => render(s, 0)).join('');
  }

  const gruposIngresoAnual = {}; const sinGrupoAnual = [];
  conceptosVenta.forEach((c, idx) => {
    const sub = c.subcuenta_vinculada_id ? subcuentas.find(s => s.id === c.subcuenta_vinculada_id) : null;
    const mayor = sub ? mayores.find(m => m.id === sub.cuenta_mayor_id) : null;
    if (mayor) (gruposIngresoAnual[mayor.id] ||= { mayor, items: [] }).items.push({ c, idx });
    else sinGrupoAnual.push({ c, idx });
  });
  const mayoresIngreso = mayores.filter(m => m.tipo === 'ingreso');
  // Se unifican aquí los mayores que solo tienen ingresos por Pólizas/Facturas (sin categoría de
  // venta vinculada) — antes salían como una sección aparte y duplicada si coincidían de nombre.
  mayoresIngreso.forEach(m => {
    const tieneDatos = datos.some(d => d.iPoliza.porMayor.some(pm => pm.id === m.id));
    if (tieneDatos) (gruposIngresoAnual[m.id] ||= { mayor: m, items: [] });
  });
  const filaIngresoAnualHtml = ({ c, idx }) => filaHtml(
    c.nombre + (c.tipo==='resta'?' (descuento)':''),
    datos.map(d => d.ingresosPorConcepto[idx]),
    { color: c.tipo==='resta' ? 'var(--red)' : null, indent: true }
  );
  const filasIngreso = Object.values(gruposIngresoAnual).map(g => {
    const valoresVenta = datos.map((d) => g.items.reduce((s, it) => s + (d.ingresosPorConcepto[it.idx] * (it.c.tipo==='resta'?-1:1)), 0));
    const valoresPoliza = datos.map(d => d.iPoliza.porMayor.find(pm => pm.id === g.mayor.id)?.subtotal || 0);
    const valoresCombinados = valoresVenta.map((v, i) => v + valoresPoliza[i]);
    return `<tr style="background:#f7f9fc;"><td colspan="${mesesYm.length + 2}" style="font-weight:700;">${g.mayor.nombre}</td></tr>`
      + g.items.map(filaIngresoAnualHtml).join('')
      + filasSubcuentasPorMayor(g.mayor, d => d.iPoliza.porMayor.find(pm => pm.id === g.mayor.id))
      + filaHtml(`Subtotal ${g.mayor.nombre}`, valoresCombinados, { italic: true, indentPx: 22 });
  }).join('') + sinGrupoAnual.map(filaIngresoAnualHtml).join('');
  const filaSobrante = datos.some(d=>d.sobranteCaja) ? filaHtml('Sobrante de caja (conciliación)', datos.map(d=>d.sobranteCaja), { color:'var(--green)' }) : '';
  const filaTotalIngresos = filaHtml('Total ingresos', datos.map(d=>d.totalIngresosFinal), { total:true });

  const hayMayoresCosto = mayoresCosto.length && datos.some(d => d.gCostos.totalClasificado);
  const filasCosto = mayoresCosto.map(m => {
    const totalPorMes = datos.map(d => d.gCostos.porMayor.find(pm=>pm.nombre===m.nombre)?.subtotal || 0);
    if (!totalPorMes.some(v=>Math.abs(v)>0.004)) return '';
    let filaPct = '';
    const idxVenta = m.concepto_venta_vinculado_id ? conceptosVenta.findIndex(c => c.id === m.concepto_venta_vinculado_id) : -1;
    if (idxVenta >= 0) {
      const pctPorMes = datos.map((d,i) => {
        const venta = d.ingresosPorConcepto[idxVenta];
        return venta ? (totalPorMes[i] / venta * 100) : null;
      });
      filaPct = `<tr><td style="padding-left:22px;font-style:italic;color:var(--muted);font-size:11px;">% vs ${conceptosVenta[idxVenta].nombre}</td>${pctPorMes.map(v => `<td class="num" style="color:var(--muted);font-size:11px;">${v===null?'—':v.toFixed(1)+'%'}</td>`).join('')}<td class="num" style="color:var(--muted);font-size:11px;"></td></tr>`;
    }
    return filaHtml(m.nombre, totalPorMes, { bold:true, bg:true }) + filasSubcuentasPorMayor(m, d => d.gCostos.porMayor.find(pm=>pm.nombre===m.nombre)) + filaPct;
  }).join('');
  const filaTotalCosto = filaHtml('Total Costo de Ventas', datos.map(d=>d.gCostos.totalClasificado), { total:true });
  const filaUtilidadBruta = filaHtml('Utilidad Bruta', datos.map(d=>d.utilidadBruta), { total:true, perValueColor:true });

  const filaGastosOp = filaHtml('Gastos operativos (sin clasificar, Ventas)', datos.map(d=>d.gastosOperativos));
  const filaFaltante = datos.some(d=>d.faltanteCaja) ? filaHtml('Faltante de caja (conciliación)', datos.map(d=>d.faltanteCaja), { color:'var(--red)' }) : '';
  const filasMayor = mayoresGasto.map(m => {
    const totalPorMes = datos.map(d => d.gClas.porMayor.find(pm=>pm.nombre===m.nombre)?.subtotal || 0);
    return filaHtml(m.nombre, totalPorMes, { bold:true, bg:true }) + filasSubcuentasPorMayor(m, d => d.gClas.porMayor.find(pm=>pm.nombre===m.nombre));
  }).join('');
  const filaSinClasificar = datos.some(d=>d.gClas.sinClasificar) ? filaHtml('Otros gastos sin subcuenta', datos.map(d=>d.gClas.sinClasificar)) : '';
  const filaTotalGastos = filaHtml('Total gastos', datos.map(d=>d.gastosTotales), { total:true });

  const filaUtilidad = filaHtml('Utilidad / Pérdida', datos.map(d=>d.utilidad), { total:true, perValueColor:true });
  const margenRow = `<tr><td style="font-style:italic;color:var(--muted);">Margen</td>${datos.map(d=>`<td class="num">${d.totalIngresosFinal?((d.utilidad/d.totalIngresosFinal*100).toFixed(0)+'%'):'—'}</td>`).join('')}<td class="num">—</td></tr>`;

  const esEjecutivo = STATE_plAnualModo === 'ejecutivo';
  el.innerHTML = plTagsHtml() + `
    <p style="font-size:13px;color:var(--muted);margin:-4px 0 10px;font-weight:600;">${estadoResultadosSubtitulo()}</p>
    <div class="tag-row" style="margin-bottom:14px;">
      <div class="tag ${!esEjecutivo?'active':''}" id="plAnualModoDetalle">Detalle</div>
      <div class="tag ${esEjecutivo?'active':''}" id="plAnualModoEjecutivo">Ejecutivo</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>${esEjecutivo ? 'Resumen ejecutivo mes por mes' : 'Detalle mes por mes'}</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Concepto</th>${mesesLabel.map(m=>`<th>${m}</th>`).join('')}<th>Acumulado</th></tr></thead>
          <tbody>
            ${esEjecutivo ? `
            ${filaTotalIngresos}
            ${hayMayoresCosto ? filaTotalCosto + filaUtilidadBruta : ''}
            ${filaTotalGastos}
            ${filaUtilidad}
            ${margenRow}
            ` : `
            <tr style="background:#f7f9fc;"><td colspan="${mesesYm.length + 2}" style="font-weight:700;">Ingresos</td></tr>
            ${filasIngreso}
            ${filaSobrante}
            ${filaTotalIngresos}
            ${hayMayoresCosto ? `
            <tr style="background:#f7f9fc;"><td colspan="${mesesYm.length + 2}" style="font-weight:700;">Costo de Ventas</td></tr>
            ${filasCosto}
            ${filaTotalCosto}
            ${filaUtilidadBruta}` : ''}
            <tr style="background:#f7f9fc;"><td colspan="${mesesYm.length + 2}" style="font-weight:700;">Gastos</td></tr>
            ${filaGastosOp}
            ${filaFaltante}
            ${filasMayor}
            ${filaSinClasificar}
            ${filaTotalGastos}
            ${filaUtilidad}
            ${margenRow}
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
  wirePLTags(el);
  document.getElementById('plAnualModoDetalle').addEventListener('click', () => { STATE_plAnualModo = 'detalle'; renderPL(); });
  document.getElementById('plAnualModoEjecutivo').addEventListener('click', () => { STATE_plAnualModo = 'ejecutivo'; renderPL(); });
}

function filaArbolSubcuentaHtml(nodo, conTerceraColumna, nivel, detalleHtmlSiAbierto) {
  const indent = 22 + nivel * 18;
  const abierto = STATE_plDetalleAbierto === nodo.id;
  const estilo = nivel === 0 ? 'font-weight:600;' : 'color:var(--muted);font-size:12.5px;';
  let html = `<tr class="pl-subcuenta-row" data-subcuenta="${nodo.id}" style="cursor:pointer;">
    <td style="padding-left:${indent}px;${estilo}">${abierto?'▾':'▸'} ${nodo.nombre}</td>
    <td class="num" style="${nivel === 0 ? 'font-weight:600;' : ''}">${fmtNeg(nodo.total)}</td>${conTerceraColumna?'<td></td>':''}
  </tr>`;
  if (abierto) html += detalleHtmlSiAbierto;
  nodo.hijos.forEach(h => { html += filaArbolSubcuentaHtml(h, conTerceraColumna, nivel + 1, detalleHtmlSiAbierto); });
  return html;
}

async function renderPL() {
  const el = document.getElementById('sec-pl');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  if (STATE_plVista === 'anual') { await renderPLAnual(el, b); return; }
  const scrollY = window.scrollY;
  let periodo = periodoPL(STATE.currentMonth, STATE_plVista);
  if (STATE_plVista === 'mensual' && STATE_plRangoDesde && STATE_plRangoHasta) {
    periodo = { ...periodo, start: STATE_plRangoDesde, end: STATE_plRangoHasta };
  }

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
    id: c.id, nombre: c.nombre, tipo: c.tipo,
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
  const gCostos = await computeGastosClasificados(b.id, periodo, subcuentas, mayores, 'costo');
  const iPoliza = await computeIngresosPoliza(b.id, periodo, subcuentas, mayores);
  const totalIngresosFinal = totalIngresos + iPoliza.total;
  const utilidadBruta = totalIngresosFinal - gCostos.totalClasificado;
  const gastosTotales = gastosOperativos + gClas.totalClasificado + gClas.sinClasificar + faltanteCaja;
  const utilidad = utilidadBruta - gastosTotales;
  const margen = totalIngresosFinal ? (utilidad/totalIngresosFinal*100) : 0;
  const periodoLabel = STATE_plVista === 'acumulado' ? `Acumulado ${STATE.currentMonth.slice(0,4)} (ene—${STATE.currentMonth.slice(5,7)})` : (STATE_plRangoDesde && STATE_plRangoHasta ? `${fechaCorta(periodo.start)} — ${fechaCorta(periodo.end)}` : STATE.currentMonth);

  let detalleGastoHtml = '', detalleIngresoHtml = '', detalleCostoHtml = '';
  if (STATE_plDetalleAbierto) {
    const esGasto = gClas.porMayor.some(m => m.subs.some(s => aplanarArbol(s).some(n => n.id === STATE_plDetalleAbierto)));
    const esCosto = gCostos.porMayor.some(m => m.subs.some(s => aplanarArbol(s).some(n => n.id === STATE_plDetalleAbierto)));
    const esIngreso = iPoliza.porMayor.some(m => m.subs.some(s => aplanarArbol(s).some(n => n.id === STATE_plDetalleAbierto)));
    if (esGasto) detalleGastoHtml = detalleSubcuentaHtml(await getDetalleGastoSubcuenta(b.id, periodo, STATE_plDetalleAbierto), 3);
    else if (esCosto) detalleCostoHtml = detalleSubcuentaHtml(await getDetalleGastoSubcuenta(b.id, periodo, STATE_plDetalleAbierto), 2);
    else if (esIngreso) detalleIngresoHtml = detalleSubcuentaHtml(await getDetalleIngresoSubcuenta(b.id, periodo, STATE_plDetalleAbierto), 2);
  }

  el.innerHTML = `
    ${plTagsHtml()}
    <p style="font-size:13px;color:var(--muted);margin:-4px 0 14px;font-weight:600;">${estadoResultadosSubtitulo(periodo)}</p>
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total ingresos</div><div class="value num">${fmt(totalIngresosFinal)}</div></div>
      ${gCostos.totalClasificado ? `<div class="kpi"><div class="label">Utilidad bruta</div><div class="value num ${utilidadBruta>=0?'green':'red'}">${fmt(utilidadBruta)}</div></div>` : ''}
      <div class="kpi"><div class="label">Total gastos</div><div class="value num red">${fmt(gastosTotales)}</div></div>
      <div class="kpi"><div class="label">Utilidad / Pérdida</div><div class="value num ${utilidad>=0?'green':'red'}">${fmt(utilidad)}</div></div>
      <div class="kpi"><div class="label">Margen</div><div class="value">${margen.toFixed(1)}%</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Ingresos — ${periodoLabel}</h3><span class="hint">Calculado de Ventas</span></div>
      <table>
        <tbody>
          ${(() => {
            const grupos = {}; const sinGrupo = [];
            ingresosPorConcepto.forEach(i => {
              const concepto = conceptosVenta.find(c => c.id === i.id);
              const sub = concepto?.subcuenta_vinculada_id ? subcuentas.find(s => s.id === concepto.subcuenta_vinculada_id) : null;
              const mayor = sub ? mayores.find(m => m.id === sub.cuenta_mayor_id) : null;
              if (mayor) { (grupos[mayor.id] ||= { id: mayor.id, nombre: mayor.nombre, items: [], iPoliza: null }).items.push(i); }
              else sinGrupo.push(i);
            });
            // Se combinan aquí mismo los ingresos de Pólizas/Facturas que caigan en la misma cuenta mayor
            // que alguna Categoría de venta — antes salían como una sección aparte y duplicada.
            iPoliza.porMayor.forEach(m => {
              (grupos[m.id] ||= { id: m.id, nombre: m.nombre, items: [], iPoliza: null }).iPoliza = m;
            });
            const filaIngresoHtml = (i) => `<tr><td style="padding-left:22px;color:var(--muted);font-size:12.5px;">${i.nombre}${i.tipo==='resta'?' (descuento)':''}</td><td class="num" style="${i.tipo==='resta'?'color:var(--red);':''}">${i.tipo==='resta'?'-':''}${fmt(i.monto)}</td></tr>`;
            const gruposHtml = Object.values(grupos).map(g => {
              const subtotalVenta = g.items.reduce((s,i)=>s+(i.tipo==='resta'?-i.monto:i.monto),0);
              const subtotalPoliza = g.iPoliza ? g.iPoliza.subtotal : 0;
              return `<tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">${g.nombre}</td></tr>`
                + g.items.map(filaIngresoHtml).join('')
                + (g.iPoliza ? g.iPoliza.subs.map(s => filaArbolSubcuentaHtml(s, false, 0, detalleIngresoHtml)).join('') : '')
                + `<tr><td style="padding-left:22px;font-style:italic;color:var(--muted);">Subtotal ${g.nombre}</td><td class="num" style="font-weight:600;">${fmtNeg(subtotalVenta + subtotalPoliza)}</td></tr>`;
            }).join('');
            return (ingresosPorConcepto.length ? gruposHtml + sinGrupo.map(filaIngresoHtml).join('') : (Object.keys(grupos).length ? gruposHtml : `<tr><td colspan="2" class="empty">Este negocio no tiene categorías de venta configuradas (ve a Ventas → Configurar categorías de venta).</td></tr>`));
          })()}
          ${sobranteCaja ? `<tr><td>Sobrante de caja (conciliación de Ventas)</td><td class="num" style="color:var(--green);">${fmt(sobranteCaja)}</td></tr>` : ''}
          <tr class="total-row"><td>Total ingresos</td><td class="num">${fmtNeg(totalIngresosFinal)}</td></tr>
        </tbody>
      </table>
    </div>

    ${gCostos.porMayor.length ? `
    <div class="card">
      <div class="card-head"><h3>Costo de Ventas — ${periodoLabel}</h3></div>
      <table>
        <tbody>
          ${gCostos.porMayor.map(m => {
            const ventaVinculada = m.conceptoVentaVinculadoId ? ingresosPorConcepto.find(i => i.id === m.conceptoVentaVinculadoId) : null;
            const porcentaje = (ventaVinculada && ventaVinculada.monto) ? ` <span style="color:var(--muted);font-weight:400;">(${(m.subtotal/ventaVinculada.monto*100).toFixed(1)}% de ${ventaVinculada.nombre})</span>` : '';
            return `
            <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">${m.nombre}</td></tr>
            ${m.subs.map(s => filaArbolSubcuentaHtml(s, false, 0, detalleCostoHtml)).join('')}
            <tr><td style="padding-left:22px;font-style:italic;color:var(--muted);">Subtotal ${m.nombre}${porcentaje}</td><td class="num" style="font-weight:600;">${fmtNeg(m.subtotal)}</td></tr>
          `;
          }).join('')}
          <tr class="total-row"><td>Total Costo de Ventas</td><td class="num">${fmtNeg(gCostos.totalClasificado)}</td></tr>
          <tr class="total-row" style="border-top:2px solid var(--navy-1);"><td>Utilidad Bruta</td><td class="num" style="color:${utilidadBruta>=0?'var(--green)':'var(--red)'};">${fmt(utilidadBruta)}</td></tr>
        </tbody>
      </table>
    </div>` : ''}

    <div class="card">
      <div class="card-head">
        <h3>Gastos por cuenta — ${periodoLabel}</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-gold btn-sm" id="addGastoBtn">+ Ajuste manual</button>
        </div>
      </div>
      <table>
        <tbody>
          <tr><td>Gastos operativos del día (desde Ventas, sin clasificar)</td><td class="num">${fmtNeg(gastosOperativos)}</td><td></td></tr>
          ${faltanteCaja ? `<tr><td>Faltante de caja (conciliación de Ventas)</td><td class="num" style="color:var(--red);">${fmt(faltanteCaja)}</td><td></td></tr>` : ''}
          ${gClas.porMayor.map(m => `
            <tr style="background:#f7f9fc;"><td colspan="2" style="font-weight:700;">${m.nombre}</td><td></td></tr>
            ${m.subs.map(s => filaArbolSubcuentaHtml(s, true, 0, detalleGastoHtml)).join('')}
            <tr><td style="padding-left:22px;font-style:italic;color:var(--muted);">Subtotal ${m.nombre}</td><td class="num" style="font-weight:600;">${fmtNeg(m.subtotal)}</td><td></td></tr>
          `).join('')}
          ${gClas.sinClasificar ? `<tr><td>Otros gastos sin subcuenta asignada</td><td class="num">${fmtNeg(gClas.sinClasificar)}</td><td></td></tr>` : ''}
          <tr class="total-row"><td>Total gastos</td><td class="num">${fmtNeg(gastosTotales)}</td><td></td></tr>
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
                ${opcionesSubcuentaHtml(subcuentas, mayores, g.subcuenta_id)}
              </select></td>
              <td><input class="cell gasto-cell" type="text" placeholder="Ej. Cloro, Servilletas" value="${g.descripcion||''}" data-id="${g.id}" data-field="descripcion"></td>
              <td><input class="cell gasto-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(g.monto)}" data-id="${g.id}" data-field="monto"></td>
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
          <tr><td>Total ingresos</td><td class="num">${fmtNeg(totalIngresosFinal)}</td></tr>
          ${gCostos.totalClasificado ? `
          <tr><td>Costo de Ventas</td><td class="num" style="color:var(--red);">-${fmt(gCostos.totalClasificado)}</td></tr>
          <tr class="total-row"><td>Utilidad Bruta</td><td class="num" style="color:${utilidadBruta>=0?'var(--green)':'var(--red)'};">${fmt(utilidadBruta)}</td></tr>` : ''}
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
  el.querySelectorAll('.abrir-origen-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const origen = JSON.parse(btn.dataset.origen.replace(/&apos;/g, "'"));
    abrirOrigenDesdeDetalle(origen, b.id);
  }));
  document.getElementById('addGastoBtn').addEventListener('click', async () => {
    await sb.from('fz_pl_gastos').insert({ business_id: b.id, mes: STATE.currentMonth, monto: 0 });
    renderPL();
  });
  el.querySelectorAll('.gasto-cell').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.field;
      const val = field === 'monto' ? leerMonto(inp.value) : (inp.value || null);
      await sb.from('fz_pl_gastos').update({ [field]: val }).eq('id', inp.dataset.id);
      renderPL();
    });
  });
  wireInputsMoneda(el);
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
          ${s.efectivoDetalle.map(m => `<tr class="flujo-link-efectivo" data-id="${m.id}" style="cursor:pointer;"><td>Caja — ${m.nombre} (${fmtNum(m.saldo)} × TC ${fmtNum(m.tc)}) ↗</td><td class="num">${fmt(m.pesoEquiv)}</td></tr>`).join('')}
          ${s.bancosDetalle.map(d => `<tr class="flujo-link-banco" data-id="${d.id}" style="cursor:pointer;"><td>Banco — ${d.nombre}${d.activo?'':' (inactiva)'} ↗</td><td class="num">${fmt(d.saldo)}</td></tr>`).join('')}
          <tr class="total-row"><td>Total disponible (caja + bancos)</td><td class="num">${fmt(s.efectivoTotal + s.bancosTotal)}</td></tr>
          <tr><td>Menos: proveedores pendientes de pago</td><td class="num" style="color:var(--red);">-${fmt(s.proveedoresPendientes)}</td></tr>
          ${s.otrosPasivosDetalle.map(p => `<tr><td>Menos: ${p.nombre}</td><td class="num" style="color:var(--red);">-${fmt(p.monto)}</td></tr>`).join('')}
          <tr class="total-row"><td>Posición neta de efectivo</td><td class="num" style="color:${s.posicionNeta>=0?'var(--green)':'var(--red)'};font-size:16px;">${fmt(s.posicionNeta)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-head"><h3>Resumen del mes — ${STATE.currentMonth}</h3></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Ventas del mes</div><div class="value num">${fmt(s.ventasMes)}</div></div>
        <div class="kpi"><div class="label">Total gastos y costos del mes</div><div class="value num red">${fmt(s.gastosTotalMes)}</div></div>
        <div class="kpi"><div class="label">Gastos capturados en Ventas</div><div class="value num red">${fmt(s.gastosOperativosMes)}</div></div>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-top:10px;">"Total gastos y costos" incluye todo lo clasificado en Proveedores, Bancos, Efectivo, Pólizas y Costo de Ventas — igual que en el Estado de Resultados. "Gastos capturados en Ventas" es solo lo que se anota manualmente en la casilla de Gastos al capturar el día en Ventas.</p>
    </div>
  `;
  el.querySelectorAll('.flujo-link-efectivo').forEach(tr => tr.addEventListener('click', () => {
    STATE_monedaAbierta = tr.dataset.id;
    irASeccion('efectivo');
  }));
  el.querySelectorAll('.flujo-link-banco').forEach(tr => tr.addEventListener('click', () => {
    STATE_bancoCuentaAbierta = tr.dataset.id;
    irASeccion('bancos');
  }));
}

document.getElementById('copyrightYear').textContent = new Date().getFullYear();
document.getElementById('loginCopyrightYear').textContent = new Date().getFullYear();
checkSession();

/* ============================================================
   PÓLIZAS DE DIARIO — partida doble (Cargo / Abono)
   ============================================================ */
async function loadPolizas(businessId) {
  const { data } = await sb.from('fz_polizas').select('*').eq('business_id', businessId).order('fecha', { ascending: false }).order('numero', { ascending: false });
  return data || [];
}
async function loadTodasLasLineas(businessId) {
  const { data } = await sb.from('fz_polizas_lineas').select('*').eq('business_id', businessId).order('orden');
  return data || [];
}

let STATE_polizaFiltroTexto = '';
let STATE_polizaFiltroDesde = '';
let STATE_polizaFiltroHasta = '';
let STATE_polizaAbiertaId = null;

async function renderPolizas() {
  const el = document.getElementById('sec-polizas');
  const b = biz();
  if (!b) { el.innerHTML = `<div class="empty">Selecciona un negocio.</div>`; return; }
  const scrollY = window.scrollY;

  const [todasPolizas, lineas, subcuentas, mayores, cuentasBancoQ, monedasQ] = await Promise.all([
    loadPolizas(b.id), loadTodasLasLineas(b.id), loadSubcuentas(b.id), loadCuentasMayor(b.id),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', b.id).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', b.id).eq('activo', true),
  ]);
  const cuentasBanco = cuentasBancoQ.data || [];
  const monedasEfectivo = monedasQ.data || [];

  const totalesPoliza = (p) => {
    const ls = lineas.filter(l => l.poliza_id === p.id);
    return { cargo: ls.reduce((s,l)=>s+(Number(l.cargo)||0),0), abono: ls.reduce((s,l)=>s+(Number(l.abono)||0),0), count: ls.length };
  };
  const totalCuadradas = todasPolizas.filter(p => { const t = totalesPoliza(p); return Math.abs(t.cargo-t.abono)<0.01 && t.count>0; }).length;

  const texto = STATE_polizaFiltroTexto.trim().toLowerCase();
  const polizas = todasPolizas.filter(p => {
    if (texto) {
      const t = totalesPoliza(p);
      const enConcepto = (p.concepto||'').toLowerCase().includes(texto) || String(p.numero||'').includes(texto);
      const enImporte = String(t.cargo).includes(texto) || fmtNum(t.cargo).includes(texto);
      if (!enConcepto && !enImporte) return false;
    }
    if (STATE_polizaFiltroDesde && p.fecha < STATE_polizaFiltroDesde) return false;
    if (STATE_polizaFiltroHasta && p.fecha > STATE_polizaFiltroHasta) return false;
    return true;
  });
  const conteoAdjuntosPolizas = await contarAdjuntosPorRegistro('fz_polizas', polizas.map(p => p.id));

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Pólizas registradas</div><div class="value">${todasPolizas.length}</div></div>
      <div class="kpi"><div class="label">Cuadradas</div><div class="value num green">${totalCuadradas}</div></div>
      <div class="kpi"><div class="label">Descuadradas</div><div class="value num ${todasPolizas.length-totalCuadradas>0?'red':''}">${todasPolizas.length - totalCuadradas}</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Pólizas de Diario</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="openCuentasBtnPolizas">⚙ Catálogo de cuentas</button>
          <button class="btn btn-ghost btn-sm" id="importPolizasBtn">Importar pólizas (Excel)</button>
          <button class="btn btn-gold btn-sm" id="addPolizaBtn">+ Nueva póliza</button>
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Cada línea puede afectar una cuenta contable (Catálogo de cuentas) o directamente una cuenta bancaria / caja de efectivo real — en ese caso el cargo/abono también se refleja en el saldo de Bancos o Efectivo. El Excel de pólizas debe tener columnas: Fecha, Concepto, Subcuenta, Descripción, Cargo, Abono — las filas con la misma Fecha y Concepto se agrupan en una sola póliza.</p>
      <div class="grid-3" style="margin-bottom:12px;">
        <div class="field" style="margin-bottom:0;">
          <label>Buscar (concepto, número o importe)</label>
          <input type="text" id="polizaBuscarTexto" placeholder="Ej. renta, 1500, #12" value="${STATE_polizaFiltroTexto}">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Desde</label>
          <input type="date" id="polizaFiltroDesde" value="${STATE_polizaFiltroDesde}">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Hasta</label>
          <input type="date" id="polizaFiltroHasta" value="${STATE_polizaFiltroHasta}">
        </div>
      </div>
      ${(STATE_polizaFiltroTexto||STATE_polizaFiltroDesde||STATE_polizaFiltroHasta) ? `<button class="btn btn-ghost btn-sm" id="polizaLimpiarFiltro" style="margin-bottom:12px;">✕ Limpiar filtros</button>` : ''}
      ${subcuentas.length === 0 ? `<div class="empty">Aún no tienes cuentas en el catálogo. Crea al menos una (de cualquier tipo) para poder registrar pólizas.</div>` : ''}
      <div class="table-wrap">
        <table>
          <thead><tr><th>No. Póliza</th><th>Fecha</th><th>Concepto</th><th>Adjunto</th><th>Importe</th><th>Estado</th></tr></thead>
          <tbody id="polizasList">
            ${polizas.length === 0 ? `<tr><td colspan="6" class="empty">${todasPolizas.length ? 'Ninguna póliza coincide con la búsqueda.' : 'Sin pólizas todavía.'}</td></tr>` : polizas.map(p => {
              const t = totalesPoliza(p);
              const cuadrada = Math.abs(t.cargo-t.abono)<0.01 && t.count>0;
              const nAdj = conteoAdjuntosPolizas[p.id] || 0;
              return `<tr class="poliza-resumen-row" data-poliza="${p.id}" style="cursor:pointer;">
                <td>#${p.numero ?? '—'}</td>
                <td>${fechaCorta(p.fecha)}</td>
                <td>${p.concepto || '<span style="color:var(--muted);">(sin concepto)</span>'}</td>
                <td>${nAdj ? nAdj + (nAdj===1?' archivo':' archivos') : '—'}</td>
                <td class="num" style="font-weight:700;">${fmt(t.cargo)}</td>
                <td><span class="badge ${cuadrada?'pag':'pend'}">${cuadrada ? 'Cuadrada' : 'Diferencia ' + fmt(t.cargo-t.abono)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('openCuentasBtnPolizas').addEventListener('click', () => openCuentasModal(b.id, renderPolizas));
  document.getElementById('importPolizasBtn').addEventListener('click', () => openImportExcelModal('polizas', b.id, renderPolizas));
  document.getElementById('addPolizaBtn').addEventListener('click', () => {
    openPolizaModal(null, b.id);
  });
  document.getElementById('polizaBuscarTexto').addEventListener('input', (e) => { STATE_polizaFiltroTexto = e.target.value; renderPolizas(); });
  document.getElementById('polizaFiltroDesde').addEventListener('change', (e) => { STATE_polizaFiltroDesde = e.target.value; renderPolizas(); });
  document.getElementById('polizaFiltroHasta').addEventListener('change', (e) => { STATE_polizaFiltroHasta = e.target.value; renderPolizas(); });
  const limpiarBtn = document.getElementById('polizaLimpiarFiltro');
  if (limpiarBtn) limpiarBtn.addEventListener('click', () => { STATE_polizaFiltroTexto=''; STATE_polizaFiltroDesde=''; STATE_polizaFiltroHasta=''; renderPolizas(); });
  el.querySelectorAll('.poliza-resumen-row').forEach(row => row.addEventListener('click', () => {
    openPolizaModal(row.dataset.poliza, b.id);
  }));
  window.scrollTo(0, scrollY);
}

/* ============================================================
   PÓLIZAS DE DIARIO — modo "borrador": nada se guarda en la base
   de datos mientras editas; solo al darle "Guardar". La "X" descarta
   los cambios (o pregunta primero, si ya habías editado algo).
   ============================================================ */
let STATE_polizaBorrador = null; // { esNueva, businessId, poliza:{...}, lineas:[...], catalogos:{...}, original:'...json...' }

function opcionesSubcuentaHtmlPrefijadas(subcuentas, mayores, selectedId) {
  const porMayor = mayores.map(m => {
    const construirNivel = (padreId, nivel) => {
      return subcuentas.filter(s => s.cuenta_mayor_id === m.id && (s.subcuenta_padre_id || null) === padreId)
        .flatMap(s => [
          `<option value="sub:${s.id}" ${selectedId===s.id?'selected':''}>${'—'.repeat(nivel)} ${s.nombre}</option>`,
          ...construirNivel(s.id, nivel + 1),
        ]);
    };
    const opts = construirNivel(null, 0);
    return opts.length ? `<optgroup label="${m.nombre}">${opts.join('')}</optgroup>` : '';
  }).join('');
  return porMayor;
}

async function crearBorradorPolizaNueva(businessId) {
  const { data: existentes } = await sb.from('fz_polizas').select('numero').eq('business_id', businessId);
  const maxNum = (existentes || []).reduce((mx, p) => Math.max(mx, p.numero || 0), 0);
  return {
    esNueva: true, businessId,
    poliza: { id: null, numero: maxNum + 1, fecha: todayStr(), concepto: '', archivo_path: null, archivo_nombre: null },
    lineas: [
      { id: 'tmp_1', subcuenta_id: null, cuenta_tipo: 'subcuenta', cuenta_ref_id: null, cargo: 0, abono: 0, descripcion: '', referencia: '', orden: 0 },
      { id: 'tmp_2', subcuenta_id: null, cuenta_tipo: 'subcuenta', cuenta_ref_id: null, cargo: 0, abono: 0, descripcion: '', referencia: '', orden: 1 },
    ],
  };
}
async function crearBorradorPolizaExistente(polizaId, businessId) {
  const [{ data: p }, { data: lineas }] = await Promise.all([
    sb.from('fz_polizas').select('*').eq('id', polizaId).single(),
    sb.from('fz_polizas_lineas').select('*').eq('poliza_id', polizaId).order('orden'),
  ]);
  return { esNueva: false, businessId, poliza: { ...p }, lineas: (lineas || []).map(l => ({ ...l })) };
}

function polizaEsBorradorVacio(borrador) {
  const sinArchivos = !(borrador.poliza.archivosPendientes || []).length && !borrador.conteoAdjuntos;
  return !(borrador.poliza.concepto || '').trim() && sinArchivos && borrador.lineas.every(l =>
    (Number(l.cargo) || 0) === 0 && (Number(l.abono) || 0) === 0 && !l.subcuenta_id && !l.cuenta_ref_id && !(l.descripcion || '').trim() && !(l.referencia || '').trim()
  );
}

async function openPolizaModal(polizaId, businessId) {
  const [subcuentas, mayores, cuentasBancoQ, monedasQ, proveedoresCatalogoQ] = await Promise.all([
    loadSubcuentas(businessId), loadCuentasMayor(businessId),
    sb.from('fz_bancos_cuentas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_efectivo_monedas').select('*').eq('business_id', businessId).eq('activo', true),
    sb.from('fz_proveedores_catalogo').select('*').eq('business_id', businessId),
  ]);
  const base = polizaId ? await crearBorradorPolizaExistente(polizaId, businessId) : await crearBorradorPolizaNueva(businessId);
  const idsYaVinculados = base.lineas.filter(l => l.cuenta_tipo === 'proveedor' && l.proveedor_factura_id).map(l => l.proveedor_factura_id);
  const { data: facturasData } = await sb.from('fz_proveedores').select('id,proveedor,factura,importe,importe_pagado,estatus').eq('business_id', businessId);
  const facturasPendientes = (facturasData || []).filter(f => f.estatus === 'Pendiente' || f.estatus === 'Parcial' || idsYaVinculados.includes(f.id));

  const idsClienteYaVinculados = base.lineas.filter(l => l.cuenta_tipo === 'cliente' && l.cliente_factura_id).map(l => l.cliente_factura_id);
  const todasFacturasClientes = await loadFacturasClientesPendConNombre(businessId);
  const facturasClientesPendientes = todasFacturasClientes.filter(f => f.estatus === 'Pendiente' || f.estatus === 'Parcial' || idsClienteYaVinculados.includes(f.id));

  const catalogos = { subcuentas, mayores, cuentasBanco: cuentasBancoQ.data || [], monedasEfectivo: monedasQ.data || [], facturasPendientes, facturasClientesPendientes, proveedoresCatalogo: proveedoresCatalogoQ.data || [] };
  STATE_polizaBorrador = { ...base, catalogos };
  STATE_polizaBorrador.original = JSON.stringify({ poliza: STATE_polizaBorrador.poliza, lineas: STATE_polizaBorrador.lineas });
  if (polizaId) {
    const conteo = await contarAdjuntosPorRegistro('fz_polizas', [polizaId]);
    STATE_polizaBorrador.conteoAdjuntos = conteo[polizaId] || 0;
  }
  document.getElementById('modalPoliza').classList.add('show');
  renderizarBorradorPoliza();
}

function polizaBorradorEsSucio() {
  if (!STATE_polizaBorrador) return false;
  if (STATE_polizaBorrador.esNueva) return !polizaEsBorradorVacio(STATE_polizaBorrador);
  return JSON.stringify({ poliza: STATE_polizaBorrador.poliza, lineas: STATE_polizaBorrador.lineas }) !== STATE_polizaBorrador.original;
}

function renderizarBorradorPoliza() {
  const wrap = document.getElementById('modalPolizaBody');
  if (!wrap || !STATE_polizaBorrador) return;

  const activo = document.activeElement;
  let foco = null;
  if (activo && wrap.contains(activo)) {
    foco = {
      clases: Array.from(activo.classList), id: activo.dataset.id || null,
      campo: activo.dataset.field || null,
      selStart: typeof activo.selectionStart === 'number' ? activo.selectionStart : null,
      selEnd: typeof activo.selectionEnd === 'number' ? activo.selectionEnd : null,
    };
  }

  wrap.innerHTML = polizaCardHtmlBorrador(STATE_polizaBorrador);
  wireBorradorPolizaHandlers(wrap);

  if (foco && foco.id) {
    const candidatos = Array.from(wrap.querySelectorAll(`[data-id="${foco.id}"]`)).filter(c => foco.clases.every(cl => c.classList.contains(cl)));
    const elegido = candidatos.find(c => (c.dataset.field || null) === foco.campo) || candidatos[0];
    if (elegido) {
      elegido.focus();
      if (foco.selStart !== null && elegido.setSelectionRange) {
        try { elegido.setSelectionRange(foco.selStart, foco.selEnd); } catch (e) {}
      }
    }
  }
}

function polizaCardHtmlBorrador(borrador) {
  const { poliza: p, lineas: lineasPoliza, catalogos } = borrador;
  const totalCargo = lineasPoliza.reduce((s, l) => s + (Number(l.cargo) || 0), 0);
  const totalAbono = lineasPoliza.reduce((s, l) => s + (Number(l.abono) || 0), 0);
  const diff = totalCargo - totalAbono;
  const cuadrada = Math.abs(diff) < 0.01;
  const catalogoItems = catalogoCuentasUnificado(catalogos);
  const labelDeLinea = (l) => {
    const match = catalogoItems.find(it =>
      (l.cuenta_tipo === 'banco' && it.tipo === 'banco' && it.id === l.cuenta_ref_id) ||
      (l.cuenta_tipo === 'efectivo' && it.tipo === 'efectivo' && it.id === l.cuenta_ref_id) ||
      (l.cuenta_tipo === 'proveedor' && it.tipo === 'proveedor' && it.id === l.proveedor_factura_id) ||
      (l.cuenta_tipo === 'cliente' && it.tipo === 'cliente' && it.id === l.cliente_factura_id) ||
      (l.cuenta_tipo === 'proveedor_provision' && it.tipo === 'proveedor_provision' && it.id === l.proveedor_catalogo_id) ||
      ((!l.cuenta_tipo || l.cuenta_tipo === 'subcuenta') && it.tipo === 'sub' && it.id === l.subcuenta_id)
    );
    return match ? match.label : '';
  };

  let adjuntoHtml;
  if (borrador.esNueva) {
    const pendientes = borrador.poliza.archivosPendientes || [];
    adjuntoHtml = `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
      ${pendientes.map((f, i) => `<span style="font-size:12px;color:var(--navy-1);background:#f7f9fc;border-radius:5px;padding:2px 6px;">${f.name} <button class="quitar-adjunto-pendiente" data-idx="${i}" style="border:none;background:none;color:var(--red);cursor:pointer;">✕</button></span>`).join('')}
      <label style="font-size:12px;color:var(--navy-3);text-decoration:underline;cursor:pointer;">${pendientes.length?'+ Agregar otro':'Adjuntar'} (se sube al guardar)<input type="file" accept=".pdf,.jpg,.jpeg,.png" class="adjunto-pendiente-input" style="display:none;"></label>
    </span>`;
  } else {
    adjuntoHtml = adjuntosCellHtml(borrador.conteoAdjuntos, p.id);
  }

  return `
    <datalist id="listaCuentasPoliza">
      ${catalogoItems.map(it => `<option value="${it.label.replace(/"/g,'&quot;')}">`).join('')}
    </datalist>
    <div class="card" style="background:#fbfcfe;border:1.5px solid var(--line);margin-bottom:16px;position:relative;">
      <button class="poliza-cerrar-x" title="Cerrar" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:20px;color:var(--muted);cursor:pointer;line-height:1;">✕</button>
      <div class="card-head" style="margin-bottom:10px;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <strong style="color:var(--navy-1);">${borrador.esNueva ? 'Nueva póliza' : 'Póliza #' + (p.numero ?? '—')}</strong>
          <input class="cell poliza-cell" type="date" value="${p.fecha}" data-field="fecha" style="width:auto;">
          <input class="cell poliza-cell" type="text" placeholder="Concepto de la póliza" value="${p.concepto || ''}" data-field="concepto" style="min-width:220px;">
          ${adjuntoHtml}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="badge ${cuadrada ? 'pag' : 'pend'}">${cuadrada ? 'Cuadrada' : 'Diferencia ' + fmt(diff)}</span>
          <button class="btn btn-gold btn-sm poliza-guardar">Guardar</button>
          ${!borrador.esNueva ? `<button class="btn btn-ghost btn-sm poliza-del" data-id="${p.id}" style="color:var(--red);">Eliminar póliza</button>` : ''}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cuenta</th><th>Proveedor</th><th>Referencia/Factura</th><th>Descripción</th><th>Cargo</th><th>Abono</th><th></th></tr></thead>
          <tbody>
            ${lineasPoliza.map(l => `<tr>
              <td><input class="cell linea-cuenta-buscar" list="listaCuentasPoliza" placeholder="Escribe para buscar…" value="${labelDeLinea(l).replace(/"/g,'&quot;')}" title="${labelDeLinea(l).replace(/"/g,'&quot;')}" data-id="${l.id}" data-field="cuenta"></td>
              <td><input class="cell linea-cell" type="text" value="${l.proveedor || ''}" placeholder="Nombre (opcional)" data-id="${l.id}" data-field="proveedor"></td>
              <td><input class="cell linea-cell" type="text" value="${l.referencia || ''}" data-id="${l.id}" data-field="referencia"></td>
              <td><input class="cell linea-cell" type="text" value="${l.descripcion || ''}" data-id="${l.id}" data-field="descripcion"></td>
              <td><input class="cell linea-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(l.cargo)}" data-id="${l.id}" data-field="cargo"></td>
              <td><input class="cell linea-cell num num-fmt" type="text" inputmode="decimal" value="${fmtInputVal(l.abono)}" data-id="${l.id}" data-field="abono"></td>
              <td><button class="row-del linea-del" data-id="${l.id}">✕</button></td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="4">Totales</td>
              <td class="num">${fmt(totalCargo)}</td>
              <td class="num">${fmt(totalAbono)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn-ghost btn-sm addLineaBtn" style="margin-top:10px;">+ Agregar línea</button>
    </div>`;
}

function catalogoCuentasUnificado(catalogos) {
  const items = [];
  catalogos.mayores.forEach(m => {
    const recorrer = (s, prefijo) => {
      const label = `${prefijo} › ${s.nombre}`;
      items.push({ label, tipo: 'sub', id: s.id });
      subcuentasHijas(s.id, catalogos.subcuentas).forEach(h => recorrer(h, label));
    };
    subcuentasRaiz(m.id, catalogos.subcuentas).forEach(s => recorrer(s, m.nombre));
  });
  catalogos.cuentasBanco.forEach(c => items.push({ label: `Banco — ${c.nombre}`, tipo: 'banco', id: c.id }));
  catalogos.monedasEfectivo.forEach(m => items.push({ label: `Caja — ${m.nombre}`, tipo: 'efectivo', id: m.id }));
  (catalogos.facturasPendientes || []).forEach(f => {
    const saldo = Number(f.importe) - (Number(f.importe_pagado) || 0);
    items.push({ label: `Pagar: ${f.proveedor} — Factura ${f.factura || 's/f'} (${fmt(saldo)} pendiente)`, tipo: 'proveedor', id: f.id });
  });
  (catalogos.facturasClientesPendientes || []).forEach(f => {
    const saldo = Number(f.total) - (Number(f.importe_pagado) || 0);
    items.push({ label: `Cobrar: ${f.clienteNombre} — Factura #${f.folio} (${fmt(saldo)} pendiente)`, tipo: 'cliente', id: f.id });
  });
  (catalogos.proveedoresCatalogo || []).forEach(c => {
    const nombre = c.razon_social ? `${c.razon_social} — ${c.nombre_comercial || ''}` : (c.nombre_comercial || c.nombre);
    items.push({ label: `Provisionar: ${nombre}`, tipo: 'proveedor_provision', id: c.id });
  });
  return items;
}

function wireBorradorPolizaHandlers(wrap) {
  wrap.querySelectorAll('.poliza-cell').forEach(inp => inp.addEventListener('change', () => {
    STATE_polizaBorrador.poliza[inp.dataset.field] = inp.value;
    renderizarBorradorPoliza();
  }));
  wrap.querySelectorAll('.linea-cuenta-buscar').forEach(inp => inp.addEventListener('change', () => {
    const linea = STATE_polizaBorrador.lineas.find(l => l.id === inp.dataset.id);
    if (!linea) return;
    const catalogoItems = catalogoCuentasUnificado(STATE_polizaBorrador.catalogos);
    const texto = inp.value.trim();
    if (!texto) { linea.cuenta_tipo = 'subcuenta'; linea.subcuenta_id = null; linea.cuenta_ref_id = null; linea.proveedor_factura_id = null; linea.cliente_factura_id = null; renderizarBorradorPoliza(); return; }
    const match = catalogoItems.find(it => it.label === texto);
    if (!match) { toast('No se encontró esa cuenta. Elige una de la lista que aparece al escribir.', 'error'); renderizarBorradorPoliza(); return; }
    if (match.tipo === 'banco') { linea.cuenta_tipo = 'banco'; linea.cuenta_ref_id = match.id; linea.subcuenta_id = null; linea.proveedor_factura_id = null; linea.cliente_factura_id = null; }
    else if (match.tipo === 'efectivo') { linea.cuenta_tipo = 'efectivo'; linea.cuenta_ref_id = match.id; linea.subcuenta_id = null; linea.proveedor_factura_id = null; linea.cliente_factura_id = null; }
    else if (match.tipo === 'proveedor') {
      linea.cuenta_tipo = 'proveedor'; linea.proveedor_factura_id = match.id; linea.subcuenta_id = null; linea.cuenta_ref_id = null; linea.cliente_factura_id = null;
      const factura = (STATE_polizaBorrador.catalogos.facturasPendientes || []).find(f => f.id === match.id);
      if (factura && !Number(linea.cargo)) linea.cargo = Number(factura.importe) - (Number(factura.importe_pagado) || 0);
    }
    else if (match.tipo === 'cliente') {
      linea.cuenta_tipo = 'cliente'; linea.cliente_factura_id = match.id; linea.subcuenta_id = null; linea.cuenta_ref_id = null; linea.proveedor_factura_id = null;
      const factura = (STATE_polizaBorrador.catalogos.facturasClientesPendientes || []).find(f => f.id === match.id);
      if (factura && !Number(linea.abono)) linea.abono = Number(factura.total) - (Number(factura.importe_pagado) || 0);
    }
    else if (match.tipo === 'proveedor_provision') {
      linea.cuenta_tipo = 'proveedor_provision'; linea.proveedor_catalogo_id = match.id; linea.subcuenta_id = null; linea.cuenta_ref_id = null; linea.proveedor_factura_id = null; linea.cliente_factura_id = null;
    }
    else { linea.cuenta_tipo = 'subcuenta'; linea.subcuenta_id = match.id; linea.cuenta_ref_id = null; linea.proveedor_factura_id = null; linea.cliente_factura_id = null; }
    renderizarBorradorPoliza();
    const siguienteInput = wrap.querySelector(`.linea-cell[data-id="${inp.dataset.id}"][data-field="proveedor"]`);
    if (siguienteInput) { siguienteInput.focus(); if (siguienteInput.select) siguienteInput.select(); }
  }));
  wrap.querySelectorAll('.linea-cell').forEach(inp => inp.addEventListener('change', () => {
    const linea = STATE_polizaBorrador.lineas.find(l => l.id === inp.dataset.id);
    if (!linea) return;
    const field = inp.dataset.field;
    linea[field] = (field === 'descripcion' || field === 'referencia' || field === 'proveedor') ? (inp.value || '') : leerMonto(inp.value);
    renderizarBorradorPoliza();
  }));
  wrap.querySelectorAll('.linea-del').forEach(btn => btn.addEventListener('click', () => {
    STATE_polizaBorrador.lineas = STATE_polizaBorrador.lineas.filter(l => l.id !== btn.dataset.id);
    renderizarBorradorPoliza();
  }));
  const addBtn = wrap.querySelector('.addLineaBtn');
  if (addBtn) addBtn.addEventListener('click', () => {
    const siguienteOrden = Math.max(-1, ...STATE_polizaBorrador.lineas.map(l => l.orden || 0)) + 1;
    STATE_polizaBorrador.lineas.push({ id: 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), subcuenta_id: null, cuenta_tipo: 'subcuenta', cuenta_ref_id: null, cargo: 0, abono: 0, descripcion: '', referencia: '', orden: siguienteOrden });
    renderizarBorradorPoliza();
  });
  const guardarBtn = wrap.querySelector('.poliza-guardar');
  if (guardarBtn) guardarBtn.addEventListener('click', guardarBorradorPoliza);
  const cerrarXBtn = wrap.querySelector('.poliza-cerrar-x');
  if (cerrarXBtn) cerrarXBtn.addEventListener('click', cerrarModalPolizaConfirmando);
  const delBtn = wrap.querySelector('.poliza-del');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro que deseas eliminar esta póliza? Esta acción no se puede deshacer.')) return;
    const businessId = STATE_polizaBorrador.businessId;
    const p = STATE_polizaBorrador.poliza;
    const facturasVinculadas = STATE_polizaBorrador.lineas.filter(l => l.cuenta_tipo === 'proveedor' && l.proveedor_factura_id).map(l => l.proveedor_factura_id);
    const facturasClienteVinculadas = STATE_polizaBorrador.lineas.filter(l => l.cuenta_tipo === 'cliente' && l.cliente_factura_id).map(l => l.cliente_factura_id);

    // Si esta póliza dio origen a alguna factura de proveedor por provisión, se elimina también
    // (nació de aquí, no tiene por qué quedar huérfana) — salvo que ya tenga pagos aplicados,
    // en cuyo caso se deja, solo se desvincula el origen para no perder ese historial.
    const { data: facturasProvenientes } = await sb.from('fz_proveedores').select('id,importe_pagado,proveedor').eq('origen_poliza_id', p.id);
    for (const fp of (facturasProvenientes || [])) {
      if (Number(fp.importe_pagado) > 0.004) {
        await sb.from('fz_proveedores').update({ origen_poliza_id: null }).eq('id', fp.id);
        toast(`La factura de ${fp.proveedor} ya tiene pagos aplicados — se conservó, solo se desvinculó de esta póliza.`);
      } else {
        await sb.from('fz_adjuntos').delete().eq('tabla', 'fz_proveedores').eq('registro_id', fp.id);
        await sb.from('fz_proveedores').delete().eq('id', fp.id);
      }
    }

    await sb.from('fz_polizas').delete().eq('id', p.id);
    for (const facturaId of [...new Set(facturasVinculadas)]) await sincronizarPagoDesdePolizas(businessId, facturaId);
    for (const facturaId of [...new Set(facturasClienteVinculadas)]) await sincronizarCobroDesdePolizas(businessId, facturaId);
    registrarAuditoria(businessId, 'eliminar', 'Pólizas', `Póliza #${p.numero ?? '—'} (${p.fecha || ''}) — ${p.concepto || 'sin concepto'}`);
    STATE_polizaBorrador = null;
    document.getElementById('modalPoliza').classList.remove('show');
    renderPolizas();
  });
  if (STATE_polizaBorrador.esNueva) {
    const pendienteInput = wrap.querySelector('.adjunto-pendiente-input');
    if (pendienteInput) pendienteInput.addEventListener('change', () => {
      const file = pendienteInput.files[0];
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ADJUNTOS_EXT_PERMITIDAS.includes(ext)) { toast('Solo se permiten archivos PDF, JPG o PNG.', 'error'); return; }
      if (file.size > ADJUNTOS_MAX_MB * 1024 * 1024) { toast(`El archivo pesa más de ${ADJUNTOS_MAX_MB} MB.`, 'error'); return; }
      if (!STATE_polizaBorrador.poliza.archivosPendientes) STATE_polizaBorrador.poliza.archivosPendientes = [];
      STATE_polizaBorrador.poliza.archivosPendientes.push(file);
      renderizarBorradorPoliza();
    });
    wrap.querySelectorAll('.quitar-adjunto-pendiente').forEach(btn => btn.addEventListener('click', () => {
      STATE_polizaBorrador.poliza.archivosPendientes.splice(Number(btn.dataset.idx), 1);
      renderizarBorradorPoliza();
    }));
  } else {
    wireAdjuntosHandlers(wrap, 'fz_polizas', STATE_polizaBorrador.businessId, () => refrescarAdjuntoBorrador());
  }
  wireInputsMoneda(wrap);
}

async function refrescarAdjuntoBorrador() {
  // el archivo ya se subió y ya se guardó en la BD (la póliza ya existía); solo refrescamos el conteo local
  if (!STATE_polizaBorrador || STATE_polizaBorrador.esNueva) return;
  const conteo = await contarAdjuntosPorRegistro('fz_polizas', [STATE_polizaBorrador.poliza.id]);
  STATE_polizaBorrador.conteoAdjuntos = conteo[STATE_polizaBorrador.poliza.id] || 0;
  renderizarBorradorPoliza();
}

async function sincronizarPagoDesdePolizas(businessId, facturaId) {
  const { data: factura } = await sb.from('fz_proveedores').select('*').eq('id', facturaId).single();
  if (!factura) return;
  const { data: lineasPago } = await sb.from('fz_polizas_lineas').select('cargo').eq('business_id', businessId).eq('cuenta_tipo', 'proveedor').eq('proveedor_factura_id', facturaId);
  const pagadoPorPolizasAhora = (lineasPago || []).reduce((s,l) => s + (Number(l.cargo) || 0), 0);
  const pagadoPorPolizasAntes = Number(factura.importe_pagado_polizas) || 0;
  const delta = pagadoPorPolizasAhora - pagadoPorPolizasAntes;
  if (Math.abs(delta) < 0.004) return; // nada cambió, no tocar lo que ya había (evita pisar pagos de Bancos/Efectivo)

  const nuevoImportePagado = Math.max(0, (Number(factura.importe_pagado) || 0) + delta);
  const nuevoEstatus = nuevoImportePagado >= Number(factura.importe) - 0.01 ? 'Pagado'
    : nuevoImportePagado > 0.004 ? 'Parcial'
    : 'Pendiente';
  const payload = { importe_pagado: nuevoImportePagado, importe_pagado_polizas: pagadoPorPolizasAhora, estatus: nuevoEstatus };
  if (nuevoEstatus === 'Pendiente') { payload.fecha_pago = null; }
  else if (!factura.fecha_pago) { payload.fecha_pago = todayStr(); }
  await sb.from('fz_proveedores').update(payload).eq('id', facturaId);
}

async function sincronizarCobroDesdePolizas(businessId, facturaId) {
  const { data: factura } = await sb.from('fz_facturas_clientes').select('*').eq('id', facturaId).single();
  if (!factura) return;
  const { data: lineasCobro } = await sb.from('fz_polizas_lineas').select('abono').eq('business_id', businessId).eq('cuenta_tipo', 'cliente').eq('cliente_factura_id', facturaId);
  const cobradoPorPolizasAhora = (lineasCobro || []).reduce((s,l) => s + (Number(l.abono) || 0), 0);
  const cobradoPorPolizasAntes = Number(factura.cobrado_por_polizas) || 0;
  const delta = cobradoPorPolizasAhora - cobradoPorPolizasAntes;
  if (Math.abs(delta) < 0.004) return; // nada cambió, no tocar lo que ya había (evita pisar cobros de Bancos/Efectivo)

  const nuevoImportePagado = Math.max(0, (Number(factura.importe_pagado) || 0) + delta);
  const nuevoEstatus = nuevoImportePagado >= Number(factura.total) - 0.01 ? 'Pagado'
    : nuevoImportePagado > 0.004 ? 'Parcial'
    : 'Pendiente';
  const payload = { importe_pagado: nuevoImportePagado, cobrado_por_polizas: cobradoPorPolizasAhora, estatus: nuevoEstatus };
  if (nuevoEstatus === 'Pendiente') { payload.fecha_pago = null; }
  else if (!factura.fecha_pago) { payload.fecha_pago = todayStr(); }
  await sb.from('fz_facturas_clientes').update(payload).eq('id', facturaId);
}

async function guardarBorradorPoliza() {
  if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
  const borrador = STATE_polizaBorrador;
  const businessId = borrador.businessId;

  if (polizaEsBorradorVacio(borrador)) {
    if (!borrador.esNueva) await sb.from('fz_polizas').delete().eq('id', borrador.poliza.id);
    STATE_polizaBorrador = null;
    document.getElementById('modalPoliza').classList.remove('show');
    renderPolizas();
    return;
  }

  let polizaId = borrador.poliza.id;
  if (borrador.esNueva) {
    const { data, error } = await sb.from('fz_polizas').insert({ business_id: businessId, numero: borrador.poliza.numero, fecha: borrador.poliza.fecha, concepto: borrador.poliza.concepto }).select().single();
    if (error) { toast('Error guardando la póliza: ' + error.message, 'error'); return; }
    polizaId = data.id;
    if ((borrador.poliza.archivosPendientes || []).length) {
      for (const file of borrador.poliza.archivosPendientes) {
        const subido = await subirAdjunto('fz_polizas', polizaId, businessId, file);
        if (subido) await sb.from('fz_adjuntos').insert({ business_id: businessId, tabla: 'fz_polizas', registro_id: polizaId, archivo_path: subido.path, archivo_nombre: subido.nombre });
      }
    }
  } else {
    const { error } = await sb.from('fz_polizas').update({ fecha: borrador.poliza.fecha, concepto: borrador.poliza.concepto }).eq('id', polizaId);
    if (error) { toast('Error guardando la póliza: ' + error.message, 'error'); return; }
  }

  // Convertir líneas de "Provisionar" en facturas reales de Proveedores (Cuentas por pagar),
  // antes de guardar las líneas — de ahí en adelante se comportan como cualquier línea vinculada.
  for (const l of borrador.lineas) {
    if (l.cuenta_tipo === 'proveedor_provision' && l.proveedor_catalogo_id) {
      const montoProvision = Number(l.abono) || 0;
      if (montoProvision <= 0) {
        toast('Para provisionar un proveedor, captura el monto en la columna Abono (no Cargo) — representa lo que se le empieza a deber.', 'error');
        continue;
      }
      const cat = (borrador.catalogos.proveedoresCatalogo || []).find(c => c.id === l.proveedor_catalogo_id);
      const nombreProv = cat ? (cat.razon_social ? `${cat.razon_social}${cat.nombre_comercial ? ' — ' + cat.nombre_comercial : ''}` : (cat.nombre_comercial || cat.nombre)) : 'Proveedor';
      const { data: nuevaFactura, error: errFact } = await sb.from('fz_proveedores').insert({
        business_id: businessId, proveedor_id: l.proveedor_catalogo_id, proveedor: nombreProv,
        fecha: borrador.poliza.fecha, importe: montoProvision, estatus: 'Pendiente', factura: null, origen_poliza_id: polizaId,
      }).select().single();
      if (errFact) { toast('Error creando la provisión en Proveedores: ' + errFact.message, 'error'); continue; }
      l.cuenta_tipo = 'proveedor';
      l.proveedor_factura_id = nuevaFactura.id;
      // La clasificación contable ya quedó registrada en las otras líneas de esta misma póliza
      // (ej. el cargo a Comisiones Bancarias) — se copian aquí para que la factura no aparezca
      // como "pendiente de desglosar" cuando en realidad ya está contabilizada.
      const desgloseHeredado = borrador.lineas
        .filter(otra => otra.cuenta_tipo === 'subcuenta' && otra.subcuenta_id && ((Number(otra.cargo)||0) > 0.004 || (Number(otra.abono)||0) > 0.004))
        .map(otra => ({ subcuenta_id: otra.subcuenta_id, monto: (Number(otra.cargo)||0) || (Number(otra.abono)||0), descripcion: otra.descripcion || null }));
      if (desgloseHeredado.length) {
        await sb.from('fz_proveedores').update({ desglose: desgloseHeredado }).eq('id', nuevaFactura.id);
      }
      registrarAuditoria(businessId, 'crear', 'Proveedores', `${nombreProv} · provisión desde Póliza de Diario · ${fmt(montoProvision)}`);
    }
  }

  let huboError = false;
  const idsFinales = []; // ids reales (ya sea existentes o recién creados) que deben permanecer
  for (const l of borrador.lineas) {
    const payload = { subcuenta_id: l.subcuenta_id || null, cuenta_tipo: l.cuenta_tipo || 'subcuenta', cuenta_ref_id: l.cuenta_ref_id || null, proveedor_factura_id: l.cuenta_tipo === 'proveedor' ? (l.proveedor_factura_id || null) : null, cliente_factura_id: l.cuenta_tipo === 'cliente' ? (l.cliente_factura_id || null) : null, cargo: Number(l.cargo) || 0, abono: Number(l.abono) || 0, descripcion: l.descripcion || null, referencia: l.referencia || null, proveedor: l.proveedor || null, orden: l.orden || 0 };
    if (String(l.id).startsWith('tmp_')) {
      const { data, error } = await sb.from('fz_polizas_lineas').insert({ business_id: businessId, poliza_id: polizaId, ...payload }).select().single();
      if (error) { toast('Error guardando una línea: ' + error.message, 'error'); huboError = true; }
      else if (data) idsFinales.push(data.id);
    } else {
      const { error } = await sb.from('fz_polizas_lineas').update(payload).eq('id', l.id);
      if (error) { toast('Error guardando una línea: ' + error.message, 'error'); huboError = true; }
      else idsFinales.push(l.id);
    }
  }
  if (huboError) return; // no cerramos la ventana: así no pierdes lo que llevas capturado, corrige y vuelve a intentar
  if (!borrador.esNueva) {
    const { data: existentesEnBD } = await sb.from('fz_polizas_lineas').select('id').eq('poliza_id', polizaId);
    const idsABorrar = (existentesEnBD || []).map(l => l.id).filter(id => !idsFinales.includes(id));
    if (idsABorrar.length) {
      const { error } = await sb.from('fz_polizas_lineas').delete().in('id', idsABorrar);
      if (error) { toast('Error al quitar líneas eliminadas: ' + error.message, 'error'); return; }
    }
  }

  // Sincronizar el estatus de cualquier factura que haya quedado vinculada (o desvinculada) en esta póliza
  const facturasOriginal = borrador.esNueva ? [] : JSON.parse(borrador.original).lineas.filter(l => l.cuenta_tipo === 'proveedor' && l.proveedor_factura_id).map(l => l.proveedor_factura_id);
  const facturasActuales = borrador.lineas.filter(l => l.cuenta_tipo === 'proveedor' && l.proveedor_factura_id).map(l => l.proveedor_factura_id);
  const facturasASincronizar = [...new Set([...facturasOriginal, ...facturasActuales])];
  for (const facturaId of facturasASincronizar) await sincronizarPagoDesdePolizas(businessId, facturaId);

  const facturasClienteOriginal = borrador.esNueva ? [] : JSON.parse(borrador.original).lineas.filter(l => l.cuenta_tipo === 'cliente' && l.cliente_factura_id).map(l => l.cliente_factura_id);
  const facturasClienteActuales = borrador.lineas.filter(l => l.cuenta_tipo === 'cliente' && l.cliente_factura_id).map(l => l.cliente_factura_id);
  const facturasClienteASincronizar = [...new Set([...facturasClienteOriginal, ...facturasClienteActuales])];
  for (const facturaId of facturasClienteASincronizar) await sincronizarCobroDesdePolizas(businessId, facturaId);

  registrarAuditoria(businessId, borrador.esNueva ? 'crear' : 'editar', 'Pólizas', `Póliza #${borrador.poliza.numero ?? '—'} (${borrador.poliza.fecha || ''}) — ${borrador.poliza.concepto || 'sin concepto'}`);
  STATE_polizaBorrador = null;
  document.getElementById('modalPoliza').classList.remove('show');
  renderPolizas();
}

function cerrarModalPolizaConfirmando() {
  if (polizaBorradorEsSucio()) {
    if (!confirm('¿Deseas salir sin guardar? Se perderán los cambios que hiciste.')) return;
  }
  STATE_polizaBorrador = null;
  document.getElementById('modalPoliza').classList.remove('show');
  renderPolizas();
}

/* ============================================================
   CERRAR CUALQUIER MODAL CON ESC
   ============================================================ */
function botonCerrarModal(modal) {
  return modal.querySelector('button[id^="close" i], button[id^="cerrar" i]')
    || modal.querySelector('.poliza-cerrar-x')
    || modal.querySelector('button[id^="cancel" i]');
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modalAbierto = document.querySelector('.modal-bg.show');
  if (!modalAbierto) return;
  const btn = botonCerrarModal(modalAbierto);
  if (btn) btn.click();
});
