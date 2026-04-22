export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        <div className="loading-gold-bar" />

        {/* Masthead */}
        <div className="skel skel-h" style={{ height: 11, width: 90 }} />
        <div className="skel skel-h" style={{ height: 40, width: 260 }} />
        <div className="skel skel-h" style={{ height: 13, width: 300 }} />

        {/* Search + sort bar */}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div className="skel" style={{ height: 44, flex: 1, maxWidth: 320 }} />
          <div className="skel" style={{ height: 44, width: 120 }} />
        </div>

        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          {["Dirigeant", "Achats", "Ventes", "Signaux"].map((l) => (
            <div key={l} className="skel skel-h" style={{ height: 10 }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px", gap: 10, alignItems: "center", padding: "4px 0" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="skel skel-r" style={{ width: 32, height: 32, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <div className="skel skel-h" style={{ height: 12, width: "70%" }} />
                <div className="skel skel-h" style={{ height: 9, width: "45%" }} />
              </div>
            </div>
            <div className="skel skel-h" style={{ height: 11 }} />
            <div className="skel skel-h" style={{ height: 11 }} />
            <div className="skel skel-r" style={{ height: 22, width: 50 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
