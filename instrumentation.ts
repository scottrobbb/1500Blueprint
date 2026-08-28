import type { Instrumentation } from "next";
import { reportServerError } from "@/lib/observability/server";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportServerError("next.request.unhandled", error, {
    provider: "next",
    method: request.method,
    route: context.routePath,
    source: context.routeType,
  });
};
