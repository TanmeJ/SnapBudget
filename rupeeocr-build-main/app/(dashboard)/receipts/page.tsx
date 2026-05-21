'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthHeaders, getStoredSession } from '@/lib/auth';
import { formatINR } from '@/lib/utils';
import { CATEGORIES } from '@/types';

const CATEGORY_ICONS: Record<string, string> = {
  food_dining: 'restaurant', groceries: 'shopping_cart', fuel_transport: 'local_taxi',
  healthcare: 'medication', shopping: 'shopping_bag', electronics: 'devices',
  utilities: 'bolt', professional: 'business_center', education: 'school',
  entertainment: 'movie', other: 'receipt',
};

export default function ReceiptsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      setReceipts([]);
      setLoading(false);
      setError('Please sign in to view your receipts.');
      router.replace('/login');
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategory) params.set('category', selectedCategory);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipts?${params}`, {
      headers: getAuthHeaders(session),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail || 'Could not load receipts');
        }
        if (!Array.isArray(payload)) {
          throw new Error('Unexpected receipts response');
        }
        setReceipts(payload);
        setLoading(false);
      })
      .catch((fetchError: Error) => {
        setReceipts([]);
        setError(fetchError.message || 'Could not load receipts');
        setLoading(false);

        if (fetchError.message.toLowerCase().includes('credentials')) {
          router.replace('/login');
        }
      });
  }, [router, search, selectedCategory]);

  const totalAmount = Array.isArray(receipts)
    ? receipts.reduce((sum, receipt) => sum + receipt.amount, 0)
    : 0;

  useEffect(() => {
    return () => {
      if (exportUrl) {
        URL.revokeObjectURL(exportUrl);
      }
    };
  }, [exportUrl]);

  const handleExport = async () => {
    const session = getStoredSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    setExporting(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipts/export.csv`, {
        headers: getAuthHeaders(session),
      });
      if (!response.ok) {
        throw new Error('Could not export receipts');
      }
      const blob = await response.blob();
      setExportUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(blob);
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Could not export receipts');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 pb-32 animate-fade-in">
      {/* Header */}
      <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-3xl font-extrabold text-on-surface mb-2">Receipt Explorer</h2>
          <p className="text-on-surface-variant text-lg">Find transactions across your fiscal history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Prepare receipt data as CSV"
            className="h-11 px-4 rounded-full bg-surface-container-low text-primary font-semibold flex items-center gap-2 hover:bg-surface-container disabled:opacity-60"
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting ? 'Preparing...' : 'Export CSV'}</span>
          </button>
          {exportUrl && (
            <a
              href={exportUrl}
              download="rupeeocr-receipts.csv"
              className="h-11 px-4 rounded-full bg-primary text-on-primary font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined">file_save</span>
              <span>Download CSV</span>
            </a>
          )}
        </div>
      </section>

      {/* Search Bar */}
      <div className="relative mb-6">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
        <input
          type="text"
          placeholder="Search merchant or invoice #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-on-surface-variant/50 font-body"
        />
      </div>

      {/* Category Chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
            !selectedCategory ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          All
        </button>
        {CATEGORIES.filter(c => c.id !== 'other').map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              selectedCategory === cat.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Summary Bar */}
      <div className="flex items-center justify-between mb-6 px-1">
        <span className="text-sm text-on-surface-variant">
          {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
        </span>
        <span className="font-headline font-bold text-on-surface">
          Total: {formatINR(totalAmount)}
        </span>
      </div>

      {/* Receipt List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="material-symbols-outlined text-error text-5xl mb-4">error</span>
          <h3 className="font-headline font-bold text-lg text-on-surface mb-1">Could not load receipts</h3>
          <p className="text-on-surface-variant text-sm mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary-gradient text-on-primary px-6 py-3 rounded-full font-headline font-bold text-sm uppercase tracking-wider shadow-primary-glow"
          >
            Retry
          </button>
        </div>
      ) : receipts.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="material-symbols-outlined text-outline text-5xl mb-4">receipt_long</span>
          <h3 className="font-headline font-bold text-lg text-on-surface mb-1">No receipts found</h3>
          <p className="text-on-surface-variant text-sm mb-6">
            {search ? 'Try a different search term.' : 'Upload your first receipt to get started.'}
          </p>
          <Link href="/upload" className="bg-primary-gradient text-on-primary px-6 py-3 rounded-full font-headline font-bold text-sm uppercase tracking-wider shadow-primary-glow">
            Upload Receipt
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((r: any) => {
            const icon = CATEGORY_ICONS[r.category] || 'receipt';
            const catConfig = CATEGORIES.find((c) => c.id === r.category);
            return (
              <Link key={r.id} href={`/receipts/${r.id}`}>
                <div className="group bg-surface-container-lowest hover:bg-surface-container-low transition-all duration-300 rounded-xl p-5 flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary">{icon}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface">{r.merchant}</h4>
                      <p className="text-xs text-on-surface-variant">
                        {catConfig?.label || r.category}
                        {r.date && ` • ${new Date(r.date).toLocaleDateString('en-IN')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {r.gst && (
                      <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-wider">GST</span>
                    )}
                    <span className="font-headline text-lg font-bold">{formatINR(r.amount)}</span>
                    <span className="material-symbols-outlined text-outline opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
