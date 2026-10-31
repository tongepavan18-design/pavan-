const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(t) {
  const e = $('#toast'); e.textContent = t; e.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 2200);
}
function vib(p) { try { navigator.vibrate && navigator.vibrate(p) } catch (e) {} }
function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied'), fb);
  else fb();
  function fb() {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast('Copied') } catch (e) { toast('Copy failed') }
    t.remove();
  }
}

/* ---------- tabs ---------- */
const tabs = [['sos', '&#128680;', 'Alert'], ['loc', '&#128205;', 'Location'], ['circle', '&#128101;', 'Contacts']];
$('#nav').innerHTML = tabs.map(t => `<button data-t="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + id));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
  if (id === 'circle') renderContacts();
  if (id === 'loc') renderLocation();
}
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.t) };
show('sos');

/* ---------- contacts ---------- */
const contacts = () => store.get('contacts', []);
function renderContacts() {
  $('#note').value = store.get('note', '');
  const c = contacts();
  $('#cts').innerHTML = c.length
    ? c.map((x, i) => `<div class="ct"><b>${esc(x.name)}<br><small>${esc(x.num)}</small></b><button class="ghost" data-del="${i}">Remove</button></div>`).join('')
    : '<p class="hint">No contacts yet.</p>';
}
$('#noteSave').onclick = () => { store.set('note', $('#note').value.trim()); toast('Saved') };
$('#cAdd').onclick = () => {
  const n = $('#cName').value.trim(), p = $('#cNum').value.trim().replace(/[^\d+]/g, '');
  const c = contacts();
  if (!n || p.replace(/\D/g, '').length < 7) return toast('Enter a name and a valid number');
  if (c.length >= 5) return toast('Maximum 5 contacts');
  c.push({ name: n, num: p }); store.set('contacts', c);
  $('#cName').value = $('#cNum').value = ''; renderContacts();
};
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.del !== undefined) {
    const c = contacts(); c.splice(+b.dataset.del, 1); store.set('contacts', c); renderContacts();
  }
});

/* ---------- live location ---------- */
let pos = null, watchId = null;
let session = store.get('session', null); // { id, token, link } while an SOS is active
const sharing = () => watchId !== null;
const mapsLink = () => pos ? `https://maps.google.com/?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}` : '';
const listeners = new Set();

function showGeoError(msg) {
  $('#locStatus').textContent = msg; $('#alLoc').textContent = msg; toast(msg);
}
function geoProblem() {
  if (!('geolocation' in navigator)) return 'This browser does not support location.';
  if (!window.isSecureContext) return 'Location needs HTTPS or localhost. Open the app from an https:// link (see README, "Use on a phone"), not from a file or an http://192.168... address.';
  return '';
}
function startWatch(highAccuracy = true) {
  const problem = geoProblem();
  if (problem) { showGeoError(problem); return false }
  if (sharing()) return true;
  watchId = navigator.geolocation.watchPosition(p => {
    pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: new Date() };
    listeners.forEach(f => f());
  }, err => {
    if (err.code === 1) { // permission denied: stop and explain
      navigator.geolocation.clearWatch(watchId); watchId = null; renderLocation();
      showGeoError('Location permission denied. Tap the lock icon next to the address bar, allow Location, then try again.');
    } else if (highAccuracy) { // GPS timed out or unavailable: retry with network location
      navigator.geolocation.clearWatch(watchId); watchId = null; startWatch(false);
    } else { // keep waiting, do not stop
      showGeoError('Still looking for your location. Turn on Location/GPS in phone settings and move near a window.');
    }
  }, { enableHighAccuracy: highAccuracy, maximumAge: 5000, timeout: highAccuracy ? 15000 : 30000 });
  renderLocation();
  return true;
}
function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null; renderLocation();
}
function renderLocation() {
  const on = sharing();
  $('#locStart').style.display = on ? 'none' : '';
  $('#locStop').style.display = on ? '' : 'none';
  $('#locStatus').textContent = on ? (pos ? 'Sharing live location.' : 'Finding your location...') : 'Not sharing.';
  const has = !!pos;
  $('#locInfo').style.display = has ? '' : 'none';
  $('#locMap').style.display = has ? '' : 'none';
  $('#locCopy').style.display = has ? '' : 'none';
  if (has) {
    $('#locInfo').textContent = `Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}\nAccuracy about ${pos.acc} m\nUpdated ${pos.at.toLocaleTimeString()}`;
    $('#locMap').href = mapsLink();
  }
  renderSend($('#locSend'), locMessage());
}
listeners.add(renderLocation);
$('#locStart').onclick = () => { startWatch() };
$('#locStop').onclick = stopWatch;
$('#locCopy').onclick = () => copy(mapsLink());

/* ---------- messages ---------- */
function note() { const n = store.get('note', ''); return n ? n + '\n' : '' }
function locLine() {
  if (session && session.link) return `Track me live: ${session.link}`;
  return pos ? `My live location: ${mapsLink()}` : 'My location is not available yet.';
}
function sosMessage() {
  return `EMERGENCY. I need help.\n${note()}${locLine()}\nTime: ${new Date().toLocaleString()}\nPlease contact me or call the police on 112.`;
}
function locMessage() {
  return `${note()}${locLine()}\nTime: ${new Date().toLocaleString()}`;
}
function digits(n) { return n.replace(/\D/g, '') }
function waNumber(n) { const d = digits(n); return d.length === 10 ? '91' + d : d }
function smsHref(n, text) {
  const sep = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
  return `sms:${n}${sep}body=${encodeURIComponent(text)}`;
}
function waHref(n, text) { return `https://wa.me/${waNumber(n)}?text=${encodeURIComponent(text)}` }
function renderSend(el, text) {
  const c = contacts();
  if (!c.length) { el.innerHTML = '<p class="hint">No contacts saved. Add them in the Contacts tab.</p>'; return }
  el.innerHTML = c.map(x => `<div class="ct"><b>${esc(x.name)}</b>
    <a class="btn" href="${smsHref(x.num, text)}">SMS</a>
    <a class="btn ghost" href="${waHref(x.num, text)}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('');
}

/* ---------- emergency alert ---------- */
function refreshAlert() {
  const msg = sosMessage();
  $('#alMsg').textContent = msg;
  $('#alLoc').textContent = pos ? `Live location on. Accuracy about ${pos.acc} m.` : 'Finding your location... you can still send the message.';
  renderSend($('#alCts'), msg);
}
const setStatus = t => { $('#alStatus').textContent = t };
const posBody = () => pos ? { lat: pos.lat, lng: pos.lng, acc: pos.acc } : null;

function getFix() {
  return new Promise(res => {
    if (pos) return res(pos);
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => {
      pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: new Date() };
      res(pos);
    }, () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 });
  });
}
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Server error ' + r.status);
  return d;
}

/* Sends the SMS automatically through the server, once per SOS */
async function sendSOS() {
  if (session) { setStatus('SOS already active. Your contacts have the live link.'); return }
  const c = contacts();
  if (!c.length) { setStatus('No contacts saved. Add contacts in the Contacts tab.'); return }
  setStatus('Sending SMS to your contacts...');
  await getFix();
  try {
    const d = await api('/api/sos', { contacts: c, note: store.get('note', ''), pos: posBody() });
    session = { id: d.id, token: d.token, link: d.link };
    store.set('session', session);
    const ok = d.results.filter(x => x.ok).length;
    setStatus(ok === d.results.length
      ? `SMS sent to all ${ok} contacts. Live location is updating.`
      : `SMS sent to ${ok} of ${d.results.length} contacts. Use the buttons below for the rest.`);
    refreshAlert();
  } catch (e) {
    setStatus(`Could not send automatically (${e.message}). Use the SMS and WhatsApp buttons below.`);
  }
}

/* Pushes the latest position to the server every few seconds */
let lastPush = 0;
function pushLocation() {
  if (!session || !pos || Date.now() - lastPush < 4000) return;
  lastPush = Date.now();
  api('/api/loc', { id: session.id, token: session.token, pos: posBody() }).catch(() => {});
}
listeners.add(pushLocation);

function openAlert() {
  $('#alert').classList.add('on');
  vib([300, 150, 300]);
  startWatch();
  refreshAlert();
  sendSOS();
}
listeners.add(() => { if ($('#alert').classList.contains('on')) refreshAlert() });

$('#alStop').onclick = async () => {
  if (session) { try { await api('/api/stop', { id: session.id, token: session.token }) } catch (e) {} }
  session = null; store.set('session', null);
  stopWatch(); $('#alert').classList.remove('on'); toast('Sharing stopped');
};
$('#alCopy').onclick = () => copy($('#alMsg').textContent);
$('#alShare').onclick = () => {
  const text = $('#alMsg').textContent;
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else copy(text);
};
$('#alClose').onclick = () => $('#alert').classList.remove('on');

/* ---------- SOS: hold 2 seconds ---------- */
(function () {
  const btn = $('#sosBtn'), ring = $('#ring'), LEN = 735, HOLD = 2000;
  let start = 0, raf = 0;
  function tick() {
    const p = Math.min((performance.now() - start) / HOLD, 1);
    ring.style.strokeDashoffset = LEN * (1 - p);
    if (p >= 1) { stop(); openAlert(); return }
    raf = requestAnimationFrame(tick);
  }
  function go(e) { e.preventDefault(); start = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); vib(30) }
  function stop() { cancelAnimationFrame(raf); start = 0; ring.style.strokeDashoffset = LEN }
  btn.addEventListener('pointerdown', go);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', e => e.preventDefault());
})();
