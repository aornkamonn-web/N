export interface ProductItem {
  rowIndex: number; // 1-based row index in Google Sheet (Row 2 is first item)
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  currentStock: number;
  minStock: number;
  location: string;
  updatedAt: string;
  seller?: string; // ชื่อผู้ขาย / ซัพพลายเออร์
  expiryDate?: string; // วันหมดอายุ (YYYY-MM-DD)
}

export type TransactionType = 'IN' | 'OUT';

export interface StockTransaction {
  rowIndex?: number;
  txId: string;
  timestamp: string;
  type: TransactionType;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  balanceAfter: number;
  reference: string; // เลขที่ใบสั่งซื้อ (PO) / เลขที่ใบส่งของ
  operator: string;
  note: string;
  seller?: string; // ชื่อผู้ขาย / ร้านค้า
  expiryDate?: string; // วันหมดอายุของล็อตที่รับเข้า (YYYY-MM-DD)
}

export interface SheetDatabaseInfo {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  productsSheetName: string;
  transactionsSheetName: string;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  variant?: 'primary' | 'danger' | 'success';
  onConfirm: () => Promise<void>;
}
