import serverless from "serverless-http";
import { randomUUID } from "node:crypto";
import app from "./app";

type LambdaResponse = {
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
  multiValueHeaders?: Record<string, string[] | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

const expressHandler = serverless(app, { provider: "aws" });

export async function forwardExpressRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const bytes = hasBody ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  const headers = Object.fromEntries(request.headers.entries());
  const requestId = randomUUID();
  const host = request.headers.get("host") || url.host;
  const event = {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: bytes.length ? bytes.toString("base64") : undefined,
    isBase64Encoded: bytes.length > 0,
    requestContext: {
      accountId: "next",
      apiId: "next",
      domainName: host,
      domainPrefix: host.split(".")[0],
      http: {
        method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
        userAgent: request.headers.get("user-agent") || "",
      },
      requestId,
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };

  const result = (await expressHandler(event, {
    awsRequestId: requestId,
    callbackWaitsForEmptyEventLoop: false,
    functionName: "circuits-kw-api",
  })) as LambdaResponse;

  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(result.headers || {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) responseHeaders.append(name, item);
    } else {
      responseHeaders.set(name, value);
    }
  }
  for (const [name, values] of Object.entries(result.multiValueHeaders || {})) {
    if (values === undefined) continue;
    responseHeaders.delete(name);
    for (const value of values) responseHeaders.append(name, value);
  }

  const status = result.statusCode || 200;
  const isBodyless = method === "HEAD" || status === 204 || status === 304;
  const body = isBodyless
    ? null
    : result.isBase64Encoded
      ? Buffer.from(result.body || "", "base64")
      : result.body || null;

  return new Response(body as BodyInit | null, {
    status,
    headers: responseHeaders,
  });
}
