import { forwardExpressRequest } from "../../src/next-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = (request: Request) => forwardExpressRequest(request);

export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
