import { notFound } from "next/navigation";
import { SwaggerDocs } from "./SwaggerDocs";

export const metadata = { title: "API (Swagger)" };

/**
 * Interactive API documentation (Swagger UI) built from openapi.yaml.
 * Development only, like Swagger disabled in production in the course: in production this page is a 404,
 * so the site never hands out a map of its API.
 */
export default function DocsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SwaggerDocs />;
}
