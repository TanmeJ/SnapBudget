'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CategoryBadge } from '@/components/ui';
import { formatINR, formatDate } from '@/lib/utils';
import { clearSession, getAuthHeaders, getStoredSession } from '@/lib/auth';
import { CATEGORIES } from '@/types';

const CATEGORY_ICONS: Record<string, string> = {
  food_dining: 'restaurant', groceries: 'shopping_cart', fuel_transport: 'local_taxi',
  healthcare: 'medication', shopping: 'shopping_bag', electronics: 'devices',
  utilities: 'bolt', professional: 'business_center', education: 'school',
  entertainment: 'movie', other: 'receipt',
};

const CATEGORY_COLORS: Record<string, string> = {
  food_dining: 'text-primary', electronics: 'text-tertiary', fuel_transport: 'text-secondary',
  healthcare: 'text-secondary', shopping: 'text-primary', groceries: 'text-secondary',
  utilities: 'text-tertiary', professional: 'text-primary', education: 'text-primary',
  entertainment: 'text-tertiary', other: 'text-outline',
};

const PIE_COLORS = ['#3525cd', '#006e2f', '#7e3000', '#ba1a1a', '#4f46e5', '#4ae176', '#ffb695'];

interface DashboardData {
  total_spend: number;
  receipts_count: number;
  gst_paid: number;
  top_category: { category: string; amount: number; percentage: number } | null;
  avg_per_receipt: number;
  category_breakdown: { category: string; amount: number; percentage: number }[];
  monthly_trend: { month: string; amount: number }[];
  recent_receipts: any[];
  gst_summary: { total_cgst: number; total_sgst: number; total_igst: number; with_gstin: number; without_gstin: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      setError('Your session has expired. Please sign in again.');
      setLoading(false);
      router.replace('/login');
      return;
    }

    fetch('/api/dashboard', {
      headers: getAuthHeaders(session),
    })
      .then(async (res) => {
        if (res.status === 401) {
          clearSession();
          throw new Error('Session expired');
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const detail =
            typeof payload?.detail === 'string' ? `: ${payload.detail}` : '';
          throw new Error(`Dashboard API error ${res.status}${detail}`);
        }
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => {
        if (e.message === 'Session expired') {
          setError('Your session has expired. Please sign in again.');
          router.replace('/login');
        } else {
          setError(e.message);
        }
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <main className="px-6 py-8 md:px-10 animate-fade-in">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-on-surface-variant text-sm">Loading dashboard...</span>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="px-6 py-8 md:px-10 animate-fade-in">
        <div className="bg-error-container rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-error text-3xl mb-2">error</span>
          <p className="text-on-error-container font-medium">Failed to load dashboard</p>
          <p className="text-on-error-container/70 text-sm mt-1">{error}</p>
          <p className="text-on-error-container/70 text-sm mt-2">
            {error?.includes('session')
              ? 'Sign in again to continue.'
              : 'Refresh once. If it persists, check the backend error details above.'}
          </p>
        </div>
      </main>
    );
  }

  if (!data || data.receipts_count === 0) {
    return (
      <main className="px-6 py-8 md:px-10 animate-fade-in pb-28">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-4xl">receipt_long</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface mb-2">No receipts yet</h2>
          <p className="text-on-surface-variant mb-8 max-w-sm">Upload your first receipt to see your spending dashboard come to life.</p>
          <Link href="/upload" className="bg-primary-gradient text-on-primary px-8 py-3 rounded-full font-headline font-bold text-sm uppercase tracking-wider shadow-primary-glow hover:shadow-primary-glow-lg transition-all">
            Upload Receipt
          </Link>
        </div>
      </main>
    );
  }

  const maxBar = data.monthly_trend.length > 0 ? Math.max(...data.monthly_trend.map((d) => d.amount)) : 1;

  // Build pie chart segments
  let pieOffset = 0;
  const pieSegments = data.category_breakdown.slice(0, 6).map((cat, i) => {
    const seg = { ...cat, offset: pieOffset, color: PIE_COLORS[i % PIE_COLORS.length] };
    pieOffset += cat.percentage;
    return seg;
  });

  return (
    <main className="px-6 py-4 md:px-10 md:py-8 space-y-8 animate-fade-in pb-28">
      {/* Bento Header Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Spending */}
        <div className="md:col-span-2 p-8 rounded-xl bg-primary-container text-on-primary-container flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <p className="font-headline text-lg font-medium opacity-90">Total Spending</p>
            <h1 className="font-headline text-5xl md:text-6xl font-extrabold mt-4 tracking-tight">
              <span className="text-on-primary-container/60 font-light">₹</span>{' '}
              {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(data.total_spend)}
            </h1>
            <div className="mt-6 flex items-center gap-4 flex-wrap">
              <span className="bg-on-primary-fixed/10 px-3 py-1 rounded-full text-sm text-secondary-fixed-dim">
                {data.receipts_count} receipts
              </span>
              <span className="bg-on-primary-fixed/10 px-3 py-1 rounded-full text-sm text-secondary-fixed-dim">
                ₹{data.avg_per_receipt.toFixed(0)} avg
              </span>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-primary opacity-20 rounded-full blur-3xl" />
        </div>

        {/* GST Summary */}
        <div className="p-8 rounded-xl bg-surface-container-lowest ghost-border flex flex-col justify-between">
          <div>
            <p className="text-on-surface-variant font-medium">GST Paid</p>
            <h2 className="font-headline text-3xl font-bold mt-2 text-secondary">
              <span className="text-on-surface-variant/40 font-normal">₹</span>{' '}
              {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(data.gst_paid)}
            </h2>
          </div>
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">CGST</span>
              <span className="font-medium">{formatINR(data.gst_summary.total_cgst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">SGST</span>
              <span className="font-medium">{formatINR(data.gst_summary.total_sgst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">IGST</span>
              <span className="font-medium">{formatINR(data.gst_summary.total_igst)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-outline-variant/10">
              <span className="text-on-surface-variant">With GSTIN</span>
              <span className="font-bold text-secondary">{data.gst_summary.with_gstin}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Day */}
        {data.monthly_trend.length > 0 && (
          <div className="p-6 rounded-xl bg-surface-container-lowest ghost-border">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline font-bold text-lg">Spending by Day</h3>
            </div>
            <div className="flex items-end justify-between h-48 px-2">
              {data.monthly_trend.map((day, i) => {
                const height = (day.amount / maxBar) * 100;
                return (
                  <div key={day.month} className="flex flex-col items-center gap-2 flex-1">
                    <span className="text-[10px] text-on-surface-variant font-medium">{formatINR(day.amount)}</span>
                    <div
                      className={`w-8 md:w-10 rounded-t-lg ${i === 0 ? 'bg-primary shadow-lg' : 'bg-primary-container'}`}
                      style={{ height: `${Math.max(height, 5)}%` }}
                    />
                    <span className="text-[10px] font-medium uppercase text-outline">{day.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Category Breakdown */}
        {data.category_breakdown.length > 0 && (
          <div className="p-6 rounded-xl bg-surface-container-lowest ghost-border">
            <h3 className="font-headline font-bold text-lg mb-8">Spending by Category</h3>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#eceef0" strokeWidth="3.5" />
                  {pieSegments.map((seg, i) => (
                    <circle
                      key={seg.category}
                      cx="18" cy="18" r="15.915" fill="transparent"
                      stroke={seg.color} strokeWidth="3.5"
                      strokeDasharray={`${seg.percentage} ${100 - seg.percentage}`}
                      strokeDashoffset={-seg.offset}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase font-bold text-outline">Top</span>
                  <span className="font-headline font-bold text-sm">
                    {CATEGORIES.find((c) => c.id === data.category_breakdown[0]?.category)?.label?.split(' ')[0] || '—'}
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-3 w-full">
                {data.category_breakdown.slice(0, 6).map((cat, i) => {
                  const config = CATEGORIES.find((c) => c.id === cat.category);
                  return (
                    <div key={cat.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-sm font-medium">{config?.label || cat.category}</span>
                      </div>
                      <span className="text-sm font-bold">{cat.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Receipts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-bold text-xl">Recent Receipts</h3>
          <Link href="/upload" className="text-sm font-semibold text-primary px-4 py-2 hover:bg-primary/5 rounded-full transition-colors">
            + Upload
          </Link>
        </div>

        {data.recent_receipts.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center ghost-border">
            <p className="text-on-surface-variant">No receipts scanned yet. Upload one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.recent_receipts.map((r: any) => {
              const icon = CATEGORY_ICONS[r.category] || 'receipt';
              const iconColor = CATEGORY_COLORS[r.category] || 'text-outline';
              return (
                <Link key={r.id} href={`/receipts/${r.id}`}>
                  <div className="group flex flex-wrap items-center justify-between p-5 bg-surface-container-lowest hover:bg-surface-container transition-all duration-300 rounded-xl cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center">
                        <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-on-surface">{r.merchant}</h4>
                        <p className="text-xs text-on-surface-variant">
                          {CATEGORIES.find((c) => c.id === r.category)?.label || r.category}
                          {r.date && ` • ${new Date(r.date).toLocaleDateString('en-IN')}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 mt-4 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                      {r.gst && (
                        <span className="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-wider">GST Paid</span>
                      )}
                      <span className="font-headline text-lg font-bold">{formatINR(r.amount)}</span>
                      <button className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined text-outline">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
