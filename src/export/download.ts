export function downloadFile(
  bytes: Uint8Array,
  name: string,
  type: string,
): void {
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
