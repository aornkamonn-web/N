import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  RefreshCw,
  ExternalLink,
  LogOut,
  FileSpreadsheet,
  X,
  LogIn,
  CheckCircle2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ProductItem,
  StockTransaction,
  SheetDatabaseInfo,
  ConfirmDialogState,
  TransactionType,
} from './types';
import { initAuth, googleSignIn, logout } from './services/auth';
import {
  findOrCreateStockSpreadsheet,
  loadAllStockData,
  addProductToSheet,
  updateProductInSheet,
  deleteProductFromSheet,
  recordStockMovement,
  recordBatchStockMovements,
  seedSampleInventoryData,
} from './services/sheets';
import { StockManageView } from './components/StockManageView';
import { StockMovementView } from './components/StockMovementView';
import { StockReportView } from './components/StockReportView';
import { ConfirmModal } from './components/ConfirmModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ExpiryAlertBanner } from './components/ExpiryAlertBanner';

type ActiveTab = 'manage' | 'stock-in' | 'stock-out' | 'report';

const CACHE_KEY_PRODUCTS = 'cupertino_stock_cached_products_v1';
const CACHE_KEY_TX = 'cupertino_stock_cached_tx_v1';
const CACHE_KEY_DB = 'cupertino_stock_cached_db_v1';

const formatThaiTimestamp = (date: Date): string => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  const ss = date.getSeconds().toString().padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
};

const INITIAL_SAMPLE_PRODUCTS: ProductItem[] = [
  {
    rowIndex: 2,
    sku: 'APL-MBP-14M3',
    name: 'MacBook Pro 14" M3 Pro (Space Black)',
    category: 'คอมพิวเตอร์',
    unit: 'เครื่อง',
    unitPrice: 69900,
    currentStock: 18,
    minStock: 5,
    location: 'Zone A-01',
    seller: 'Apple South Asia (Thailand)',
    expiryDate: '2027-10-12',
    updatedAt: '12/10/2026 12:00:00',
  },
  {
    rowIndex: 3,
    sku: 'APL-IPA-11M2',
    name: 'iPad Air 11" M2 Wi-Fi 128GB',
    category: 'แท็บเล็ต',
    unit: 'เครื่อง',
    unitPrice: 23900,
    currentStock: 24,
    minStock: 8,
    location: 'Zone A-02',
    seller: 'Com7 Business Solutions',
    expiryDate: '2027-10-12',
    updatedAt: '12/10/2026 12:00:00',
  },
  {
    rowIndex: 4,
    sku: 'APL-APP-USB',
    name: 'AirPods Pro 2 (USB-C MagSafe)',
    category: 'อุปกรณ์เสริม',
    unit: 'กล่อง',
    unitPrice: 8990,
    currentStock: 42,
    minStock: 15,
    location: 'Zone B-01',
    seller: 'Synnex (Thailand)',
    expiryDate: '2026-10-18',
    updatedAt: '12/10/2026 12:00:00',
  },
  {
    rowIndex: 5,
    sku: 'APL-MGC-MSE',
    name: 'Magic Mouse (Multi-Touch Surface)',
    category: 'อุปกรณ์เสริม',
    unit: 'ชิ้น',
    unitPrice: 3190,
    currentStock: 6,
    minStock: 10,
    location: 'Zone B-04',
    seller: 'Synnex (Thailand)',
    expiryDate: '-',
    updatedAt: '12/10/2026 12:00:00',
  },
  {
    rowIndex: 6,
    sku: 'APL-USBC-240W',
    name: 'สายชาร์จ USB-C Woven (2m, 240W)',
    category: 'สายเคเบิล',
    unit: 'เส้น',
    unitPrice: 1190,
    currentStock: 3,
    minStock: 12,
    location: 'Zone C-02',
    seller: 'Copperwired (iStudio)',
    expiryDate: '-',
    updatedAt: '12/10/2026 12:00:00',
  },
  {
    rowIndex: 7,
    sku: 'APL-STD-DSP',
    name: 'Apple Studio Display 27" 5K Retina',
    category: 'จอมอนิเตอร์',
    unit: 'เครื่อง',
    unitPrice: 54900,
    currentStock: 0,
    minStock: 3,
    location: 'Zone A-05',
    seller: 'Apple South Asia (Thailand)',
    expiryDate: '-',
    updatedAt: '12/10/2026 12:00:00',
  },
];

const INITIAL_SAMPLE_TX: StockTransaction[] = [
  {
    rowIndex: 2,
    txId: 'RCV-100101',
    timestamp: '10/08/2026 09:30:00',
    type: 'IN',
    sku: 'APL-MBP-14M3',
    productName: 'MacBook Pro 14" M3 Pro (Space Black)',
    quantity: 10,
    unit: 'เครื่อง',
    balanceAfter: 10,
    reference: 'PO-2026-088',
    operator: 'ผู้ดูแลคลังสินค้า',
    note: 'รับเข้าล็อตที่ 1',
    seller: 'Apple South Asia (Thailand)',
    expiryDate: '2027-10-12',
  },
  {
    rowIndex: 3,
    txId: 'RCV-100102',
    timestamp: '15/09/2026 14:15:00',
    type: 'IN',
    sku: 'APL-MBP-14M3',
    productName: 'MacBook Pro 14" M3 Pro (Space Black)',
    quantity: 10,
    unit: 'เครื่อง',
    balanceAfter: 20,
    reference: 'PO-2026-089',
    operator: 'ผู้ดูแลคลังสินค้า',
    note: 'รับเข้าล็อตที่ 2',
    seller: 'Apple South Asia (Thailand)',
    expiryDate: '2027-10-12',
  },
  {
    rowIndex: 4,
    txId: 'ISS-100103',
    timestamp: '25/09/2026 11:00:00',
    type: 'OUT',
    sku: 'APL-MBP-14M3',
    productName: 'MacBook Pro 14" M3 Pro (Space Black)',
    quantity: 2,
    unit: 'เครื่อง',
    balanceAfter: 18,
    reference: 'PO-2026-088',
    operator: 'ผู้ดูแลคลังสินค้า',
    note: 'เบิกใช้งานพนักงานใหม่ (ฝ่ายวิศวกรรม)',
    seller: 'Apple South Asia (Thailand)',
    expiryDate: '2027-10-12',
  },
  {
    rowIndex: 5,
    txId: 'RCV-100104',
    timestamp: '01/10/2026 10:00:00',
    type: 'IN',
    sku: 'APL-APP-USB',
    productName: 'AirPods Pro 2 (USB-C MagSafe)',
    quantity: 42,
    unit: 'กล่อง',
    balanceAfter: 42,
    reference: 'PO-2026-092',
    operator: 'ผู้ดูแลคลังสินค้า',
    note: 'สต๊อกพร้อมจำหน่าย',
    seller: 'Synnex (Thailand)',
    expiryDate: '2026-10-18',
  },
  {
    rowIndex: 6,
    txId: 'RCV-100105',
    timestamp: '05/10/2026 13:40:00',
    type: 'IN',
    sku: 'APL-MGC-MSE',
    productName: 'Magic Mouse (Multi-Touch Surface)',
    quantity: 10,
    unit: 'ชิ้น',
    balanceAfter: 10,
    reference: 'PO-2026-075',
    operator: 'ผู้ดูแลคลังสินค้า',
    note: 'รับเข้าอุปกรณ์ประจำไตรมาส',
    seller: 'Synnex (Thailand)',
    expiryDate: '-',
  },
  {
    rowIndex: 7,
    txId: 'ISS-100106',
    timestamp: '08/10/2026 16:20:00',
    type: 'OUT',
    sku: 'APL-MGC-MSE',
    productName: 'Magic Mouse (Multi-Touch Surface)',
    quantity: 4,
    unit: 'ชิ้น',
    balanceAfter: 6,
    reference: 'PO-2026-075',
    operator: 'ผู้ดูแลคลังสินค้า',
    note: 'เบิกอุปกรณ์ประจำโต๊ะทำงาน (แผนกออกแบบ)',
    seller: 'Synnex (Thailand)',
    expiryDate: '-',
  },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('manage');
  const [preselectedSku, setPreselectedSku] = useState<string | undefined>(undefined);

  // Google Sheets state (with local offline cache initialization)
  const [dbInfo, setDbInfo] = useState<SheetDatabaseInfo | null>(() => {
    try {
      const saved = localStorage.getItem(CACHE_KEY_DB);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [products, setProducts] = useState<ProductItem[]>(() => {
    try {
      const saved = localStorage.getItem(CACHE_KEY_PRODUCTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return INITIAL_SAMPLE_PRODUCTS;
    } catch {
      return INITIAL_SAMPLE_PRODUCTS;
    }
  });

  const [transactions, setTransactions] = useState<StockTransaction[]>(() => {
    try {
      const saved = localStorage.getItem(CACHE_KEY_TX);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return INITIAL_SAMPLE_TX;
    } catch {
      return INITIAL_SAMPLE_TX;
    }
  });

  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Optional custom Spreadsheet ID modal
  const [isSheetConfigOpen, setIsSheetConfigOpen] = useState(false);
  const [customSheetInput, setCustomSheetInput] = useState('');

  // Mandatory Confirmation Dialog State for mutating/destructive operations
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmLabel: 'ยืนยัน',
    onConfirm: async () => {},
  });

  const openConfirmDialog = useCallback((config: Omit<ConfirmDialogState, 'isOpen'>) => {
    setConfirmDialog({
      ...config,
      isOpen: true,
    });
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const saveToLocalCache = useCallback(
    (sheetInfo: SheetDatabaseInfo | null, loadedProducts: ProductItem[], loadedTx: StockTransaction[]) => {
      try {
        if (sheetInfo) {
          localStorage.setItem(CACHE_KEY_DB, JSON.stringify(sheetInfo));
        }
        localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(loadedProducts));
        localStorage.setItem(CACHE_KEY_TX, JSON.stringify(loadedTx));
      } catch {
        // Ignore storage quota errors
      }
    },
    []
  );

  const initializeAndLoadSheet = useCallback(
    async (overrideSheetId?: string) => {
      setIsLoadingData(true);
      setGlobalError(null);
      try {
        const sheetInfo = await findOrCreateStockSpreadsheet(overrideSheetId);
        setDbInfo(sheetInfo);
        const { products: loadedProducts, transactions: loadedTx } = await loadAllStockData(
          sheetInfo
        );
        setProducts(loadedProducts);
        setTransactions(loadedTx);
        saveToLocalCache(sheetInfo, loadedProducts, loadedTx);
      } catch (err: any) {
        if (err?.message !== 'AUTH_REQUIRED') {
          setGlobalError(
            err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets กรุณาลองซิงค์ข้อมูลอีกครั้ง'
          );
        }
      } finally {
        setIsLoadingData(false);
      }
    },
    [saveToLocalCache]
  );

  // Listen to Google Auth in the background (Optional sync - never blocks user entry)
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        initializeAndLoadSheet();
      },
      () => {
        setUser(null);
      }
    );
    return () => unsubscribe();
  }, [initializeAndLoadSheet]);

  const handleLogin = async () => {
    try {
      setIsLoadingData(true);
      setGlobalError(null);
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        await initializeAndLoadSheet();
      }
    } catch (err: any) {
      setGlobalError(err?.message || 'การเชื่อมต่อกับ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setDbInfo(null);
    // Keep local inventory intact so the user can continue working seamlessly
  };

  const handleRefreshData = async () => {
    if (!dbInfo || !user) {
      // Refresh / reload from local cache
      try {
        const savedProds = localStorage.getItem(CACHE_KEY_PRODUCTS);
        const savedTx = localStorage.getItem(CACHE_KEY_TX);
        if (savedProds) setProducts(JSON.parse(savedProds));
        if (savedTx) setTransactions(JSON.parse(savedTx));
      } catch {
        // Ignore
      }
      return;
    }
    setIsLoadingData(true);
    setGlobalError(null);
    try {
      const { products: loadedProducts, transactions: loadedTx } = await loadAllStockData(dbInfo);
      setProducts(loadedProducts);
      setTransactions(loadedTx);
      saveToLocalCache(dbInfo, loadedProducts, loadedTx);
    } catch (err: any) {
      if (err?.message !== 'AUTH_REQUIRED') {
        setGlobalError(err?.message || 'ไม่สามารถโหลดข้อมูลล่าสุดจาก Google Sheets ได้');
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleNavigateToMovement = (type: 'IN' | 'OUT', sku?: string) => {
    setPreselectedSku(sku);
    setActiveTab(type === 'IN' ? 'stock-in' : 'stock-out');
  };

  // CRUD & Movement Handlers: Save immediately to state & localStorage, and sync to Google Sheets if connected
  const handleAddProduct = async (newProduct: Omit<ProductItem, 'rowIndex' | 'updatedAt'>) => {
    const now = new Date();
    const nowStr = formatThaiTimestamp(now);
    const itemWithMeta: ProductItem = {
      ...newProduct,
      rowIndex: products.length + 2,
      updatedAt: nowStr,
    };

    const updated = [itemWithMeta, ...products.filter((p) => p.sku !== newProduct.sku)];
    setProducts(updated);
    saveToLocalCache(dbInfo, updated, transactions);

    if (dbInfo && user) {
      try {
        await addProductToSheet(dbInfo, newProduct, user?.email || 'ผู้ดูแลคลังสินค้า');
        await handleRefreshData();
      } catch (err) {
        console.warn('Google Sheets sync skipped:', err);
      }
    }
  };

  const handleUpdateProduct = async (updatedProduct: ProductItem) => {
    const updated = products.map((p) => (p.sku === updatedProduct.sku ? updatedProduct : p));
    setProducts(updated);
    saveToLocalCache(dbInfo, updated, transactions);

    if (dbInfo && user) {
      try {
        await updateProductInSheet(dbInfo, updatedProduct);
        await handleRefreshData();
      } catch (err) {
        console.warn('Google Sheets sync skipped:', err);
      }
    }
  };

  const handleDeleteProduct = async (productToDelete: ProductItem) => {
    const updated = products.filter((p) => p.sku !== productToDelete.sku);
    setProducts(updated);
    saveToLocalCache(dbInfo, updated, transactions);

    if (dbInfo && user) {
      try {
        await deleteProductFromSheet(dbInfo, productToDelete);
        await handleRefreshData();
      } catch (err) {
        console.warn('Google Sheets sync skipped:', err);
      }
    }
  };

  const handleRecordBatchMovements = async (
    items: Array<{
      product: ProductItem;
      type: TransactionType;
      quantity: number;
      reference: string;
      operator: string;
      note: string;
      seller?: string;
      expiryDate?: string;
    }>
  ) => {
    if (items.length === 0) return;
    const now = new Date();
    const nowStr = formatThaiTimestamp(now);

    const runningProductMap = new Map<string, ProductItem>(
      products.map((p) => [p.sku, { ...p }])
    );
    const newTxList: StockTransaction[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const prod = runningProductMap.get(item.product.sku)!;
      const roundedQty = Number(item.quantity.toFixed(2));
      const diff = item.type === 'IN' ? roundedQty : -roundedQty;
      const newBal = Number(Math.max(0, prod.currentStock + diff).toFixed(2));
      const txId =
        (item.type === 'IN' ? 'RCV-' : 'ISS-') +
        Date.now().toString().slice(-6) +
        (items.length > 1 ? `-${i + 1}` : '');

      const effectiveSeller =
        item.seller?.trim() || (prod.seller && prod.seller !== '-' ? prod.seller : '-');
      const effectiveExpiry =
        item.expiryDate?.trim() ||
        (prod.expiryDate && prod.expiryDate !== '-' ? prod.expiryDate : '-');

      const tx: StockTransaction = {
        rowIndex: transactions.length + newTxList.length + 2,
        txId,
        timestamp: nowStr,
        type: item.type,
        sku: prod.sku,
        productName: prod.name,
        quantity: roundedQty,
        unit: prod.unit,
        balanceAfter: newBal,
        reference: item.reference?.trim() || '-',
        operator: item.operator?.trim() || user?.email || 'ผู้ดูแลคลังสินค้า',
        note: item.note?.trim() || '-',
        seller: effectiveSeller,
        expiryDate: effectiveExpiry,
      };

      prod.currentStock = newBal;
      prod.updatedAt = nowStr;
      if (item.type === 'IN') {
        if (item.seller?.trim()) prod.seller = item.seller.trim();
        if (item.expiryDate?.trim()) prod.expiryDate = item.expiryDate.trim();
      }

      newTxList.push(tx);
    }

    const updatedProducts = products.map((p) => runningProductMap.get(p.sku) || p);
    // Newest transactions first
    const updatedTx = [...newTxList.reverse(), ...transactions];

    setProducts(updatedProducts);
    setTransactions(updatedTx);
    saveToLocalCache(dbInfo, updatedProducts, updatedTx);

    if (dbInfo && user) {
      try {
        await recordBatchStockMovements(dbInfo, items);
        await handleRefreshData();
      } catch (err) {
        console.warn('Google Sheets sync skipped:', err);
      }
    }
  };

  const handleRecordMovement = async (params: {
    product: ProductItem;
    type: TransactionType;
    quantity: number;
    reference: string;
    operator: string;
    note: string;
    seller?: string;
    expiryDate?: string;
  }) => {
    await handleRecordBatchMovements([params]);
  };

  const handleSeedSampleData = async () => {
    setProducts(INITIAL_SAMPLE_PRODUCTS);
    setTransactions(INITIAL_SAMPLE_TX);
    saveToLocalCache(dbInfo, INITIAL_SAMPLE_PRODUCTS, INITIAL_SAMPLE_TX);

    if (dbInfo && user) {
      try {
        await seedSampleInventoryData(dbInfo, user?.email || 'ผู้ดูแลคลังสินค้า');
        await handleRefreshData();
      } catch (err) {
        console.warn('Google Sheets sync skipped:', err);
      }
    }
  };

  const handleSwitchSpreadsheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = customSheetInput.trim();
    if (!raw) return;
    // Extract spreadsheetId if user pasted a full Google Sheets URL
    const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const extractedId = match ? match[1] : raw;
    setIsSheetConfigOpen(false);
    await initializeAndLoadSheet(extractedId);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] flex flex-col pb-20 md:pb-10">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white/85 backdrop-blur-md border-b border-[#E5E5EA]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#manage"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('manage');
          }}
          className="text-lg font-bold tracking-tight text-[#1D1D1F] whitespace-nowrap shrink-0"
        >
          Cupertino Stock
        </a>

        {/* Zone 2: 4 clean single-line text navigation links with icons */}
        <nav className="hidden md:flex items-center gap-1 bg-[#F5F5F7] p-1 rounded-2xl border border-[#E5E5EA]">
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'manage'
                ? 'bg-white text-[#1D1D1F] shadow-xs'
                : 'text-[#6E6E73] hover:text-[#1D1D1F]'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-[#0071E3]" />
            <span>จัดการสต๊อก</span>
            <span className="font-mono-tabular text-[10px] text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-md">
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stock-in')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'stock-in'
                ? 'bg-white text-[#1D1D1F] shadow-xs'
                : 'text-[#6E6E73] hover:text-[#1D1D1F]'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>รับเข้าสินค้า</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stock-out')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'stock-out'
                ? 'bg-white text-[#1D1D1F] shadow-xs'
                : 'text-[#6E6E73] hover:text-[#1D1D1F]'
            }`}
          >
            <ArrowUpFromLine className="w-3.5 h-3.5 text-[#D97706]" />
            <span>เบิกสินค้า</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'report'
                ? 'bg-white text-[#1D1D1F] shadow-xs'
                : 'text-[#6E6E73] hover:text-[#1D1D1F]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#0071E3]" />
            <span>รายงานคงเหลือ</span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={handleRefreshData}
              disabled={isLoadingData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1D1D1F] rounded-xl hover:bg-[#3A3A3C] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>{isLoadingData ? 'กำลังซิงค์...' : 'ซิงค์ Google Sheets'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRefreshData}
              disabled={isLoadingData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1D1D1F] rounded-xl hover:bg-[#3A3A3C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>รีเฟรชข้อมูล</span>
            </button>
          )}
        </div>
      </header>

      {/* Workspace Context Bar (Below Top Bar) */}
      <div className="bg-white border-b border-[#E5E5EA] px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-[#6E6E73]">
          <div className="flex flex-wrap items-center gap-2">
            {user && dbInfo ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[#16A34A] font-semibold bg-[#16A34A]/10 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"></span>
                  บันทึกข้อมูลลง Google Sheets: <strong className="text-[#1D1D1F]">{dbInfo.spreadsheetTitle}</strong>
                </span>
                {dbInfo.spreadsheetUrl && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline">·</span>
                    <a
                      href={dbInfo.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#0071E3] hover:underline font-semibold"
                    >
                      <span>เปิดตาราง Sheet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setCustomSheetInput(dbInfo?.spreadsheetId || '');
                    setIsSheetConfigOpen(true);
                  }}
                  className="text-[#6E6E73] hover:text-[#1D1D1F] underline cursor-pointer"
                >
                  เปลี่ยนไฟล์ Sheet
                </button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[#16A34A] font-medium bg-[#16A34A]/10 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A]"></span>
                  คลังสินค้าพร้อมใช้งานทันที (บันทึกลงเครื่องอัตโนมัติ)
                </span>
                <button
                  type="button"
                  onClick={handleLogin}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0071E3] hover:text-[#005BB5] bg-[#0071E3]/10 hover:bg-[#0071E3]/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>เชื่อมต่อ Google Sheets เพื่อบันทึกลงคลาวด์</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PWAInstallButton />
            {user?.email && (
              <>
                <span className="hidden sm:inline">
                  ผู้ใช้งาน: <strong className="font-medium text-[#1D1D1F]">{user.email}</strong>
                </span>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 text-[#DC2626] hover:underline font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ยกเลิกเชื่อมต่อ</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
        {globalError && (
          <div className="mb-6 p-4 rounded-2xl bg-[#DC2626]/10 border border-[#DC2626]/20 flex items-center justify-between gap-4 text-xs text-[#DC2626]">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={handleRefreshData}
              className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {/* 7-Day Expiry Advance Warning Banner */}
        <ExpiryAlertBanner
          products={products}
          onQuickStockOut={(sku) => handleNavigateToMovement('OUT', sku)}
        />

        {activeTab === 'manage' && (
          <StockManageView
            products={products}
            isLoading={isLoadingData}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onSeedSampleData={handleSeedSampleData}
            openConfirmDialog={openConfirmDialog}
            onNavigateToMovement={handleNavigateToMovement}
          />
        )}

        {activeTab === 'stock-in' && (
          <StockMovementView
            mode="IN"
            products={products}
            transactions={transactions}
            operatorEmail={user?.email || ''}
            preselectedSku={preselectedSku}
            onRecordMovement={handleRecordMovement}
            onRecordBatchMovements={handleRecordBatchMovements}
            openConfirmDialog={openConfirmDialog}
          />
        )}

        {activeTab === 'stock-out' && (
          <StockMovementView
            mode="OUT"
            products={products}
            transactions={transactions}
            operatorEmail={user?.email || ''}
            preselectedSku={preselectedSku}
            onRecordMovement={handleRecordMovement}
            onRecordBatchMovements={handleRecordBatchMovements}
            openConfirmDialog={openConfirmDialog}
          />
        )}

        {activeTab === 'report' && (
          <StockReportView
            products={products}
            transactions={transactions}
            dbInfo={dbInfo}
            onNavigateToMovement={handleNavigateToMovement}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-friendly iOS Cupertino style) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] grid grid-cols-4 px-1 py-1.5 shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('manage')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all min-h-[48px] cursor-pointer ${
            activeTab === 'manage'
              ? 'text-[#0071E3] bg-[#0071E3]/10 font-bold'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap mt-0.5">จัดการสต๊อก</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock-in')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all min-h-[48px] cursor-pointer ${
            activeTab === 'stock-in'
              ? 'text-[#16A34A] bg-[#16A34A]/10 font-bold'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <ArrowDownToLine className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap mt-0.5">รับเข้าสินค้า</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock-out')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all min-h-[48px] cursor-pointer ${
            activeTab === 'stock-out'
              ? 'text-[#D97706] bg-[#D97706]/10 font-bold'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <ArrowUpFromLine className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap mt-0.5">เบิกสินค้า</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all min-h-[48px] cursor-pointer ${
            activeTab === 'report'
              ? 'text-[#0071E3] bg-[#0071E3]/10 font-bold'
              : 'text-[#6E6E73] hover:text-[#1D1D1F]'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap mt-0.5">รายงานคงเหลือ</span>
        </button>
      </nav>

      {/* Switch Custom Google Sheet Modal */}
      {isSheetConfigOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E5EA] shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1D1D1F]">
                ตั้งค่าไฟล์ Google Sheets
              </h3>
              <button
                type="button"
                onClick={() => setIsSheetConfigOpen(false)}
                className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#6E6E73] leading-relaxed">
              วางลิงก์ URL หรือ Spreadsheet ID ของไฟล์ Google Sheets ที่สร้างผ่านแอปนี้ หรือปล่อยว่างเพื่อใช้ไฟล์มาตรฐานของระบบ
            </p>
            <form onSubmit={handleSwitchSpreadsheet} className="space-y-4">
              <input
                type="text"
                value={customSheetInput}
                onChange={(e) => setCustomSheetInput(e.target.value)}
                placeholder="วางลิงก์ Google Sheets หรือ Spreadsheet ID..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSheetConfigOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#1D1D1F] bg-[#F5F5F7]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#005BB5]"
                >
                  เชื่อมต่อตาราง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Dialog for all Sheets mutations */}
      <ConfirmModal dialog={confirmDialog} onClose={closeConfirmDialog} />

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />
    </div>
  );
}
