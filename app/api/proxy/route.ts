// app/api/proxy/route.ts
export const runtime = 'edge';

function json(obj: any, status: number = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-relay-hop',
    },
  });
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('x-relay-hop') === '1') {
      return json({ e: 'loop detected' }, 508);
    }

    let req: any;
    try {
      req = await request.json();
    } catch {
      return json({ e: 'invalid json body' }, 400);
    }

    if (!req.u || typeof req.u !== 'string') {
      return json({ e: 'missing url' }, 400);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(req.u);
    } catch {
      return json({ e: 'invalid url' }, 400);
    }

    const currentHost = new URL(request.url).hostname;
    if (currentHost === targetUrl.hostname) {
      return json({ e: 'self-fetch blocked' }, 400);
    }

    const headers = new Headers();
    if (req.h && typeof req.h === 'object') {
      for (const [k, v] of Object.entries(req.h)) {
        if (typeof v === 'string') headers.set(k, v);
      }
    }
    headers.set('x-relay-hop', '1');

    const fetchOptions: RequestInit = {
      method: (req.m || 'GET').toUpperCase(),
      headers,
      redirect: req.r === false ? 'manual' : 'follow',
    };

    if (req.b && typeof req.b === 'string') {
      const binary = Uint8Array.from(atob(req.b), (c) => c.charCodeAt(0));
      fetchOptions.body = binary;
    }

    const resp = await fetch(targetUrl.toString(), fetchOptions);
    const buffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // تبدیل به Base64 با chunk
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      let chunkStr = '';
      for (let j = 0; j < chunk.length; j++) {
        chunkStr += String.fromCharCode(chunk[j]);
      }
      binary += chunkStr;
    }
    const base64 = btoa(binary);

    const responseHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    return json({
      s: resp.status,
      h: responseHeaders,
      b: base64,
    });
  } catch (err: any) {
    return json({ e: String(err) }, 500);
  }
}

export async function GET() {
  return json({ e: 'Method not allowed. Use POST.' }, 405);
}