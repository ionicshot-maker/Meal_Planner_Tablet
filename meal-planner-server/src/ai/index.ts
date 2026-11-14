import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Handler } from './netlify-compat.js';
import { handler as barcodeLookup } from './barcode-lookup.js';
import { handler as barcodeWebLookup } from './gemini-barcode-web-lookup.js';
import { handler as detectRecipeBoxes } from './gemini-detect-recipe-boxes.js';
import { handler as labelScan } from './gemini-label-scan.js';
import { handler as nutrition } from './gemini-nutrition.js';
import { handler as photoRecipe } from './gemini-photo-recipe.js';
import { handler as receiptScan } from './gemini-receipt-scan.js';
import { handler as recipeImport } from './gemini-recipe-import.js';
import { handler as referenceScan } from './gemini-reference-scan.js';
import { handler as usdaSearch } from './usda-search.js';

/**
 * The AI / lookup proxies the app calls at `/api/<name>`. They are stateless: the caller's own Gemini / USDA key travels in the
 * request (nothing is stored server-side), and the server's only job is to make the outbound request (page fetches and Google
 * APIs are not reachable from the browser because of CORS). Same URLs as the old Netlify functions, so the app's call sites do not
 * change. Unlike Netlify they now require a signed-in account -- any role: they write nothing to the household's data.
 */
export const AI_ROUTES: Record<string, Handler> = {
  'barcode-lookup': barcodeLookup,
  'gemini-barcode-web-lookup': barcodeWebLookup,
  'gemini-detect-recipe-boxes': detectRecipeBoxes,
  'gemini-label-scan': labelScan,
  'gemini-nutrition': nutrition,
  'gemini-photo-recipe': photoRecipe,
  'gemini-receipt-scan': receiptScan,
  'gemini-recipe-import': recipeImport,
  'gemini-reference-scan': referenceScan,
  'usda-search': usdaSearch,
};

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export function registerAiRoutes(app: FastifyInstance, opts: { requireUser: Guard }) {
  // Own encapsulated scope: the handlers parse the JSON body themselves (and answer a bad body with their own "Invalid JSON body"),
  // so in here the body is handed over as the raw string instead of being parsed by Fastify.
  void app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    for (const [name, handler] of Object.entries(AI_ROUTES)) {
      scope.route({
        method: ['GET', 'POST'],
        url: `/api/${name}`,
        preHandler: opts.requireUser,
        handler: async (req, reply) => {
          const res = await handler({
            httpMethod: req.method,
            body: typeof req.body === 'string' ? req.body : null,
            queryStringParameters: req.query as Record<string, string | undefined>,
          });
          if (!res) return reply.code(204).send();
          for (const [k, v] of Object.entries(res.headers ?? {})) if (v !== undefined) void reply.header(k, v);
          return reply.code(res.statusCode).send(res.body ?? '');
        },
      });
    }
  });
}
