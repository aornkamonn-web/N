import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  Minus,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ScanLine,
  X,
  CalendarClock,
  FileText,
  Lock,
  ChevronDown,
  Users,
  Trash2,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
} from 'lucide-react';
import { ProductItem, StockTransaction, TransactionType, ConfirmDialogState } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { getExpiryStatus } from '../utils/expiry';
import { formatDateYMD } from '../services/sheets';

const OPERATORS_STORAGE_KEY = 'cupertino_stock_operators_list_v1';
const DEFAULT_OPERATORS = [
  'ผู้ดูแลคลังสินค้า',
  'เจ้าหน้าที่ฝ่ายคลัง',
  'เจ้าหน้าที่ฝ่ายจัดซื้อ',
  'เจ้าหน้าที่ฝ่ายผลิต',
  'อรวรรณ นาควิจิตร',
  'สมชาย ใจดี',
];

interface StockMovementViewProps {
  mode: TransactionType; // 'IN' for หน้ารับเข้าสินค้า, 'OUT' for หน้าเบิกสินค้า
  products: ProductItem[];
  transactions: StockTransaction[];
  operatorEmail: string;
  preselectedSku?: string;
  onRecordMovement: (params: {
    product: ProductItem;
    type: TransactionType;
    quantity: number;
    reference: string;
    operator: string;
    note: string;
    seller?: string;
    expiryDate?: string;
  }) => Promise<void>;
  onRecordBatchMovements?: (items: Array<{
    product: ProductItem;
    type: TransactionType;
    quantity: number;
    reference: string;
    operator: string;
    note: string;
    seller?: string;
    expiryDate?: string;
  }>) => Promise<void>;
  openConfirmDialog: (config: Omit<ConfirmDialogState, 'isOpen'>) => void;
}

export const StockMovementView: React.FC<StockMovementViewProps> = ({
  mode,
  products,
  transactions,
  operatorEmail,
  preselectedSku,
  onRecordMovement,
  onRecordBatchMovements,
  openConfirmDialog,
}) => {
  const isStockIn = mode === 'IN';
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedSku, setSelectedSku] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [seller, setSeller] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [reference, setReference] = useState<string>('');

  // Multi-PO / Lot Allocation State for Stock Out (เบิกสินค้า)
  // Mapping poNumber -> allocated quantity (e.g. { 'PO-2026-101': 5, 'PO-2026-102': 3 })
  const [selectedPoAllocations, setSelectedPoAllocations] = useState<Record<string, number>>({});
  // Master total quantity input for Stock Out to allow quick adjustments & auto FIFO allocation
  const [desiredTotalQty, setDesiredTotalQty] = useState<string>('1');

  // Operator Dropdown & Dynamic List Management (เพิ่ม-ลดรายชื่อได้)
  const [operators, setOperators] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(OPERATORS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_OPERATORS;
  });

  const [operator, setOperator] = useState<string>(() => {
    if (operatorEmail) return operatorEmail;
    try {
      const saved = localStorage.getItem(OPERATORS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      }
    } catch {}
    return DEFAULT_OPERATORS[0];
  });

  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState<boolean>(false);
  const [newOperatorName, setNewOperatorName] = useState<string>('');
  const [operatorError, setOperatorError] = useState<string | null>(null);

  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [scanSuccessBanner, setScanSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OPERATORS_STORAGE_KEY, JSON.stringify(operators));
    } catch {}
  }, [operators]);

  // If operatorEmail is provided and not in operators, add it automatically
  useEffect(() => {
    if (operatorEmail && !operators.includes(operatorEmail)) {
      setOperators((prev) => [operatorEmail, ...prev]);
      setOperator(operatorEmail);
    }
  }, [operatorEmail, operators]);

  const handleAddOperator = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newOperatorName.trim();
    if (!clean) {
      setOperatorError('กรุณากรอกชื่อผู้ทำรายการ');
      return;
    }
    if (operators.includes(clean)) {
      setOperatorError('มีรายชื่อนี้อยู่ในระบบแล้ว');
      setOperator(clean);
      return;
    }
    const updated = [...operators, clean];
    setOperators(updated);
    setOperator(clean);
    setNewOperatorName('');
    setOperatorError(null);
  };

  const handleDeleteOperator = (nameToRemove: string) => {
    if (operators.length <= 1) {
      setOperatorError('ต้องมีรายชื่อผู้ทำรายการอย่างน้อย 1 ชื่อในระบบ');
      return;
    }
    const updated = operators.filter((op) => op !== nameToRemove);
    setOperators(updated);
    if (operator === nameToRemove) {
      setOperator(updated[0]);
    }
    setOperatorError(null);
  };

  const handleBarcodeScanned = (scannedCode: string) => {
    setIsScannerOpen(false);
    setErrorMsg(null);
    const normalized = scannedCode.trim();
    if (!normalized) return;

    // Match exact SKU (case-insensitive) or partial SKU/Name match
    const exactMatch = products.find(
      (p) => p.sku.toLowerCase() === normalized.toLowerCase()
    );
    const partialMatch =
      exactMatch ||
      products.find(
        (p) =>
          p.sku.toLowerCase().includes(normalized.toLowerCase()) ||
          normalized.toLowerCase().includes(p.sku.toLowerCase())
      );

    if (partialMatch) {
      setSelectedSku(partialMatch.sku);
      setSearchProduct(partialMatch.sku);
      setScanSuccessBanner(`สแกนสำเร็จ: เลือกสินค้า ${partialMatch.sku} (${partialMatch.name})`);
    } else {
      setSearchProduct(normalized);
      setScanSuccessBanner(null);
      setErrorMsg(`สแกนพบรหัส "${normalized}" แต่ไม่พบสินค้าที่ตรงกันในคลัง`);
    }
  };

  useEffect(() => {
    if (preselectedSku && products.some((p) => p.sku === preselectedSku)) {
      setSelectedSku(preselectedSku);
    } else if (!selectedSku && products.length > 0) {
      setSelectedSku(products[0].sku);
    }
  }, [preselectedSku, products]);

  useEffect(() => {
    if (operatorEmail) {
      setOperator(operatorEmail);
    }
  }, [operatorEmail]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.sku === selectedSku) || null,
    [products, selectedSku]
  );

  // Calculate Purchase Order (เลขที่ใบสั่งซื้อ) records for the selected product from transaction history
  const purchaseOrdersForSelected = useMemo(() => {
    if (!selectedProduct) return [];

    const poMap = new Map<
      string,
      {
        poNumber: string;
        receivedQty: number;
        issuedQty: number;
        remainingQty: number;
        outCount: number;
        expiryDate: string;
        seller: string;
        firstReceivedDate: string;
        firstReceivedIndex: number;
        lastTimestamp: string;
        isSelectable: boolean;
        disabledReason: string;
      }
    >();

    // Process transactions in chronological order (oldest first)
    const chronologicalTx = [...transactions]
      .filter((t) => t.sku === selectedProduct.sku)
      .reverse();

    let receiptIndexCounter = 0;

    for (let i = 0; i < chronologicalTx.length; i++) {
      const tx = chronologicalTx[i];
      const poKey = tx.reference && tx.reference !== '-' ? tx.reference.trim() : '';
      if (!poKey) continue;

      const existing = poMap.get(poKey) || {
        poNumber: poKey,
        receivedQty: 0,
        issuedQty: 0,
        remainingQty: 0,
        outCount: 0,
        expiryDate: tx.expiryDate && tx.expiryDate !== '-' ? tx.expiryDate : '-',
        seller: tx.seller && tx.seller !== '-' ? tx.seller : '-',
        firstReceivedDate: tx.type === 'IN' ? tx.timestamp : '',
        firstReceivedIndex: tx.type === 'IN' ? ++receiptIndexCounter : 999999,
        lastTimestamp: tx.timestamp,
        isSelectable: true,
        disabledReason: '',
      };

      if (tx.type === 'IN') {
        existing.receivedQty = Number((existing.receivedQty + tx.quantity).toFixed(2));
        if (!existing.firstReceivedDate) {
          existing.firstReceivedDate = tx.timestamp;
          existing.firstReceivedIndex = ++receiptIndexCounter;
        }
        if (tx.expiryDate && tx.expiryDate !== '-') existing.expiryDate = tx.expiryDate;
        if (tx.seller && tx.seller !== '-') existing.seller = tx.seller;
        existing.lastTimestamp = tx.timestamp;
      } else {
        existing.issuedQty = Number((existing.issuedQty + tx.quantity).toFixed(2));
        existing.outCount += 1;
      }

      existing.remainingQty = Number(
        Math.max(0, existing.receivedQty - existing.issuedQty).toFixed(2)
      );

      if (existing.remainingQty <= 0) {
        existing.isSelectable = false;
        existing.disabledReason = 'ไม่มีสินค้าเหลือในใบสั่งซื้อนี้ (คงเหลือ 0)';
      } else {
        existing.isSelectable = true;
        existing.disabledReason = '';
      }

      poMap.set(poKey, existing);
    }

    // Fallback: If no PO transactions were recorded yet but product has positive stock
    if (poMap.size === 0 && selectedProduct.currentStock > 0) {
      const fallbackPo = 'LOT-INITIAL';
      poMap.set(fallbackPo, {
        poNumber: fallbackPo,
        receivedQty: selectedProduct.currentStock,
        issuedQty: 0,
        remainingQty: selectedProduct.currentStock,
        outCount: 0,
        expiryDate:
          selectedProduct.expiryDate && selectedProduct.expiryDate !== '-'
            ? selectedProduct.expiryDate
            : '-',
        seller:
          selectedProduct.seller && selectedProduct.seller !== '-'
            ? selectedProduct.seller
            : '-',
        firstReceivedDate: 'ยอดยกมาเริ่มต้น',
        firstReceivedIndex: 1,
        lastTimestamp: '',
        isSelectable: true,
        disabledReason: '',
      });
    }

    // Sort POs: Selectable first, ordered by FIFO/FEFO priority
    return Array.from(poMap.values())
      .filter((po) => po.receivedQty > 0)
      .sort((a, b) => {
        if (a.isSelectable && !b.isSelectable) return -1;
        if (!a.isSelectable && b.isSelectable) return 1;

        // 1. FEFO (First Expired First Out)
        const hasExpA = a.expiryDate && a.expiryDate !== '-';
        const hasExpB = b.expiryDate && b.expiryDate !== '-';
        if (hasExpA && hasExpB) {
          const expDiff = a.expiryDate.localeCompare(b.expiryDate);
          if (expDiff !== 0) return expDiff;
        } else if (hasExpA && !hasExpB) {
          return -1;
        } else if (!hasExpA && hasExpB) {
          return 1;
        }

        // 2. FIFO (First In First Out)
        if (a.firstReceivedIndex !== b.firstReceivedIndex) {
          return a.firstReceivedIndex - b.firstReceivedIndex;
        }
        return a.firstReceivedDate.localeCompare(b.firstReceivedDate);
      });
  }, [selectedProduct, transactions]);

  // Selectable POs (remaining stock > 0)
  const selectablePos = useMemo(
    () => purchaseOrdersForSelected.filter((po) => po.isSelectable),
    [purchaseOrdersForSelected]
  );

  // Sorted selectable POs strictly by FIFO/FEFO priority with 1-based ranks
  const sortedFifoPos = useMemo(() => {
    return [...selectablePos].map((po, idx) => ({
      ...po,
      fifoRank: idx + 1,
      isRecommendedFifo: idx === 0,
    }));
  }, [selectablePos]);

  // FIFO / FEFO Warning Computation:
  // Detects if the user selected a newer PO while an older or sooner-expiring Lot was skipped or under-allocated
  const fifoWarningInfo = useMemo(() => {
    if (isStockIn || sortedFifoPos.length === 0) return null;

    const activeAllocations = Object.entries(selectedPoAllocations).filter(
      ([_, q]) => Number(q) > 0
    );
    if (activeAllocations.length === 0) return null;

    const selectedKeys = new Set(activeAllocations.map(([k]) => k));
    let maxSelectedRank = 0;

    for (const [key] of activeAllocations) {
      const matched = sortedFifoPos.find((p) => p.poNumber === key);
      if (matched && matched.fifoRank > maxSelectedRank) {
        maxSelectedRank = matched.fifoRank;
      }
    }

    // 1. Skipped older or earlier-expiring POs (rank < maxSelectedRank, but completely unselected)
    const skippedOlderPos = sortedFifoPos.filter(
      (po) => po.fifoRank < maxSelectedRank && !selectedKeys.has(po.poNumber) && po.remainingQty > 0
    );

    // 2. Under-allocated older POs: an older PO is selected but not fully depleted while a newer PO is also selected
    const underAllocatedOlderPos = sortedFifoPos.filter((po) => {
      if (!selectedKeys.has(po.poNumber)) return false;
      const allocated = selectedPoAllocations[po.poNumber] || 0;
      if (allocated >= po.remainingQty) return false;
      return activeAllocations.some(([k]) => {
        const other = sortedFifoPos.find((p) => p.poNumber === k);
        return other && other.fifoRank > po.fifoRank;
      });
    });

    if (skippedOlderPos.length === 0 && underAllocatedOlderPos.length === 0) {
      return null;
    }

    return {
      skippedOlderPos,
      underAllocatedOlderPos,
    };
  }, [isStockIn, sortedFifoPos, selectedPoAllocations]);

  // Total quantity for Stock Out (sum of individual PO allocations)
  const totalOutQuantity = useMemo(() => {
    if (isStockIn) return 0;
    return Number(
      Object.values(selectedPoAllocations)
        .reduce((sum, q) => sum + (Number(q) || 0), 0)
        .toFixed(2)
    );
  }, [isStockIn, selectedPoAllocations]);

  // Selected POs formatted list with non-zero allocation
  const selectedPosList = useMemo(() => {
    return purchaseOrdersForSelected
      .filter((po) => (selectedPoAllocations[po.poNumber] ?? 0) > 0)
      .map((po) => ({
        ...po,
        allocatedQty: selectedPoAllocations[po.poNumber] ?? 0,
      }));
  }, [purchaseOrdersForSelected, selectedPoAllocations]);

  // For Stock In mode: single selected PO reference info
  const selectedPoInfo = useMemo(
    () => purchaseOrdersForSelected.find((po) => po.poNumber === reference) || null,
    [purchaseOrdersForSelected, reference]
  );

  // Initialize selected product & default PO selection on SKU change
  useEffect(() => {
    if (selectedProduct) {
      setSeller(
        selectedProduct.seller && selectedProduct.seller !== '-' ? selectedProduct.seller : ''
      );
      setExpiryDate(
        selectedProduct.expiryDate && selectedProduct.expiryDate !== '-'
          ? selectedProduct.expiryDate
          : ''
      );
      if (!isStockIn) {
        // Automatically allocate to the top recommended FIFO/FEFO PO by default
        if (sortedFifoPos.length > 0) {
          const topPo = sortedFifoPos[0];
          const defaultQty = Number(Math.min(1, topPo.remainingQty).toFixed(2));
          setSelectedPoAllocations({ [topPo.poNumber]: defaultQty });
          setDesiredTotalQty(String(defaultQty));
          if (topPo.seller && topPo.seller !== '-') {
            setSeller(topPo.seller);
          }
        } else {
          setSelectedPoAllocations({});
          setDesiredTotalQty('1');
        }
      } else {
        setReference('');
        setSelectedPoAllocations({});
      }
    }
  }, [selectedProduct?.sku, isStockIn, sortedFifoPos.length > 0 ? sortedFifoPos[0].poNumber : '']);

  const filteredProductSelector = useMemo(() => {
    const q = searchProduct.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.seller && p.seller.toLowerCase().includes(q))
    );
  }, [products, searchProduct]);

  const recentModeTransactions = useMemo(
    () => transactions.filter((t) => t.type === mode).slice(0, 15),
    [transactions, mode]
  );

  const projectedBalance = useMemo(() => {
    if (!selectedProduct) return 0;
    if (isStockIn) {
      const qty = parseFloat(quantity) || 0;
      return Number((selectedProduct.currentStock + qty).toFixed(2));
    } else {
      return Number((selectedProduct.currentStock - totalOutQuantity).toFixed(2));
    }
  }, [selectedProduct, isStockIn, quantity, totalOutQuantity]);

  // Adjust quantity for Stock In mode
  const handleAdjustQuantity = (delta: number) => {
    setErrorMsg(null);
    setQuantity((prev) => {
      const currentVal = parseFloat(prev) || 0;
      const next = Number(Math.max(0.01, currentVal + delta).toFixed(2));
      return String(next);
    });
  };

  // Auto-allocate quantity across POs strictly according to FIFO / FEFO order
  const handleAutoAllocateFifo = (targetTotal?: number) => {
    setErrorMsg(null);
    if (!selectedProduct || sortedFifoPos.length === 0) return;

    let needed =
      targetTotal !== undefined && targetTotal > 0
        ? targetTotal
        : totalOutQuantity > 0
        ? totalOutQuantity
        : parseFloat(desiredTotalQty) || 1;

    needed = Math.min(needed, selectedProduct.currentStock);
    let remaining = needed;
    const nextAllocations: Record<string, number> = {};

    for (const po of sortedFifoPos) {
      if (remaining <= 0) break;
      const take = Math.min(po.remainingQty, remaining);
      if (take > 0) {
        nextAllocations[po.poNumber] = Number(take.toFixed(2));
        remaining = Number((remaining - take).toFixed(2));
      }
    }

    setSelectedPoAllocations(nextAllocations);
    setDesiredTotalQty(String(Number(needed.toFixed(2))));
  };

  // Adjust total quantity for Stock Out mode (automatically distributes to oldest POs)
  const handleAdjustOutTotal = (delta: number) => {
    setErrorMsg(null);
    if (!selectedProduct) return;
    const currentVal = totalOutQuantity > 0 ? totalOutQuantity : parseFloat(desiredTotalQty) || 0;
    const nextVal = Number(
      Math.max(0.01, Math.min(selectedProduct.currentStock, currentVal + delta)).toFixed(2)
    );
    handleAutoAllocateFifo(nextVal);
  };

  // Toggle selection of a specific PO in Stock Out mode
  const handleTogglePo = (poNumber: string) => {
    setErrorMsg(null);
    const targetPo = purchaseOrdersForSelected.find((p) => p.poNumber === poNumber);
    if (!targetPo || !targetPo.isSelectable) return;

    setSelectedPoAllocations((prev) => {
      const next = { ...prev };
      if (next[poNumber] && next[poNumber] > 0) {
        delete next[poNumber];
      } else {
        // Default allocate remaining needed or 1 unit
        next[poNumber] = Number(Math.min(1, targetPo.remainingQty).toFixed(2));
      }
      return next;
    });
  };

  // Adjust quantity for a specific PO
  const handleAdjustPoQty = (poNumber: string, delta: number) => {
    setErrorMsg(null);
    const targetPo = purchaseOrdersForSelected.find((p) => p.poNumber === poNumber);
    if (!targetPo) return;
    const current = selectedPoAllocations[poNumber] || 0;
    const nextVal = Number(
      Math.min(targetPo.remainingQty, Math.max(0, current + delta)).toFixed(2)
    );

    setSelectedPoAllocations((prev) => {
      const next = { ...prev };
      if (nextVal <= 0) {
        delete next[poNumber];
      } else {
        next[poNumber] = nextVal;
      }
      return next;
    });
  };

  // Directly set quantity for a specific PO
  const handleSetPoQty = (poNumber: string, valStr: string) => {
    setErrorMsg(null);
    const targetPo = purchaseOrdersForSelected.find((p) => p.poNumber === poNumber);
    if (!targetPo) return;
    const num = parseFloat(valStr) || 0;
    const clamped = Number(Math.min(targetPo.remainingQty, Math.max(0, num)).toFixed(2));

    setSelectedPoAllocations((prev) => {
      const next = { ...prev };
      if (clamped <= 0) {
        delete next[poNumber];
      } else {
        next[poNumber] = clamped;
      }
      return next;
    });
  };

  // Maximize withdrawal for a specific PO
  const handleMaxPoQty = (poNumber: string) => {
    setErrorMsg(null);
    const targetPo = purchaseOrdersForSelected.find((p) => p.poNumber === poNumber);
    if (!targetPo || !targetPo.isSelectable) return;

    setSelectedPoAllocations((prev) => ({
      ...prev,
      [poNumber]: targetPo.remainingQty,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedProduct) {
      setErrorMsg('กรุณาเลือกรายการสินค้าที่ต้องการทำรายการ');
      return;
    }

    // 1. Stock In Submission
    if (isStockIn) {
      const cleanPo = reference.trim();
      if (!cleanPo) {
        setErrorMsg('กรุณาระบุเลขที่ใบสั่งซื้อ (PO) สำหรับการรับเข้าสินค้า');
        return;
      }

      // Prevent duplicate PO on Stock In for the same SKU if that PO already exists
      const duplicateInPo = purchaseOrdersForSelected.find(
        (po) => po.poNumber.toLowerCase() === cleanPo.toLowerCase()
      );
      if (duplicateInPo) {
        setErrorMsg(
          `เลขที่ใบสั่งซื้อ "${cleanPo}" มีประวัติรับเข้าสำหรับสินค้านี้แล้ว กรุณาระบุเลขที่ใบสั่งซื้อใหม่`
        );
        return;
      }

      const cleanQty = Number((parseFloat(quantity) || 0).toFixed(2));
      if (!cleanQty || cleanQty <= 0) {
        setErrorMsg('กรุณาระบุจำนวนสินค้ามากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
        return;
      }

      const cleanSeller =
        seller.trim() ||
        (selectedProduct.seller && selectedProduct.seller !== '-' ? selectedProduct.seller : '-');
      const cleanExpiry =
        expiryDate.trim() ||
        (selectedProduct.expiryDate && selectedProduct.expiryDate !== '-'
          ? selectedProduct.expiryDate
          : '-');

      openConfirmDialog({
        title: `ยืนยันการรับเข้าสินค้า "${selectedProduct.name}"?`,
        description:
          'ระบบจะทำการบวกเพิ่มยอดคงเหลือในตาราง Products และบันทึกประวัติการรับเข้าพร้อมเลขที่ใบสั่งซื้อลงในตาราง Transactions บน Google Sheets',
        details: [
          `รหัสสินค้า: ${selectedProduct.sku} · ${selectedProduct.name}`,
          `เลขที่ใบสั่งซื้อ (PO): ${cleanPo}`,
          `ชื่อผู้ขาย/ซัพพลายเออร์: ${cleanSeller}`,
          `วันหมดอายุสินค้า: ${cleanExpiry === '-' ? 'ไม่ระบุ' : cleanExpiry}`,
          `จำนวนที่ทำรายการ: +${cleanQty.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })} ${selectedProduct.unit}`,
          `ยอดคงเหลือ: ${selectedProduct.currentStock.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })} → ${projectedBalance.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })} ${selectedProduct.unit}`,
          `ผู้ทำรายการ: ${operator.trim() || '-'} · หมายเหตุ: ${note.trim() || '-'}`,
        ],
        confirmLabel: 'ยืนยันรับเข้าสต๊อก',
        variant: 'success',
        onConfirm: async () => {
          await onRecordMovement({
            product: selectedProduct,
            type: 'IN',
            quantity: cleanQty,
            reference: cleanPo,
            operator: operator.trim() || operatorEmail || 'ผู้ใช้งานระบบ',
            note: note.trim() || '-',
            seller: cleanSeller,
            expiryDate: cleanExpiry,
          });
          setQuantity('1');
          setReference('');
          setNote('');
        },
      });
      return;
    }

    // 2. Stock Out Submission (Supports Multiple POs / Lots)
    const activeAllocations = Object.entries(selectedPoAllocations)
      .filter(([_, q]) => Number(q) > 0)
      .map(([poNumber, qty]) => {
        const po = purchaseOrdersForSelected.find((p) => p.poNumber === poNumber);
        return {
          poNumber,
          quantity: Number(Number(qty).toFixed(2)),
          po,
        };
      });

    if (activeAllocations.length === 0) {
      setErrorMsg('กรุณาคลิกเลือกเลขที่ใบสั่งซื้อ (PO) / Lot อย่างน้อย 1 รายการเพื่อทำการเบิกสินค้า');
      return;
    }

    for (const item of activeAllocations) {
      if (!item.po || !item.po.isSelectable) {
        setErrorMsg(`ไม่สามารถเบิกจากใบสั่งซื้อ ${item.poNumber} ได้ เนื่องจากไม่มีสินค้าเหลือ`);
        return;
      }
      if (item.quantity > item.po.remainingQty) {
        setErrorMsg(
          `จำนวนที่ต้องการเบิกจากใบสั่งซื้อ ${item.poNumber} (${item.quantity} ${selectedProduct.unit}) เกินกว่ายอดคงเหลือในใบสั่งซื้อนี้ (${item.po.remainingQty} ${selectedProduct.unit})`
        );
        return;
      }
    }

    if (totalOutQuantity > selectedProduct.currentStock) {
      setErrorMsg(
        `ยอดเบิกรวม (${totalOutQuantity} ${selectedProduct.unit}) เกินกว่ายอดคงเหลือรวมในคลัง (${selectedProduct.currentStock} ${selectedProduct.unit})`
      );
      return;
    }

    const actionTitle = `ยืนยันการเบิกจ่ายสินค้า "${selectedProduct.name}"?`;
    const actionDesc =
      activeAllocations.length > 1
        ? `ระบบจะทำการตัดยอดคงเหลือในตาราง Products และบันทึกประวัติการเบิกสินค้าแยกตามเลขที่ใบสั่งซื้อทั้ง ${activeAllocations.length} รายการลงในตาราง Transactions บน Google Sheets`
        : `ระบบจะทำการตัดยอดคงเหลือในตาราง Products และบันทึกใบเบิกสินค้าตามเลขที่ใบสั่งซื้อ ${activeAllocations[0].poNumber} ลงในตาราง Transactions บน Google Sheets`;

    const detailsList = [
      `รหัสสินค้า: ${selectedProduct.sku} · ${selectedProduct.name}`,
      `รายการใบสั่งซื้อ/Lot ที่เบิก (${activeAllocations.length} ใบสั่งซื้อ):`,
      ...activeAllocations.map(
        (a) =>
          `  • ${a.poNumber}: เบิก ${a.quantity} ${selectedProduct.unit} (คงเหลือใน PO: ${a.po!.remainingQty} → ${Number((a.po!.remainingQty - a.quantity).toFixed(2))} ${selectedProduct.unit}${a.po!.expiryDate !== '-' ? ` · หมดอายุ: ${a.po!.expiryDate}` : ''})`
      ),
      `ยอดเบิกรวมทั้งสิ้น: -${totalOutQuantity.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} ${selectedProduct.unit}`,
      `ยอดคงเหลือในคลัง: ${selectedProduct.currentStock.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} → ${projectedBalance.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} ${selectedProduct.unit}`,
      `ผู้ทำรายการ: ${operator.trim() || '-'} · หมายเหตุ: ${note.trim() || '-'}`,
    ];

    if (fifoWarningInfo) {
      detailsList.push(
        '⚠️ แจ้งเตือน: รายการนี้ไม่ได้เบิก Lot เก่าสุด หรือ Lot ที่ใกล้หมดอายุก่อนตามหลัก FIFO/FEFO'
      );
    }

    openConfirmDialog({
      title: actionTitle,
      description: actionDesc,
      details: detailsList,
      confirmLabel: 'ยืนยันการเบิกสินค้า',
      variant: 'primary',
      onConfirm: async () => {
        const movements = activeAllocations.map((a) => ({
          product: selectedProduct,
          type: 'OUT' as TransactionType,
          quantity: a.quantity,
          reference: a.poNumber,
          operator: operator.trim() || operatorEmail || 'ผู้ใช้งานระบบ',
          note: note.trim() || '-',
          seller: a.po!.seller && a.po!.seller !== '-' ? a.po!.seller : selectedProduct.seller,
          expiryDate:
            a.po!.expiryDate && a.po!.expiryDate !== '-'
              ? a.po!.expiryDate
              : selectedProduct.expiryDate,
        }));

        if (onRecordBatchMovements) {
          await onRecordBatchMovements(movements);
        } else {
          for (const m of movements) {
            await onRecordMovement(m);
          }
        }

        setSelectedPoAllocations({});
        setNote('');
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isStockIn ? 'bg-[#16A34A]/10 text-[#16A34A]' : 'bg-[#D97706]/10 text-[#D97706]'
              }`}
            >
              {isStockIn ? (
                <ArrowDownToLine className="w-5 h-5" />
              ) : (
                <ArrowUpFromLine className="w-5 h-5" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">
              {isStockIn ? 'หน้ารับเข้าสินค้า (Stock In)' : 'หน้าเบิกสินค้า (Stock Out)'}
            </h1>
          </div>
          <p className="text-xs text-[#6E6E73] mt-1.5">
            {isStockIn
              ? 'บันทึกการรับสินค้าเข้าคลังจากซัพพลายเออร์ หรือเพิ่มสต๊อกสินค้าพร้อมอัปเดตยอดคงเหลือลง Google Sheets ทันที'
              : 'บันทึกการเบิกจ่ายสินค้าออกจากคลัง ตรวจสอบยอดคงเหลือแบบเรียลไทม์ป้องกันสต๊อกติดลบ'}
          </p>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Picker & Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E5E5EA] p-6 space-y-6">
          {/* Step 1: Select Product */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[#1D1D1F]">
                1. เลือกสินค้าที่ต้องการ{isStockIn ? 'รับเข้า' : 'เบิกออก'}
              </label>
              <span className="text-[11px] text-[#6E6E73] font-mono-tabular">
                ทั้งหมด {products.length} รายการ
              </span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#6E6E73] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchProduct}
                  onChange={(e) => {
                    setSearchProduct(e.target.value);
                    setScanSuccessBanner(null);
                  }}
                  placeholder="พิมพ์ค้นหาชื่อสินค้า หรือสแกนรหัส SKU..."
                  className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
                {searchProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchProduct('');
                      setScanSuccessBanner(null);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E6E73] hover:text-[#1D1D1F] cursor-pointer"
                    aria-label="ล้างคำค้นหา"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1D1D1F] hover:bg-[#3A3A3C] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="สแกน QR Code หรือ Barcode ด้วยกล้อง"
              >
                <ScanLine className="w-4 h-4 text-[#38BDF8]" />
                <span>สแกน QR / บาร์โค้ด</span>
              </button>
            </div>

            {scanSuccessBanner && (
              <div className="mb-3 p-3 rounded-xl bg-[#16A34A]/10 border border-[#16A34A]/20 flex items-center justify-between gap-2 text-xs text-[#16A34A] font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{scanSuccessBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScanSuccessBanner(null)}
                  className="text-[#16A34A] hover:opacity-75 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {products.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#F5F5F7] text-xs text-[#6E6E73] text-center">
                ยังไม่มีสินค้าในระบบ กรุณาเพิ่มสินค้าที่หน้า "จัดการสต๊อก" ก่อนทำรายการ
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-[#E5E5EA] border border-[#E5E5EA] rounded-xl">
                {filteredProductSelector.map((item) => {
                  const isSelected = item.sku === selectedSku;
                  const outOfStock = item.currentStock <= 0;
                  return (
                    <button
                      key={`${item.sku}-${item.rowIndex}`}
                      type="button"
                      onClick={() => {
                        setSelectedSku(item.sku);
                        setErrorMsg(null);
                      }}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected ? 'bg-[#0071E3]/8' : 'hover:bg-[#F5F5F7]/70'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-xs font-bold text-[#0071E3]">
                            {item.sku}
                          </span>
                          <span className="text-xs font-semibold text-[#1D1D1F] truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#6E6E73] mt-0.5 flex flex-wrap items-center gap-1">
                          <span>{item.category} · คลัง {item.location}</span>
                          {item.seller && item.seller !== '-' && (
                            <span>· ผู้ขาย: {item.seller}</span>
                          )}
                          {item.expiryDate && item.expiryDate !== '-' && (
                            <span
                              className={
                                getExpiryStatus(item.expiryDate).status === 'EXPIRED'
                                  ? 'text-[#DC2626] font-semibold'
                                  : getExpiryStatus(item.expiryDate).status === 'EXPIRING_SOON'
                                  ? 'text-[#D97706] font-semibold'
                                  : 'text-[#6E6E73]'
                              }
                            >
                              · หมดอายุ: {item.expiryDate} ({getExpiryStatus(item.expiryDate).label})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`text-xs font-mono-tabular font-bold ${
                            outOfStock ? 'text-[#DC2626]' : 'text-[#1D1D1F]'
                          }`}
                        >
                          คงเหลือ {item.currentStock.toLocaleString()} {item.unit}
                        </div>
                        {isSelected && (
                          <div className="text-[11px] font-semibold text-[#0071E3]">เลือกอยู่</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Movement Details Form */}
          <form onSubmit={handleSubmit} className="space-y-5 pt-2 border-t border-[#E5E5EA]">
            {selectedProduct && (
              <div className="p-4 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-[#6E6E73]">สินค้าที่เลือกทำรายการ</div>
                  <div className="text-sm font-bold text-[#1D1D1F] mt-0.5">
                    {selectedProduct.name} ({selectedProduct.sku})
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-[11px] text-[#6E6E73]">ยอดคงเหลือหลังทำรายการ</div>
                  <div className="text-sm font-mono-tabular font-bold text-[#1D1D1F] mt-0.5">
                    {selectedProduct.currentStock.toLocaleString()} →{' '}
                    <span
                      className={
                        projectedBalance < 0
                          ? 'text-[#DC2626]'
                          : isStockIn
                          ? 'text-[#16A34A]'
                          : 'text-[#D97706]'
                      }
                    >
                      {projectedBalance.toLocaleString()} {selectedProduct.unit}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 flex items-center gap-2 text-xs text-[#DC2626]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form Fields: Switch between Stock In and Stock Out */}
            {isStockIn ? (
              /* =================== STOCK IN (รับเข้าสินค้า) =================== */
              <div className="space-y-5">
                {/* 2. Quantity Stepper for Stock In */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-bold text-[#1D1D1F]">
                      2. ระบุจำนวนที่ต้องการรับเข้า ({selectedProduct?.unit || 'หน่วย'} · ใส่ทศนิยมได้ 2 ตำแหน่ง) *
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleAdjustQuantity(-1)}
                      className="w-12 h-11 rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      aria-label="ลดจำนวน"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={quantity}
                      onChange={(e) => {
                        setErrorMsg(null);
                        setQuantity(e.target.value);
                      }}
                      placeholder="เช่น 1 หรือ 1.50"
                      className="w-full h-11 px-4 rounded-xl bg-[#F5F5F7] text-center font-mono-tabular text-base font-bold text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAdjustQuantity(1)}
                      className="w-12 h-11 rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      aria-label="เพิ่มจำนวน"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Quick Quantity Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {[0.25, 0.5, 1, 5, 10, 20, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setQuantity(String(preset));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[11px] font-mono-tabular font-medium text-[#6E6E73] hover:text-[#1D1D1F] transition-colors cursor-pointer"
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seller & Expiry Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                      ชื่อผู้ขาย / ร้านค้า / ซัพพลายเออร์ (Seller / Supplier)
                    </label>
                    <input
                      type="text"
                      value={seller}
                      onChange={(e) => setSeller(e.target.value)}
                      placeholder="ระบุชื่อผู้ขาย หรือซัพพลายเออร์..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    />
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-[#1D1D1F] mb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5 text-[#0071E3]" />
                        <span>วันหมดอายุสินค้า (แจ้งเตือนล่วงหน้า 7 วัน)</span>
                      </span>
                      {expiryDate && (
                        <button
                          type="button"
                          onClick={() => setExpiryDate('')}
                          className="text-[11px] font-normal text-[#6E6E73] hover:text-[#DC2626] underline cursor-pointer"
                        >
                          ล้างวันที่
                        </button>
                      )}
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    />
                    {/* Quick Expiry Date Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {[
                        { label: '+5 วัน (ทดสอบเตือน)', days: 5 },
                        { label: '+7 วัน', days: 7 },
                        { label: '+30 วัน', days: 30 },
                        { label: '+1 ปี', days: 365 },
                      ].map((preset) => (
                        <button
                          key={preset.days}
                          type="button"
                          onClick={() => {
                            const target = new Date(Date.now() + preset.days * 24 * 60 * 60 * 1000);
                            setExpiryDate(formatDateYMD(target));
                          }}
                          className="px-2 py-0.5 rounded-md bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[10px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] transition-colors cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    {expiryDate && (
                      <div
                        className={`mt-1.5 text-[11px] font-medium ${
                          getExpiryStatus(expiryDate).status === 'EXPIRED'
                            ? 'text-[#DC2626]'
                            : getExpiryStatus(expiryDate).status === 'EXPIRING_SOON'
                            ? 'text-[#D97706]'
                            : 'text-[#16A34A]'
                        }`}
                      >
                        สถานะวันหมดอายุ: {getExpiryStatus(expiryDate).label}
                      </div>
                    )}
                  </div>
                </div>

                {/* PO Number & Operator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1D1D1F] mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#16A34A]" />
                      <span>เลขที่ใบสั่งซื้อ (PO) / เลขที่ใบส่งของ *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={reference}
                      onChange={(e) => {
                        setErrorMsg(null);
                        setReference(e.target.value);
                      }}
                      placeholder="เช่น PO-2026-104"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-[#1D1D1F]">
                        ผู้ทำรายการ / คนที่ลงบันทึก *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setOperatorError(null);
                          setIsOperatorModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0071E3] hover:underline cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>เพิ่ม-ลดรายชื่อ</span>
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] text-xs font-semibold text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] cursor-pointer appearance-none pr-8 min-h-[44px]"
                      >
                        {operators.map((op) => (
                          <option key={op} value={op}>
                            👤 {op}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[#6E6E73]">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    หมายเหตุเพิ่มเติม
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ระบุรายละเอียดสินค้า หรือสภาพสินค้าเมื่อรับเข้า..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>
              </div>
            ) : (
              /* =================== STOCK OUT (เบิกสินค้า) =================== */
              <div className="space-y-6">
                {/* Step 2 Header & Multiple PO guidance */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E5E5EA]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#0071E3] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <h3 className="text-xs font-bold text-[#1D1D1F]">
                        เลือกเลขที่ใบสั่งซื้อ / Lot และจำนวนที่ต้องการเบิก
                      </h3>
                    </div>
                    <p className="text-[11px] text-[#6E6E73] mt-1 ml-7">
                      สินค้า 1 รายการ สามารถคลิกเลือกเลขที่ใบสั่งซื้อ / Lot ได้มากกว่า 1 รายการ พร้อมระบุจำนวนที่เบิกของแต่ละ Lot ได้
                    </p>
                  </div>
                  <div className="ml-7 sm:ml-0 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-[#0071E3]/10 text-[11px] font-mono-tabular font-bold text-[#0071E3]">
                      เลือกแล้ว {selectedPosList.length} ใบสั่งซื้อ
                    </span>
                    <span className="text-[11px] text-[#6E6E73] font-mono-tabular">
                      (รวม {totalOutQuantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {selectedProduct?.unit})
                    </span>
                  </div>
                </div>

                {/* 1. Quick Auto-Allocate Tool (ตัวช่วยกระจายยอดเบิกตาม Lot เก่าสุด) */}
                {selectablePos.length > 0 && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-[#F5F5F7] to-[#0071E3]/5 border border-[#E5E5EA] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#0071E3]" />
                        <span className="text-xs font-bold text-[#1D1D1F]">
                          ตัวช่วยจัดสรรตาม Lot เก่าสุดอัตโนมัติ (FIFO / FEFO Auto-Allocation)
                        </span>
                      </div>
                      <span className="text-[11px] text-[#6E6E73]">
                        ใส่ยอดรวมที่ต้องการเบิก แล้วคลิกปุ่มเพื่อกระจายยอดลงใน Lot เก่าสุดให้อัตโนมัติ
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-[#E5E5EA]">
                        <button
                          type="button"
                          onClick={() => handleAdjustOutTotal(-1)}
                          className="w-8 h-8 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] flex items-center justify-center cursor-pointer"
                          aria-label="ลด 1"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="0.01"
                          max={selectedProduct?.currentStock}
                          step="0.01"
                          value={desiredTotalQty}
                          onChange={(e) => {
                            setDesiredTotalQty(e.target.value);
                            const val = parseFloat(e.target.value);
                            if (val > 0) {
                              handleAutoAllocateFifo(val);
                            }
                          }}
                          placeholder="ยอดรวม"
                          className="w-24 h-8 px-2 text-center font-mono-tabular text-xs font-bold text-[#1D1D1F] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleAdjustOutTotal(1)}
                          className="w-8 h-8 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] flex items-center justify-center cursor-pointer"
                          aria-label="เพิ่ม 1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAutoAllocateFifo(parseFloat(desiredTotalQty) || 1)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#0071E3] hover:bg-[#005BB5] shadow-xs transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>จัดสรรตาม Lot เก่าสุดให้อัตโนมัติ</span>
                      </button>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1">
                        {[1, 5, 10, 20].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={!selectedProduct || preset > selectedProduct.currentStock}
                            onClick={() => handleAutoAllocateFifo(preset)}
                            className="px-2 py-1 rounded-lg bg-white border border-[#E5E5EA] hover:border-[#0071E3] text-[11px] font-mono-tabular font-medium text-[#1D1D1F] transition-colors cursor-pointer disabled:opacity-40"
                          >
                            +{preset}
                          </button>
                        ))}
                        {selectedProduct && selectedProduct.currentStock > 0 && (
                          <button
                            type="button"
                            onClick={() => handleAutoAllocateFifo(selectedProduct.currentStock)}
                            className="px-2 py-1 rounded-lg bg-[#0071E3]/10 hover:bg-[#0071E3]/20 text-[11px] font-mono-tabular font-semibold text-[#0071E3] transition-colors cursor-pointer"
                          >
                            เบิกหมดคลัง ({selectedProduct.currentStock.toLocaleString()})
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. FIFO / FEFO Warning Alert Banner */}
                {fifoWarningInfo && (
                  <div className="p-4 rounded-2xl bg-amber-50/95 border-2 border-amber-400 text-amber-950 shadow-xs space-y-2.5 animate-fadeIn">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <span>⚠️ แจ้งเตือน: ไม่ได้เลือกเบิก Lot เก่าสุด หรือ Lot ที่ใกล้หมดอายุก่อนตามหลัก FIFO/FEFO</span>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          ระบบตรวจพบว่าคุณกำลังเลือกเบิกจาก Lot ใหม่กว่า ในขณะที่ยังมี Lot เก่ากว่า หรือ Lot ที่ใกล้หมดอายุยังคงเหลืออยู่:
                        </p>

                        {/* Skipped older POs details */}
                        {fifoWarningInfo.skippedOlderPos.length > 0 && (
                          <div className="mt-2 space-y-1 bg-white/70 p-2.5 rounded-xl border border-amber-200">
                            <div className="text-[11px] font-bold text-amber-900">
                              📋 Lot เก่ากว่าที่ยังไม่ได้เลือกเบิก:
                            </div>
                            {fifoWarningInfo.skippedOlderPos.map((po) => (
                              <div
                                key={po.poNumber}
                                className="text-[11px] text-amber-900 flex flex-wrap items-center gap-1.5"
                              >
                                <span className="font-mono-tabular font-bold text-amber-950">
                                  • เลขที่ PO: {po.poNumber}
                                </span>
                                <span>(คงเหลือใน Lot: <strong>{po.remainingQty.toLocaleString()} {selectedProduct?.unit}</strong></span>
                                {po.firstReceivedDate && <span>· รับเข้า: {po.firstReceivedDate}</span>}
                                {po.expiryDate && po.expiryDate !== '-' && (
                                  <span className="font-semibold text-[#DC2626]">
                                    · หมดอายุ: {po.expiryDate}
                                  </span>
                                )}
                                <span>)</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Under-allocated older POs details */}
                        {fifoWarningInfo.underAllocatedOlderPos.length > 0 && (
                          <div className="mt-2 space-y-1 bg-white/70 p-2.5 rounded-xl border border-amber-200">
                            <div className="text-[11px] font-bold text-amber-900">
                              📋 Lot เก่ากว่าที่ยังเบิกไม่หมด ก่อนเลือก Lot ถัดไป:
                            </div>
                            {fifoWarningInfo.underAllocatedOlderPos.map((po) => (
                              <div
                                key={po.poNumber}
                                className="text-[11px] text-amber-900 flex flex-wrap items-center gap-1.5"
                              >
                                <span className="font-mono-tabular font-bold text-amber-950">
                                  • เลขที่ PO: {po.poNumber}
                                </span>
                                <span>
                                  (เลือกเบิกแล้ว {selectedPoAllocations[po.poNumber] || 0} จากคงเหลือทั้งหมด {po.remainingQty.toLocaleString()} {selectedProduct?.unit})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick switch to recommended FIFO button */}
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAutoAllocateFifo()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>คลิกเพื่อสลับมาจัดสรร Lot เก่าสุดอัตโนมัติ</span>
                          </button>
                          <span className="text-[10px] text-amber-700 italic">
                            * หากมีความจำเป็นต้องเบิก Lot นี้จริงๆ สามารถกดยืนยันบันทึกต่อได้
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Multiple PO / Lot Selection Cards List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#1D1D1F] flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#0071E3]" />
                      <span>รายการเลขที่ใบสั่งซื้อ / Lot ในคลัง ({purchaseOrdersForSelected.length} ใบสั่งซื้อ)</span>
                    </label>
                    <span className="text-[11px] text-[#6E6E73]">
                      คลิกที่การ์ดเพื่อเลือก/ยกเลิก และระบุจำนวนที่ต้องการเบิกในแต่ละ Lot
                    </span>
                  </div>

                  {purchaseOrdersForSelected.length === 0 ? (
                    <div className="p-4 rounded-xl bg-white border border-[#DC2626]/20 text-xs text-[#DC2626] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        ยังไม่มีเลขที่ใบสั่งซื้อที่รับเข้าสำหรับสินค้านี้ กรุณาบันทึกรับเข้าสินค้าพร้อมระบุเลขที่ใบสั่งซื้อก่อน
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {purchaseOrdersForSelected.map((po) => {
                        const isAllocated = (selectedPoAllocations[po.poNumber] || 0) > 0;
                        const isSelectedInMap = po.poNumber in selectedPoAllocations;
                        const isCardActive = isAllocated || isSelectedInMap;
                        const currentAllocated = selectedPoAllocations[po.poNumber] || 0;
                        const remainingAfter = Number(
                          Math.max(0, po.remainingQty - currentAllocated).toFixed(2)
                        );
                        const matchedFifo = sortedFifoPos.find((p) => p.poNumber === po.poNumber);
                        const isFifoRank1 = matchedFifo?.isRecommendedFifo && po.isSelectable;
                        const expiryInfo =
                          po.expiryDate && po.expiryDate !== '-'
                            ? getExpiryStatus(po.expiryDate)
                            : null;

                        return (
                          <div
                            key={po.poNumber}
                            className={`rounded-2xl border transition-all ${
                              !po.isSelectable
                                ? 'bg-[#F5F5F7] border-[#E5E5EA] opacity-60'
                                : isCardActive
                                ? 'bg-white border-[#0071E3] ring-1 ring-[#0071E3]/20 shadow-xs'
                                : 'bg-white border-[#E5E5EA] hover:border-[#0071E3]/40'
                            }`}
                          >
                            {/* Card Top Row: Checkbox, PO Info, Badges */}
                            <div className="p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex items-start gap-3">
                                  {/* Checkbox Button */}
                                  <button
                                    type="button"
                                    disabled={!po.isSelectable}
                                    onClick={() => handleTogglePo(po.poNumber)}
                                    className={`mt-0.5 p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                                      !po.isSelectable
                                        ? 'text-[#86868B] cursor-not-allowed'
                                        : isCardActive
                                        ? 'text-[#0071E3] hover:text-[#005BB5]'
                                        : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                                    }`}
                                    aria-label={`เลือกใบสั่งซื้อ ${po.poNumber}`}
                                  >
                                    {isCardActive ? (
                                      <CheckSquare className="w-5 h-5 fill-[#0071E3]/10" />
                                    ) : (
                                      <Square className="w-5 h-5" />
                                    )}
                                  </button>

                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono-tabular text-sm font-bold text-[#1D1D1F]">
                                        {po.poNumber}
                                      </span>

                                      {/* FIFO / FEFO Priority Badge */}
                                      {isFifoRank1 ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20">
                                          <span>⭐ แนะนำเบิกก่อน: Lot เก่าสุด (FIFO)</span>
                                        </span>
                                      ) : matchedFifo && po.isSelectable ? (
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#F5F5F7] text-[#6E6E73]">
                                          Lot ลำดับที่ {matchedFifo.fifoRank}
                                        </span>
                                      ) : null}

                                      {/* Expiry Badge */}
                                      {expiryInfo && (
                                        <span
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                            expiryInfo.status === 'EXPIRED'
                                              ? 'bg-[#DC2626]/10 text-[#DC2626]'
                                              : expiryInfo.status === 'EXPIRING_SOON'
                                              ? 'bg-[#D97706]/10 text-[#D97706]'
                                              : 'bg-[#16A34A]/10 text-[#16A34A]'
                                          }`}
                                        >
                                          หมดอายุ: {po.expiryDate} ({expiryInfo.label})
                                        </span>
                                      )}
                                    </div>

                                    {/* PO Metadata */}
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E6E73]">
                                      {po.firstReceivedDate && (
                                        <span>รับเข้า: {po.firstReceivedDate}</span>
                                      )}
                                      <span aria-hidden="true">·</span>
                                      <span>รับเข้าเดิม: {po.receivedQty.toLocaleString()} {selectedProduct?.unit}</span>
                                      <span aria-hidden="true">·</span>
                                      <span>เบิกแล้ว: {po.issuedQty.toLocaleString()} {selectedProduct?.unit}</span>
                                      {po.seller && po.seller !== '-' && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span>ผู้ขาย: <strong className="text-[#1D1D1F]">{po.seller}</strong></span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Remaining in PO display */}
                                <div className="text-right shrink-0 ml-8 sm:ml-0">
                                  {po.isSelectable ? (
                                    <div className="inline-flex flex-col items-end">
                                      <div className="text-[11px] text-[#6E6E73]">ยอดคงเหลือใน Lot นี้</div>
                                      <div className="text-sm font-mono-tabular font-bold text-[#16A34A]">
                                        {po.remainingQty.toLocaleString(undefined, {
                                          minimumFractionDigits: 0,
                                          maximumFractionDigits: 2,
                                        })}{' '}
                                        {selectedProduct?.unit}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-[#DC2626]/10 text-[#DC2626]">
                                      <Lock className="w-3.5 h-3.5" />
                                      <span>หมดแล้ว (คงเหลือ 0)</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Per-PO Quantity Input (Revealed when PO is selected) */}
                              {isCardActive && po.isSelectable && (
                                <div className="mt-3 pt-3 border-t border-[#0071E3]/20 bg-[#0071E3]/5 p-3 rounded-xl space-y-2.5">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                                    <label className="font-bold text-[#1D1D1F]">
                                      ระบุจำนวนที่ต้องการเบิกจากใบสั่งซื้อ {po.poNumber} ({selectedProduct?.unit || 'หน่วย'}):
                                    </label>
                                    <span className="text-[11px] font-mono-tabular font-semibold text-[#0071E3]">
                                      เบิกได้สูงสุด: {po.remainingQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {selectedProduct?.unit}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#0071E3]/30 shadow-2xs">
                                      <button
                                        type="button"
                                        onClick={() => handleAdjustPoQty(po.poNumber, -1)}
                                        className="w-8 h-8 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] flex items-center justify-center cursor-pointer transition-colors"
                                        aria-label="ลด 1"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <input
                                        type="number"
                                        min="0"
                                        max={po.remainingQty}
                                        step="0.01"
                                        value={selectedPoAllocations[po.poNumber] ?? ''}
                                        onChange={(e) => handleSetPoQty(po.poNumber, e.target.value)}
                                        placeholder="0.00"
                                        className="w-24 h-8 px-2 text-center font-mono-tabular text-sm font-bold text-[#1D1D1F] focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleAdjustPoQty(po.poNumber, 1)}
                                        className="w-8 h-8 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] flex items-center justify-center cursor-pointer transition-colors"
                                        aria-label="เพิ่ม 1"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {/* Quick Presets for this PO */}
                                    <div className="flex items-center gap-1">
                                      {[0.5, 1, 5, 10].map((preset) => (
                                        <button
                                          key={preset}
                                          type="button"
                                          disabled={preset > po.remainingQty}
                                          onClick={() => handleSetPoQty(po.poNumber, String(preset))}
                                          className="px-2 py-1 rounded-lg bg-white border border-[#E5E5EA] hover:border-[#0071E3] text-[11px] font-mono-tabular text-[#1D1D1F] transition-colors cursor-pointer disabled:opacity-40"
                                        >
                                          {preset}
                                        </button>
                                      ))}

                                      {/* Max Button for this PO */}
                                      <button
                                        type="button"
                                        onClick={() => handleMaxPoQty(po.poNumber)}
                                        className="px-2.5 py-1 rounded-lg bg-[#0071E3] hover:bg-[#005BB5] text-[11px] font-mono-tabular font-bold text-white transition-colors cursor-pointer shadow-2xs"
                                      >
                                        เบิกหมด Lot นี้ ({po.remainingQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })})
                                      </button>
                                    </div>
                                  </div>

                                  {/* Projected remaining for this PO */}
                                  <div className="text-[11px] text-[#6E6E73] flex items-center justify-between font-mono-tabular">
                                    <span>
                                      ยอดคงเหลือใน Lot นี้หลังเบิก:{' '}
                                      <strong className="text-[#1D1D1F]">{po.remainingQty}</strong> →{' '}
                                      <strong
                                        className={
                                          remainingAfter === 0 ? 'text-[#D97706]' : 'text-[#16A34A]'
                                        }
                                      >
                                        {remainingAfter} {selectedProduct?.unit}
                                      </strong>
                                      {remainingAfter === 0 && ' (Lot นี้จะหมดสต๊อก)'}
                                    </span>
                                    {currentAllocated > 0 && (
                                      <span className="font-semibold text-[#0071E3]">
                                        ✓ เบิกจาก PO นี้ {currentAllocated} {selectedProduct?.unit}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 4. Total Withdrawal Summary Strip */}
                <div className="p-4 rounded-2xl bg-white border-2 border-[#0071E3]/20 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-[#6E6E73]">
                        สรุปการเบิกสินค้า (รวมทุกล็อตที่เลือก)
                      </div>
                      <div className="text-sm font-bold text-[#1D1D1F] mt-0.5">
                        {selectedProduct?.name} ({selectedProduct?.sku})
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-[11px] font-semibold text-[#6E6E73]">
                        ยอดเบิกรวมสุทธิ ({selectedPosList.length} ใบสั่งซื้อ/Lot)
                      </div>
                      <div className="text-base font-mono-tabular font-bold text-[#0071E3] mt-0.5">
                        {totalOutQuantity.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {selectedProduct?.unit}
                      </div>
                    </div>
                  </div>

                  {/* PO Allocation Chips */}
                  {selectedPosList.length > 0 && (
                    <div className="pt-2 border-t border-[#E5E5EA] flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-[#6E6E73]">รายการที่เบิก:</span>
                      {selectedPosList.map((po) => (
                        <span
                          key={po.poNumber}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0071E3]/10 text-[11px] font-mono-tabular font-semibold text-[#0071E3]"
                        >
                          <span>{po.poNumber}:</span>
                          <strong className="text-[#1D1D1F]">{po.allocatedQty} {selectedProduct?.unit}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Operator & Note for Stock Out */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-[#1D1D1F]">
                        ผู้ทำรายการ / คนที่ลงบันทึก *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setOperatorError(null);
                          setIsOperatorModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0071E3] hover:underline cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>เพิ่ม-ลดรายชื่อ</span>
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] text-xs font-semibold text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] cursor-pointer appearance-none pr-8 min-h-[44px]"
                      >
                        {operators.map((op) => (
                          <option key={op} value={op}>
                            👤 {op}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[#6E6E73]">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                      แผนกที่เบิก / หมายเหตุเพิ่มเติม
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="ระบุแผนกที่เบิก เหตุผลการเบิก หรือชื่อผู้รับมอบ..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] min-h-[44px]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                !selectedProduct ||
                (isStockIn ? !reference.trim() : totalOutQuantity <= 0)
              }
              className={`w-full py-3.5 px-5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-xs ${
                isStockIn
                  ? 'bg-[#16A34A] hover:bg-[#15803D]'
                  : 'bg-[#0071E3] hover:bg-[#005BB5]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isStockIn
                ? 'ตรวจสอบและบันทึกรับเข้าสินค้าลง Google Sheets'
                : totalOutQuantity > 0
                ? `ตรวจสอบและบันทึกการเบิกสินค้า (รวม ${totalOutQuantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${selectedProduct?.unit || ''} จาก ${selectedPosList.length} ใบสั่งซื้อ)`
                : 'กรุณาคลิกเลือกใบสั่งซื้อ/Lot และระบุจำนวนที่ต้องการเบิก'}
            </button>
          </form>
        </div>

        {/* Right Column: Recent Transactions History */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E5E5EA] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#6E6E73]" />
              <h2 className="text-sm font-bold text-[#1D1D1F]">
                ประวัติการ{isStockIn ? 'รับเข้าสินค้า' : 'เบิกจ่ายสินค้า'}ล่าสุด
              </h2>
            </div>
            <span className="text-[11px] text-[#6E6E73] font-mono-tabular">
              {recentModeTransactions.length} รายการล่าสุด
            </span>
          </div>

          {recentModeTransactions.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6E6E73]">
              ยังไม่มีประวัติการ{isStockIn ? 'รับเข้าสินค้า' : 'เบิกจ่ายสินค้า'}ใน Google Sheets
            </div>
          ) : (
            <div className="divide-y divide-[#E5E5EA]">
              {recentModeTransactions.map((tx, index) => (
                <div key={`${tx.txId}-${index}`} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-[#1D1D1F]">
                        {tx.productName}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6E6E73] mt-0.5">
                        <span className="font-mono-tabular">{tx.txId}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{tx.sku}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tx.timestamp}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs font-mono-tabular font-bold ${
                          tx.type === 'IN' ? 'text-[#16A34A]' : 'text-[#D97706]'
                        }`}
                      >
                        {tx.type === 'IN' ? '+' : '-'}
                        {tx.quantity.toLocaleString()} {tx.unit}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-[#6E6E73]">
                        คงเหลือ {tx.balanceAfter.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-[#6E6E73] flex flex-wrap items-center gap-1.5">
                    <span>
                      เลขที่ใบสั่งซื้อ:{' '}
                      <strong className="font-mono-tabular font-semibold text-[#0071E3]">
                        {tx.reference || '-'}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    {tx.seller && tx.seller !== '-' && (
                      <>
                        <span>ผู้ขาย: <strong className="font-medium text-[#1D1D1F]">{tx.seller}</strong></span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    {tx.expiryDate && tx.expiryDate !== '-' && (
                      <>
                        <span>
                          วันหมดอายุ:{' '}
                          <strong
                            className={`font-mono-tabular font-semibold ${
                              getExpiryStatus(tx.expiryDate).status === 'EXPIRED'
                                ? 'text-[#DC2626]'
                                : getExpiryStatus(tx.expiryDate).status === 'EXPIRING_SOON'
                                ? 'text-[#D97706]'
                                : 'text-[#1D1D1F]'
                            }`}
                          >
                            {tx.expiryDate}
                          </strong>
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>โดย: {tx.operator || '-'}</span>
                    {tx.note && tx.note !== '-' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>หมายเหตุ: {tx.note}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Camera QR / Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
        products={products}
      />

      {/* Operator Management Modal (เพิ่ม-ลดรายชื่อได้) */}
      {isOperatorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E5EA] shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#0071E3]" />
                <h3 className="text-base font-bold text-[#1D1D1F]">
                  จัดการรายชื่อคนลงบันทึก
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOperatorModalOpen(false)}
                className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#6E6E73] leading-relaxed">
              เพิ่มหรือลบรายชื่อเจ้าหน้าที่ที่ทำรายการ เพื่อใช้เลือกเป็นตัวเลือกใน Drop Down ตอนบันทึกรับเข้าหรือเบิกจ่ายสินค้า
            </p>

            {/* Add New Operator Form */}
            <form onSubmit={handleAddOperator} className="flex gap-2">
              <input
                type="text"
                value={newOperatorName}
                onChange={(e) => {
                  setOperatorError(null);
                  setNewOperatorName(e.target.value);
                }}
                placeholder="พิมพ์ชื่อผู้บันทึกใหม่ เช่น สมชาย ใจดี..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] min-h-[44px]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors whitespace-nowrap cursor-pointer shrink-0 min-h-[44px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มชื่อ</span>
              </button>
            </form>

            {operatorError && (
              <div className="p-2.5 rounded-xl bg-[#DC2626]/10 text-xs text-[#DC2626]">
                {operatorError}
              </div>
            )}

            {/* List of current operators */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              <div className="text-[11px] font-semibold text-[#86868B] px-1">
                รายชื่อใน Drop Down ทั้งหมด ({operators.length} ชื่อ)
              </div>
              {operators.map((op) => (
                <div
                  key={op}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    operator === op
                      ? 'bg-[#0071E3]/5 border-[#0071E3]/30 text-[#1D1D1F]'
                      : 'bg-[#F5F5F7] border-transparent text-[#1D1D1F]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOperator(op);
                      setIsOperatorModalOpen(false);
                    }}
                    className="flex-1 text-left flex items-center gap-2 cursor-pointer text-xs font-medium"
                  >
                    <span>👤 {op}</span>
                    {operator === op && (
                      <span className="text-[10px] bg-[#0071E3] text-white px-1.5 py-0.5 rounded-md font-semibold">
                        เลือกอยู่
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOperator(op)}
                    title={`ลบ "${op}" ออกจากรายชื่อ`}
                    disabled={operators.length <= 1}
                    className="p-1.5 rounded-lg text-[#86868B] hover:text-[#DC2626] hover:bg-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#E5E5EA] flex justify-end">
              <button
                type="button"
                onClick={() => setIsOperatorModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors cursor-pointer min-h-[44px]"
              >
                เรียบร้อย
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
