import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, call, setupOwner, addUser } from './helpers.js';
import { AI_ROUTES } from '../src/ai/index.js';

// ---- a fake network: nothing here ever reaches Gemini, USDA or Open Food Facts ----
type Call = { url: string; init: RequestInit | undefined };
const realFetch = globalThis.fetch;
let calls: Call[] = [];
afterEach(() => { globalThis.fetch = realFetch; calls = []; });

function mockFetch(route: (url: string, init: RequestInit | undefined, n: number) => Response | Promise<Response> | Error) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = await route(url, init, calls.length);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const gem = (text: string, extra: Record<string, unknown> = {}) => json({ candidates: [{ content: { parts: [{ text }] }, ...extra }] });
const gemErr = (status: number, message: string, st?: string) => json({ error: { message, status: st } }, status);
const KEY = 'AIzaSyFAKE-KEY-FOR-TESTS-0123456789';
const isGemini = (u: string) => u.startsWith('https://generativelanguage.googleapis.com/');

async function signedIn() {
  const s = makeServer();
  const owner = await setupOwner(s.app);
  return { ...s, owner };
}
const post = (s: Awaited<ReturnType<typeof signedIn>>, name: string, body: unknown, token = s.owner.token) =>
  call(s.app, 'POST', `/api/${name}`, { token, body: body as object });

// ============================================================ plumbing
test('every Netlify function has a route at the same URL', () => {
  assert.deepEqual(Object.keys(AI_ROUTES).sort(), [
    'barcode-lookup', 'gemini-barcode-web-lookup', 'gemini-detect-recipe-boxes', 'gemini-label-scan', 'gemini-nutrition',
    'gemini-photo-recipe', 'gemini-receipt-scan', 'gemini-recipe-import', 'gemini-reference-scan', 'usda-search',
  ]);
});

test('every AI route requires a sign-in and never reaches the network without one', async () => {
  const { app } = makeServer();
  await setupOwner(app);
  mockFetch(() => { throw new Error('network must not be touched'); });
  for (const name of Object.keys(AI_ROUTES)) {
    for (const method of ['GET', 'POST'] as const) {
      const r = await call(app, method, `/api/${name}?query=x&barcode=1`, method === 'POST' ? { body: { apiKey: KEY } } : {});
      assert.equal(r.status, 401, `${method} ${name}`);
    }
    assert.equal((await call(app, 'POST', `/api/${name}`, { token: 'bogus', body: {} })).status, 401, name);
  }
  assert.equal(calls.length, 0);
});

test('any role may use the AI routes, read-only included (they write nothing to the household)', async () => {
  const s = await signedIn();
  const guest = await addUser(s.app, s.owner, 'guest', 'readonly');
  mockFetch(() => gem('{}'));
  const r = await post(s, 'gemini-nutrition', {}, guest.token);
  assert.equal(r.status, 400); // got past sign-in/roles and into the handler's own validation
  assert.match(r.json.error, /Missing productName/);
});

test('POST-only routes answer GET with 405; a malformed JSON body gets the handler\'s own 400', async () => {
  const s = await signedIn();
  for (const name of ['gemini-photo-recipe', 'gemini-recipe-import', 'gemini-label-scan']) {
    const r = await call(s.app, 'GET', `/api/${name}`, { token: s.owner.token });
    assert.equal(r.status, 405, name);
  }
  const res = await s.app.inject({
    method: 'POST', url: '/api/gemini-photo-recipe',
    headers: { authorization: `Bearer ${s.owner.token}`, 'content-type': 'application/json' }, payload: '{not json',
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'Invalid JSON body');
});

test('the ordinary API keeps normal JSON parsing (the raw-body parser is scoped to the AI routes)', async () => {
  const s = await signedIn();
  const bad = await s.app.inject({
    method: 'POST', url: '/api/sync/push',
    headers: { authorization: `Bearer ${s.owner.token}`, 'content-type': 'application/json' }, payload: '{"changes": [',
  });
  assert.equal(bad.statusCode, 400);
});

test('responses keep the upstream handler\'s headers (no-store for AI, a one-hour cache for USDA)', async () => {
  const s = await signedIn();
  mockFetch(() => json({ foods: [] }));
  const usda = await call(s.app, 'GET', '/api/usda-search?query=butter', { token: s.owner.token });
  assert.equal(usda.headers['cache-control'], 'public, max-age=3600');
  const ai = await post(s, 'gemini-nutrition', {});
  assert.equal(ai.headers['cache-control'], 'no-store');
  assert.match(String(ai.headers['content-type']), /application\/json/);
});

test('the caller\'s API key is never written to the server log, not even a prefix', async () => {
  const s = await signedIn();
  const logged: string[] = [];
  const origLog = console.log, origErr = console.error;
  console.log = (...a: unknown[]) => { logged.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(' ')); };
  try {
    mockFetch(() => gem('{"name":"Pancakes"}'));
    await post(s, 'gemini-photo-recipe', { image: 'AAAA', apiKey: KEY });
    await post(s, 'gemini-receipt-scan', { image: 'AAAA', apiKey: KEY });
    await post(s, 'gemini-label-scan', { image: 'AAAA', apiKey: KEY });
    await post(s, 'gemini-reference-scan', { image: 'AAAA', apiKey: KEY });
    await post(s, 'gemini-recipe-import', { text: 'x', apiKey: KEY });
    await post(s, 'gemini-nutrition', { productName: 'Butter', apiKey: KEY });
  } finally { console.log = origLog; console.error = origErr; }
  assert.ok(logged.length > 0, 'the handlers still log their progress');
  assert.equal(logged.some((l) => l.includes(KEY.slice(0, 8))), false, 'no key prefix in logs');
  assert.equal(logged.some((l) => l.includes('key prefix')), false);
});

test('no personal contact details go out to third parties (User-Agent is a generic client name)', async () => {
  const s = await signedIn();
  mockFetch(() => json({ status: 0 }));
  await call(s.app, 'GET', '/api/barcode-lookup?barcode=0123456789012', { token: s.owner.token });
  const ua = (calls[0].init?.headers as Record<string, string>)['User-Agent'];
  assert.equal(ua, 'MealPlannerSelfHosted/1.0');
  assert.equal(ua.includes('@'), false);
});

// ============================================================ the five photo/Gemini routes that share one shape
const PHOTO_ROUTES = [
  { name: 'gemini-photo-recipe', ok: { name: 'Pancakes', servings: 4, ingredients: [], steps: [] }, field: 'recipe', lowReason: /recipe/i },
  { name: 'gemini-label-scan', ok: { productName: 'Oats', calories: 150 }, field: 'nutrition', lowReason: /label/i },
  { name: 'gemini-reference-scan', ok: { title: 'Oven temps', contentType: 'charts', content: '350F', tableData: null, confidence: 'high' }, field: 'reference', lowReason: /reference|photo/i },
  { name: 'gemini-receipt-scan', ok: { store: 'Kroger', date: '2026-11-01', total: 12.5, items: [{ name: 'Milk', price: 3 }] }, field: null, lowReason: /receipt/i },
] as const;

for (const r of PHOTO_ROUTES) {
  test(`${r.name}: validates the key and the photo before calling anyone`, async () => {
    const s = await signedIn();
    mockFetch(() => { throw new Error('no call expected'); });
    const noKey = await post(s, r.name, { image: 'AAAA', apiKey: 'short' });
    assert.equal(noKey.status, 400);
    assert.match(noKey.json.error, /valid Gemini API key/);
    const noImg = await post(s, r.name, { apiKey: KEY });
    assert.equal(noImg.status, 400);
    assert.match(noImg.json.error, /No photo/);
    assert.equal(calls.length, 0);
  });

  test(`${r.name}: success returns the parsed result; the key goes in a header and the photo is forwarded`, async () => {
    const s = await signedIn();
    mockFetch(() => gem(JSON.stringify(r.ok)));
    const res = await post(s, r.name, { image: 'BASE64DATA', mimeType: 'image/png', apiKey: KEY, model: 'gemini-test-model' });
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 1);
    if (r.field) assert.deepEqual(res.json[r.field], r.ok);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/models/gemini-test-model:generateContent'));
    assert.equal(calls[0].url.includes(KEY), false, 'the key must not be in the URL');
    assert.equal((calls[0].init?.headers as Record<string, string>)['x-goog-api-key'], KEY);
    const sent = JSON.parse(String(calls[0].init?.body));
    assert.equal(JSON.stringify(sent).includes('BASE64DATA'), true);
    assert.equal(JSON.stringify(sent).includes('image/png'), true);
  });

  test(`${r.name}: a response wrapped in a markdown code fence is still parsed`, async () => {
    const s = await signedIn();
    mockFetch(() => gem('```json\n' + JSON.stringify(r.ok) + '\n```'));
    const res = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(res.json.status, 1);
  });

  test(`${r.name}: low confidence, empty text and unparsable text become a friendly lowConfidence result (HTTP 200)`, async () => {
    const s = await signedIn();
    mockFetch(() => gem(JSON.stringify({ confidence: 'low', reason: 'Too blurry to read.' })));
    const low = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(low.status, 200);
    assert.deepEqual(low.json, { lowConfidence: true, reason: 'Too blurry to read.' });
    mockFetch(() => gem('   '));
    const empty = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(empty.json.lowConfidence, true);
    mockFetch(() => gem('this is not json at all'));
    const junk = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(junk.status, 200);
    assert.equal(junk.json.lowConfidence, true);
    assert.match(junk.json.reason, r.lowReason);
  });

  test(`${r.name}: an unknown model falls back to the fallback model once`, async () => {
    const s = await signedIn();
    mockFetch((_u, _i, n) => (n === 1 ? gemErr(404, 'model not found', 'NOT_FOUND') : gem(JSON.stringify(r.ok))));
    const res = await post(s, r.name, { image: 'AAAA', apiKey: KEY, model: 'gemini-retired' });
    assert.equal(res.json.status, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes('gemini-retired'));
    assert.ok(calls[1].url.includes('gemini-3-flash:'));
  });

  test(`${r.name}: Gemini errors map to clear statuses (404 both models, 429, bad key, outage, unreachable)`, async () => {
    const s = await signedIn();
    mockFetch(() => gemErr(404, 'nope', 'NOT_FOUND'));
    const nf = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(nf.status, 404);
    assert.match(nf.json.error, /not found/);
    mockFetch(() => gemErr(429, 'quota'));
    const rl = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(rl.status, 429);
    assert.match(rl.json.error, /rate limit/i);
    for (const code of [401, 403]) {
      mockFetch(() => gemErr(code, 'API key not valid'));
      const bad = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
      assert.equal(bad.status, code);
      assert.match(bad.json.error, /invalid or not authorized/);
    }
    mockFetch(() => gemErr(503, 'overloaded'));
    const down = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(down.status, 503);
    assert.equal(down.json.error, 'overloaded');
    mockFetch(() => new Error('getaddrinfo ENOTFOUND'));
    const gone = await post(s, r.name, { image: 'AAAA', apiKey: KEY });
    assert.equal(gone.status, 502);
    assert.match(gone.json.error, /Could not reach Gemini API/);
  });
}

test('gemini-receipt-scan: returns the receipt fields, and a receipt with no line items is low confidence', async () => {
  const s = await signedIn();
  mockFetch(() => gem(JSON.stringify({ store: 'Kroger', date: '2026-11-01', total: 12.5, items: [{ name: 'Milk', price: 3 }] })));
  const ok = await post(s, 'gemini-receipt-scan', { image: 'AAAA', apiKey: KEY });
  assert.equal(ok.json.status, 1);
  assert.equal(ok.json.store, 'Kroger');
  assert.equal(ok.json.items.length, 1);
  mockFetch(() => gem(JSON.stringify({ store: 'Kroger', items: [] })));
  const none = await post(s, 'gemini-receipt-scan', { image: 'AAAA', apiKey: KEY });
  assert.equal(none.json.lowConfidence, true);
  assert.match(none.json.reason, /No line items/);
});

test('gemini-photo-recipe: the large photo (a few MB of base64) passes through the body limit', async () => {
  const s = await signedIn();
  mockFetch(() => gem(JSON.stringify({ name: 'Big' })));
  const res = await post(s, 'gemini-photo-recipe', { image: 'A'.repeat(8_000_000), apiKey: KEY });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(String(calls[0].init?.body)).contents[0].parts.some((p: any) => p.inline_data?.data?.length === 8_000_000), true);
});

// ============================================================ recipe boxes (best-effort: failures degrade to an empty list)
test('gemini-detect-recipe-boxes: returns clean boxes, drops malformed ones', async () => {
  const s = await signedIn();
  mockFetch(() => gem(JSON.stringify({ boxes: [
    { leftPct: 0, topPct: 0, widthPct: 50, heightPct: 100 },
    { leftPct: '50', topPct: 0, widthPct: 50, heightPct: 100 },   // numeric strings are coerced
    { leftPct: 'x', topPct: 0, widthPct: 50, heightPct: 100 },    // dropped
    'garbage', null,
  ] })));
  const r = await post(s, 'gemini-detect-recipe-boxes', { image: 'AAAA', apiKey: KEY });
  assert.deepEqual(r.json.boxes, [
    { leftPct: 0, topPct: 0, widthPct: 50, heightPct: 100 },
    { leftPct: 50, topPct: 0, widthPct: 50, heightPct: 100 },
  ]);
});

test('gemini-detect-recipe-boxes: every upstream failure degrades to 200 with no boxes; bad input is still a 400', async () => {
  const s = await signedIn();
  assert.equal((await post(s, 'gemini-detect-recipe-boxes', { image: 'AAAA', apiKey: 'x' })).status, 400);
  assert.equal((await post(s, 'gemini-detect-recipe-boxes', { apiKey: KEY })).status, 400);
  const degrade = async (route: Parameters<typeof mockFetch>[0], label: string) => {
    mockFetch(route);
    const r = await post(s, 'gemini-detect-recipe-boxes', { image: 'AAAA', apiKey: KEY });
    assert.equal(r.status, 200, label);
    assert.deepEqual(r.json, { boxes: [] }, label);
  };
  await degrade(() => new Error('offline'), 'network down');
  await degrade(() => gemErr(429, 'quota'), 'rate limited');
  await degrade(() => gemErr(500, 'boom'), 'server error');
  await degrade(() => gem(''), 'empty text');
  await degrade(() => gem('not json'), 'unparsable');
  await degrade(() => gem(JSON.stringify({ boxes: 'nope' })), 'wrong shape');
  await degrade((_u, _i, n) => (n === 1 ? gemErr(404, 'gone', 'NOT_FOUND') : new Error('offline')), 'fallback also fails');
});

// ============================================================ recipe import (text or URL)
test('gemini-recipe-import: pasted text is parsed; nothing is fetched except Gemini', async () => {
  const s = await signedIn();
  mockFetch(() => gem(JSON.stringify({ name: 'Pancakes', servings: 4, ingredients: [], steps: [] })));
  const r = await post(s, 'gemini-recipe-import', { text: '2 cups flour...', apiKey: KEY });
  assert.equal(r.json.status, 1);
  assert.equal(r.json.recipe.name, 'Pancakes');
  assert.equal(r.json.recipe.sourceUrl, undefined);
  assert.equal(calls.length, 1);
  assert.ok(isGemini(calls[0].url));
  assert.ok(JSON.stringify(JSON.parse(String(calls[0].init?.body))).includes('2 cups flour'));
});

test('gemini-recipe-import: a URL is fetched, scripts/styles/tags are stripped, the page text is sent, and sourceUrl is attached', async () => {
  const s = await signedIn();
  mockFetch((url) => isGemini(url)
    ? gem('```json\n{"name":"Soup","servings":6,"ingredients":[],"steps":[]}\n```')
    : new Response('<html><head><style>.x{color:red}</style><script>alert(1)</script></head><body><h1>Great Soup</h1><p>Boil <b>water</b>.</p></body></html>'));
  const r = await post(s, 'gemini-recipe-import', { url: 'https://example.com/soup', apiKey: KEY });
  assert.equal(r.json.status, 1);
  assert.equal(r.json.recipe.sourceUrl, 'https://example.com/soup');
  assert.equal(calls[0].url, 'https://example.com/soup');
  const prompt = JSON.stringify(JSON.parse(String(calls[1].init?.body)).contents);
  assert.ok(prompt.includes('Great Soup') && prompt.includes('Boil'));
  assert.equal(prompt.includes('alert(1)'), false);
  assert.equal(prompt.includes('color:red'), false);
  assert.equal(prompt.includes('<p>'), false);
});

test('gemini-recipe-import: page problems and bad input give plain errors', async () => {
  const s = await signedIn();
  mockFetch(() => new Response('nope', { status: 403 }));
  const forbidden = await post(s, 'gemini-recipe-import', { url: 'https://example.com/x', apiKey: KEY });
  assert.equal(forbidden.status, 502);
  assert.match(forbidden.json.error, /HTTP 403.*pasting the recipe text/);
  mockFetch(() => new Error('timed out'));
  const timeout = await post(s, 'gemini-recipe-import', { url: 'https://example.com/x', apiKey: KEY });
  assert.equal(timeout.status, 502);
  assert.match(timeout.json.error, /Could not fetch that URL: timed out/);
  assert.equal((await post(s, 'gemini-recipe-import', { apiKey: KEY })).status, 400);
  assert.equal((await post(s, 'gemini-recipe-import', { text: 'x', apiKey: 'tiny' })).status, 400);
});

test('gemini-recipe-import: an empty or non-JSON Gemini answer is a clear error, not a crash', async () => {
  const s = await signedIn();
  mockFetch(() => gem(''));
  const empty = await post(s, 'gemini-recipe-import', { text: 'x', apiKey: KEY });
  assert.equal(empty.status, 500);
  assert.match(empty.json.error, /empty response/);
  mockFetch(() => gem('Sorry, I cannot do that.'));
  const junk = await post(s, 'gemini-recipe-import', { text: 'x', apiKey: KEY });
  assert.ok(junk.status >= 400);
  assert.ok(junk.json.error);
});

// ============================================================ nutrition by name
test('gemini-nutrition: validates input, returns nutrition, and reports "not found" as status 0', async () => {
  const s = await signedIn();
  assert.equal((await post(s, 'gemini-nutrition', { apiKey: KEY })).status, 400);
  assert.match((await post(s, 'gemini-nutrition', { productName: 'Butter' })).json.error, /No Gemini API key/);
  mockFetch(() => gem(JSON.stringify({ calories: 100, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 11, sodium: 90, servingSize: 14, servingUnit: 'g' })));
  const ok = await post(s, 'gemini-nutrition', { productName: 'Butter', brand: 'Land O Lakes', apiKey: KEY });
  assert.equal(ok.json.status, 1);
  assert.equal(ok.json.nutrition.fat, 11);
  assert.equal(calls.length, 1);
  assert.ok(JSON.stringify(JSON.parse(String(calls[0].init?.body))).includes('Land O Lakes'));
  mockFetch(() => gem(JSON.stringify({ notFound: true })));
  assert.deepEqual((await post(s, 'gemini-nutrition', { productName: 'Zzz', apiKey: KEY })).json, { status: 0 });
});

test('gemini-nutrition: an implausible "oz" serving (over 30) is corrected to grams', async () => {
  const s = await signedIn();
  mockFetch(() => gem(JSON.stringify({ calories: 200, protein: 20, carbs: 0, fiber: 0, sugar: 0, fat: 12, sodium: 70, servingSize: 113, servingUnit: 'oz' })));
  const r = await post(s, 'gemini-nutrition', { productName: 'Ground beef', apiKey: KEY });
  assert.equal(r.json.nutrition.servingUnit, 'g');
  mockFetch(() => gem(JSON.stringify({ calories: 100, protein: 1, carbs: 1, fiber: 0, sugar: 0, fat: 1, sodium: 1, servingSize: 4, servingUnit: 'oz' })));
  assert.equal((await post(s, 'gemini-nutrition', { productName: 'Beef', apiKey: KEY })).json.nutrition.servingUnit, 'oz'); // a believable oz serving is left alone
});

test('gemini-nutrition: an unparsable first answer is retried once with a simpler prompt', async () => {
  const s = await signedIn();
  mockFetch((_u, _i, n) => (n === 1 ? gem('garbled {{') : gem(JSON.stringify({ calories: 5, protein: 0, carbs: 1, fiber: 0, sugar: 0, fat: 0, sodium: 0 }))));
  const r = await post(s, 'gemini-nutrition', { productName: 'Gum', apiKey: KEY });
  assert.equal(r.json.status, 1);
  assert.equal(calls.length, 2);
  mockFetch(() => gem('garbled {{'));
  const fail = await post(s, 'gemini-nutrition', { productName: 'Gum', apiKey: KEY });
  assert.equal(fail.status, 502);
  assert.match(fail.json.error, /could not return valid nutrition data/);
});

test('gemini-nutrition: upstream errors map to clear statuses', async () => {
  const s = await signedIn();
  mockFetch(() => gemErr(429, 'quota'));
  assert.equal((await post(s, 'gemini-nutrition', { productName: 'x', apiKey: KEY })).status, 429);
  mockFetch(() => gemErr(404, 'no model', 'NOT_FOUND'));
  assert.equal((await post(s, 'gemini-nutrition', { productName: 'x', apiKey: KEY })).status, 404);
  mockFetch(() => gemErr(403, 'bad key'));
  assert.equal((await post(s, 'gemini-nutrition', { productName: 'x', apiKey: KEY })).status, 403);
  mockFetch(() => new Error('offline'));
  assert.equal((await post(s, 'gemini-nutrition', { productName: 'x', apiKey: KEY })).status, 502);
});

// ============================================================ barcode lookup (Open Food Facts)
const off = (product: Record<string, unknown>) => json({ status: 1, product });

test('barcode-lookup: missing barcode is a 400; an unknown barcode is status 0; OFF errors pass their status through', async () => {
  const s = await signedIn();
  assert.equal((await call(s.app, 'GET', '/api/barcode-lookup', { token: s.owner.token })).status, 400);
  mockFetch(() => json({ status: 0 }));
  assert.deepEqual((await call(s.app, 'GET', '/api/barcode-lookup?barcode=000', { token: s.owner.token })).json, { status: 0 });
  mockFetch(() => new Response('x', { status: 503 }));
  const down = await call(s.app, 'GET', '/api/barcode-lookup?barcode=000', { token: s.owner.token });
  assert.equal(down.status, 503);
  mockFetch(() => new Error('offline'));
  assert.equal((await call(s.app, 'GET', '/api/barcode-lookup?barcode=000', { token: s.owner.token })).status, 502);
});

test('barcode-lookup: looks up the right product URL and normalizes per-serving nutrition, grades and allergens', async () => {
  const s = await signedIn();
  mockFetch(() => off({
    product_name: 'Oat Bar', brands: 'Acme', serving_size: '1 bar (40 g)', serving_quantity: 40,
    categories_tags: ['en:snacks'], nutriscore_grade: 'b', nova_group: 3, allergens_tags: ['en:milk', 'en:tree-nuts'],
    nutriments: { 'energy-kcal_serving': 160.44, proteins_serving: 4, carbohydrates_serving: 24, fiber_serving: 3, sugars_serving: 9, fat_serving: 6, sodium_serving: 0.12 },
  }));
  const r = await call(s.app, 'GET', '/api/barcode-lookup?barcode=0123456789012', { token: s.owner.token });
  assert.equal(calls[0].url, 'https://world.openfoodfacts.org/api/v2/product/0123456789012.json');
  const p = r.json.product;
  assert.equal(r.json.status, 1);
  assert.equal(p.product_name, 'Oat Bar');
  assert.equal(p.brands, 'Acme');
  assert.equal(p.barcode, '0123456789012');
  assert.equal(p.serving_quantity_g, 40);
  assert.equal(p.serving_display_size, 1);
  assert.equal(p.serving_display_unit, 'g'); // "1 bar" is not a known unit -> grams
  assert.deepEqual(p.macros, { calories: 160.4, protein: 4, carbs: 24, fiber: 3, sugar: 9, fat: 6, sodium: 120 });
  assert.equal(p.nutriscore, 'B');
  assert.equal(p.novaGroup, 3);
  assert.deepEqual(p.allergens, ['Milk', 'Tree Nuts']);
});

test('barcode-lookup: with only per-100g data the macros are scaled to the serving; a spice with no serving data defaults to 1 tsp', async () => {
  const s = await signedIn();
  mockFetch(() => off({ product_name: 'Cereal', serving_quantity: 30, categories_tags: [], nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 80, fat_100g: 5, sodium_100g: 0.5 } }));
  const cereal = (await call(s.app, 'GET', '/api/barcode-lookup?barcode=1', { token: s.owner.token })).json.product;
  assert.equal(cereal.macros.calories, 120);
  assert.equal(cereal.macros.protein, 3);
  assert.equal(cereal.macros.sodium, 150);
  mockFetch(() => off({ product_name: 'Cinnamon', categories_tags: ['en:spices', 'en:cinnamon'], nutriments: { 'energy-kcal_100g': 250 } }));
  const spice = (await call(s.app, 'GET', '/api/barcode-lookup?barcode=2', { token: s.owner.token })).json.product;
  assert.equal(spice.serving_quantity_g, 2.6);
  assert.equal(spice.serving_display_unit, 'tsp');
  mockFetch(() => off({ product_name: 'Rice', product_quantity: 900, number_of_servings: 20, categories_tags: [], nutriments: {} }));
  assert.equal((await call(s.app, 'GET', '/api/barcode-lookup?barcode=3', { token: s.owner.token })).json.product.serving_quantity_g, 45);
});

// ============================================================ barcode web fallback (Gemini + grounded search)
const webClaim = (over: Record<string, unknown> = {}) => JSON.stringify({
  found: true, product_name: 'Great Oats', brand: 'Acme', barcode_signal: 'text',
  nutrition: { calories: 150, protein: 5, carbs: 27, fiber: 4, sugar: 1, fat: 3, sodium: 0 }, serving_display_size: 40, serving_display_unit: 'g', ...over,
});
const grounded = (text: string, uris: string[]) => gem(text, { groundingMetadata: { groundingChunks: uris.map((uri) => ({ web: { uri, title: `T ${uri}` } })) } });

test('gemini-barcode-web-lookup: validates input; nothing grounded, no claim, or no macros all mean "not found"', async () => {
  const s = await signedIn();
  assert.equal((await post(s, 'gemini-barcode-web-lookup', { barcode: '1', apiKey: 'x' })).status, 400);
  assert.equal((await post(s, 'gemini-barcode-web-lookup', { barcode: '  ', apiKey: KEY })).status, 400);
  const notFound = async (route: Parameters<typeof mockFetch>[0], why: string) => {
    mockFetch(route);
    assert.deepEqual((await post(s, 'gemini-barcode-web-lookup', { barcode: '012345678905', apiKey: KEY })).json, { status: 0 }, why);
  };
  await notFound(() => gem(webClaim()), 'a claim with no grounding sources is not trusted');
  await notFound(() => grounded(webClaim({ found: false }), ['https://a.example']), 'found:false');
  await notFound(() => grounded(webClaim({ nutrition: {} }), ['https://a.example']), 'no macros');
  await notFound(() => grounded('not json', ['https://a.example']), 'unparsable');
});

test('gemini-barcode-web-lookup: confidence is "high" only when a real source page independently contains the barcode', async () => {
  const s = await signedIn();
  mockFetch((url) => isGemini(url)
    ? grounded(webClaim(), ['https://miss.example/a', 'https://hit.example/b'])
    : new Response(url.includes('hit') ? '<p>UPC: 0-12345-67890-5</p>' : '<p>nothing here</p>'));
  const high = await post(s, 'gemini-barcode-web-lookup', { barcode: '012345678905', nameHint: 'oats', apiKey: KEY });
  assert.equal(high.json.status, 1);
  assert.equal(high.json.result.confidence, 'high');
  assert.equal(high.json.result.confirmedByFetch, true);
  assert.equal(high.json.result.sourceUrl, 'https://hit.example/b');
  assert.equal(high.json.result.productName, 'Great Oats');
  assert.equal(high.json.result.macros.calories, 150);
  // The page checks go out with the generic client name.
  assert.equal(calls.filter((c) => !isGemini(c.url)).every((c) => (c.init?.headers as Record<string, string>)['User-Agent'] === 'MealPlannerSelfHosted/1.0'), true);
});

test('gemini-barcode-web-lookup: no page confirmation falls back to medium (model saw the barcode) or low (it did not)', async () => {
  const s = await signedIn();
  mockFetch((url) => (isGemini(url) ? grounded(webClaim({ barcode_signal: 'image' }), ['https://a.example']) : new Response('<p>no digits</p>')));
  const medium = await post(s, 'gemini-barcode-web-lookup', { barcode: '012345678905', apiKey: KEY });
  assert.equal(medium.json.result.confidence, 'medium');
  assert.equal(medium.json.result.confirmedByFetch, false);
  mockFetch((url) => (isGemini(url) ? grounded(webClaim({ barcode_signal: 'none' }), ['https://a.example']) : new Response('', { status: 404 })));
  assert.equal((await post(s, 'gemini-barcode-web-lookup', { barcode: '012345678905', apiKey: KEY })).json.result.confidence, 'low');
});

test('gemini-barcode-web-lookup: Gemini outages are reported, not swallowed', async () => {
  const s = await signedIn();
  mockFetch(() => new Error('offline'));
  assert.equal((await post(s, 'gemini-barcode-web-lookup', { barcode: '1', apiKey: KEY })).status, 502);
  mockFetch(() => gemErr(429, 'quota'));
  assert.equal((await post(s, 'gemini-barcode-web-lookup', { barcode: '1', apiKey: KEY })).status, 429);
  mockFetch(() => gemErr(401, 'bad key'));
  assert.equal((await post(s, 'gemini-barcode-web-lookup', { barcode: '1', apiKey: KEY })).status, 401);
});

// ============================================================ USDA
test('usda-search: needs a query; uses DEMO_KEY unless the caller supplies a key; passes errors through', async () => {
  const s = await signedIn();
  assert.equal((await call(s.app, 'GET', '/api/usda-search', { token: s.owner.token })).status, 400);
  mockFetch(() => json({ foods: [{ description: 'Butter' }] }));
  const ok = await call(s.app, 'GET', '/api/usda-search?query=butter%20salted', { token: s.owner.token });
  assert.equal(ok.json.foods[0].description, 'Butter');
  assert.ok(calls[0].url.startsWith('https://api.nal.usda.gov/fdc/v1/foods/search?query=butter%20salted'));
  assert.ok(calls[0].url.endsWith('api_key=DEMO_KEY'));
  await call(s.app, 'GET', '/api/usda-search?query=x&apiKey=my%20key', { token: s.owner.token });
  assert.ok(calls[1].url.endsWith('api_key=my%20key'));
  mockFetch(() => new Response('', { status: 429 }));
  const limited = await call(s.app, 'GET', '/api/usda-search?query=x', { token: s.owner.token });
  assert.equal(limited.status, 429);
  assert.match(limited.json.error, /USDA API returned 429/);
  mockFetch(() => new Error('offline'));
  assert.equal((await call(s.app, 'GET', '/api/usda-search?query=x', { token: s.owner.token })).status, 502);
});
