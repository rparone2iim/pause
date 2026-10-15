-- Retour arrière de 0003 : recrée la table des jetons révoqués (vide : les sessions ont pris le relais).
CREATE TABLE "revoked_tokens" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
