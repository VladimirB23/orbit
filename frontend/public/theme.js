// Runs before the first paint so the page never flashes in the wrong theme.
// A separate file, not an inline script: the content security policy forbids inline code.
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem('orbit.theme');
  } catch {}
  const dark =
    saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
