const btn = document.getElementById('menuBtn');
const drawer = document.getElementById('drawer');

if (btn && drawer) {
  const closeDrawer = () => {
    drawer.classList.remove('show');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('show');

    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  drawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });
}
