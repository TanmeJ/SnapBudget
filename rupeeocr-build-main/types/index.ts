// RupeeOCR Type Definitions
// Based on PRD v1.0 Field Specifications

export type Category =
  | 'food_dining'
  | 'groceries'
  | 'fuel_transport'
  | 'healthcare'
  | 'shopping'
  | 'electronics'
  | 'utilities'
  | 'professional'
  | 'education'
  | 'entertainment'
  | 'other';

export interface CategoryConfig {
  id: Category;
  label: string;
  color: string;
  bgColor: string;
  keywords: string[];
}

export const CATEGORIES: CategoryConfig[] = [
  { id: 'food_dining', label: 'Food & Dining', color: '#92400E', bgColor: '#FEF3C7', keywords: ['zomato', 'swiggy', 'dominos', 'kfc', 'café', 'restaurant', 'dhaba', 'biryani', 'chai'] },
  { id: 'groceries', label: 'Groceries & FMCG', color: '#065F46', bgColor: '#D1FAE5', keywords: ['dmart', 'bigbasket', 'blinkit', 'zepto', 'kirana', 'grocery', 'atta', 'dal', 'oil', 'masala'] },
  { id: 'fuel_transport', label: 'Fuel & Transport', color: '#1E40AF', bgColor: '#DBEAFE', keywords: ['iocl', 'bpcl', 'hpcl', 'petrol', 'diesel', 'ola', 'uber', 'irctc', 'fastag', 'metro'] },
  { id: 'healthcare', label: 'Healthcare', color: '#0F766E', bgColor: '#CCFBF1', keywords: ['apollo', 'medplus', 'netmeds', 'pharmacy', 'hospital', 'diagnostic', 'lab', 'medicine'] },
  { id: 'shopping', label: 'Shopping & Apparel', color: '#5B21B6', bgColor: '#EDE9FE', keywords: ['myntra', 'ajio', 'meesho', 'lifestyle', 'westside', 'fashion', 'clothing', 'footwear'] },
  { id: 'electronics', label: 'Electronics', color: '#1E40AF', bgColor: '#DBEAFE', keywords: ['croma', 'reliance digital', 'vijay sales', 'boat', 'samsung', 'laptop', 'mobile', 'repair'] },
  { id: 'utilities', label: 'Utilities & Bills', color: '#92400E', bgColor: '#FEF3C7', keywords: ['airtel', 'jio', 'vi', 'bsnl', 'electricity', 'broadband', 'dth', 'recharge', 'bill'] },
  { id: 'professional', label: 'Professional Services', color: '#374151', bgColor: '#F3F4F6', keywords: ['design agency', 'consulting', 'ca', 'chartered', 'solutions', 'pvt ltd', 'audit', 'printing'] },
  { id: 'education', label: 'Education', color: '#1E40AF', bgColor: '#DBEAFE', keywords: ['byjus', 'unacademy', 'school', 'college', 'coaching', 'course fees', 'institute'] },
  { id: 'entertainment', label: 'Entertainment', color: '#9D174D', bgColor: '#FCE7F3', keywords: ['pvr', 'inox', 'bookmyshow', 'netflix', 'gym', 'salon', 'spa', 'oyo', 'hotel', 'resort'] },
  { id: 'other', label: 'Other', color: '#6B7280', bgColor: '#F3F4F6', keywords: [] },
];

// Core Receipt Fields (PRD Section 6.1)
export interface Receipt {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  currency: string; // ISO code, defaults to INR
  date: string; // ISO date string
  category: Category;
  category_confidence: number; // 0-1
  ocr_confidence: number; // 0-100
  extraction_method: 'pymupdf' | 'tesseract' | 'gemini';
  processing_ms: number;
  raw_text: string;
  file_url: string;
  user_verified: boolean;
  created_at: string;
}

// GST Fields (PRD Section 6.2)
export interface ReceiptGST {
  id: string;
  receipt_id: string;
  gstin: string | null; // 15 chars
  gstin_valid: boolean;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  gst_rate: number | null; // 5, 12, 18, 28
  pan: string | null; // 10 chars
  hsn: string | null; // 4-8 digits
  sac: string | null; // 4-6 digits
  invoice_number: string | null;
}

// Combined receipt with GST data
export interface ReceiptWithGST extends Receipt {
  gst?: ReceiptGST;
}

// Line items when extractable
export interface LineItem {
  id: string;
  receipt_id: string;
  qty: number;
  description: string;
  unit_price: number;
  amount: number;
}

// API Response types
export interface ScanResult {
  success: boolean;
  receipt: ReceiptWithGST;
  warnings?: string[];
}

export interface BatchScanResult {
  total: number;
  processed: number;
  failed: number;
  results: ScanResult[];
  total_amount: number;
}

export interface DashboardData {
  total_spend: number;
  receipts_count: number;
  gst_paid: number;
  top_category: { category: Category; amount: number };
  avg_per_receipt: number;
  category_breakdown: { category: Category; amount: number; percentage: number }[];
  monthly_trend: { month: string; amount: number }[];
  recent_receipts: ReceiptWithGST[];
  gst_summary: {
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    with_gstin: number;
    without_gstin: number;
  };
}

// Filter params for receipts list
export interface ReceiptFilters {
  category?: Category[];
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  has_gst?: boolean;
  search?: string;
}

// User type
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  plan: 'free' | 'pro' | 'business';
  created_at: string;
}

// Merchant override for learned preferences
export interface MerchantOverride {
  id: string;
  user_id: string;
  merchant_normalized: string;
  category: Category;
  created_at: string;
}
