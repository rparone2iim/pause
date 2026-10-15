import { spotController } from "@/lib/controllers/spot.controller";

export const GET = spotController.get;
export const PATCH = spotController.update;
export const DELETE = spotController.remove;
