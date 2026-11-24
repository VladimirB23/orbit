/** Hands an address to another program, the same way a click on a link does. */
export function openExternal(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.click();
}
