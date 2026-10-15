/**
 * Demo data: 2 accounts and 14 community spots — 7 around the school (IIM, Nanterre-Préfecture side)
 * and 7 on the esplanade of La Défense — with a few reviews.
 * Safe to run twice: nothing happens if the demo account already exists.
 *
 *   npm run db:seed
 *
 * Accounts: demo@pause.dev and alex@pause.dev — password DemoPause2026
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { favorites, reviews, spots, users } from "../src/db/schema";

const PASSWORD = "DemoPause2026";

// Locally the URL comes from .env; in Docker it comes from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

type Seed = Omit<typeof spots.$inferInsert, "authorId"> & { by: "demo" | "alex" };

const SPOTS: Seed[] = [
  {
    by: "demo",
    name: "Coin fumeur du parvis",
    type: "smoking",
    lat: 48.8937,
    lng: 2.2278,
    description: "Cendriers fixés au muret, un peu à l'écart du flux.",
    accessTip: "Sortie principale de l'école, à droite, derrière les bacs à plantes.",
    tags: [
      { icon: "smoking_rooms", label: "Cendrier" },
      { icon: "chair", label: "Places assises" },
    ],
    filters: ["smoke"],
    quiet: 2,
  },
  {
    by: "demo",
    name: "Banc sous les arbres",
    type: "bench",
    lat: 48.8925,
    lng: 2.2259,
    description: "Trois bancs à l'ombre, rarement pris avant midi.",
    accessTip: "Longer l'allée piétonne vers l'ouest, après la fontaine.",
    tags: [
      { icon: "wb_shade", label: "À l'ombre" },
      { icon: "texture", label: "Muret en pierre" },
    ],
    filters: ["quiet", "shade"],
    quiet: 4,
  },
  {
    by: "alex",
    name: "Abri de la passerelle",
    type: "shelter",
    lat: 48.8945,
    lng: 2.2292,
    description: "Couvert, parfait quand il pleut. Un cendrier à l'entrée.",
    accessTip: "Sous la passerelle, côté escalier mécanique.",
    tags: [
      { icon: "umbrella", label: "Couvert" },
      { icon: "air", label: "À l'abri du vent" },
      { icon: "smoking_rooms", label: "Cendrier" },
    ],
    filters: ["shelter", "smoke"],
    quiet: 3,
  },
  {
    by: "alex",
    name: "Café du coin",
    type: "cafe",
    lat: 48.8919,
    lng: 2.2286,
    description: "Espresso correct, à emporter en 2 minutes.",
    accessTip: "Rez-de-chaussée de la tour, entrée côté esplanade.",
    tags: [
      { icon: "local_cafe", label: "Bon café" },
      { icon: "takeout_dining", label: "À emporter" },
      { icon: "deck", label: "Terrasse" },
    ],
    filters: ["coffee", "shelter"],
    quiet: 3,
  },
  {
    by: "demo",
    name: "Pelouse calme",
    type: "park",
    lat: 48.8951,
    lng: 2.2252,
    description: "Un carré d'herbe au calme, idéal pour 10 minutes de pause.",
    accessTip: "Derrière le gymnase, suivre le chemin de graviers.",
    tags: [
      { icon: "park", label: "Arbres / ombre" },
      { icon: "volume_off", label: "Calme" },
    ],
    filters: ["quiet", "shade"],
    quiet: 5,
  },
  {
    by: "alex",
    name: "Marches au soleil",
    type: "bench",
    lat: 48.8929,
    lng: 2.2301,
    description: "Larges marches exposées plein sud.",
    accessTip: "En haut de l'esplanade, face aux tours.",
    tags: [
      { icon: "wb_sunny", label: "Au soleil" },
      { icon: "smoking_rooms", label: "Fumeurs OK" },
    ],
    filters: ["smoke"],
    quiet: 3,
  },
  {
    by: "demo",
    name: "Terrasse couverte",
    type: "smoking",
    lat: 48.8913,
    lng: 2.2265,
    description: "Zone fumeurs couverte avec quelques tabourets.",
    accessTip: "Au pied de la résidence étudiante, côté parking vélos.",
    tags: [
      { icon: "smoking_rooms", label: "Cendrier" },
      { icon: "umbrella", label: "Couvert" },
      { icon: "chair", label: "Places assises" },
    ],
    filters: ["smoke", "shelter"],
    quiet: 2,
  },
  // --- Esplanade de La Défense ---
  {
    by: "demo",
    name: "Marches de la Grande Arche (côté soleil)",
    type: "bench",
    lat: 48.89245,
    lng: 2.23655,
    description: "Les grandes marches en granit au pied de l'Arche. Plein soleil en fin de matinée, beaucoup de place pour s'asseoir, vue sur toute l'esplanade.",
    accessTip: "Monte les premières marches côté gauche, c'est plus calme que le centre.",
    tags: [
      { icon: "wb_sunny", label: "Au soleil" },
      { icon: "chair", label: "Places assises" },
    ],
    filters: [],
    quiet: 3,
  },
  {
    by: "alex",
    name: "Coin fumeur abrité sous la passerelle",
    type: "smoking",
    lat: 48.89135,
    lng: 2.23845,
    description: "Petit renfoncement sous la passerelle piétonne, cendrier mural, protégé de la pluie et du vent. Pratique entre deux réunions.",
    accessTip: "Descends l'escalier à droite de l'entrée du centre commercial, le cendrier est contre le pilier.",
    tags: [
      { icon: "smoking_rooms", label: "Cendrier" },
      { icon: "umbrella", label: "Couvert" },
      { icon: "air", label: "À l'abri du vent" },
    ],
    filters: ["smoke", "shelter"],
    quiet: 2,
  },
  {
    by: "demo",
    name: "Kiosque café de l'esplanade",
    type: "cafe",
    lat: 48.89055,
    lng: 2.24015,
    description: "Kiosque à emporter avec quelques tables hautes. Service rapide même à midi, bon espresso.",
    accessTip: "Au milieu de l'esplanade, entre les deux bassins.",
    tags: [
      { icon: "takeout_dining", label: "À emporter" },
      { icon: "chair", label: "Places assises" },
    ],
    filters: ["coffee"],
    quiet: 2,
  },
  {
    by: "alex",
    name: "Banc sous les arbres — Jardin de l'Arche",
    type: "park",
    lat: 48.89335,
    lng: 2.23215,
    description: "Bancs à l'ombre des arbres, loin du passage. L'endroit le plus calme du quartier pour une vraie coupure sans écran.",
    accessTip: "Passe derrière l'Arche et descends vers le jardin, les bancs sont sur la gauche.",
    tags: [
      { icon: "wb_shade", label: "À l'ombre" },
      { icon: "volume_off", label: "Calme" },
      { icon: "chair", label: "Banc" },
    ],
    filters: ["quiet", "shade"],
    quiet: 5,
  },
  {
    by: "demo",
    name: "Rebord du bassin (fontaine)",
    type: "bench",
    lat: 48.88975,
    lng: 2.24195,
    description: "Rebord en pierre autour de la fontaine, le bruit de l'eau couvre celui de la foule. Très agréable l'après-midi.",
    tags: [
      { icon: "wb_sunny", label: "Au soleil" },
      { icon: "texture", label: "Muret en pierre" },
    ],
    filters: [],
    quiet: 3,
  },
  {
    by: "alex",
    name: "Auvent devant le CNIT",
    type: "shelter",
    lat: 48.89225,
    lng: 2.23925,
    description: "Grand auvent devant l'entrée : parfait quand il pleut. Cendriers sur pied, un peu de passage aux heures de pointe.",
    accessTip: "Reste sur la partie droite de l'auvent, c'est là qu'il y a les cendriers.",
    tags: [
      { icon: "umbrella", label: "Couvert" },
      { icon: "smoking_rooms", label: "Cendrier" },
    ],
    filters: ["shelter", "smoke"],
    quiet: 2,
  },
  {
    by: "demo",
    name: "Comptoir café rapide (rue piétonne)",
    type: "cafe",
    lat: 48.89385,
    lng: 2.23735,
    description: "Petit comptoir, peu connu donc presque jamais de queue. Café filtre correct, quelques tabourets.",
    tags: [
      { icon: "local_cafe", label: "Bon café" },
      { icon: "volume_off", label: "Calme" },
    ],
    filters: ["coffee", "quiet"],
    quiet: 4,
  },
];

async function main() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, "demo@pause.dev"));
  if (existing) {
    console.log("Demo data already present, nothing to do.");
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [demo, alex] = await db
    .insert(users)
    .values([
      { email: "demo@pause.dev", displayName: "Demo", passwordHash, preferredTypes: ["smoke", "coffee"], radiusM: 800 },
      { email: "alex@pause.dev", displayName: "Alex", passwordHash, preferredTypes: ["quiet", "shade"], radiusM: 1000 },
    ])
    .returning();
  const author = { demo: demo.id, alex: alex.id };

  const created = await db
    .insert(spots)
    .values(SPOTS.map(({ by, ...s }) => ({ ...s, authorId: author[by] })))
    .returning();

  await db.insert(reviews).values([
    { spotId: created[0].id, authorId: alex.id, rating: 4, calm: 2, clean: 3, seating: 4, comment: "Pratique entre deux cours." },
    { spotId: created[1].id, authorId: alex.id, rating: 5, calm: 5, clean: 4, seating: 5, comment: "Mon spot préféré quand il fait chaud." },
    { spotId: created[2].id, authorId: demo.id, rating: 4, calm: 3, clean: 3, seating: 2, comment: "Sauvé par cet abri un jour de pluie." },
    { spotId: created[3].id, authorId: demo.id, rating: 3, calm: 2, clean: 4, seating: 3, comment: "" },
    { spotId: created[4].id, authorId: alex.id, rating: 5, calm: 5, clean: 4, seating: 3, comment: "Vraiment calme." },
    { spotId: created[7].id, authorId: alex.id, rating: 5, calm: 4, clean: 4, seating: 5, comment: "Super au soleil vers 11h." },
    { spotId: created[8].id, authorId: demo.id, rating: 4, calm: 3, clean: 4, seating: 1, comment: "Cendrier propre, bien abrité." },
    { spotId: created[9].id, authorId: alex.id, rating: 4, calm: 2, clean: 4, seating: 3, comment: "" },
    { spotId: created[10].id, authorId: demo.id, rating: 5, calm: 5, clean: 4, seating: 4, comment: "Le meilleur coin pour décrocher 10 min." },
    { spotId: created[12].id, authorId: demo.id, rating: 3, calm: 2, clean: 3, seating: 1, comment: "Pratique sous la pluie, mais du passage." },
  ]);
  await db.insert(favorites).values([
    { userId: demo.id, spotId: created[1].id },
    { userId: alex.id, spotId: created[0].id },
  ]);

  console.log(`Demo data created: 2 accounts (password ${PASSWORD}), ${created.length} spots.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
