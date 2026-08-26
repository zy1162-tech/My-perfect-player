const endpoint = 'http://127.0.0.1:9225';
const page = (await fetch(`${endpoint}/json/list`).then(r => r.json())).find(item => item.type === 'page' && item.webSocketDebuggerUrl);
if (!page) throw new Error('No Chrome page target');
const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once:true });
  socket.addEventListener('error', reject, { once:true });
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
await send('Network.enable');
await send('Page.enable');
await send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
await send('Page.navigate', { url:'http://127.0.0.1:8765/nba-perfect-player.html?offline-smoke=1' });
const deadline = Date.now() + 15000;
let state = null;
while (Date.now() < deadline) {
  const result = await send('Runtime.evaluate', {
    expression:"({ready:document.readyState,title:document.title,nav:!!document.querySelector('.mode-local-nav'),era:typeof showLegendEraPicker==='function',text:(document.body&&document.body.innerText||'').slice(0,300)})",
    returnByValue:true
  });
  state = result.result && result.result.value;
  if (state && state.ready === 'complete' && state.nav && state.era) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
console.log(JSON.stringify(state));
socket.close();
if (!state || state.ready !== 'complete' || !state.nav || !state.era) process.exitCode = 1;
