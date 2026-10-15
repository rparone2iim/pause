"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

// In a production build this branch is removed: Swagger UI (a dev dependency) is never shipped.
const SwaggerUI = process.env.NODE_ENV === "production" ? () => null : dynamic(() => import("swagger-ui-react"), { ssr: false });

/** "Authorize" → paste an access token (POST /api/v1/sessions) to try the private routes. */
export function SwaggerDocs() {
  return (
    <div className="bg-white min-h-svh">
      <SwaggerUI url="/docs/openapi.yaml" persistAuthorization={false} tryItOutEnabled />
    </div>
  );
}
