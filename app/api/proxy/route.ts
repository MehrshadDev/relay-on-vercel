// app/api/proxy/route.ts
export const runtime = 'edge';   // استفاده از Edge Runtime (مشابه Worker)

// تابع کمکی برای پاسخ JSON
function json(obj: any, status: number = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  try {
    // 1. تشخیص لوپ (جلوگیری از درخواست مجدد به خودمان)
    if (request.headers.get('x-relay-hop') === '1') {
      return json({ e: 'loop detected' }, 508);
    }

    // 2. خواندن بدنه JSON
    let req: any;
    try {
      req = await request.json();
    } catch {
      return json({ e: 'invalid json body' }, 400);
    }

    // 3. اعتبارسنجی URL
    if (!req.u || typeof req.u !== 'string') {
      return json({ e: 'missing url' }, 400);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(req.u);
    } catch {
      return json({ e: 'invalid url' }, 400);
    }

    // 4. جلوگیری از self-fetch (درخواست به خودمان)
    const currentHost = new URL(request.url).hostname;
    if (currentHost === targetUrl.hostname) {
      return json({ e: 'self-fetch blocked' }, 400);
    }

    // 5. ساخت هدرهای خروجی
    const headers = new Headers();
    if (req.h && typeof req.h === 'object') {
      for (const [k, v] of Object.entries(req.h)) {
        if (typeof v === 'string') headers.set(k, v);
      }
    }
    headers.set('x-relay-hop', '1');

    // 6. تنظیمات fetch
    const fetchOptions: RequestInit = {
      method: (req.m || 'GET').toUpperCase(),
      headers,
      redirect: req.r === false ? 'manual' : 'follow',
    };

    // 7. اضافه کردن body (در صورت وجود)
    if (req.b && typeof req.b === 'string') {
      const binary = Uint8Array.from(atob(req.b), (c) => c.charCodeAt(0));
      fetchOptions.body = binary;
    }

    // 8. ارسال درخواست به مقصد
    const resp = await fetch(targetUrl.toString(), fetchOptions);

    // 9. خواندن پاسخ به صورت ArrayBuffer
    const buffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // 10. تبدیل به base64 بدون stack overflow (روش امن)
    let binary = '';
    const chunkSize = 0x8000; // 32768 بایت
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      let chunkStr = '';
      for (let j = 0; j < chunk.length; j++) {
        chunkStr += String.fromCharCode(chunk[j]);
      }
      binary += chunkStr;
    }
    const base64 = btoa(binary);

    // 11. استخراج هدرهای پاسخ
    const responseHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    // 12. بازگشت پاسخ نهایی (همان ساختار Worker)
    return json({
      s: resp.status,
      h: responseHeaders,
      b: base64,
    });
  } catch (err: any) {
    return json({ e: String(err) }, 500);
  }
}

// در صورت درخواست GET خطا بدهید
export async function GET() {
  return json({ e: 'Method not allowed. Use POST.' }, 405);
}