/** Erreur "propre" qu'on a le droit de montrer au client (message contrôlé, pas de détail technique). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}
