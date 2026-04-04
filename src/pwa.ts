const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const isProductionHost =
  !isPreviewHost && !isInIframe && window.location.hostname !== "localhost";

if (isProductionHost) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        const banner = document.createElement("div");
        banner.id = "pwa-update-banner";
        banner.style.cssText =
          "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;" +
          "background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:8px;" +
          "display:flex;align-items:center;gap:12px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.4)";
        banner.innerHTML =
          '<span>Nueva versión disponible</span>' +
          '<button id="pwa-reload-btn" style="background:#6366f1;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px">Recargar</button>';
        document.body.appendChild(banner);
        document.getElementById("pwa-reload-btn")?.addEventListener("click", () => {
          window.location.reload();
        });
      },
      onOfflineReady() {},
    });
  });
}
