export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequestId(request: Request): string | undefined {
  return (
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    undefined
  );
}

function sanitizeErrorText(value: string): string {
  return value
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
    .replace(/((?:password|passwd|pwd|token|secret)\s*[=:]\s*)[^\s&]+/gi, "$1[redacted]");
}

async function handle(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const { forwardExpressRequest } = await import("@workspace/api-server/handler");
    return await forwardExpressRequest(request);
  } catch (error) {
    const errorMessage = sanitizeErrorText(
      error instanceof Error ? error.message : "Unknown API handler error",
    );
    const errorStack =
      error instanceof Error && error.stack
        ? sanitizeErrorText(error.stack)
        : undefined;
    const responseBody = {
      error: "api_handler_failed",
      message: "The API request could not be completed.",
      ...(requestId ? { requestId } : {}),
    };

    console.error("[Vercel API] Express handler failed", {
      method: request.method,
      url: new URL(request.url).pathname,
      statusCode: 500,
      requestId,
      responseBody,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage,
      errorStack,
    });

    return Response.json(responseBody, {
      status: 500,
      headers: requestId ? { "x-request-id": requestId } : undefined,
    });
  }
}

export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
