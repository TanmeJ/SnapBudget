'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { clearSession, getAuthHeaders, getStoredSession } from '@/lib/auth';
import { formatINR } from '@/lib/utils';
import { CATEGORIES } from '@/types';

export default function ReceiptDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Editable fields
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      setLoading(false);
      router.replace('/login');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipts/${id}`, {
      headers: getAuthHeaders(session),
    })
      .then((r) => {
        if (r.status === 401) {
          clearSession();
          router.replace('/login');
          throw new Error('Unauthorized');
        }
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((d) => {
        setReceipt(d);
        setMerchant(d.merchant);
        setAmount(d.amount.toString());
        setDate(d.date ? d.date.split('T')[0] : '');
        setCategory(d.category);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (!receipt?.file_url) {
      return;
    }

    const session = getStoredSession();
    if (!session) {
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipts/${id}/file`, {
      headers: getAuthHeaders(session),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Receipt file unavailable');
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setFilePreviewUrl(objectUrl);
        }
      })
      .catch(() => setFilePreviewUrl(null));

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, receipt?.file_url]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const session = getStoredSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session),
        },
        body: JSON.stringify({
          merchant,
          amount: parseFloat(amount),
          date: date ? new Date(date).toISOString() : undefined,
          category,
        }),
      });
      if (res.status === 401) {
        clearSession();
        router.replace('/login');
        throw new Error('Unauthorized');
      }
      if (res.ok) {
        const updated = await res.json();
        setReceipt(updated);
        setEditing(false);
      }
    } catch (e) {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this receipt?')) return;
    const session = getStoredSession();
    if (!session) {
      return;
    }

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipts/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(session),
    });
    router.push('/receipts');
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-8 flex justify-center">
        <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </main>
    );
  }

  if (!receipt) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-8 text-center">
        <span className="material-symbols-outlined text-outline text-5xl mb-4">error</span>
        <h2 className="font-headline text-2xl font-bold mb-2">Receipt not found</h2>
        <button onClick={() => router.push('/receipts')} className="text-primary font-semibold mt-4">← Back to receipts</button>
      </main>
    );
  }

  const catConfig = CATEGORIES.find((c) => c.id === (receipt.category || category));

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 pb-32 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-on-surface-variant hover:text-primary mb-4 transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          <span className="text-sm font-medium">Back</span>
        </button>
        <h2 className="font-headline text-3xl font-extrabold text-on-surface mb-2">Verify Scan Results</h2>
        <p className="text-on-surface-variant">Review and edit details before saving.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Receipt Info */}
        <div className="lg:col-span-5">
          <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-ambient sticky top-24">
            <div className="p-4 bg-surface-container-low flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Receipt Status</span>
              <span className="text-xs font-medium text-primary">ID: {receipt.id}</span>
            </div>
            <div className="p-6 space-y-4">
              {filePreviewUrl && receipt.file_content_type?.startsWith('image/') && (
                <img
                  src={filePreviewUrl}
                  alt={receipt.file_name || 'Stored receipt'}
                  className="w-full max-h-[460px] object-contain rounded-lg bg-surface-container"
                />
              )}
              {filePreviewUrl && receipt.file_content_type === 'application/pdf' && (
                <a
                  href={filePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full px-4 py-3 rounded-lg bg-surface-container flex items-center justify-between font-semibold text-primary"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined">picture_as_pdf</span>
                    View stored PDF
                  </span>
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
              )}
              {filePreviewUrl && (
                <a
                  href={filePreviewUrl}
                  download={receipt.file_name || `receipt-${receipt.id}`}
                  className="w-full px-4 py-3 rounded-lg bg-surface-container flex items-center justify-between font-semibold text-primary"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined">download</span>
                    Download original
                  </span>
                  <span className="text-xs text-on-surface-variant truncate max-w-40">
                    {receipt.file_name}
                  </span>
                </a>
              )}
              <div className="rounded-xl bg-surface-container p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary mt-0.5">
                    {receipt.user_verified ? 'verified' : 'edit_note'}
                  </span>
                  <div>
                    <p className="font-semibold text-on-surface">
                      {receipt.user_verified ? 'Receipt verified' : 'Review suggested'}
                    </p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {receipt.user_verified
                        ? 'These receipt details were already reviewed and saved.'
                        : 'Check the merchant, amount, date, and category before saving.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Status</span>
                <span className={`font-bold ${receipt.user_verified ? 'text-secondary' : 'text-primary'}`}>
                  {receipt.user_verified ? 'Verified' : 'Needs review'}
                </span>
              </div>
              {receipt.gst?.gstin && (
                <>
                  <div className="h-px bg-outline-variant/20" />
                  <div>
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">GSTIN</span>
                    <p className="font-mono text-sm mt-1">
                      {receipt.gst.gstin}
                      {receipt.gst.gstin_valid && <span className="ml-2 text-secondary">✓ Valid</span>}
                    </p>
                  </div>
                  {(receipt.gst.cgst || receipt.gst.sgst) && (
                    <div className="flex gap-6">
                      {receipt.gst.cgst != null && <div><span className="text-xs text-on-surface-variant">CGST</span><p className="font-bold">{formatINR(receipt.gst.cgst)}</p></div>}
                      {receipt.gst.sgst != null && <div><span className="text-xs text-on-surface-variant">SGST</span><p className="font-bold">{formatINR(receipt.gst.sgst)}</p></div>}
                      {receipt.gst.igst != null && <div><span className="text-xs text-on-surface-variant">IGST</span><p className="font-bold">{formatINR(receipt.gst.igst)}</p></div>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Editable Data */}
        <div className="lg:col-span-7 space-y-6">
          {/* Merchant */}
          <div className="bg-surface-container-lowest p-8 rounded-xl shadow-ambient">
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Merchant Name</label>
                <input
                  type="text" value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  disabled={!editing}
                  className="w-full text-2xl font-bold font-headline bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 p-3 disabled:bg-transparent disabled:p-0"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Date</label>
                  <input
                    type="date" value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={!editing}
                    className="w-full bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 p-3 font-medium disabled:bg-transparent disabled:p-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Category</label>
                  {editing ? (
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 p-3 font-medium"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1">
                      <span className="px-3.5 py-1.5 rounded-full text-sm font-semibold" style={{ backgroundColor: catConfig?.bgColor, color: catConfig?.color }}>
                        {catConfig?.label || category}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="bg-surface-container-lowest p-8 rounded-xl shadow-ambient">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Total Amount</label>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-medium text-on-surface-variant font-headline">₹</span>
              <input
                type="text" value={editing ? amount : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(parseFloat(amount) || 0)}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                disabled={!editing}
                className="text-5xl font-extrabold font-headline bg-transparent border-none focus:ring-0 p-0 w-full text-on-surface disabled:text-on-surface"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-4">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="flex-1 py-4 px-6 rounded-full font-bold text-on-surface-variant bg-surface-container-high hover:bg-surface-container-highest transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-[2] bg-primary-gradient py-4 px-6 rounded-full font-bold text-white shadow-primary-glow flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : (
                    <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span> Confirm & Save</>
                  )}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="flex-1 py-4 px-6 rounded-full font-bold text-primary bg-surface-container-high hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">edit</span> Edit Details
                </button>
                <button onClick={handleDelete} className="py-4 px-6 rounded-full font-bold text-error bg-error-container hover:bg-error-container/80 transition-colors">
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
