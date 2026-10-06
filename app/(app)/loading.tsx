export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" style={{ width: "40%" }} />
      <div className="card action-list" style={{ marginTop: 28 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="action-row">
            <div className="skeleton skeleton-avatar" />
            <div style={{ flex: 1, display: "grid", gap: 7 }}>
              <div className="skeleton skeleton-line" style={{ width: "35%" }} />
              <div className="skeleton skeleton-line" style={{ width: "55%" }} />
            </div>
            <div className="skeleton skeleton-button" />
          </div>
        ))}
      </div>
    </div>
  );
}
