export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        <div className="loading-gold-bar" />

        {/* Title */}
        <div className="skel skel-h" style={{ height: 14, width: 100 }} />
        <div className="skel skel-h" style={{ height: 32, width: 220 }} />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {[90, 70, 100, 70].map((w, i) => (
            <div key={i} className="skel" style={{ height: 36, width: w }} />
          ))}
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" style={{ height: 90 }} />
          ))}
        </div>

        {/* Chart */}
        <div className="skel" style={{ height: 260 }} />

        {/* Table header */}
        <div style={{ display: "flex", gap: 10, padding: "10px 0" }}>
          {[160, 80, 80, 80, 90].map((w, i) => (
            <div key={i} className="skel skel-h" style={{ height: 10, width: w }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 52 }} />
        ))}
      </div>
    </div>
  );
}
