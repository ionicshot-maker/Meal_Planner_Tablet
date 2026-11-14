// The AI proxy handlers were written for Netlify Functions and are ported unchanged (apart from this import and no longer
// logging key prefixes). These are the only parts of Netlify's `Handler` contract they use; `index.ts` adapts them to Fastify.
export interface HandlerEvent {
  httpMethod: string;
  body: string | null;
  queryStringParameters: Record<string, string | undefined> | null;
}
export interface HandlerResponse {
  statusCode: number;
  headers?: Record<string, string | undefined>;
  body?: string;
}
export type Handler = (event: HandlerEvent) => Promise<HandlerResponse | void>;
