import React, { useState, useMemo } from 'react';
import {
  Download,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Layers,
  CalendarClock,
  TrendingUp,
  Printer,
  FileText,
  FileDown,
  X,
  FileSpreadsheet,
  Package,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { ProductItem, StockTransaction, SheetDatabaseInfo } from '../types';
import { getExpiryStatus } from '../utils/expiry';

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_FULL_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

// Helper to extract YYYY-MM from transaction timestamp
const parseYearMonth = (rawTimestamp: string): string | null => {
  if (!rawTimestamp) return null;
  const trimmed = rawTimestamp.trim();
  // Match YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})/);
  if (isoMatch) {
    let yyyy = parseInt(isoMatch[1], 10);
    if (yyyy > 2400) yyyy -= 543;
    const mm = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    let yyyy = parseInt(dmyMatch[3], 10);
    if (yyyy > 2400) yyyy -= 543;
    const mm = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
  return null;
};

interface StockReportViewProps {
  products: ProductItem[];
  transactions: StockTransaction[];
  dbInfo: SheetDatabaseInfo | null;
  onNavigateToMovement: (type: 'IN' | 'OUT', sku?: string) => void;
}

type StatusFilter = 'ALL' | 'NORMAL' | 'LOW' | 'OUT' | 'EXPIRING';
type ChartMonthSpan = 6 | 12;

export const StockReportView: React.FC<StockReportViewProps> = ({
  products,
  transactions,
  dbInfo,
  onNavigateToMovement,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [chartSpan, setChartSpan] = useState<ChartMonthSpan>(6);
  const [chartSkuFilter, setChartSkuFilter] = useState<string>('ALL');
  const [showStockInLine, setShowStockInLine] = useState<boolean>(true);
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);

  // Tab View Mode
  type ReportTab = 'MONTHLY_TABLE' | 'ALL_STOCK' | 'TREND_CHART';
  const [activeTab, setActiveTab] = useState<ReportTab>('MONTHLY_TABLE');

  // Monthly Report states (รายงานสรุปยอดยกมาจากเดือนก่อนหน้า, ยอดรับเข้า, ยอดเบิก, ยอดคงเหลือ, มูลค่า)
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlySearchQuery, setMonthlySearchQuery] = useState<string>('');
  type MonthlyMovementFilter = 'ALL' | 'MOVED_ONLY' | 'OUT_OF_STOCK' | 'LOW_STOCK';
  const [monthlyMovementFilter, setMonthlyMovementFilter] = useState<MonthlyMovementFilter>('ALL');
  const [mobileLayout, setMobileLayout] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);

  // Calculate aggregate KPIs
  const metrics = useMemo(() => {
    const totalSku = products.length;
    const totalUnits = Number(products.reduce((acc, p) => acc + p.currentStock, 0).toFixed(2));
    const totalValuation = Number(
      products.reduce((acc, p) => acc + p.currentStock * p.unitPrice, 0).toFixed(2)
    );
    const lowStockItems = products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStock);
    const outOfStockItems = products.filter((p) => p.currentStock <= 0);
    const expiringItems = products.filter((p) => {
      if (p.currentStock <= 0) return false;
      const st = getExpiryStatus(p.expiryDate).status;
      return st === 'EXPIRING_SOON' || st === 'EXPIRED';
    });
    return {
      totalSku,
      totalUnits,
      totalValuation,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      expiringCount: expiringItems.length,
      alertCount: lowStockItems.length + outOfStockItems.length,
    };
  }, [products]);

  // Category Breakdown
  const categorySummary = useMemo(() => {
    const map = new Map<string, { category: string; skuCount: number; unitCount: number; valuation: number }>();
    products.forEach((p) => {
      const cat = p.category || 'ทั่วไป';
      const current = map.get(cat) || { category: cat, skuCount: 0, unitCount: 0, valuation: 0 };
      current.skuCount += 1;
      current.unitCount += p.currentStock;
      current.valuation += p.currentStock * p.unitPrice;
      map.set(cat, current);
    });
    return Array.from(map.values()).sort((a, b) => b.valuation - a.valuation);
  }, [products]);

  // Monthly Stock Withdrawal & Movement Trend from Transactions
  const monthlyTrendData = useMemo(() => {
    // Determine latest reference date (either current date or latest transaction date)
    let anchorDate = new Date();
    for (const tx of transactions) {
      const ym = parseYearMonth(tx.timestamp);
      if (ym) {
        const [y, m] = ym.split('-').map(Number);
        const txDate = new Date(y, m - 1, 1);
        if (txDate > anchorDate) {
          anchorDate = txDate;
        }
      }
    }

    // Generate continuous N-month buckets ending at anchorDate
    const buckets: Array<{
      key: string;
      label: string;
      fullLabel: string;
      outQty: number;
      inQty: number;
      outTxCount: number;
      inTxCount: number;
    }> = [];

    const bucketMap = new Map<string, (typeof buckets)[0]>();

    for (let i = chartSpan - 1; i >= 0; i--) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mmIndex = d.getMonth();
      const key = `${yyyy}-${String(mmIndex + 1).padStart(2, '0')}`;
      const thaiYearShort = String((yyyy + 543) % 100).padStart(2, '0');
      const label = `${THAI_SHORT_MONTHS[mmIndex]} ${thaiYearShort}`;
      const fullLabel = `${THAI_SHORT_MONTHS[mmIndex]} ${yyyy + 543} (${key})`;
      const item = {
        key,
        label,
        fullLabel,
        outQty: 0,
        inQty: 0,
        outTxCount: 0,
        inTxCount: 0,
      };
      buckets.push(item);
      bucketMap.set(key, item);
    }

    // Aggregate transactions into monthly buckets
    transactions.forEach((tx) => {
      if (chartSkuFilter !== 'ALL' && tx.sku !== chartSkuFilter) return;
      const ym = parseYearMonth(tx.timestamp);
      if (!ym) return;
      const bucket = bucketMap.get(ym);
      if (!bucket) return;

      if (tx.type === 'OUT') {
        bucket.outQty = Number((bucket.outQty + tx.quantity).toFixed(2));
        bucket.outTxCount += 1;
      } else if (tx.type === 'IN') {
        bucket.inQty = Number((bucket.inQty + tx.quantity).toFixed(2));
        bucket.inTxCount += 1;
      }
    });

    const totalOutInPeriod = Number(
      buckets.reduce((sum, b) => sum + b.outQty, 0).toFixed(2)
    );
    const totalInInPeriod = Number(
      buckets.reduce((sum, b) => sum + b.inQty, 0).toFixed(2)
    );
    const maxVal = Math.max(
      1,
      ...buckets.map((b) => Math.max(b.outQty, showStockInLine ? b.inQty : 0))
    );
    const peakOutBucket = buckets.reduce(
      (best, cur) => (cur.outQty > best.outQty ? cur : best),
      buckets[0]
    );

    return {
      buckets,
      totalOutInPeriod,
      totalInInPeriod,
      maxVal,
      peakOutBucket,
    };
  }, [transactions, chartSpan, chartSkuFilter, showStockInLine]);

  // Filtered Balance Rows
  const filteredRows = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter === 'NORMAL' && p.currentStock <= p.minStock) return false;
      if (statusFilter === 'LOW' && (p.currentStock <= 0 || p.currentStock > p.minStock)) return false;
      if (statusFilter === 'OUT' && p.currentStock > 0) return false;
      if (statusFilter === 'EXPIRING') {
        const st = getExpiryStatus(p.expiryDate).status;
        if (p.currentStock <= 0 || (st !== 'EXPIRING_SOON' && st !== 'EXPIRED')) return false;
      }

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        (p.seller && p.seller.toLowerCase().includes(q)) ||
        (p.expiryDate && p.expiryDate.toLowerCase().includes(q))
      );
    });
  }, [products, statusFilter, searchQuery]);

  // Export CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'รหัส SKU',
      'ชื่อสินค้า',
      'หมวดหมู่',
      'คลังจัดเก็บ',
      'ชื่อผู้ขาย',
      'วันหมดอายุ',
      'ราคาต่อหน่วย (บาท)',
      'คงเหลือ',
      'หน่วยนับ',
      'จุดสั่งซื้อขั้นต่ำ',
      'มูลค่ารวม (บาท)',
      'สถานะสต๊อก',
      'อัปเดตล่าสุด',
    ];

    const rows = filteredRows.map((p) => {
      const statusText =
        p.currentStock <= 0
          ? 'สินค้าหมดสต๊อก'
          : p.currentStock <= p.minStock
          ? 'ต่ำกว่าจุดสั่งซื้อ'
          : 'ปกติ';
      const totalVal = p.currentStock * p.unitPrice;
      const sellerName = p.seller || '-';
      const expiryStr = p.expiryDate || '-';
      return [
        `"${p.sku.replace(/"/g, '""')}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category.replace(/"/g, '""')}"`,
        `"${p.location.replace(/"/g, '""')}"`,
        `"${sellerName.replace(/"/g, '""')}"`,
        `"${expiryStr.replace(/"/g, '""')}"`,
        p.unitPrice,
        p.currentStock,
        `"${p.unit}"`,
        p.minStock,
        totalVal,
        `"${statusText}"`,
        `"${p.updatedAt}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_balance_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Available Months for Monthly Report (sorted newest first)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

    transactions.forEach((tx) => {
      const ym = parseYearMonth(tx.timestamp);
      if (ym) set.add(ym);
    });

    const sorted = Array.from(set).sort().reverse();
    return sorted.map((ym) => {
      const [yStr, mStr] = ym.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const thaiYear = y + 543;
      const monthName = THAI_FULL_MONTHS[m - 1] || mStr;
      return {
        key: ym,
        label: `${monthName} ${thaiYear}`,
        year: y,
        month: m,
      };
    });
  }, [transactions]);

  // Monthly Report Calculations (ยอดยกมาจากเดือนก่อนหน้า 1 เดือน, ยอดรับเข้า, ยอดเบิก, ยอดคงเหลือ, มูลค่า)
  const monthlyReport = useMemo(() => {
    const isAll = selectedReportMonth === 'ALL';

    let prevMonthLabel = 'งวดก่อนหน้า';
    let prevMonthShort = 'ก่อนหน้า';
    if (!isAll) {
      const [yStr, mStr] = selectedReportMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const prevDate = new Date(y, m - 2, 1);
      const prevY = prevDate.getFullYear();
      const prevM = prevDate.getMonth() + 1;
      const prevThaiYear = prevY + 543;
      const prevMonthName = THAI_FULL_MONTHS[prevM - 1] || `${prevM}`;
      prevMonthShort = `${THAI_SHORT_MONTHS[prevM - 1]} ${String(prevThaiYear % 100).padStart(2, '0')}`;
      prevMonthLabel = `${prevMonthName} ${prevThaiYear}`;
    }

    const items = products.map((p) => {
      const txList = transactions.filter((t) => t.sku === p.sku);

      let broughtForward = 0;
      let inQty = 0;
      let outQty = 0;
      let endingStock = 0;

      if (isAll) {
        txList.forEach((tx) => {
          if (tx.type === 'IN') inQty += tx.quantity;
          else if (tx.type === 'OUT') outQty += tx.quantity;
        });
        endingStock = p.currentStock;
        broughtForward = Math.max(0, Number((endingStock - inQty + outQty).toFixed(2)));
      } else {
        let afterIn = 0;
        let afterOut = 0;

        txList.forEach((tx) => {
          const ym = parseYearMonth(tx.timestamp);
          if (!ym) return;
          if (ym > selectedReportMonth) {
            if (tx.type === 'IN') afterIn += tx.quantity;
            else if (tx.type === 'OUT') afterOut += tx.quantity;
          } else if (ym === selectedReportMonth) {
            if (tx.type === 'IN') inQty += tx.quantity;
            else if (tx.type === 'OUT') outQty += tx.quantity;
          }
        });

        endingStock = Math.max(0, Number((p.currentStock - afterIn + afterOut).toFixed(2)));
        broughtForward = Math.max(0, Number((endingStock - inQty + outQty).toFixed(2)));
      }

      const roundedBroughtForward = Number(broughtForward.toFixed(2));
      const roundedIn = Number(inQty.toFixed(2));
      const roundedOut = Number(outQty.toFixed(2));
      const roundedEnding = Number(endingStock.toFixed(2));
      const valuation = Number((roundedEnding * p.unitPrice).toFixed(2));

      return {
        sku: p.sku,
        name: p.name,
        category: p.category,
        location: p.location,
        unit: p.unit,
        unitPrice: p.unitPrice,
        minStock: p.minStock,
        broughtForward: roundedBroughtForward,
        inQty: roundedIn,
        outQty: roundedOut,
        endingStock: roundedEnding,
        valuation,
      };
    });

    let inCount = 0;
    let outCount = 0;
    transactions.forEach((tx) => {
      const ym = parseYearMonth(tx.timestamp);
      if (isAll || ym === selectedReportMonth) {
        if (tx.type === 'IN') inCount += 1;
        else if (tx.type === 'OUT') outCount += 1;
      }
    });

    const totalBroughtForward = Number(
      items.reduce((acc, it) => acc + it.broughtForward, 0).toFixed(2)
    );
    const totalInQty = Number(
      items.reduce((acc, it) => acc + it.inQty, 0).toFixed(2)
    );
    const totalOutQty = Number(
      items.reduce((acc, it) => acc + it.outQty, 0).toFixed(2)
    );
    const totalStockQty = Number(
      items.reduce((acc, it) => acc + it.endingStock, 0).toFixed(2)
    );
    const totalValuation = Number(
      items.reduce((acc, it) => acc + it.valuation, 0).toFixed(2)
    );

    const movedItemCount = items.filter((it) => it.inQty > 0 || it.outQty > 0).length;
    const lowStockMonthlyCount = items.filter(
      (it) => it.endingStock > 0 && it.endingStock <= it.minStock
    ).length;
    const outOfStockMonthlyCount = items.filter((it) => it.endingStock <= 0).length;

    const activeMonthObj = availableMonths.find((m) => m.key === selectedReportMonth);

    return {
      selectedMonthLabel: isAll
        ? 'ทุกเดือนสะสม (All Periods)'
        : activeMonthObj?.label || selectedReportMonth,
      prevMonthLabel,
      prevMonthShort,
      items,
      totalBroughtForward,
      totalInQty,
      totalOutQty,
      totalStockQty,
      totalValuation,
      inCount,
      outCount,
      movedItemCount,
      lowStockMonthlyCount,
      outOfStockMonthlyCount,
    };
  }, [selectedReportMonth, transactions, products, availableMonths]);

  // Month navigation helpers (availableMonths is sorted newest first)
  const handlePrevMonth = () => {
    const currentIdx = availableMonths.findIndex((m) => m.key === selectedReportMonth);
    if (currentIdx < availableMonths.length - 1 && currentIdx >= 0) {
      setSelectedReportMonth(availableMonths[currentIdx + 1].key);
    }
  };

  const handleNextMonth = () => {
    const currentIdx = availableMonths.findIndex((m) => m.key === selectedReportMonth);
    if (currentIdx > 0) {
      setSelectedReportMonth(availableMonths[currentIdx - 1].key);
    }
  };

  // Filtered Monthly Items based on monthly search query and movement filter
  const filteredMonthlyItems = useMemo(() => {
    let list = monthlyReport.items;

    if (monthlyMovementFilter === 'MOVED_ONLY') {
      list = list.filter((item) => item.inQty > 0 || item.outQty > 0);
    } else if (monthlyMovementFilter === 'OUT_OF_STOCK') {
      list = list.filter((item) => item.endingStock <= 0);
    } else if (monthlyMovementFilter === 'LOW_STOCK') {
      list = list.filter((item) => item.endingStock > 0 && item.endingStock <= item.minStock);
    }

    if (monthlySearchQuery.trim()) {
      const q = monthlySearchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q)
      );
    }

    return list;
  }, [monthlyReport.items, monthlyMovementFilter, monthlySearchQuery]);

  // Export Monthly Summary as CSV
  const handleExportMonthlyCsv = () => {
    const headers = [
      'ลำดับ',
      'รหัส SKU',
      'ชื่อสินค้า',
      'หมวดหมู่',
      'หน่วยนับ',
      `ยอดยกมาจากเดือนก่อนหน้า 1 เดือน (${monthlyReport.prevMonthLabel})`,
      'ยอดรับเข้าในงวด',
      'ยอดเบิกออกในงวด',
      'ยอดคงเหลือประจำเดือน',
      'ราคาต่อหน่วย (บาท)',
      'มูลค่าคงเหลือ (บาท)',
      'สถานะสินค้า',
    ];

    const dataRows = monthlyReport.items.map((p, idx) => {
      const statusText =
        p.endingStock <= 0
          ? 'สินค้าหมดสต๊อก'
          : p.endingStock <= p.minStock
          ? 'ต่ำกว่าจุดสั่งซื้อ'
          : 'ปกติ';
      return [
        idx + 1,
        `"${p.sku.replace(/"/g, '""')}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category.replace(/"/g, '""')}"`,
        `"${p.unit}"`,
        p.broughtForward,
        p.inQty,
        p.outQty,
        p.endingStock,
        p.unitPrice,
        p.valuation,
        `"${statusText}"`,
      ].join(',');
    });

    const summaryRow = [
      '"รวมทั้งหมด"',
      '""',
      '""',
      '""',
      '""',
      monthlyReport.totalBroughtForward,
      monthlyReport.totalInQty,
      monthlyReport.totalOutQty,
      monthlyReport.totalStockQty,
      '""',
      monthlyReport.totalValuation,
      '""',
    ].join(',');

    const titleBlock = [
      `"รายงานสรุปยอดยกมาจากเดือนก่อนหน้า ยอดรับเข้า ยอดเบิก ยอดคงเหลือ และมูลค่าสินค้าประจำเดือน"`,
      `"ประจำงวด: ${monthlyReport.selectedMonthLabel}"`,
      `"ยอดยกมาจากเดือนก่อนหน้า: ${monthlyReport.prevMonthLabel}"`,
      `"วันที่ออกรายงาน: ${new Date().toLocaleString('th-TH')}"`,
      `"คลังสินค้า: Cupertino Stock Database (เชื่อมต่อ Google Sheets)"`,
      `"ยอดยกมารวม: ${monthlyReport.totalBroughtForward.toLocaleString()} หน่วย"`,
      `"ยอดรับเข้ารวม: ${monthlyReport.totalInQty.toLocaleString()} หน่วย (${monthlyReport.inCount} ครั้ง)"`,
      `"ยอดเบิกออกรวม: ${monthlyReport.totalOutQty.toLocaleString()} หน่วย (${monthlyReport.outCount} ครั้ง)"`,
      `"ยอดคงเหลือรวม: ${monthlyReport.totalStockQty.toLocaleString()} หน่วย (มูลค่าคงเหลือรวม ฿${monthlyReport.totalValuation.toLocaleString()})"`,
      `""`,
    ].join('\n');

    const csvContent =
      '\uFEFF' + titleBlock + '\n' + [headers.join(','), ...dataRows, summaryRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `monthly_stock_summary_${selectedReportMonth || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">
            รายงานสินค้าคงเหลือ (Stock Balance Report)
          </h1>
          <p className="text-xs text-[#6E6E73] mt-1">
            สรุปยอดรับเข้า, ยอดเบิก, ยอดคงเหลือประจำเดือน พร้อมระบบส่งออกรายงานเป็น PDF และ CSV อัตโนมัติ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {dbInfo?.spreadsheetUrl && (
            <a
              href={dbInfo.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1D1D1F] bg-white border border-[#E5E5EA] hover:bg-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#0071E3]" />
              <span className="hidden sm:inline">เปิดใน Google Sheets</span>
              <span className="sm:hidden">Google Sheets</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setIsPdfModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs min-h-[40px]"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์ / PDF รายเดือน</span>
          </button>
          <button
            type="button"
            onClick={handleExportMonthlyCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1D1D1F] bg-white border border-[#E5E5EA] hover:bg-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
          >
            <FileDown className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>CSV รายเดือน</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#6E6E73] hover:text-[#1D1D1F] bg-white border border-[#E5E5EA] hover:bg-[#F5F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV สต๊อกรวม</span>
          </button>
        </div>
      </div>

      {/* 3 View Mode Segmented Controls */}
      <div className="flex items-center gap-1.5 p-1 bg-[#F5F5F7] rounded-2xl border border-[#E5E5EA] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('MONTHLY_TABLE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'MONTHLY_TABLE'
              ? 'bg-white text-[#0071E3] shadow-xs'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-[#0071E3]" />
          <span>ตารางสรุปรายเดือน (ยอดยกมา · รับเข้า · เบิก · คงเหลือ · มูลค่า)</span>
          <span className="px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-bold">
            {monthlyReport.selectedMonthLabel}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ALL_STOCK')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'ALL_STOCK'
              ? 'bg-white text-[#1D1D1F] shadow-xs'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <Package className="w-4 h-4 text-[#6E6E73]" />
          <span>รายการสต๊อกคงเหลือปัจจุบัน ({products.length} รายการ)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TREND_CHART')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'TREND_CHART'
              ? 'bg-white text-[#1D1D1F] shadow-xs'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-[#D97706]" />
          <span>กราฟแนวโน้มการเบิก & สัดส่วนหมวดหมู่</span>
        </button>
      </div>

      {/* TAB 1: ตารางสรุปรายเดือน (Monthly Inflow, Outflow, Balance & Valuation Table) */}
      {activeTab === 'MONTHLY_TABLE' && (
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5 space-y-5 shadow-xs">
          {/* Month Stepper & Export Hub */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-[#E5E5EA]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#0071E3]" />
                <h2 className="text-base font-bold text-[#1D1D1F]">
                  ตารางสรุปยอดรับเข้า, ยอดเบิก, ยอดคงเหลือ ประจำเดือน
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-xs font-bold">
                  {monthlyReport.selectedMonthLabel}
                </span>
              </div>
              <p className="text-xs text-[#6E6E73] mt-1">
                สรุปภาพรวมบัญชีสต๊อก: เปรียบเทียบยอดยกมาจากสิ้นเดือน <strong className="text-[#1D1D1F]">{monthlyReport.prevMonthLabel}</strong> กับยอดรับเข้า ยอดเบิก ยอดคงเหลือ และมูลค่าสินค้าสิ้นงวด
              </p>
            </div>

            {/* Stepper & Selector */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Stepper Buttons */}
              <div className="inline-flex items-center p-0.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA]">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="เดือนก่อนหน้า"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#1D1D1F] hover:bg-white hover:shadow-xs transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">เดือนก่อน</span>
                </button>
                <div className="h-4 w-px bg-[#E5E5EA]" />
                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="เดือนถัดไป"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#1D1D1F] hover:bg-white hover:shadow-xs transition-colors cursor-pointer"
                >
                  <span className="hidden sm:inline">เดือนถัดไป</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Month Dropdown */}
              <select
                value={selectedReportMonth}
                onChange={(e) => setSelectedReportMonth(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] text-xs font-semibold text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] cursor-pointer min-h-[38px]"
              >
                <option value="ALL">ทุกเดือนสะสม (All Periods)</option>
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key}>
                    ประจำเดือน {m.label}
                  </option>
                ))}
              </select>

              {/* Quick Export Actions */}
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors whitespace-nowrap cursor-pointer shadow-xs min-h-[38px]"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>พิมพ์ / PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportMonthlyCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] border border-[#E5E5EA] transition-colors whitespace-nowrap cursor-pointer min-h-[38px]"
              >
                <FileDown className="w-3.5 h-3.5 text-[#16A34A]" />
                <span>ส่งออก CSV</span>
              </button>
            </div>
          </div>

          {/* Visual Accounting Balance Equation Strip */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA]">
            <div className="text-[11px] font-semibold text-[#6E6E73] mb-2">
              สูตรการคำนวณสมดุลสต๊อกประจำงวด (Stock Balance Equation):
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
              <div className="px-3 py-1.5 rounded-lg bg-white border border-[#E5E5EA] shadow-2xs font-mono-tabular">
                <span className="text-[#6E6E73] text-[11px] block">ยอดยกมา ({monthlyReport.prevMonthShort})</span>
                <strong className="text-[#1D1D1F] text-sm">
                  {monthlyReport.totalBroughtForward.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </strong>{' '}
                <span className="text-[11px] text-[#6E6E73]">หน่วย</span>
              </div>

              <span className="w-5 h-5 rounded-full bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center font-bold text-sm shrink-0">
                +
              </span>

              <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 shadow-2xs font-mono-tabular">
                <span className="text-emerald-700 text-[11px] block">ยอดรับเข้าในงวด</span>
                <strong className="text-emerald-700 text-sm">
                  +{monthlyReport.totalInQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </strong>{' '}
                <span className="text-[11px] text-emerald-600">หน่วย ({monthlyReport.inCount} ครั้ง)</span>
              </div>

              <span className="w-5 h-5 rounded-full bg-[#D97706]/10 text-[#D97706] flex items-center justify-center font-bold text-sm shrink-0">
                -
              </span>

              <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 shadow-2xs font-mono-tabular">
                <span className="text-amber-700 text-[11px] block">ยอดเบิกออกในงวด</span>
                <strong className="text-amber-700 text-sm">
                  -{monthlyReport.totalOutQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </strong>{' '}
                <span className="text-[11px] text-amber-600">หน่วย ({monthlyReport.outCount} ครั้ง)</span>
              </div>

              <span className="w-5 h-5 rounded-full bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center font-bold text-sm shrink-0">
                =
              </span>

              <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 shadow-2xs font-mono-tabular">
                <span className="text-blue-700 text-[11px] block">ยอดคงเหลือสิ้นงวด</span>
                <strong className="text-blue-700 text-sm">
                  {monthlyReport.totalStockQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </strong>{' '}
                <span className="text-[11px] text-blue-600">หน่วย</span>
              </div>

              <div className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-[#E5E5EA] shadow-2xs font-mono-tabular">
                <span className="text-[#6E6E73] text-[11px] block">มูลค่าคงคลังรวม</span>
                <strong className="text-[#1D1D1F] text-sm">
                  ฿{monthlyReport.totalValuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
          </div>

          {/* 5 Summary Metric Cards for Selected Month */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA]">
              <div className="text-[11px] font-medium text-[#6E6E73]">
                ยอดยกมาจากเดือนก่อน
              </div>
              <div className="text-lg md:text-xl font-mono-tabular font-bold text-[#1D1D1F] mt-1">
                {monthlyReport.totalBroughtForward.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-xs font-normal text-[#6E6E73]">หน่วย</span>
              </div>
              <div className="text-[10px] text-[#6E6E73] mt-0.5 truncate">สิ้นเดือน {monthlyReport.prevMonthShort}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#16A34A]/5 border border-[#16A34A]/20">
              <div className="text-[11px] font-medium text-[#16A34A]">
                ยอดรับเข้ารวม ({monthlyReport.inCount} ครั้ง)
              </div>
              <div className="text-lg md:text-xl font-mono-tabular font-bold text-[#16A34A] mt-1">
                +{monthlyReport.totalInQty.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-xs font-normal">หน่วย</span>
              </div>
              <div className="text-[10px] text-[#6E6E73] mt-0.5 truncate">{monthlyReport.selectedMonthLabel}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#D97706]/5 border border-[#D97706]/20">
              <div className="text-[11px] font-medium text-[#D97706]">
                ยอดเบิกออกรวม ({monthlyReport.outCount} ครั้ง)
              </div>
              <div className="text-lg md:text-xl font-mono-tabular font-bold text-[#D97706] mt-1">
                -{monthlyReport.totalOutQty.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-xs font-normal">หน่วย</span>
              </div>
              <div className="text-[10px] text-[#6E6E73] mt-0.5 truncate">{monthlyReport.selectedMonthLabel}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0071E3]/5 border border-[#0071E3]/20">
              <div className="text-[11px] font-medium text-[#0071E3]">
                ยอดคงเหลือประจำงวด
              </div>
              <div className="text-lg md:text-xl font-mono-tabular font-bold text-[#0071E3] mt-1">
                {monthlyReport.totalStockQty.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-xs font-normal">หน่วย</span>
              </div>
              <div className="text-[10px] text-[#6E6E73] mt-0.5">{products.length} รายการสินค้า</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] col-span-2 sm:col-span-1">
              <div className="text-[11px] font-medium text-[#6E6E73]">
                มูลค่าสินค้าคงคลังรวม
              </div>
              <div className="text-lg md:text-xl font-mono-tabular font-bold text-[#1D1D1F] mt-1">
                ฿{monthlyReport.totalValuation.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-[10px] text-[#6E6E73] mt-0.5 truncate">ราคาประเมินสิ้นงวด</div>
            </div>
          </div>

          {/* Table Filters & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-[#E5E5EA]">
            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 p-1 bg-[#F5F5F7] rounded-xl overflow-x-auto">
              {[
                { id: 'ALL', label: `สินค้าทั้งหมด (${monthlyReport.items.length})` },
                {
                  id: 'MOVED_ONLY',
                  label: `มีการเคลื่อนไหว (${monthlyReport.movedItemCount})`,
                },
                {
                  id: 'LOW_STOCK',
                  label: `ควรสั่งเพิ่ม (${monthlyReport.lowStockMonthlyCount})`,
                },
                {
                  id: 'OUT_OF_STOCK',
                  label: `สินค้าหมด (${monthlyReport.outOfStockMonthlyCount})`,
                },
              ].map((tab) => {
                const active = monthlyMovementFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMonthlyMovementFilter(tab.id as MonthlyMovementFilter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-white text-[#1D1D1F] shadow-xs'
                        : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Search + Mobile Layout Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-[#6E6E73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={monthlySearchQuery}
                  onChange={(e) => setMonthlySearchQuery(e.target.value)}
                  placeholder="ค้นหา SKU, ชื่อ, หรือคลัง..."
                  className="w-full pl-8 pr-7 py-1.5 bg-[#F5F5F7] rounded-xl text-xs text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
                {monthlySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMonthlySearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6E6E73] hover:text-[#1D1D1F] p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Mobile Table/Cards Toggle */}
              <div className="inline-flex md:hidden items-center p-0.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA]">
                <button
                  type="button"
                  onClick={() => setMobileLayout('TABLE')}
                  title="แสดงแบบตาราง"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    mobileLayout === 'TABLE' ? 'bg-white text-[#1D1D1F] shadow-xs' : 'text-[#6E6E73]'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileLayout('CARDS')}
                  title="แสดงแบบการ์ด"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    mobileLayout === 'CARDS' ? 'bg-white text-[#1D1D1F] shadow-xs' : 'text-[#6E6E73]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Cards View (Optional on small screens) */}
          {mobileLayout === 'CARDS' ? (
            <div className="md:hidden space-y-3 pt-1">
              {filteredMonthlyItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#6E6E73] bg-[#F5F5F7] rounded-xl">
                  ไม่พบรายการสินค้าตามเงื่อนไขที่เลือก
                </div>
              ) : (
                filteredMonthlyItems.map((item, idx) => {
                  const isOut = item.endingStock <= 0;
                  const isLow = !isOut && item.endingStock <= item.minStock;

                  return (
                    <div
                      key={item.sku}
                      className="p-4 rounded-xl border border-[#E5E5EA] bg-white space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-mono-tabular font-bold text-[#0071E3]">
                              #{idx + 1} {item.sku}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#F5F5F7] text-[#6E6E73]">
                              {item.category}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-[#1D1D1F] mt-0.5">{item.name}</h4>
                          <div className="text-[10px] text-[#6E6E73] mt-0.5">{item.location}</div>
                        </div>

                        <div>
                          {isOut ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#DC2626]/10 text-[#DC2626]">
                              <XCircle className="w-3 h-3" />
                              <span>หมด</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D97706]/10 text-[#D97706]">
                              <AlertTriangle className="w-3 h-3" />
                              <span>สั่งเพิ่ม</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#16A34A]/10 text-[#16A34A]">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ปกติ</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Movement Flow Sequence */}
                      <div className="grid grid-cols-4 gap-1.5 p-2 rounded-lg bg-[#F5F5F7] text-center text-xs font-mono-tabular">
                        <div>
                          <span className="text-[10px] text-[#6E6E73] block truncate">ยอดยกมา</span>
                          <span className="font-semibold text-[#1D1D1F] text-xs">
                            {item.broughtForward.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-700 block truncate">รับเข้า (+)</span>
                          <span className="font-semibold text-emerald-700 text-xs">
                            {item.inQty > 0 ? `+${item.inQty}` : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-amber-700 block truncate">เบิกออก (-)</span>
                          <span className="font-semibold text-amber-700 text-xs">
                            {item.outQty > 0 ? `-${item.outQty}` : '-'}
                          </span>
                        </div>
                        <div className="bg-blue-100/60 rounded-md py-0.5">
                          <span className="text-[10px] text-blue-700 font-semibold block truncate">คงเหลือ</span>
                          <span className="font-bold text-blue-700 text-xs">
                            {item.endingStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Price & Valuation */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E5E5EA] font-mono-tabular">
                        <span className="text-[#6E6E73]">
                          ราคา: ฿{item.unitPrice.toLocaleString()} / {item.unit}
                        </span>
                        <span className="font-bold text-[#1D1D1F]">
                          มูลค่า: ฿{item.valuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* High-Contrast Full Width Table */
            <div className="overflow-x-auto rounded-xl border border-[#E5E5EA] bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F5F5F7] border-b border-[#E5E5EA] text-[11px] font-semibold text-[#6E6E73]">
                    <th className="py-3 px-3 text-center w-10">ลำดับ</th>
                    <th className="py-3 px-3 whitespace-nowrap">รหัส SKU</th>
                    <th className="py-3 px-3 min-w-[220px]">รายการสินค้า</th>
                    <th className="py-3 px-3 whitespace-nowrap">หมวดหมู่</th>
                    <th className="py-3 px-2 text-center whitespace-nowrap">หน่วย</th>
                    <th className="py-3 px-3 text-right bg-slate-100/80 border-x border-[#E5E5EA] whitespace-nowrap">
                      <div className="font-bold text-[#1D1D1F]">ยอดยกมาจากเดือนก่อน</div>
                      <div className="text-[10px] font-normal text-[#6E6E73]">({monthlyReport.prevMonthShort})</div>
                    </th>
                    <th className="py-3 px-3 text-right bg-emerald-50/60 border-r border-[#E5E5EA] whitespace-nowrap">
                      <div className="font-bold text-emerald-800">ยอดรับเข้า (+)</div>
                      <div className="text-[10px] font-normal text-emerald-700">ในงวดนี้</div>
                    </th>
                    <th className="py-3 px-3 text-right bg-amber-50/60 border-r border-[#E5E5EA] whitespace-nowrap">
                      <div className="font-bold text-amber-800">ยอดเบิก (-)</div>
                      <div className="text-[10px] font-normal text-amber-700">ในงวดนี้</div>
                    </th>
                    <th className="py-3 px-3 text-right font-bold text-[#0071E3] bg-blue-50/60 border-r border-[#E5E5EA] whitespace-nowrap">
                      <div className="font-bold text-[#0071E3]">ยอดคงเหลือ</div>
                      <div className="text-[10px] font-normal text-[#0071E3]">สิ้นงวดนี้</div>
                    </th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">ราคา/หน่วย</th>
                    <th className="py-3 px-3 text-right font-bold text-[#1D1D1F] bg-slate-50/50 border-r border-[#E5E5EA] whitespace-nowrap">
                      <div>มูลค่าคงเหลือ (บาท)</div>
                      <div className="text-[10px] font-normal text-[#6E6E73]">(คงเหลือ × ราคา)</div>
                    </th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5EA]">
                  {filteredMonthlyItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-[#6E6E73]">
                        ไม่พบรายการสินค้าตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredMonthlyItems.map((item, idx) => {
                      const isOut = item.endingStock <= 0;
                      const isLow = !isOut && item.endingStock <= item.minStock;

                      return (
                        <tr key={item.sku} className="hover:bg-[#F5F5F7]/80 transition-colors">
                          <td className="py-3 px-3 text-center text-[#6E6E73] font-mono-tabular">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono-tabular font-bold text-[#1D1D1F] whitespace-nowrap">
                            {item.sku}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-[#1D1D1F]">{item.name}</div>
                            <div className="text-[11px] text-[#6E6E73]">{item.location}</div>
                          </td>
                          <td className="py-3 px-3 text-[#6E6E73] whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-[#F5F5F7] text-[11px] font-medium">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center text-[#6E6E73] whitespace-nowrap">
                            {item.unit}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-[#1D1D1F] bg-slate-50/50 border-x border-[#E5E5EA] whitespace-nowrap">
                            {item.broughtForward.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular bg-emerald-50/30 border-r border-[#E5E5EA] whitespace-nowrap">
                            {item.inQty > 0 ? (
                              <span className="font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-md">
                                +{item.inQty.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            ) : (
                              <span className="text-[#6E6E73]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular bg-amber-50/30 border-r border-[#E5E5EA] whitespace-nowrap">
                            {item.outQty > 0 ? (
                              <span className="font-bold text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-md">
                                -{item.outQty.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            ) : (
                              <span className="text-[#6E6E73]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular font-bold text-[#0071E3] bg-blue-50/40 border-r border-[#E5E5EA] whitespace-nowrap">
                            <span className="text-sm">
                              {item.endingStock.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular text-[#6E6E73] whitespace-nowrap">
                            ฿{item.unitPrice.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular font-bold text-[#1D1D1F] bg-slate-50/50 border-r border-[#E5E5EA] whitespace-nowrap">
                            ฿{item.valuation.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isOut ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#DC2626]/10 text-[#DC2626]">
                                <XCircle className="w-3 h-3" />
                                <span>หมดสต๊อก</span>
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D97706]/10 text-[#D97706]">
                                <AlertTriangle className="w-3 h-3" />
                                <span>ควรสั่งเพิ่ม</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#16A34A]/10 text-[#16A34A]">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>ปกติ</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-[#F5F5F7] border-t-2 border-[#1D1D1F] text-xs font-bold text-[#1D1D1F]">
                  <tr>
                    <td colSpan={5} className="py-3.5 px-3 text-right font-semibold">
                      รวมทั้งสิ้น ({monthlyReport.items.length} รายการสินค้า)
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-tabular font-bold border-x border-[#E5E5EA]">
                      {monthlyReport.totalBroughtForward.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-tabular font-bold text-emerald-700 bg-emerald-50/60 border-r border-[#E5E5EA]">
                      +{monthlyReport.totalInQty.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-tabular font-bold text-amber-700 bg-amber-50/60 border-r border-[#E5E5EA]">
                      -{monthlyReport.totalOutQty.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-tabular font-bold text-[#0071E3] bg-blue-50/60 border-r border-[#E5E5EA] text-sm">
                      {monthlyReport.totalStockQty.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-tabular text-[#6E6E73] font-normal">
                      -
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-tabular font-bold text-[#1D1D1F] bg-slate-50/60 border-r border-[#E5E5EA]">
                      ฿{monthlyReport.totalValuation.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3.5 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Bottom Navigation Shortcuts */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E5E5EA] text-xs text-[#6E6E73]">
            <div>
              กำลังแสดงข้อมูลประจำเดือน: <strong className="text-[#1D1D1F]">{monthlyReport.selectedMonthLabel}</strong> (ค้นพบ {filteredMonthlyItems.length} จากทั้งหมด {monthlyReport.items.length} รายการ)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('TREND_CHART')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] font-medium transition-colors cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-[#D97706]" />
                <span>ดูกราฟแนวโน้มการเบิก</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ALL_STOCK')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] font-medium transition-colors cursor-pointer"
              >
                <Package className="w-3.5 h-3.5 text-[#0071E3]" />
                <span>ดูสต๊อกคงเหลือปัจจุบัน</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: กราฟแนวโน้มการเบิก & สัดส่วนหมวดหมู่ (Trend Chart View) */}
      {activeTab === 'TREND_CHART' && (
        <div className="space-y-6">
          {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
          <div className="text-xs text-[#6E6E73]">มูลค่าสต๊อกคงเหลือรวม</div>
          <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#1D1D1F] mt-1.5">
            ฿{metrics.totalValuation.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#6E6E73] mt-1">
            คำนวณจาก {metrics.totalSku.toLocaleString()} รหัสสินค้า
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
          <div className="text-xs text-[#6E6E73]">จำนวนชิ้นรวมทั้งคลัง</div>
          <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#1D1D1F] mt-1.5">
            {metrics.totalUnits.toLocaleString()} <span className="text-xs font-normal text-[#6E6E73]">หน่วย</span>
          </div>
          <div className="text-[11px] text-[#6E6E73] mt-1">
            ธุรกรรมสะสม {transactions.length.toLocaleString()} รายการ
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
          <div className="text-xs text-[#6E6E73]">สินค้าต่ำกว่าจุดสั่งซื้อ</div>
          <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#D97706] mt-1.5">
            {metrics.lowStockCount.toLocaleString()} <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
          </div>
          <div className="text-[11px] text-[#6E6E73] mt-1">
            ควรวางแผนสั่งซื้อเพิ่มเติม
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
          <div className="text-xs text-[#6E6E73]">สินค้าหมดสต๊อก (Out of Stock)</div>
          <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#DC2626] mt-1.5">
            {metrics.outOfStockCount.toLocaleString()} <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
          </div>
          <div className="text-[11px] text-[#6E6E73] mt-1">
            ต้องรับเข้าสินค้าเร่งด่วน
          </div>
        </div>
      </div>

      {/* Monthly Stock Withdrawal & Movement Line Chart */}
      <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#D97706]" />
              <h2 className="text-sm font-bold text-[#1D1D1F]">
                กราฟเส้นแนวโน้มการเบิกสินค้าและเคลื่อนไหวสต๊อกรายเดือน (Monthly Stock Movement)
              </h2>
            </div>
            <p className="text-xs text-[#6E6E73] mt-1">
              วิเคราะห์ปริมาณการเบิกจ่ายสินค้า (Stock Out) เปรียบเทียบกับการรับเข้า (Stock In) ในแต่ละเดือนจากข้อมูล Transactions
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by SKU */}
            <select
              value={chartSkuFilter}
              onChange={(e) => setChartSkuFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] text-xs font-medium text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] cursor-pointer max-w-56 truncate"
            >
              <option value="ALL">ทุกหมวดหมู่ / สินค้าทั้งหมด ({products.length} รหัส)</option>
              {products.map((p) => (
                <option key={`${p.sku}-${p.rowIndex}`} value={p.sku}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>

            {/* Toggle Stock In comparison line */}
            <button
              type="button"
              onClick={() => setShowStockInLine((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                showStockInLine
                  ? 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#16A34A]'
                  : 'bg-[#F5F5F7] border-[#E5E5EA] text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              {showStockInLine ? 'แสดงเส้นรับเข้า (IN)' : 'ซ่อนเส้นรับเข้า (IN)'}
            </button>

            {/* 6M / 12M Span Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA]">
              {([6, 12] as ChartMonthSpan[]).map((span) => (
                <button
                  key={span}
                  type="button"
                  onClick={() => setChartSpan(span)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    chartSpan === span
                      ? 'bg-white text-[#1D1D1F] shadow-xs'
                      : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                  }`}
                >
                  {span} เดือน
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Metrics & Legend Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-[#E5E5EA] text-xs">
          <div className="flex flex-wrap items-center gap-5 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#D97706] inline-block" />
              <span className="text-[#6E6E73]">ยอดเบิกออกรวม ({chartSpan} เดือน):</span>
              <strong className="font-mono-tabular font-bold text-[#1D1D1F]">
                {monthlyTrendData.totalOutInPeriod.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                หน่วย
              </strong>
            </div>

            {showStockInLine && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#16A34A] inline-block" />
                <span className="text-[#6E6E73]">ยอดรับเข้ารวม ({chartSpan} เดือน):</span>
                <strong className="font-mono-tabular font-bold text-[#1D1D1F]">
                  {monthlyTrendData.totalInInPeriod.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{' '}
                  หน่วย
                </strong>
              </div>
            )}
          </div>

          {monthlyTrendData.peakOutBucket && monthlyTrendData.peakOutBucket.outQty > 0 && (
            <div className="text-[11px] text-[#6E6E73] pt-2">
              เดือนที่เบิกสูงสุด:{' '}
              <strong className="font-semibold text-[#D97706]">
                {monthlyTrendData.peakOutBucket.label}
              </strong>{' '}
              (
              <span className="font-mono-tabular font-semibold text-[#1D1D1F]">
                {monthlyTrendData.peakOutBucket.outQty.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </span>{' '}
              หน่วย)
            </div>
          )}
        </div>

        {/* SVG Line Chart Canvas */}
        {(() => {
          const buckets = monthlyTrendData.buckets;
          const maxVal = monthlyTrendData.maxVal;
          const svgWidth = 760;
          const svgHeight = 250;
          const padLeft = 48;
          const padRight = 28;
          const padTop = 24;
          const padBottom = 38;
          const plotWidth = svgWidth - padLeft - padRight;
          const plotHeight = svgHeight - padTop - padBottom;

          const getX = (index: number) => {
            if (buckets.length <= 1) return padLeft + plotWidth / 2;
            return padLeft + (index / (buckets.length - 1)) * plotWidth;
          };

          const getY = (val: number) => {
            const ratio = Math.min(1, Math.max(0, val / maxVal));
            return padTop + plotHeight - ratio * plotHeight;
          };

          const outPoints = buckets.map((b, i) => ({ x: getX(i), y: getY(b.outQty), bucket: b }));
          const inPoints = buckets.map((b, i) => ({ x: getX(i), y: getY(b.inQty), bucket: b }));

          const buildPath = (pts: Array<{ x: number; y: number }>) =>
            pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

          const buildAreaPath = (pts: Array<{ x: number; y: number }>) => {
            if (pts.length === 0) return '';
            const line = buildPath(pts);
            const baselineY = (padTop + plotHeight).toFixed(1);
            return `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baselineY} L ${pts[0].x.toFixed(
              1
            )} ${baselineY} Z`;
          };

          const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
            value: Number((maxVal * t).toFixed(2)),
            y: getY(maxVal * t),
          }));

          const activeBucket =
            hoveredMonthIdx !== null && buckets[hoveredMonthIdx]
              ? buckets[hoveredMonthIdx]
              : buckets[buckets.length - 1];

          return (
            <div className="space-y-3">
              <div className="relative w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full min-w-[540px] h-60 select-none overflow-visible"
                  role="img"
                  aria-label="กราฟเส้นแสดงแนวโน้มการเบิกสินค้ารายเดือน"
                >
                  <defs>
                    <linearGradient id="outAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D97706" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#D97706" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="inAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16A34A" stopOpacity="0.14" />
                      <stop offset="100%" stopColor="#16A34A" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines & Y-Axis Labels */}
                  {yTicks.map((tick, idx) => (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        y1={tick.y}
                        x2={svgWidth - padRight}
                        y2={tick.y}
                        stroke="#E5E5EA"
                        strokeDasharray={idx === 0 ? undefined : '4 4'}
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 8}
                        y={tick.y + 4}
                        textAnchor="end"
                        className="fill-[#6E6E73] text-[10px] font-mono-tabular"
                      >
                        {tick.value.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                      </text>
                    </g>
                  ))}

                  {/* Optional Stock In Comparison Area & Line */}
                  {showStockInLine && (
                    <>
                      <path d={buildAreaPath(inPoints)} fill="url(#inAreaGrad)" />
                      <path
                        d={buildPath(inPoints)}
                        fill="none"
                        stroke="#16A34A"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="5 3"
                      />
                    </>
                  )}

                  {/* Primary Stock Out Area & Line */}
                  <path d={buildAreaPath(outPoints)} fill="url(#outAreaGrad)" />
                  <path
                    d={buildPath(outPoints)}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data Points & Interactive Hover Columns */}
                  {buckets.map((b, i) => {
                    const x = getX(i);
                    const outY = getY(b.outQty);
                    const inY = getY(b.inQty);
                    const isHovered = hoveredMonthIdx === i;

                    return (
                      <g
                        key={b.key}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredMonthIdx(i)}
                        onMouseLeave={() => setHoveredMonthIdx(null)}
                        onClick={() => setHoveredMonthIdx(i)}
                      >
                        {/* Vertical Hover Guide Line */}
                        {isHovered && (
                          <line
                            x1={x}
                            y1={padTop}
                            x2={x}
                            y2={padTop + plotHeight}
                            stroke="#1D1D1F"
                            strokeOpacity="0.2"
                            strokeWidth="1.5"
                          />
                        )}

                        {/* Stock In Point */}
                        {showStockInLine && (
                          <circle
                            cx={x}
                            cy={inY}
                            r={isHovered ? 5 : 3.5}
                            fill="#FFFFFF"
                            stroke="#16A34A"
                            strokeWidth="2"
                          />
                        )}

                        {/* Stock Out Point */}
                        <circle
                          cx={x}
                          cy={outY}
                          r={isHovered ? 6 : 4.2}
                          fill={isHovered ? '#D97706' : '#FFFFFF'}
                          stroke="#D97706"
                          strokeWidth="2.5"
                        />

                        {/* Value Label Above Point when > 0 or Hovered */}
                        {(b.outQty > 0 || isHovered) && (
                          <text
                            x={x}
                            y={Math.max(12, outY - 10)}
                            textAnchor="middle"
                            className="fill-[#1D1D1F] text-[10px] font-mono-tabular font-bold"
                          >
                            {b.outQty.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </text>
                        )}

                        {/* Month Label on X-Axis */}
                        <text
                          x={x}
                          y={svgHeight - 12}
                          textAnchor="middle"
                          className={`text-[11px] ${
                            isHovered
                              ? 'fill-[#1D1D1F] font-bold'
                              : 'fill-[#6E6E73] font-medium'
                          }`}
                        >
                          {b.label}
                        </text>

                        {/* Transparent Hit Target for Easy Touch/Hover */}
                        <rect
                          x={x - plotWidth / Math.max(2, buckets.length * 2)}
                          y={padTop}
                          width={plotWidth / Math.max(1, buckets.length)}
                          height={plotHeight + padBottom}
                          fill="transparent"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Active / Hovered Month Breakdown Bar */}
              {activeBucket && (
                <div className="p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1D1D1F]">
                      สรุปเดือน {activeBucket.fullLabel}
                    </span>
                    <span className="text-[#6E6E73]">
                      (แตะหรือชี้ที่จุดบนกราฟเพื่อดูรายละเอียดแต่ละเดือน)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 font-mono-tabular">
                    <span className="text-[#D97706] font-semibold">
                      เบิกออก: {activeBucket.outQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} หน่วย ({activeBucket.outTxCount} รายการ)
                    </span>
                    <span aria-hidden="true" className="text-[#6E6E73]">·</span>
                    <span className="text-[#16A34A] font-semibold">
                      รับเข้า: {activeBucket.inQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} หน่วย ({activeBucket.inTxCount} รายการ)
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Category Valuation Breakdown */}
      {categorySummary.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0071E3]" />
              <h2 className="text-sm font-bold text-[#1D1D1F]">
                สัดส่วนมูลค่าสินค้าคงคลังตามหมวดหมู่
              </h2>
            </div>
            <span className="text-xs text-[#6E6E73] font-mono-tabular">
              {categorySummary.length} หมวดหมู่
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorySummary.map((cat) => {
              const pct =
                metrics.totalValuation > 0
                  ? Math.round((cat.valuation / metrics.totalValuation) * 100)
                  : 0;
              return (
                <div
                  key={cat.category}
                  className="p-4 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#1D1D1F]">{cat.category}</span>
                    <span className="font-mono-tabular font-semibold text-[#0071E3]">{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#E5E5EA] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0071E3] rounded-full"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#6E6E73] font-mono-tabular">
                    <span>
                      {cat.skuCount} รหัส · {cat.unitCount.toLocaleString()} ชิ้น
                    </span>
                    <span className="font-semibold text-[#1D1D1F]">
                      ฿{cat.valuation.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>
      )}

      {/* TAB 3: รายการสต๊อกคงเหลือปัจจุบัน (All Current Stock Table View) */}
      {activeTab === 'ALL_STOCK' && (
        <div className="space-y-6">
          {/* 4-Column KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
              <div className="text-xs text-[#6E6E73]">มูลค่าสต๊อกคงเหลือรวม</div>
              <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#1D1D1F] mt-1.5">
                ฿{metrics.totalValuation.toLocaleString()}
              </div>
              <div className="text-[11px] text-[#6E6E73] mt-1">
                คำนวณจาก {metrics.totalSku.toLocaleString()} รหัสสินค้า
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
              <div className="text-xs text-[#6E6E73]">จำนวนชิ้นรวมทั้งคลัง</div>
              <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#1D1D1F] mt-1.5">
                {metrics.totalUnits.toLocaleString()} <span className="text-xs font-normal text-[#6E6E73]">หน่วย</span>
              </div>
              <div className="text-[11px] text-[#6E6E73] mt-1">
                ธุรกรรมสะสม {transactions.length.toLocaleString()} รายการ
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
              <div className="text-xs text-[#6E6E73]">สินค้าต่ำกว่าจุดสั่งซื้อ</div>
              <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#D97706] mt-1.5">
                {metrics.lowStockCount.toLocaleString()} <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
              </div>
              <div className="text-[11px] text-[#6E6E73] mt-1">
                ควรวางแผนสั่งซื้อเพิ่มเติม
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E5EA] p-5">
              <div className="text-xs text-[#6E6E73]">สินค้าหมดสต๊อก (Out of Stock)</div>
              <div className="text-xl md:text-2xl font-mono-tabular font-bold text-[#DC2626] mt-1.5">
                {metrics.outOfStockCount.toLocaleString()} <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
              </div>
              <div className="text-[11px] text-[#6E6E73] mt-1">
                ต้องรับเข้าสินค้าเร่งด่วน
              </div>
            </div>
          </div>

          {/* Filter & Search Bar for Detailed Balance Table */}
          <div className="bg-white rounded-2xl border border-[#E5E5EA] p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Segmented Status Controls */}
          <div className="flex items-center gap-1 p-1 bg-[#F5F5F7] rounded-xl overflow-x-auto">
            {[
              { id: 'ALL', label: `ทั้งหมด (${products.length})` },
              {
                id: 'NORMAL',
                label: `สต๊อกปกติ (${
                  products.length - metrics.lowStockCount - metrics.outOfStockCount
                })`,
              },
              { id: 'LOW', label: `ใกล้หมด (${metrics.lowStockCount})` },
              { id: 'OUT', label: `สินค้าหมด (${metrics.outOfStockCount})` },
              { id: 'EXPIRING', label: `ใกล้หมดอายุ 7 วัน (${metrics.expiringCount})` },
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as StatusFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#1D1D1F] shadow-xs'
                      : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#6E6E73] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="กรองชื่อสินค้า หรือ SKU..."
              className="w-full pl-9 pr-4 py-2 bg-[#F5F5F7] rounded-xl text-xs text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />
          </div>
        </div>

        {/* Detailed Balance Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E5EA] text-[11px] font-semibold text-[#6E6E73]">
                <th className="py-3 px-3">รหัส SKU</th>
                <th className="py-3 px-3">รายการสินค้า</th>
                <th className="py-3 px-3">หมวดหมู่ · คลัง</th>
                <th className="py-3 px-3 text-right">ราคา/หน่วย</th>
                <th className="py-3 px-3 text-right">คงเหลือ</th>
                <th className="py-3 px-3 text-right">จุดสั่งซื้อ</th>
                <th className="py-3 px-3 text-right">มูลค่ารวม</th>
                <th className="py-3 px-3">สถานะ</th>
                <th className="py-3 px-3 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5EA] text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#6E6E73]">
                    ไม่พบรายการสินค้าตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => {
                  const totalVal = item.currentStock * item.unitPrice;
                  const isOut = item.currentStock <= 0;
                  const isLow = !isOut && item.currentStock <= item.minStock;

                  return (
                    <tr
                      key={`${item.sku}-${item.rowIndex}`}
                      className="hover:bg-[#F5F5F7]/60 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono-tabular font-semibold text-[#1D1D1F] whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#1D1D1F]">
                        {item.name}
                      </td>
                      <td className="py-3 px-3 text-[#6E6E73] whitespace-nowrap">
                        <div>{item.category} · {item.location}</div>
                        {item.seller && item.seller !== '-' && (
                          <div className="text-[11px] text-[#6E6E73]">ผู้ขาย: {item.seller}</div>
                        )}
                        {item.expiryDate && item.expiryDate !== '-' && (
                          <div
                            className={`text-[11px] inline-flex items-center gap-1 ${
                              getExpiryStatus(item.expiryDate).status === 'EXPIRED'
                                ? 'text-[#DC2626] font-semibold'
                                : getExpiryStatus(item.expiryDate).status === 'EXPIRING_SOON'
                                ? 'text-[#D97706] font-semibold'
                                : 'text-[#6E6E73]'
                            }`}
                          >
                            <CalendarClock className="w-3 h-3" />
                            <span>หมดอายุ: {item.expiryDate} ({getExpiryStatus(item.expiryDate).label})</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-[#1D1D1F] whitespace-nowrap">
                        ฿{item.unitPrice.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-bold text-[#1D1D1F] whitespace-nowrap">
                        {item.currentStock.toLocaleString()} {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-[#6E6E73] whitespace-nowrap">
                        {item.minStock.toLocaleString()} {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-[#1D1D1F] whitespace-nowrap">
                        ฿{totalVal.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 text-[#DC2626] font-medium">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>สินค้าหมด</span>
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 text-[#D97706] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>ควรสั่งเพิ่ม</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#16A34A] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>ปกติ</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onNavigateToMovement('IN', item.sku)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#0071E3] hover:bg-[#0071E3]/10 transition-colors cursor-pointer"
                        >
                          +เติมสต๊อก
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>
      )}

      {/* Printable PDF Monthly Report Modal (พร้อมพิมพ์และบันทึกเป็น PDF) */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#E5E5EA] my-6 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Controls Bar (Hidden during actual print) */}
            <div className="no-print flex items-center justify-between px-6 py-4 bg-[#F5F5F7] border-b border-[#E5E5EA] shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#0071E3]" />
                <div>
                  <h3 className="text-sm font-bold text-[#1D1D1F]">
                    ตัวอย่างรายงานประจำเดือน (PDF Print Preview)
                  </h3>
                  <p className="text-[11px] text-[#6E6E73]">
                    เมื่อกด "พิมพ์ / บันทึกเป็น PDF" หน้าต่างพิมพ์ของเบราว์เซอร์จะเปิดขึ้น ให้เลือกปลายทางเป็น <strong>"Save as PDF"</strong> หรือเลือกเครื่องพิมพ์
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0071E3] hover:bg-[#005BB5] shadow-xs cursor-pointer min-h-[42px]"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์ / บันทึกเป็น PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(false)}
                  className="p-2 rounded-xl text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#E5E5EA] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Body (Rendered for print onto A4) */}
            <div id="printable-monthly-report" className="p-6 sm:p-10 overflow-y-auto space-y-6 text-[#1D1D1F] bg-white">
              {/* Document Header */}
              <div className="border-b-2 border-[#1D1D1F] pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold tracking-wider text-[#0071E3] uppercase">
                    Thai Anbao · Cupertino Stock Inventory
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1D1F] mt-1">
                    ใบรายงานสรุปยอดรับเข้า · ยอดเบิก · ยอดคงเหลือสินค้าประจำเดือน
                  </h1>
                  <div className="text-xs font-semibold text-[#6E6E73] mt-1">
                    ประจำงวด: <strong className="text-[#1D1D1F]">{monthlyReport.selectedMonthLabel}</strong>
                  </div>
                </div>
                <div className="text-right text-xs text-[#6E6E73] font-mono-tabular shrink-0 space-y-1">
                  <div>วันที่พิมพ์: <strong>{new Date().toLocaleDateString('th-TH')}</strong></div>
                  <div>เวลา: <strong>{new Date().toLocaleTimeString('th-TH')}</strong></div>
                  <div>ระบบฐานข้อมูล: <strong>Google Sheets Database</strong></div>
                </div>
              </div>

              {/* Monthly KPI Summary Strip */}
              {/* Monthly KPI Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-2.5 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7]/50">
                  <div className="text-[10px] text-[#6E6E73]">ยอดยกมาจากเดือนก่อน</div>
                  <div className="text-sm font-bold text-[#1D1D1F] mt-0.5 font-mono-tabular">
                    {monthlyReport.totalBroughtForward.toLocaleString()} <span className="text-[10px] font-normal">หน่วย</span>
                  </div>
                  <div className="text-[9px] text-[#6E6E73] mt-0.5 truncate">{monthlyReport.prevMonthShort}</div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7]/50">
                  <div className="text-[10px] text-[#6E6E73]">ยอดรับเข้ารวม</div>
                  <div className="text-sm font-bold text-[#16A34A] mt-0.5 font-mono-tabular">
                    +{monthlyReport.totalInQty.toLocaleString()} <span className="text-[10px] font-normal">หน่วย</span>
                  </div>
                  <div className="text-[9px] text-[#6E6E73] mt-0.5">{monthlyReport.inCount} ครั้งที่รับเข้า</div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7]/50">
                  <div className="text-[10px] text-[#6E6E73]">ยอดเบิกออกรวม</div>
                  <div className="text-sm font-bold text-[#D97706] mt-0.5 font-mono-tabular">
                    -{monthlyReport.totalOutQty.toLocaleString()} <span className="text-[10px] font-normal">หน่วย</span>
                  </div>
                  <div className="text-[9px] text-[#6E6E73] mt-0.5">{monthlyReport.outCount} ครั้งที่เบิกจ่าย</div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7]/50">
                  <div className="text-[10px] text-[#6E6E73]">ยอดคงเหลือรวม</div>
                  <div className="text-sm font-bold text-[#0071E3] mt-0.5 font-mono-tabular">
                    {monthlyReport.totalStockQty.toLocaleString()} <span className="text-[10px] font-normal">หน่วย</span>
                  </div>
                  <div className="text-[9px] text-[#6E6E73] mt-0.5">{products.length} รายการ</div>
                </div>
                <div className="p-2.5 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7]/50">
                  <div className="text-[10px] text-[#6E6E73]">มูลค่าคงคลังรวม</div>
                  <div className="text-sm font-bold text-[#1D1D1F] mt-0.5 font-mono-tabular">
                    ฿{monthlyReport.totalValuation.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-[#6E6E73] mt-0.5">ราคาประเมิน</div>
                </div>
              </div>

              {/* Detail Table */}
              <div className="border border-[#E5E5EA] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F7] border-b border-[#E5E5EA] font-semibold text-[#1D1D1F]">
                      <th className="py-2.5 px-2 text-center w-8">#</th>
                      <th className="py-2.5 px-2">รหัส SKU</th>
                      <th className="py-2.5 px-3">รายการสินค้า</th>
                      <th className="py-2.5 px-2">หมวดหมู่</th>
                      <th className="py-2.5 px-1.5 text-center">หน่วย</th>
                      <th className="py-2.5 px-2 text-right bg-slate-100/60">
                        <div>ยอดยกมา</div>
                        <div className="text-[9px] font-normal text-[#6E6E73]">({monthlyReport.prevMonthShort})</div>
                      </th>
                      <th className="py-2.5 px-2 text-right text-[#16A34A]">รับเข้า (+)</th>
                      <th className="py-2.5 px-2 text-right text-[#D97706]">เบิกออก (-)</th>
                      <th className="py-2.5 px-2 text-right font-bold text-[#0071E3] bg-blue-50/50">คงเหลือ</th>
                      <th className="py-2.5 px-2 text-right">ราคา/หน่วย</th>
                      <th className="py-2.5 px-2 text-right">รวมมูลค่า (฿)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5EA]">
                    {monthlyReport.items.map((item, index) => (
                      <tr key={item.sku} className="hover:bg-[#F5F5F7]/30">
                        <td className="py-2 px-2 text-center text-[#6E6E73] font-mono-tabular">{index + 1}</td>
                        <td className="py-2 px-2 font-mono-tabular font-semibold text-[#1D1D1F]">{item.sku}</td>
                        <td className="py-2 px-3 font-medium text-[#1D1D1F]">{item.name}</td>
                        <td className="py-2 px-2 text-[#6E6E73]">{item.category}</td>
                        <td className="py-2 px-1.5 text-center text-[#6E6E73]">{item.unit}</td>
                        <td className="py-2 px-2 text-right font-mono-tabular font-medium text-[#1D1D1F] bg-slate-50/50">
                          {item.broughtForward.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-tabular text-[#16A34A]">
                          {item.inQty > 0 ? `+${item.inQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-tabular text-[#D97706]">
                          {item.outQty > 0 ? `-${item.outQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-tabular font-bold text-[#0071E3] bg-blue-50/30">
                          {item.endingStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-tabular text-[#6E6E73]">
                          ฿{item.unitPrice.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-tabular font-semibold text-[#1D1D1F]">
                          ฿{item.valuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F5F5F7] font-bold text-[#1D1D1F] border-t-2 border-[#1D1D1F]">
                      <td colSpan={5} className="py-3 px-3 text-right">รวมทั้งสิ้น ({monthlyReport.items.length} รายการ)</td>
                      <td className="py-3 px-2 text-right font-mono-tabular">
                        {monthlyReport.totalBroughtForward.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-right font-mono-tabular text-[#16A34A]">
                        +{monthlyReport.totalInQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-right font-mono-tabular text-[#D97706]">
                        -{monthlyReport.totalOutQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-right font-mono-tabular text-[#0071E3]">
                        {monthlyReport.totalStockQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-right font-mono-tabular text-[#6E6E73] font-normal">-</td>
                      <td className="py-3 px-2 text-right font-mono-tabular">
                        ฿{monthlyReport.totalValuation.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures Block for Official PDF / Print */}
              <div className="pt-8 border-t border-[#E5E5EA] grid grid-cols-2 gap-8 text-xs text-[#1D1D1F] print-avoid-break">
                <div className="space-y-4">
                  <div>ลงชื่อ: ............................................................</div>
                  <div>( ............................................................ )</div>
                  <div className="text-[#6E6E73] font-medium">ผู้จัดทำรายงาน / เจ้าหน้าที่คลังสินค้า</div>
                  <div className="text-[11px] text-[#6E6E73]">วันที่: .......... / .......... / ................</div>
                </div>
                <div className="space-y-4 text-right">
                  <div>ลงชื่อ: ............................................................</div>
                  <div>( ............................................................ )</div>
                  <div className="text-[#6E6E73] font-medium">ผู้ตรวจสอบ / ผู้มีอำนาจอนุมัติ</div>
                  <div className="text-[11px] text-[#6E6E73]">วันที่: .......... / .......... / ................</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
