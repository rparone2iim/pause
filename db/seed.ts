// Données de démo (autour de Paris La Défense). Lancer : npm run db:seed
// Comptes de démo : demo@pause.dev / DemoPause2026  et  alex@pause.dev / DemoPause2026
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { users, spots, reviews } from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const existing = await db.select().from(users).where(eq(users.email, "demo@pause.dev"));
if (existing.length) {
  console.log("Seed déjà présent, rien à faire.");
  await pool.end();
  process.exit(0);
}

const hash = await bcrypt.hash("DemoPause2026", 12);
const [demo, alex] = await db.insert(users).values([
  { email: "demo@pause.dev", displayName: "Démo", passwordHash: hash, preferredTypes: [], radiusM: 800 },
  { email: "alex@pause.dev", displayName: "Alex", passwordHash: hash, preferredTypes: ["CAFE"], radiusM: 500 },
]).returning();

const data = [
  { name: "Marches de la Grande Arche (côté soleil)", type: "BENCH", lat: 48.89245, lng: 2.23655, tags: ["SUN", "SEATING"],
    description: "Les grandes marches en granit au pied de l'Arche. Plein soleil en fin de matinée, beaucoup de place pour s'asseoir, vue sur toute l'esplanade.",
    accessTip: "Monte les premières marches côté gauche, c'est plus calme que le centre." },
  { name: "Coin fumeur abrité sous la passerelle", type: "SMOKING", lat: 48.89135, lng: 2.23845, tags: ["ASHTRAY", "SHELTERED"],
    description: "Petit renfoncement sous la passerelle piétonne, cendrier mural, protégé de la pluie et du vent. Pratique entre deux réunions.",
    accessTip: "Descends l'escalier à droite de l'entrée du centre commercial, le cendrier est contre le pilier." },
  { name: "Kiosque café de l'esplanade", type: "CAFE", lat: 48.89055, lng: 2.24015, tags: ["TAKEAWAY", "SEATING"],
    description: "Kiosque à emporter avec quelques tables hautes. Service rapide même à midi, bon espresso.",
    accessTip: "Au milieu de l'esplanade, entre les deux bassins." },
  { name: "Banc sous les arbres — Jardin de l'Arche", type: "BENCH", lat: 48.89335, lng: 2.23215, tags: ["SHADE", "QUIET", "SEATING"],
    description: "Bancs à l'ombre des arbres, loin du passage. L'endroit le plus calme du quartier pour une vraie coupure sans écran.",
    accessTip: "Passe derrière l'Arche et descends vers le jardin, les bancs sont sur la gauche." },
  { name: "Rebord du bassin (fontaine)", type: "BENCH", lat: 48.88975, lng: 2.24195, tags: ["SUN", "SEATING"],
    description: "Rebord en pierre autour de la fontaine, le bruit de l'eau couvre celui de la foule. Très agréable l'après-midi.",
    accessTip: null },
  { name: "Auvent devant le CNIT", type: "SHELTER", lat: 48.89225, lng: 2.23925, tags: ["SHELTERED", "ASHTRAY"],
    description: "Grand auvent devant l'entrée : parfait quand il pleut. Cendriers sur pied, un peu de passage aux heures de pointe.",
    accessTip: "Reste sur la partie droite de l'auvent, c'est là qu'il y a les cendriers." },
  { name: "Comptoir café rapide (rue piétonne)", type: "CAFE", lat: 48.89385, lng: 2.23735, tags: ["TAKEAWAY", "QUIET"],
    description: "Petit comptoir, peu connu donc presque jamais de queue. Café filtre correct, quelques tabourets.",
    accessTip: null },
  // --- Autour de l'école (Pôle Léonard de Vinci / Nanterre-Préfecture) ---
  { name: "Banc sous les arbres", type: "BENCH", lat: 48.8925, lng: 2.2259, tags: ["SHADE", "QUIET", "SEATING"],
    description: "Trois bancs à l'ombre et un muret en pierre, rarement pris avant midi.",
    accessTip: "Longe l'allée piétonne vers l'ouest, après la fontaine." },
  { name: "Abri de la passerelle", type: "SHELTER", lat: 48.8945, lng: 2.2292, tags: ["SHELTERED", "ASHTRAY"],
    description: "Couvert et à l'abri du vent, parfait quand il pleut. Un cendrier à l'entrée.",
    accessTip: "Sous la passerelle, côté escalier mécanique." },
  { name: "Café du coin", type: "CAFE", lat: 48.8919, lng: 2.2286, tags: ["TAKEAWAY", "SEATING"],
    description: "Espresso correct, à emporter en 2 minutes. Petite terrasse.",
    accessTip: "Rez-de-chaussée de la tour, entrée côté esplanade." },
  { name: "Pelouse calme", type: "BENCH", lat: 48.8951, lng: 2.2252, tags: ["SHADE", "QUIET"],
    description: "Un carré d'herbe sous les arbres, au calme, idéal pour 10 minutes de pause.",
    accessTip: "Derrière le gymnase, suis le chemin de graviers." },
  { name: "Marches au soleil", type: "BENCH", lat: 48.8929, lng: 2.2301, tags: ["SUN", "SEATING"],
    description: "Larges marches exposées plein sud, fumeurs tolérés.",
    accessTip: "En haut de l'esplanade, face aux tours." },
  { name: "Terrasse couverte", type: "SMOKING", lat: 48.8913, lng: 2.2265, tags: ["ASHTRAY", "SHELTERED", "SEATING"],
    description: "Zone fumeurs couverte avec quelques tabourets.",
    accessTip: "Au pied de la résidence étudiante, côté parking vélos." },
  { name: "Coin fumeur du parvis", type: "SMOKING", lat: 48.8937, lng: 2.2278, tags: ["ASHTRAY", "SEATING"],
    description: "Cendriers fixés au muret, un peu à l'écart du flux.",
    accessTip: null },
  { name: "Alvaro (Café Restaurant)", type: "CAFE", lat: 48.895949, lng: 2.2227969, tags: ["SHELTERED", "SEATING"],
    description: "Café-restaurant de quartier, salle couverte. Bon plan pour un café assis au chaud.",
    accessTip: null },
  { name: "Corcoran's", type: "CAFE", lat: 48.8942699, lng: 2.2270188, tags: ["SHELTERED", "SEATING"],
    description: "Pub irlandais avec salle couverte : café ou boisson fraîche, au calme en dehors du soir.",
    accessTip: null },
] as const;

const created = await db.insert(spots).values(
  data.map((s, i) => ({ ...s, tags: [...s.tags], accessTip: s.accessTip ?? null, authorId: i % 2 ? alex.id : demo.id })),
).returning({ id: spots.id });

await db.insert(reviews).values([
  { spotId: created[0].id, authorId: alex.id, rating: 5, calm: 4, clean: 4, seating: 5, comment: "Super au soleil vers 11h." },
  { spotId: created[1].id, authorId: demo.id, rating: 4, calm: 3, clean: 4, seating: 1, comment: "Cendrier propre, bien abrité." },
  { spotId: created[2].id, authorId: demo.id, rating: 4, calm: 2, clean: 4, seating: 3, comment: null },
  { spotId: created[3].id, authorId: alex.id, rating: 5, calm: 5, clean: 4, seating: 4, comment: "Le meilleur coin pour décrocher 10 min." },
  { spotId: created[5].id, authorId: demo.id, rating: 3, calm: 2, clean: 3, seating: 1, comment: "Pratique sous la pluie, mais du passage." },
  { spotId: created[7].id, authorId: alex.id, rating: 5, calm: 5, clean: 4, seating: 4, comment: "Toujours une place libre le matin." },
  { spotId: created[8].id, authorId: demo.id, rating: 4, calm: 3, clean: 4, seating: 2, comment: "Sauve la mise quand il pleut." },
  { spotId: created[9].id, authorId: demo.id, rating: 4, calm: 2, clean: 4, seating: 3, comment: null },
  { spotId: created[13].id, authorId: alex.id, rating: 4, calm: 3, clean: 3, seating: 4, comment: "Propre, un peu à l'écart." },
  { spotId: created[14].id, authorId: alex.id, rating: 4, calm: 4, clean: 4, seating: 5, comment: null },
]);

console.log(`✔ Seed : 2 comptes, ${created.length} spots, 10 avis`);
await pool.end();
