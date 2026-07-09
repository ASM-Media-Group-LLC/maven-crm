const statusEl = document.getElementById("status");

async function refresh() {
  const { status } = await chrome.storage.local.get(["status"]);
  statusEl.textContent = status || "Sin correr todavía.";
}
document.getElementById("scan").addEventListener("click", () => {
  statusEl.textContent = "Iniciando…";
  chrome.runtime.sendMessage({ type: "scan-now" });
});
document.getElementById("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
chrome.storage.onChanged.addListener(refresh);
refresh();
