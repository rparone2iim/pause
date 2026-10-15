import { healthController } from "@/lib/controllers/health.controller";

const { notFound } = healthController;

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
