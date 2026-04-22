export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        <div className="loading-gold-bar" />

        {/* Masthead */}
        <div className="skel skel-h" style={{ height: 11, width: 100 }} />
        <div className="skel skel-h" style={{ height: 36, width: 300 }} />
        <div className="skel skel-h" style={{ height: 13, width: 420 }} />

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" style={{ height: 72 }} />
          ))}
        </div>

        {/* Nav tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {[110, 80, 120, 90, 70, 80].map((w, i) => (
            <div key={i} className="skel" style={{ height: 36, width: w }} />
          ))}
        </div>

        {/* Main panel */}
        <div className="skel" style={{ height: 320 }} />

        {/* Table header */}
        <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          {[160, 60, 90, 90, 70, 80, 80, 80].map((w, i) => (
            <div key={i} className="skel skel-h" style={{ height: 10, width: w }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 46 }} />
        ))}
      </div>
    </div>
  );
}
