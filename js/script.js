(() => {
  "use strict";

  const btn = document.getElementById("menuBtn");
  const drawer = document.getElementById("drawer");

  // Evitar errores si los elementos no existen en la página.
  if (!btn || !drawer) return;

  // Estado inicial accesible.
  btn.setAttribute("aria-expanded", "false");

  function closeDrawer() {
    drawer.classList.remove("show");
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }

  function toggleDrawer() {
    const isOpen = drawer.classList.toggle("show");

    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
  }

  // Abrir o cerrar menú.
  btn.addEventListener("click", toggleDrawer);

  // Cerrar al seleccionar un enlace.
  drawer.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeDrawer);
  });

  // Cerrar con Escape.
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && drawer.classList.contains("show")) {
      closeDrawer();
    }
  });

})();
