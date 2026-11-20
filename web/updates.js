/* Browser-safe update flow; user code is persisted before an update is offered. */
(() => {
  if (!("serviceWorker" in navigator)) return;
  const banner = document.getElementById("update-banner");
  const apply = document.getElementById("update-apply");
  let registration;
  let currentBuild = null;
  let reloading = false;
  let updateAvailable = false;

  function showUpdate() {
    updateAvailable = true;
    banner.hidden = false;
  }
  function maybeActivate() {
    if (registration?.waiting) registration.waiting.postMessage({type: "SKIP_WAITING"});
  }
  function watchInstalling(sw) {
    if (!sw) return;
    sw.addEventListener("statechange", () => {
      if (sw.state === "installed" && navigator.serviceWorker.controller) showUpdate();
      if (sw.state === "installed" && updateAvailable) maybeActivate();
    });
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloading) {
      reloading = true;
      location.reload();
    }
  });
  apply.addEventListener("click", async () => {
    apply.disabled = true;
    try {
      await registration?.update();
      maybeActivate();
      if (!registration?.waiting) {
        // Wait for the installing worker instead of refreshing into stale assets.
        watchInstalling(registration?.installing);
      }
    } catch {
      apply.disabled = false;
    }
  });
  async function check() {
    try {
      const response = await fetch("./version.json?t=" + Date.now(), {cache: "no-store"});
      if (!response.ok) return;
      const data = await response.json();
      if (!currentBuild) { currentBuild = data.build; return; }
      if (currentBuild !== data.build) {
        showUpdate();
        await registration?.update();
      }
    } catch { /* offline: keep the working local PWA */ }
  }
  window.addEventListener("load", async () => {
    try {
      registration = await navigator.serviceWorker.register("./sw.js");
      registration.addEventListener("updatefound", () => watchInstalling(registration.installing));
      if (registration.waiting) showUpdate();
      await check();
      setInterval(check, 60000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) check();
      });
    } catch { /* graceful fallback on unsupported browser / Pages setup */ }
  });
})();
