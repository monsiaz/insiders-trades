import { NextResponse } from "next/server";

export const revalidate = 3600;

/** Public Swagger UI page. Loads spec from /api/openapi.json. */
export async function GET() {
  const html = /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Insiders Trades Sigma · API Reference</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>
    html, body { margin: 0; padding: 0; background: #FDFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .topbar { display: none; }
    /* Sigma brand bar */
    .sigma-bar {
      background: linear-gradient(90deg, #112A46 0%, #17305C 100%);
      padding: 18px 28px;
      color: #FDFBF7;
      display: flex; align-items: center; gap: 18px;
      border-bottom: 2px solid #B8955A;
    }
    .sigma-bar h1 {
      font-family: 'DM Serif Display', Georgia, serif;
      font-weight: 400; font-size: 1.5rem; letter-spacing: -0.01em; margin: 0;
    }
    .sigma-bar a { color: #B8955A; text-decoration: none; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .sigma-bar a:hover { text-decoration: underline; }
    .sigma-bar .right { margin-left: auto; display: flex; gap: 16px; align-items: center; }
    .sigma-eye {
      width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid #B8955A; display: flex; align-items: center; justify-content: center;
    }
    .sigma-eye::after {
      content: ""; width: 8px; height: 8px; border-radius: 50%; background: #B8955A;
    }
    .swagger-ui { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .swagger-ui .info .title { color: #112A46; }
    .swagger-ui .btn.authorize { background: #B8955A; border-color: #B8955A; color: #0A0C10; }
    .swagger-ui .btn.authorize svg { fill: #0A0C10; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #17305C; }
    .swagger-ui .scheme-container { background: #F4F1EC; box-shadow: none; border-bottom: 1px solid rgba(17,42,70,0.12); }
  </style>
</head>
<body>
  <div class="sigma-bar">
    <div class="sigma-eye" aria-hidden></div>
    <h1>Insiders Trades Sigma · API Reference</h1>
    <div class="right">
      <a href="/fonctionnement">Comment ça marche ↗</a>
      <a href="/methodologie">Méthodologie ↗</a>
      <a href="/account/api-keys">Mes clés API ↗</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        deepLinking: true,
        filter: true,
        persistAuthorization: true,
        defaultModelsExpandDepth: 1,
        defaultModelRendering: 'model',
        tryItOutEnabled: true,
        syntaxHighlight: { activate: true, theme: 'agate' }
      });
    };
  </script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
