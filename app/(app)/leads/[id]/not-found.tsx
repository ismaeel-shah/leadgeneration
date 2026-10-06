import Link from "next/link";

export default function LeadNotFound() {
  return (
    <div className="card empty-state">
      <h3>Lead not found</h3>
      <p>It may have been deleted, or it belongs to another account.</p>
      <Link className="button primary" href="/leads">Back to pipeline</Link>
    </div>
  );
}
