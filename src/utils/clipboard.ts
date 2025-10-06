export async function copyToClipboard(value: string) {
  if (!navigator?.clipboard) {
    throw new Error('Clipboard API not available');
  }
  await navigator.clipboard.writeText(value);
}
