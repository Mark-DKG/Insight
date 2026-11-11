export default function StoreNotFound() {
  return (
    <div className="st-panel st-empty">
      <div style={{ fontSize: 17, fontWeight: 700, color: "#1F2937", marginBottom: 6 }}>This page isn't available</div>
      <div>The product or seller may have been removed or is temporarily unavailable.</div>
      <div style={{ marginTop: 14 }}><a className="st-btn" href="/store">Back to Insight Store</a></div>
    </div>
  );
}
