'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loading, ErrorState } from '../Feedback';
import { ListingContent } from '../ListingView';
import MyTracker from './MyTracker';
import { loadTrackersForProduct } from './TrackerBits';
import { api } from '@/lib/client';
import { DEFAULT_MARKETPLACE } from '@/lib/constants';

// Reseller view of a product's listings: the shared content as read-only copy fields
// (no shared status, notes or history) plus their own private tracker.
export default function ResellerListingPanel({ productId }) {
  const [marketplaces, setMarketplaces] = useState([]);
  const [listings, setListings] = useState(null);
  const [trackers, setTrackers] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [active, setActive] = useState(DEFAULT_MARKETPLACE);
  const [error, setError] = useState('');
  const [trackerError, setTrackerError] = useState('');

  const loadTrackers = useCallback(async () => {
    setTrackerError('');
    const res = await loadTrackersForProduct(productId);
    if (res.ok) setTrackers(res.trackers);
    else setTrackerError(res.error);
  }, [productId]);

  const load = useCallback(async () => {
    setError('');
    const [m, l] = await Promise.all([api('/api/marketplaces'), api(`/api/products/${productId}/listings`), loadTrackers()]);
    if (!m.ok || !l.ok) return setError(m.error || l.error);
    setMarketplaces(m.data.marketplaces);
    setListings(l.data.listings);
    setAiEnabled(Boolean(l.data.aiEnabled));
  }, [productId, loadTrackers]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!listings) {
    return (
      <div className="card">
        <Loading label="Loading listing…" />
      </div>
    );
  }

  const marketplace = marketplaces.find((m) => m.key === active) || marketplaces[0];
  const listing = listings.find((l) => l.marketplace === marketplace?.key);
  const defaultMarketplace = marketplaces.find((m) => m.key === DEFAULT_MARKETPLACE) || { key: DEFAULT_MARKETPLACE, name: 'Meesho' };

  return (
    <>
      <div className="card" id="listing">
        <div className="card-header">
          <h2>Listing content</h2>
        </div>
        {marketplaces.length > 1 && (
          <div className="tabs" role="tablist">
            {marketplaces.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={m.key === marketplace.key} onClick={() => setActive(m.key)}>
                {m.name}
              </button>
            ))}
          </div>
        )}
        {listing ? (
          <ListingContent listing={listing} marketplaceName={marketplace.name} />
        ) : (
          <p className="muted">
            Admin ne abhi is product ka {marketplace?.name || 'marketplace'} listing content tayyar nahi kiya. &quot;Product information&quot; se details copy kar sakte ho, ya
            &quot;Mera tracker&quot; mein AI se naya title banao.
          </p>
        )}
      </div>

      {trackerError && <ErrorState message={trackerError} onRetry={loadTrackers} />}
      {!trackerError && !trackers && (
        <div className="card">
          <Loading label="Loading your tracker…" />
        </div>
      )}
      {trackers && (
        <MyTracker
          productId={productId}
          trackers={trackers}
          onChange={setTrackers}
          onReload={loadTrackers}
          aiEnabled={aiEnabled}
          marketplace={defaultMarketplace}
        />
      )}
    </>
  );
}
