import "server-only";
import { healthRepository } from "../repositories/health.repository";

type Status = "healthy" | "unhealthy";

export const healthService = {
  /** Liveness + database check. Says only "healthy" or not: no dependency names, hosts or versions. */
  async check() {
    let status: Status = "healthy";
    try {
      await healthRepository.ping();
    } catch {
      status = "unhealthy";
    }
    return { status, checkedAt: new Date().toISOString() };
  },
};
