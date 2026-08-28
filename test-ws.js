const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8787/api/session/TEST1/ws?role=host');

ws.on('open', () => {
  console.log('Connected!');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log('Closed:', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('Error:', err);
});
