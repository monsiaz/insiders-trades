// Global fallback · shown during cold starts and first page loads
export default function Loading() {
  return (
    <div className="content-wrapper">
      <div className="loading-wrap">
        <div className="loading-gold-bar" />

        <div className="skel skel-h" style={{ height: 11, width: 90 }} />
        <div className="skel skel-h" style={{ height: 36, width: 280 }} />
        <div className="skel skel-h" style={{ height: 13, width: 360 }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" style={{ height: 80 }} />
          ))}
        </div>

        <div className="skel" style={{ height: 240 }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skel" style={{ height: 110 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
