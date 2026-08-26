const endpoint = 'http://127.0.0.1:9225';
const targetUrl = 'http://127.0.0.1:8765/tools/artifacts/sw-browser-smoke.html';
const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(targetUrl)}`, { method:'PUT' }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
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
await send('Runtime.enable');
const deadline = Date.now() + 30000;
let text = 'RUNNING';
while (Date.now() < deadline && text === 'RUNNING') {
  const result = await send('Runtime.evaluate', {
    expression:"document.getElementById('result') && document.getElementById('result').textContent",
    returnByValue:true
  });
  text = result.result && result.result.value || 'RUNNING';
  if (text === 'RUNNING') await new Promise(resolve => setTimeout(resolve, 250));
}
console.log(text);
socket.close();
if (!text.startsWith('PASS ')) process.exitCode = 1;
