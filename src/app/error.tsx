"use client";
// Pilier 6 : page d'erreur générique. Aucun détail technique n'est affiché à l'utilisateur.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page empty">
      <h2>Oups, quelque chose s&apos;est mal passé.</h2>
      <p className="muted" style={{ margin: "8px 0 16px" }}>Réessaie dans un instant.</p>
      <button className="btn" onClick={reset}>Réessayer</button>
    </main>
  );
}
