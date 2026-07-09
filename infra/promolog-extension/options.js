const urlEl = document.getElementById("url");
const tokenEl = document.getElementById("token");
const msgEl = document.getElementById("msg");

(async () => {
  const { mavenUrl, extToken } = await chrome.storage.sync.get(["mavenUrl", "extToken"]);
  urlEl.value = mavenUrl || "https://lsagslbkliprespbyhts.supabase.co";
  tokenEl.value = extToken || "";
})();

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    mavenUrl: urlEl.value.trim().replace(/\/+$/, ""),
    extToken: tokenEl.value.trim(),
  });
  msgEl.textContent = "Guardado ✓";
  setTimeout(() => (msgEl.textContent = ""), 2500);
});
