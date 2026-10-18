'use strict';
const $ = (id) => document.getElementById(id);
let KEY = null; // base64url host key, kept in memory only, never stored
const b64 = (k) => btoa(String.fromCharCode(...new TextEncoder().encode(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-host-key-b64': KEY, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
let filled = false;
async function refresh() {
  const s = await api('api/host/state');
  $('keyView').classList.add('hidden'); $('console').classList.remove('hidden');
  const m = s.match;
  $('status').innerHTML = `Status: <strong>${m.status}</strong>${m.outcome ? ` (${m.outcome})` : ''} · ${esc(m.difficultyLabel)} · ${m.playerCount} player(s)${m.finalized ? ' · report saved' : ''}`;
  if (!filled) { $('diff').innerHTML = s.difficulties.map((d) => `<option value="${d.id}">${esc(d.label)}</option>`).join(''); filled = true; }
  if (document.activeElement !== $('diff')) $('diff').value = m.difficulty;
  if (document.activeElement !== $('teams')) $('teams').value = m.teamCount;
  const lobby = m.status === 'lobby';
  $('diff').disabled = $('teams').disabled = $('saveBtn').disabled = $('startBtn').disabled = !lobby;
  $('endBtn').disabled = m.status !== 'running';
  $('newBtn').disabled = $('dlBtn').disabled = !m.finalized;
  $('levels').innerHTML = s.difficulties.map((d) => `<tr><td>${esc(d.label)}</td><td>${d.mutants}</td><td>${d.bugs}</td><td>${d.requiredProbes}</td></tr>`).join('');
  $('roster').innerHTML = s.roster.map((p) => `<tr><td>${esc(p.nickname)}</td><td>${p.team}</td><td>${p.linked ? 'linked' : 'guest'}</td><td>${p.status}</td><td>${p.probes}</td><td>${p.killed ?? '–'}</td><td>${p.bugs ?? '–'}</td><td>${p.completed ? 'yes' : 'no'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nobody has joined yet.</td></tr>';
}
const act = (fn) => async () => { $('hostErr').textContent = ''; try { await fn(); await refresh(); } catch (e) { $('hostErr').textContent = e.message; } };
$('keyBtn').onclick = async () => { KEY = b64($('key').value); try { await refresh(); setInterval(() => refresh().catch(() => {}), 2500); } catch (e) { $('keyErr').textContent = e.message; } };
$('saveBtn').onclick = act(() => api('api/host/configure', { difficulty: $('diff').value, teamCount: Number($('teams').value) }));
$('startBtn').onclick = act(() => api('api/host/start', {}));
$('endBtn').onclick = act(async () => { if (confirm('End the session for everyone and write the final report?')) await api('api/host/end', {}); });
$('newBtn').onclick = act(() => api('api/host/new-match', {}));
$('dlBtn').onclick = act(async () => {
  const r = await fetch('api/host/report', { headers: { 'x-host-key-b64': KEY } });
  if (!r.ok) throw new Error('Report not available.');
  const blob = await r.blob(); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'code-er-report.json'; a.click(); URL.revokeObjectURL(a.href);
});
