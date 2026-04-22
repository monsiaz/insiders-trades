import { ReactNode } from "react";

export function MethodBadge({ method }: { method: "GET" | "POST" | "DELETE" | "PATCH" }) {
  const colors = {
    GET:    { bg: "rgba(0,158,98,0.12)",   fg: "#009E62", bd: "rgba(0,158,98,0.30)" },
    POST:   { bg: "rgba(184,149,90,0.12)", fg: "#B8955A", bd: "rgba(184,149,90,0.30)" },
    DELETE: { bg: "rgba(200,32,56,0.12)",  fg: "#C82038", bd: "rgba(200,32,56,0.30)" },
    PATCH:  { bg: "rgba(23,48,92,0.12)",   fg: "#17305C", bd: "rgba(23,48,92,0.30)" },
  }[method];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: colors.fg,
        background: colors.bg,
        border: `1px solid ${colors.bd}`,
        borderRadius: "2px",
        verticalAlign: "middle",
      }}
    >
      {method}
    </span>
  );
}

export interface EndpointParam {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description: string;
}

export function Endpoint({
  id,
  method,
  path,
  summary,
  description,
  queryParams,
  pathParams,
  children,
}: {
  id: string;
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  summary: string;
  description?: string;
  queryParams?: EndpointParam[];
  pathParams?: EndpointParam[];
  children?: ReactNode;
}) {
  return (
    <article
      id={id}
      style={{
        scrollMarginTop: "90px",
        padding: "26px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <header style={{ marginBottom: "14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "8px",
          }}
        >
          <MethodBadge method={method} />
          <code
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--tx-1)",
              background: "var(--bg-surface)",
              padding: "4px 9px",
              border: "1px solid var(--border)",
              borderRadius: "2px",
            }}
          >
            {path}
          </code>
        </div>
        <h3
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.2rem, 2.5vw, 1.55rem)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            color: "var(--tx-1)",
            marginTop: "6px",
            lineHeight: 1.25,
          }}
        >
          {summary}
        </h3>
        {description && (
          <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", lineHeight: 1.65, marginTop: "6px" }}>
            {description}
          </p>
        )}
      </header>

      {pathParams && pathParams.length > 0 && (
        <ParamTable title="Paramètres de chemin" params={pathParams} />
      )}
      {queryParams && queryParams.length > 0 && (
        <ParamTable title="Paramètres de requête" params={queryParams} />
      )}

      {children}
    </article>
  );
}

function ParamTable({ title, params }: { title: string; params: EndpointParam[] }) {
  return (
    <div style={{ margin: "14px 0" }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.66rem",
          fontWeight: 700,
          color: "var(--tx-3)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: "6px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
              {["Nom", "Type", "Défaut", "Description"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "7px 12px",
                    textAlign: "left",
                    fontSize: "0.66rem",
                    fontWeight: 700,
                    color: "var(--tx-3)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {params.map((p, i) => (
              <tr key={p.name} style={{ borderBottom: i === params.length - 1 ? "none" : "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                  <code
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.82rem",
                      color: "var(--tx-1)",
                      fontWeight: 600,
                    }}
                  >
                    {p.name}
                  </code>
                  {p.required && (
                    <span
                      style={{
                        marginLeft: "6px",
                        fontSize: "0.62rem",
                        color: "var(--c-crimson)",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      requis
                    </span>
                  )}
                </td>
                <td style={{ padding: "8px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                  <code
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.78rem",
                      color: "var(--gold)",
                    }}
                  >
                    {p.type}
                  </code>
                </td>
                <td style={{ padding: "8px 12px", verticalAlign: "top", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }}>
                  {p.default ?? "·"}
                </td>
                <td style={{ padding: "8px 12px", color: "var(--tx-2)", lineHeight: 1.55 }}>
                  {p.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
