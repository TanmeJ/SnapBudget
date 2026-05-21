'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { clearSession, getAuthHeaders, getStoredSession } from '@/lib/auth';
import { formatINR } from '@/lib/utils';
import { CATEGORIES } from '@/types';

const CHART_COLORS = ['#3525cd', '#006e2f', '#7e3000'];

interface DashboardData {
  total_spend: number;
  receipts_count: number;
  gst_paid: number;
  avg_per_receipt: number;
  category_breakdown: { category: string; amount: number; percentage: number }[];
  monthly_trend: { month: string; amount: number }[];
  recent_receipts: Array<{ amount: number }>;
}

function getTrendValue(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const latest = values[values.length - 1] || 0;
  const previous = values[values.length - 2] || 0;
  if (previous === 0) {
    return latest > 0 ? 100 : 0;
  }

  return Math.round(((latest - previous) / previous) * 100);
}

function EmptyAnalyticsState() {
  return (
    <div className="rounded-[28px] bg-surface-container-lowest shadow-ambient p-10 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/8 text-primary">
        <span className="material-symbols-outlined text-4xl">insights</span>
      </div>
      <h2 className="mt-6 font-headline text-3xl font-extrabold text-on-surface">
        No receipts yet. Upload to see insights
      </h2>
      <p className="mt-3 max-w-xl mx-auto text-on-surface-variant">
        Start by scanning your first receipt. Once data comes in, we’ll show spending trends,
        top categories, and stronger monthly insights here.
      </p>
      <Link
        href="/upload"
        className="mt-8 inline-flex items-center justify-center rounded-full bg-primary-gradient px-8 py-4 text-sm font-bold uppercase tracking-wider text-on-primary shadow-primary-glow transition-all hover:shadow-primary-glow-lg"
      >
        Go to Scan
      </Link>
    </div>
  );
}

function InsightCard({
  title,
  value,
  trend,
  icon,
}: {
  title: string;
  value: string;
  trend: number;
  icon: string;
}) {
  const positive = trend >= 0;

  return (
    <div className="rounded-2xl bg-surface-container-lowest p-5 ghost-border">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{title}</span>
        <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
      </div>
      <p className="mt-3 font-headline text-2xl font-extrabold text-on-surface">{value}</p>
      <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? 'bg-secondary-container/30 text-secondary' : 'bg-error-container text-on-error-container'}`}>
        <span className="material-symbols-outlined text-sm">{positive ? 'trending_up' : 'trending_down'}</span>
        {positive ? '+' : ''}
        {trend}%
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      clearSession();
      setLoading(false);
      router.replace('/login');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard`, {
      headers: getAuthHeaders(session),
    })
      .then(async (response) => {
        if (response.status === 401) {
          clearSession();
          router.replace('/login');
          throw new Error('Session expired');
        }

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail || 'Could not load analytics');
        }

        setData(payload);
        setLoading(false);
      })
      .catch((fetchError: Error) => {
        setError(fetchError.message || 'Could not load analytics');
        setLoading(false);
      });
  }, [router]);

  const hasData = Boolean(data && data.receipts_count > 0);

  const monthlyValues = useMemo(
    () => data?.monthly_trend.map((entry) => entry.amount) ?? [],
    [data],
  );
  const spendTrend = getTrendValue(monthlyValues);
  const receiptTrend = getTrendValue(data?.monthly_trend.map((entry) => entry.amount > 0 ? 1 : 0) ?? []);
  const topCategories = (data?.category_breakdown ?? []).slice(0, 3);
  const topCategory = topCategories[0];

  const chartData = topCategories.map((category, index) => ({
    ...category,
    label: CATEGORIES.find((entry) => entry.id === category.category)?.label || category.category,
    color: CHART_COLORS[index],
  }));

  if (loading) {
    return (
      <main className="px-6 py-8 flex justify-center items-center h-64">
        <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 pb-32 space-y-8 animate-fade-in">
      <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-headline text-3xl font-extrabold text-on-surface">Analytics</h2>
          <p className="mt-2 text-on-surface-variant text-lg">
            Clear insights from your scanned receipts.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full bg-surface-container-low px-5 py-3 text-sm font-semibold text-on-surface transition-all hover:bg-surface-container"
        >
          <span className="material-symbols-outlined mr-2 text-lg">download</span>
          Export
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl bg-error-container px-5 py-4 text-on-error-container text-sm">
          {error}
        </div>
      ) : !hasData ? (
        <EmptyAnalyticsState />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <InsightCard title="Total Spend" value={formatINR(data!.total_spend)} trend={spendTrend} icon="payments" />
            <InsightCard title="Receipts" value={String(data!.receipts_count)} trend={receiptTrend} icon="receipt_long" />
            <InsightCard title="Avg / Receipt" value={formatINR(data!.avg_per_receipt)} trend={Math.max(spendTrend - 4, -100)} icon="monitoring" />
            <InsightCard title="GST Logged" value={formatINR(data!.gst_paid)} trend={Math.max(spendTrend - 2, -100)} icon="verified" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl bg-surface-container-lowest p-6 ghost-border">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">Top categories</h3>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Focus on the categories driving most of your spend.
                  </p>
                </div>
                <Link href="/receipts" className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>

              <div className="mt-6 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#777587' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#777587' }} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                    <Tooltip
                      cursor={{ fill: 'rgba(53, 37, 205, 0.05)' }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg bg-inverse-surface px-3 py-2 text-sm text-inverse-on-surface shadow-lg">
                            <p className="font-medium">{payload[0].payload.label}</p>
                            <p className="font-headline font-bold">{formatINR(payload[0].value as number)}</p>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="amount" radius={[10, 10, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.category} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest p-6 ghost-border">
              <h3 className="font-headline text-xl font-bold text-on-surface">Key insight</h3>
              {topCategory ? (
                <>
                  <p className="mt-4 text-3xl font-headline font-extrabold text-on-surface">
                    You spend {topCategory.percentage}% on{' '}
                    {CATEGORIES.find((entry) => entry.id === topCategory.category)?.label || topCategory.category}
                  </p>
                  <p className="mt-4 text-on-surface-variant">
                    This is your highest spend category right now. If you want tighter monthly control,
                    start review and budgeting from here first.
                  </p>

                  <div className="mt-6 space-y-3">
                    {topCategories.map((category, index) => (
                      <div key={category.category} className="rounded-xl bg-surface-container p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index] }} />
                          <span className="font-medium text-on-surface">
                            {CATEGORIES.find((entry) => entry.id === category.category)?.label || category.category}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-on-surface">{formatINR(category.amount)}</p>
                          <p className="text-xs text-on-surface-variant">{category.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-on-surface-variant">No category insights yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest p-6 ghost-border">
            <h3 className="font-headline text-xl font-bold text-on-surface">Monthly movement</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              Track how your scanned receipts are changing over time.
            </p>

            <div className="mt-6 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceef0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#777587' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#777587' }} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    cursor={{ fill: 'rgba(53, 37, 205, 0.05)' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg bg-inverse-surface px-3 py-2 text-sm text-inverse-on-surface shadow-lg">
                          <p className="font-medium">{label}</p>
                          <p className="font-headline font-bold">{formatINR(payload[0].value as number)}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="amount" fill="#3525cd" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
