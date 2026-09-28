const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el;
};

function setStatus(message) {
  $("status").textContent = message;
}

function now() {
  return new Date().toLocaleString();
}

function boot() {
  setStatus(`Ready. (${now()})`);

  $("btnPing").addEventListener("click", () => {
    setStatus(`Pong! (${now()})`);
  });
}

boot();
