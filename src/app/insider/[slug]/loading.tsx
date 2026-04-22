export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        {/* Back link */}
        <div className="skel skel-h" style={{ height: 12, width: 80 }} />

        <div className="loading-gold-bar" />

        {/* Hero card */}
        <div className="skel" style={{ height: 100, padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
          <div className="skel skel-r" style={{ width: 56, height: 56, flexShrink: 0, background: "var(--bg-elevated)" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skel skel-h" style={{ height: 20, width: "50%", background: "var(--bg-elevated)" }} />
            <div style={{ display: "flex", gap: 6 }}>
              {[80, 70, 90].map((w, i) => (
                <div key={i} className="skel skel-r" style={{ height: 22, width: w, background: "var(--bg-elevated)" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 80 }} />
          ))}
        </div>

        {/* Section label */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
          <div className="skel skel-h" style={{ height: 11, width: 140 }} />
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {/* Declaration rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 68 }} />
        ))}
      </div>
    </div>
  );
}
