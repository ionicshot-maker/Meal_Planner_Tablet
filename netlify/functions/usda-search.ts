import type { Handler } from '@netlify/functions'

const handler: Handler = async (event) => {
  const query  = event.queryStringParameters?.query?.trim()
  const apiKey = event.queryStringParameters?.apiKey?.trim() || 'DEMO_KEY'

  if (!query) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing query parameter' }),
    }
  }

  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=SR%20Legacy,Foundation&pageSize=5&api_key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url)

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `USDA API returned ${res.status}` }),
      }
    }

    const data = await res.json()
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Upstream request failed', details: String(err) }),
    }
  }
}

export { handler }
