const example = {
  domain: 'app.example.com', https: true, listen: 443, redirectHttp: true,
  certificate: '/etc/letsencrypt/live/app.example.com/fullchain.pem',
  certificateKey: '/etc/letsencrypt/live/app.example.com/privkey.pem',
  hideVersion: true, gzip: true, clientMaxBodySizeMb: 20,
  upstreams: [{name:'api', strategy:'least_conn', servers:[{address:'10.0.0.10:5000'},{address:'10.0.0.11:5000'}]}],
  routes: [{path:'/api/', type:'proxy', target:'api', rateLimit:{rate:10, burst:20}, websocket:true}, {path:'/', type:'static', root:'/srv/app', spa:true}]
};
const input = document.querySelector('#model-input');
const output = document.querySelector('#output code');
const diagnosticsList = document.querySelector('#diagnostics-list');
const status = document.querySelector('#status');
let lastConfig = '';

function pretty(value) { return JSON.stringify(value, null, 2); }
function setStatus(label, tone='ready') { status.className = 'status ' + tone; status.innerHTML = '<i></i> ' + label; }
function toast(message) { const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2200); }
function updateMetrics(model) {
  document.querySelector('#target').textContent = model.domain || '—';
  document.querySelector('#protocol').textContent = model.https ? 'HTTPS' : 'HTTP';
  document.querySelector('#route-count').textContent = model.routes?.length ?? 0;
  document.querySelector('#upstream-count').textContent = model.upstreams?.length ?? 0;
}
function renderDiagnostics(items) {
  const warnings = items.filter(item => item.severity === 'warning');
  document.querySelector('#diagnostic-count').textContent = warnings.length ? `${warnings.length} advisory${warnings.length === 1 ? '' : 'ies'}` : 'No advisories';
  diagnosticsList.innerHTML = warnings.length ? warnings.map(item => `<div class="diagnostic"><span class="diagnostic-icon">!</span><div><strong>${item.code}</strong><p>${item.message}</p><small>${item.path}</small></div></div>`).join('') : '<div class="empty"><span>✓</span><p>Everything looks clear.</p></div>';
}
function renderError(message) {
  output.textContent = 'Unable to generate configuration.';
  renderDiagnostics([]);
  diagnosticsList.innerHTML = `<div class="diagnostic error"><span class="diagnostic-icon">×</span><div><strong>MODEL_ERROR</strong><p>${message}</p><small>Check the JSON model above</small></div></div>`;
  document.querySelector('#diagnostic-count').textContent = 'Needs attention';
  document.querySelector('#model-message').textContent = message;
  setStatus('Needs attention', 'error');
}
async function generate() {
  let model;
  try { model = JSON.parse(input.value); } catch (error) { renderError('Invalid JSON: ' + error.message); return; }
  try {
    setStatus('Generating…', 'working');
    const response = await fetch('/api/generate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(model)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Generation failed');
    lastConfig = result.config;
    output.textContent = result.config;
    document.querySelector('#output-size').textContent = `${result.config.split('\n').length - 1} lines`;
    document.querySelector('#model-message').textContent = 'Model generated successfully';
    updateMetrics(model); renderDiagnostics(result.diagnostics); setStatus('Generated', 'success');
  } catch (error) { renderError(error.message); }
}
input.value = pretty(example);
document.querySelector('#generate').addEventListener('click', generate);
document.querySelector('#reset').addEventListener('click', () => { input.value = pretty(example); generate(); });
document.querySelector('#copy').addEventListener('click', async () => { if (!lastConfig) return toast('Generate a config first'); await navigator.clipboard.writeText(lastConfig); toast('Configuration copied'); });
document.querySelector('#download').addEventListener('click', () => { if (!lastConfig) return toast('Generate a config first'); const blob = new Blob([lastConfig], {type:'text/plain'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'nginx.conf'; link.click(); URL.revokeObjectURL(link.href); toast('nginx.conf downloaded'); });
input.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') generate(); });
generate();
