export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        <div className="loading-gold-bar" />

        {/* Title */}
        <div className="skel skel-h" style={{ height: 11, width: 110 }} />
        <div className="skel skel-h" style={{ height: 36, width: 260 }} />

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {[70, 60, 80, 65, 90].map((w, i) => (
            <div key={i} className="skel skel-r" style={{ height: 32, width: w }} />
          ))}
        </div>

        {/* Signal cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel" style={{ height: 190 }} />
          ))}
        </div>

        {/* Methodology strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skel" style={{ height: 88 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
