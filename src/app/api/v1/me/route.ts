import { meController } from "@/lib/controllers/me.controller";

export const GET = meController.get;
export const PATCH = meController.update;
export const DELETE = meController.remove;
