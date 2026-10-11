const btn = document.getElementById('menuBtn');
const drawer = document.getElementById('drawer');
btn.addEventListener('click', () => {
  const open = drawer.classList.toggle('show');
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open);
});
document.querySelectorAll('.drawer a').forEach(a => a.addEventListener('click', () => {
  drawer.classList.remove('show');
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}));
