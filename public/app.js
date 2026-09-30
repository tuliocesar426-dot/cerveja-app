const API = '/api';
const CATS = ['Todas', 'Mercado', 'Adega', 'Empório', 'Conveniência'];
const PACKS = ['Lata 269 ml', 'Lata 350 ml', 'Lata 473 ml', 'Long neck 330 ml', 'Garrafa 600 ml', 'Garrafa 1 litro', 'Caixa com 12 latas', 'Fardo com 12 garrafas'];
const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

const $ = id => document.getElementById(id);
let user = null, filter = 'Todas', tab = 'mural', q = '', items = [], pos = null;

const brl = n => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
const waFix = v => {
  let d = String(v).replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return d;
};
const esc = t => {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
};

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)) } catch (e) { return null } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } }
};

const msgUrl = (o, rep) => {
  const n = String(o.whatsapp || '').replace(/\D/g, '');
  const who = user ? 'Aqui é ' + user.name + '. ' : '';
  const m = rep ? 'Olá! ' + who + 'Quero repetir meu pedido: ' + o.product + ' (' + o.pack + '). Da última vez foi ' + brl(o.price) + '. Ainda tem?' : 'Olá! ' + who + 'Vi no CerveJá: ' + o.product + ' (' + o.pack + ') por ' + brl(o.price) + '. Ainda está valendo?';
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(m);
};

const waUrl = p => msgUrl(p, false);

const OKLOC = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)\//;

function parseLoc(t) {
  t = String(t || '').trim();
  if (!t) return {};
  const m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || t.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/^(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+\.\d+)$/);
  if (m) return { lat: +m[1], lng: +m[2] };
  return OKLOC.test(t) ? { loc: t } : {};
}

const ll = p => p.lat != null && p.lng != null ? p.lat + ',' + p.lng : null;
const txt = p => encodeURIComponent((p.store || '') + ', ' + p.address);
const mapUrl = p => ll(p) ? 'https://www.google.com/maps/search/?api=1&query=' + ll(p) : p.loc || 'https://www.google.com/maps/search/?api=1&query=' + txt(p);
const dirUrl = p => 'https://www.google.com/maps/dir/?api=1&destination=' + (ll(p) || txt(p));
const parkUrl = p => ll(p) ? 'https://www.google.com/maps/search/estacionamento/@' + ll(p) + ',17z' : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('estacionamento perto de ' + p.address);

const dist = (a, b) => {
  const r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dg = r(b.lng - a.lng);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

function bindLoc() {
  const b = $('loc');
  if (!b) return;
  b.onclick = () => {
    const msg = $('locmsg');
    if (!navigator.geolocation) {
      msg.textContent = 'Seu navegador não permite localização.';
      return;
    }
    msg.textContent = 'Buscando sua localização…';
    navigator.geolocation.getCurrentPosition(
      g => {
        pos = { lat: g.coords.latitude, lng: g.coords.longitude };
        msg.textContent = 'Ordenado pela distância.';
        render();
      },
      () => { msg.textContent = 'Não foi possível pegar sua localização. Permita o acesso e tente de novo.'; },
      { timeout: 10000 }
    );
  };
}

const today = () => new Date().toLocaleDateString('sv-SE');
const active = p => !p.valid_until || p.valid_until >= today();
const match = p => (filter === 'Todas' || p.category === filter) && ((p.store + ' ' + p.address + ' ' + (p.product || '')).toLowerCase().includes(q.toLowerCase()));

async function fetchPromotions() {
  try {
    const params = new URLSearchParams();
    if (filter !== 'Todas') params.append('category', filter);
    if (q) params.append('search', q);
    const res = await fetch(`${API}/promotions?${params}`);
    if (!res.ok) throw new Error();
    items = await res.json();
    render();
  } catch (err) {
    console.error('Erro ao buscar promoções:', err);
  }
}

function controls() {
  $('chips').innerHTML = `<input id="q" type="search" placeholder="Buscar por nome ou endereço" aria-label="Buscar"><select id="fc" aria-label="Categoria">${CATS.map(c => `<option value="${c}"${c === filter ? ' selected' : ''}>${c === 'Todas' ? 'Todas as categorias' : c}</option>`).join('')}</select>`;
  $('q').value = q;
  $('q').oninput = e => { q = e.target.value; fetchPromotions(); };
  $('fc').onchange = e => { filter = e.target.value; fetchPromotions(); };
}

function render() {
  if (tab === 'mural') {
    const l = items.filter(p => active(p)).sort((a, b) => a.price - b.price);
    if (!l.length) { $('list').innerHTML = '<div class="empty">Nenhuma promoção encontrada.</div>'; return; }
    $('list').innerHTML = l.map((p, i) => {
      const off = p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
      return `<article class="card${i ? '' : ' best'}"><div class="kick">Cerveja / ${esc(p.category)}</div><div class="name">${esc(p.store)}</div>
<div class="addr">${PIN}<span>${esc(p.address)}</span></div>
<div class="prod">${esc(p.product)} <span class="mut">${esc(p.pack)}</span></div>
<div class="pr"><span class="price">${brl(p.price)}</span>${p.old_price ? `<span class="old">${brl(p.old_price)}</span>` : ''}${off ? `<span class="badge">-${off}%</span>` : ''}</div>
${p.valid_until ? `<div class="mut">Até ${p.valid_until.split('-').reverse().join('/')}</div>` : ''}
<div class="acts"><a class="btn pri go" href="${waUrl(p)}" target="_blank" rel="noopener">Chamar no WhatsApp</a>
<a class="btn" href="${mapUrl(p)}" target="_blank" rel="noopener">Ver no mapa</a>
<a class="btn" href="${dirUrl(p)}" target="_blank" rel="noopener">Como chegar</a>
<a class="btn" href="${parkUrl(p)}" target="_blank" rel="noopener">Estacionamento</a></div></article>`;
    }).join('');
  } else {
    const m = new Map();
    items.forEach(p => {
      const k = p.store + '|' + p.address;
      const e = m.get(k) || { store: p.store, category: p.category, address: p.address, whatsapp: p.whatsapp, lat: p.latitude, lng: p.longitude, loc: p.location_url, n: 0, min: null };
      if (active(p)) { e.n++; e.min = e.min === null ? p.price : Math.min(e.min, p.price); }
      m.set(k, e);
    });
    const l = [...m.values()].filter(e => match({ store: e.store, address: e.address, category: e.category }));
    l.forEach(e => e.d = (pos && ll(e)) ? dist(pos, e) : null);
    l.sort((a, b) => tab === 'mapa' && pos ? ((a.d ?? 1e9) - (b.d ?? 1e9)) : a.store.localeCompare(b.store));
    if (!l.length) { $('list').innerHTML = '<div class="empty">Nenhum estabelecimento encontrado.</div>'; return; }
    $('list').innerHTML = l.map(e => `<article class="card"><div class="kick">Cerveja / ${esc(e.category)}</div><div class="name">${esc(e.store)}</div>
<div class="addr">${PIN}<span>${esc(e.address)}</span></div>
<div class="mut">${e.d != null ? `A ${e.d < 1 ? Math.round(e.d * 1000) + ' m' : e.d.toFixed(1).replace('.', ',') + ' km'} de você • ` : ''}${e.n ? `${e.n} oferta${e.n > 1 ? 's' : ''} ativa${e.n > 1 ? 's' : ''} • a partir de ${brl(e.min)}` : 'Sem ofertas ativas no momento.'}</div>
<div class="acts"><a class="btn" href="https://wa.me/${String(e.whatsapp || '').replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp</a>
<a class="btn pri" href="${mapUrl(e)}" target="_blank" rel="noopener">Ver no mapa</a>
<a class="btn" href="${dirUrl(e)}" target="_blank" rel="noopener">Como chegar</a>
<a class="btn" href="${parkUrl(e)}" target="_blank" rel="noopener">Estacionamento</a></div></article>`).join('');
  }
}

function adminUI() {
  $('admin').innerHTML = `<details id="add"><summary>Cadastrar promoção</summary>
<form id="f">
<label>Tipo de local<select id="cat">${CATS.slice(1).map(c => `<option>${c}</option>`).join('')}</select></label>
<label>Cerveja (marca ou estilo)<input id="prod" required maxlength="50" placeholder="Ex.: Pilsen"></label>
<label>Embalagem<select id="pack">${PACKS.map(c => `<option>${c}</option>`).join('')}</select></label>
<div class="row"><label>Preço de (R$)<input id="old" type="number" step="0.01" min="0" inputmode="decimal"></label>
<label>Preço por (R$)<input id="price" type="number" step="0.01" min="0" required inputmode="decimal"></label></div>
<label>Válido até<input id="until" type="date"></label>
<label>Endereço do local<input id="addr" required maxlength="120" placeholder="Rua, número, cidade"></label>
<label>WhatsApp do local (com DDD)<input id="wa" type="tel" required maxlength="20" inputmode="tel" placeholder="Ex.: 16 99999-9999"></label>
<label>Localização exata (opcional)<input id="lx" maxlength="300" placeholder="Cole o link do Google Maps ou lat, lng"></label>
<button class="save" type="submit">Publicar promoção</button></form></details>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const token = ls.get('ap-token');
      const loc = parseLoc($('lx').value);
      const res = await fetch(`${API}/promotions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: $('cat').value,
          product: $('prod').value.trim(),
          pack: $('pack').value,
          old_price: parseFloat($('old').value) || null,
          price: parseFloat($('price').value),
          valid_until: $('until').value,
          address: $('addr').value.trim(),
          whatsapp: waFix($('wa').value),
          ...loc
        })
      });
      if (!res.ok) throw new Error();
      $('f').reset();
      fetchPromotions();
      alert('✅ Promoção publicada com sucesso!');
    } catch (err) {
      alert('❌ Erro ao publicar promoção');
    }
  };
}

function refresh() {
  const ok = !!user;
  $('hd').innerHTML = ok ? '<button class="pill" id="out" type="button">Sair</button>' : '';
  $('gate').innerHTML = ok ? '' : `<div class="card"><strong>Bem-vindo! Cadastre-se para ver as promoções de cerveja.</strong><button class="save" id="gb" type="button">Cadastrar</button></div>`;

  const FORM = `<form id="g" class="card"><strong>Crie seu cadastro para ver as promoções</strong>
<label>Seu nome<input id="gn" required maxlength="40" autocomplete="name"></label>
<label>Seu WhatsApp (com DDD)<input id="gw" type="tel" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="Ex.: 16 99999-9999"></label>
<button class="save" type="submit">Entrar</button></form>`;

  if (!ok) {
    ['tabs', 'ttl', 'chips', 'list'].forEach(i => $(i).innerHTML = '');
    const gb = $('gb');
    if (gb) gb.onclick = () => {
      $('gate').innerHTML = FORM;
      $('gn').focus();
      $('g').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: $('gn').value.trim(), wa: waFix($('gw').value) })
          });
          if (!res.ok) throw new Error();
          const data = await res.json();
          user = data.user;
          ls.set('ap-token', data.token);
          ls.set('ap-user', user);
          refresh();
        } catch (err) {
          alert('❌ Erro ao fazer login');
        }
      };
    };
    return;
  }

  $('admin').innerHTML = '';
  adminUI();
  $('tabs').innerHTML = [['mural', 'Mural'], ['lugares', 'Lugares'], ['mapa', 'Mapa']].map(([k, l]) => `<button class="tab" type="button" aria-pressed="${tab === k}" data-k="${k}">${l}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.k; refresh(); });
  
  $('ttl').innerHTML = tab === 'mural' ? '<h1>Mural de ofertas</h1><p class="sub">Os menores preços de cerveja perto de você.</p>' : tab === 'lugares' ? '<h1>Estabelecimentos</h1><p class="sub">Adegas, mercados, empórios e conveniências com promoção de cerveja.</p>' : '<h1>Mapa</h1><p class="sub">Veja quem está mais perto e vá direto até lá.</p><button class="btn pri" id="loc" type="button">Usar minha localização</button><p class="sub" id="locmsg" style="margin-top:10px"></p>';

  controls();
  fetchPromotions();
  bindLoc();

  const out = $('out');
  if (out) out.onclick = () => { user = null; ls.set('ap-token', null); ls.set('ap-user', null); refresh(); };
}

// Verificar login ao carregar
const token = ls.get('ap-token');
const savedUser = ls.get('ap-user');
if (token && savedUser) {
  user = savedUser;
}

refresh();
