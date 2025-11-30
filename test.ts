import WebSocket from "@tauri-apps/plugin-websocket";

const ws = await WebSocket.connect("ws://127.0.0.1:8080");

ws.addListener((msg) => {
  console.log("Received Message:", msg);
});

await ws.send("Hello World!");

await ws.disconnect();
