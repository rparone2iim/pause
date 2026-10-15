/** Applies the stored theme before first paint to avoid a light flash in dark mode. */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const code = `try{var t=localStorage.getItem('pause-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;
  // Browsers hide a script's nonce from the DOM once loaded (nonce=""): not a real mismatch.
  return <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: code }} />;
}
