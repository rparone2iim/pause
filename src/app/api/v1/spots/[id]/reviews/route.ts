import { reviewController } from "@/lib/controllers/review.controller";

export const GET = reviewController.list;
export const PUT = reviewController.upsert;
