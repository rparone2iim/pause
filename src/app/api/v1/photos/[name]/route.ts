import { photoController } from "@/lib/controllers/photo.controller";

export const GET = photoController.serve;
export const DELETE = photoController.remove;
