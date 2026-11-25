// Preferência de aparência deste navegador. Não contém dados financeiros.
(function () {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  const label = button.querySelector(".theme-label");
  const meta = document.querySelector('meta[name="theme-color"]');
  function apply(theme) {
    const light = theme === "light";
    root.dataset.theme = light ? "light" : "dark";
    button.setAttribute("aria-label", light ? "Ativar modo escuro" : "Ativar modo claro");
    label.textContent = light ? "Escuro" : "Claro";
    meta.setAttribute("content", light ? "#EDECE4" : "#0B2118");
  }
  let saved = null;
  try { saved = localStorage.getItem("carteira-theme"); } catch (_) {}
  apply(saved === "light" ? "light" : "dark");
  button.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    apply(next);
    try { localStorage.setItem("carteira-theme", next); } catch (_) {}
  });
})();
