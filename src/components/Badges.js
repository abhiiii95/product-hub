import { LISTING_STATUS_LABELS, RESELLER_LISTING_STATUS_LABELS } from '@/lib/constants';

const LISTING_CLASSES = {
  not_started: 'badge',
  in_progress: 'badge badge-info',
  listed: 'badge badge-success',
  needs_changes: 'badge badge-warning',
  paused: 'badge', // reseller tracker only
};

// Shared listing statuses plus the reseller-only "paused".
const LABELS = { ...RESELLER_LISTING_STATUS_LABELS, ...LISTING_STATUS_LABELS };

export function ListingStatusBadge({ status }) {
  return <span className={LISTING_CLASSES[status] || 'badge'}>{LABELS[status] || 'Not Started'}</span>;
}

export function ProductStatusBadge({ status }) {
  return <span className={status === 'active' ? 'badge badge-success' : 'badge'}>{status === 'active' ? 'Active' : 'Inactive'}</span>;
}

export function StockBadge({ product }) {
  if (product.stock === undefined) {
    return <span className={product.inStock ? 'badge badge-success' : 'badge badge-danger'}>{product.inStock ? 'In stock' : 'Out of stock'}</span>;
  }
  if (product.stock <= 0) return <span className="badge badge-danger">Out of stock</span>;
  if (product.isLowStock) return <span className="badge badge-warning">Low: {product.stock}</span>;
  return <span className="badge badge-success">{product.stock} in stock</span>;
}
