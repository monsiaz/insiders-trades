export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        <div className="loading-gold-bar" />

        {/* Masthead */}
        <div className="skel skel-h" style={{ height: 11, width: 90 }} />
        <div className="skel skel-h" style={{ height: 40, width: 280 }} />
        <div className="skel skel-h" style={{ height: 13, width: 340 }} />

        {/* Search + filters bar */}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div className="skel" style={{ height: 44, flex: 1, maxWidth: 320 }} />
          {[80, 70, 90, 75].map((w, i) => (
            <div key={i} className="skel skel-r" style={{ height: 36, width: w }} />
          ))}
        </div>

        {/* Cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skel" style={{ height: 120 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
