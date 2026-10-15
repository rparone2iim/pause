import { spotController } from "@/lib/controllers/spot.controller";

export const GET = spotController.list;
export const POST = spotController.create;
