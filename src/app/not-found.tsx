import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page empty">
      <h2>Page introuvable</h2>
      <p style={{ marginTop: 12 }}><Link href="/">← Retour à la carte</Link></p>
    </main>
  );
}
