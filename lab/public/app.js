'use strict';
const $ = (id) => document.getElementById(id);
let S = null; let kindSig = '';
const FIELD = {
  type: { label: 'type', placeholder: 'MINI / SEDAN / SUV' }, km: { label: 'km', num: true }, hour: { label: 'hour (0-23)', num: true },
  promo: { label: 'promo', placeholder: 'FLAT30, NONE, …' }, name: { label: 'rider name' }, phone: { label: 'phone', placeholder: '10 digits' },
  minutes: { label: 'minutes since booking', num: true }, completeFirst: { label: 'complete ride first?', bool: true },
  ratings: { label: 'ratings', placeholder: 'e.g. 5,1,3' }, name1: { label: 'driver 1 name' }, type1: { label: 'driver 1 type' },
  name2: { label: 'driver 2 name' }, type2: { label: 'driver 2 type' },
};

async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
  return data;
}
const show = (id, on) => $(id).classList.toggle('hidden', !on);

function render() {
  const m = S.match, me = S.me;
  ['joinView', 'waitView', 'playView', 'resultView', 'leftView'].forEach((v) => show(v, false));
  $('exitBtn').textContent = me && me.completed ? 'Return to Krilern' : (m.status === 'ended' && me ? 'Return to Krilern' : 'Leave game');
  if (!S.returnUrl && me && (me.completed || m.status === 'ended')) $('exitBtn').textContent = 'Finish';
  $('banner').textContent = S.linkedAccount ? '' : 'Playing standalone: results are not linked to a Krilern account.';
  if (!me) {
    if (m.status === 'ended') { $('banner').textContent = 'This match has ended.'; return; }
    show('joinView', true);
    if ($('team').options.length !== m.teamCount) $('team').innerHTML = Array.from({ length: m.teamCount }, (_, i) => `<option value="${i + 1}">Team ${i + 1}</option>`).join('');
    return;
  }
  if (me.status === 'left') { show('leftView', true); $('leftText').textContent = me.completed ? 'Your completed result is saved by the game.' : 'Your progress so far is saved by the game. You left before finishing, so this match gives no completion credit.'; return; }
  if (m.status === 'lobby') { show('waitView', true); $('waitNick').textContent = me.nickname; $('waitDiff').textContent = m.difficultyLabel; return; }
  if (me.submitted || m.status === 'ended') { renderResult(); return; }
  show('playView', true);
  $('diffLine').textContent = `${m.difficultyLabel}. ${m.mutantCount} broken copies are hidden; ${m.bugCount} real suspected bugs are in the answer key.`;
  const sig = m.kinds.map((k) => k.id).join();
  if (sig !== kindSig) {
    kindSig = sig;
    $('kind').innerHTML = m.kinds.map((k) => `<option value="${k.id}">${esc(k.label)}</option>`).join('');
    $('flag').innerHTML = '<option value="">No — behaves as expected</option>' + m.bugOptions.map((b) => `<option value="${b.id}">${esc(b.label)}</option>`).join('');
    renderFields();
  }
  const n = me.probes.length, req = m.requiredProbes;
  $('bar').style.width = Math.min(100, (n / req) * 100) + '%';
  $('progressText').textContent = `${n} locked · ${req} required · max ${m.maxProbes}`;
  $('submitBtn').disabled = n < req;
  $('probeList').innerHTML = me.probes.map((p) => `<li><div><span class="pill">${p.kind}</span> ${p.flag ? '<span class="pill flag">bug flagged</span>' : ''}<br><code>${esc(JSON.stringify(p.input))}</code><br><code>${esc(p.expected.split('\n')[0])}</code></div><button type="button" data-del="${p.id}" aria-label="Delete probe">✕</button></li>`).join('') || '<li class="muted">No probes yet.</li>';
}
function renderResult() {
  show('resultView', true);
  const r = S.me.result;
  if (r) {
    $('vitals').textContent = `${r.killed} / ${r.of} broken copies caught`;
    $('resultText').textContent = `Suspected bugs logged correctly: ${r.bugsFound} / ${r.bugsOf} (${r.falseFlags} wrong flag${r.falseFlags === 1 ? '' : 's'}). ${r.objectiveMet ? 'Objective met: your net caught at least 70% of the broken copies.' : 'Objective not met (70% of broken copies).'} Saved by game.`;
    $('killedList').innerHTML = r.killedNames.map((k) => `<li>${esc(k)}</li>`).join('');
  } else {
    $('vitals').textContent = 'No monitor run';
    $('resultText').textContent = 'The match ended before you ran the heart monitor, so there is no completion credit.';
  }
  if (S.leaderboard) {
    show('boardWrap', true);
    $('board').innerHTML = S.leaderboard.map((p) => `<tr><td>${p.rank ?? '–'}</td><td>${esc(p.name)}</td><td>${p.team ?? ''}</td><td>${p.completed ? `${p.score}/${p.maxScore}` : 'not finished'}</td></tr>`).join('');
  }
}
function renderFields() {
  const k = S.match.kinds.find((x) => x.id === $('kind').value);
  $('fields').innerHTML = k.fields.map((f) => {
    const d = FIELD[f];
    if (d.bool) return `<div><label for="f_${f}">${d.label}</label><select id="f_${f}"><option value="false">no</option><option value="true">yes</option></select></div>`;
    return `<div><label for="f_${f}">${d.label}</label><input id="f_${f}" ${d.num ? 'inputmode="decimal"' : ''} placeholder="${d.placeholder || ''}" maxlength="40"></div>`;
  }).join('');
}
function probeInput() {
  const k = S.match.kinds.find((x) => x.id === $('kind').value);
  const input = {};
  for (const f of k.fields) { const v = $('f_' + f).value; input[f] = FIELD[f].num ? (v.trim() === '' ? '' : Number(v)) : v; }
  return { kind: k.id, input };
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function refresh() {
  try { S = await api('api/state'); render(); } catch (e) { $('banner').textContent = e.message; }
}

$('joinBtn').onclick = async () => { $('joinErr').textContent = ''; try { await api('api/join', { nickname: $('nick').value, team: Number($('team').value) }); await refresh(); } catch (e) { $('joinErr').textContent = e.message; } };
$('renameBtn').onclick = async () => { try { await api('api/nickname', { nickname: $('rename').value }); await refresh(); } catch (e) { $('banner').textContent = e.message; } };
$('kind').onchange = renderFields;
$('runBtn').onclick = async () => { $('playErr').textContent = ''; try { const r = await api('api/probe/run', probeInput()); $('obs').textContent = r.observed; } catch (e) { $('playErr').textContent = e.message; } };
$('lockBtn').onclick = async () => { $('playErr').textContent = ''; try { const r = await api('api/probe/lock', { ...probeInput(), flag: $('flag').value || null }); $('obs').textContent = r.observed + (r.duplicate ? '\n(already locked)' : '\n✓ locked in'); $('flag').value = ''; await refresh(); } catch (e) { $('playErr').textContent = e.message; } };
$('probeList').onclick = async (ev) => { const id = ev.target.dataset && ev.target.dataset.del; if (!id) return; try { await api('api/probe/delete', { id }); await refresh(); } catch (e) { $('playErr').textContent = e.message; } };
$('submitBtn').onclick = async () => { try { await api('api/submit', {}); await refresh(); } catch (e) { $('playErr').textContent = e.message; } };

function goReturn(url) {
  if (url) { window.location.assign(url); return; }
  $('banner').textContent = 'No portal return address is configured. Your result is saved by the game; you can close this tab.';
  ['joinView', 'waitView', 'playView'].forEach((v) => show(v, false));
}
$('exitBtn').onclick = async () => {
  const me = S && S.me;
  if (!me || me.status === 'left' || me.completed || S.match.status === 'ended') {
    if (me && me.status !== 'left') { try { await api('api/leave', {}); } catch (e) { /* completion already saved server-side */ } }
    goReturn(S && S.returnUrl);
    return;
  }
  $('leaveErr').textContent = ''; show('leaveAnyway', false);
  $('leaveDlg').showModal();
};
$('leaveCancel').onclick = () => $('leaveDlg').close();
$('leaveConfirm').onclick = async () => {
  $('leaveConfirm').disabled = true;
  try {
    const r = await api('api/leave', {});
    $('leaveDlg').close();
    goReturn(r.returnUrl);
    await refresh();
  } catch (e) {
    $('leaveErr').textContent = (e.status === 401 || e.status === 403 ? 'Your game session is no longer valid. ' : 'Could not save your departure. ') + 'Retry, or leave without the game confirming it.';
    $('leaveConfirm').textContent = 'Retry';
    show('leaveAnyway', true);
  } finally { $('leaveConfirm').disabled = false; }
};
$('leaveAnyway').onclick = () => { $('leaveDlg').close(); goReturn(S && S.returnUrl); };

refresh();
setInterval(refresh, 2500);
