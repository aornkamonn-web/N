import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Package,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  CalendarClock,
} from 'lucide-react';
import { ProductItem, ConfirmDialogState } from '../types';
import { getExpiryStatus } from '../utils/expiry';

interface StockManageViewProps {
  products: ProductItem[];
  isLoading: boolean;
  onAddProduct: (product: Omit<ProductItem, 'rowIndex' | 'updatedAt'>) => Promise<void>;
  onUpdateProduct: (product: ProductItem) => Promise<void>;
  onDeleteProduct: (product: ProductItem) => Promise<void>;
  onSeedSampleData: () => Promise<void>;
  openConfirmDialog: (config: Omit<ConfirmDialogState, 'isOpen'>) => void;
  onNavigateToMovement: (type: 'IN' | 'OUT', sku?: string) => void;
}

const DEFAULT_CATEGORIES = ['ทั้งหมด', 'คอมพิวเตอร์', 'แท็บเล็ต', 'อุปกรณ์เสริม', 'สายเคเบิล', 'จอมอนิเตอร์', 'อะไหล่', 'ทั่วไป'];

export const StockManageView: React.FC<StockManageViewProps> = ({
  products,
  isLoading,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onSeedSampleData,
  openConfirmDialog,
  onNavigateToMovement,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);

  // Form states
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('อุปกรณ์เสริม');
  const [unit, setUnit] = useState('ชิ้น');
  const [unitPrice, setUnitPrice] = useState('0');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [location, setLocation] = useState('Zone A-01');
  const [seller, setSeller] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const dynamic = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...dynamic]));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const matchesCat = selectedCategory === 'ทั้งหมด' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        item.sku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        (item.seller && item.seller.toLowerCase().includes(q)) ||
        (item.expiryDate && item.expiryDate.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    setSku(`PRD-${randomSuffix}`);
    setName('');
    setCategory('อุปกรณ์เสริม');
    setUnit('ชิ้น');
    setUnitPrice('1000');
    setCurrentStock('10');
    setMinStock('5');
    setLocation('Zone A-01');
    setSeller('');
    setExpiryDate('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: ProductItem) => {
    setEditingProduct(product);
    setSku(product.sku);
    setName(product.name);
    setCategory(product.category);
    setUnit(product.unit);
    setUnitPrice(String(product.unitPrice));
    setCurrentStock(String(product.currentStock));
    setMinStock(String(product.minStock));
    setLocation(product.location);
    setSeller(product.seller && product.seller !== '-' ? product.seller : '');
    setExpiryDate(product.expiryDate && product.expiryDate !== '-' ? product.expiryDate : '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanSku = sku.trim().toUpperCase();
    const cleanName = name.trim();
    if (!cleanSku || !cleanName) {
      setFormError('กรุณากรอกรหัสสินค้า (SKU) และชื่อสินค้าให้ครบถ้วน');
      return;
    }

    // Check duplicate SKU on add
    if (!editingProduct && products.some((p) => p.sku.toUpperCase() === cleanSku)) {
      setFormError(`รหัสสินค้า ${cleanSku} มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`);
      return;
    }

    const parsedPrice = Number(Math.max(0, parseFloat(unitPrice) || 0).toFixed(2));
    const parsedStock = Number(Math.max(0, parseFloat(currentStock) || 0).toFixed(2));
    const parsedMin = Number(Math.max(0, parseFloat(minStock) || 0).toFixed(2));

    if (editingProduct) {
      const updatedItem: ProductItem = {
        ...editingProduct,
        sku: cleanSku,
        name: cleanName,
        category: category.trim() || 'ทั่วไป',
        unit: unit.trim() || 'ชิ้น',
        unitPrice: parsedPrice,
        currentStock: parsedStock,
        minStock: parsedMin,
        location: location.trim() || '-',
        seller: seller.trim() || '-',
        expiryDate: expiryDate.trim() || '-',
      };

      openConfirmDialog({
        title: `ยืนยันการแก้ไขข้อมูลสินค้า "${cleanName}"?`,
        description:
          'ข้อมูลที่แก้ไขจะถูกนำไปเขียนทับในแถวข้อมูลของ Google Sheets ทันที กรุณาตรวจสอบความถูกต้องก่อนยืนยัน',
        details: [
          `รหัส SKU: ${cleanSku} (แถวที่ ${editingProduct.rowIndex})`,
          `ผู้ขาย/ซัพพลายเออร์: ${updatedItem.seller} · วันหมดอายุ: ${updatedItem.expiryDate}`,
          `จำนวนคงเหลือ: ${parsedStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`,
          `ราคาต่อหน่วย: ฿${parsedPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} · จุดสั่งซื้อขั้นต่ำ: ${parsedMin.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        ],
        confirmLabel: 'ยืนยันการแก้ไขลง Sheet',
        variant: 'primary',
        onConfirm: async () => {
          await onUpdateProduct(updatedItem);
          setIsModalOpen(false);
        },
      });
    } else {
      const newProduct = {
        sku: cleanSku,
        name: cleanName,
        category: category.trim() || 'ทั่วไป',
        unit: unit.trim() || 'ชิ้น',
        unitPrice: parsedPrice,
        currentStock: parsedStock,
        minStock: parsedMin,
        location: location.trim() || '-',
        seller: seller.trim() || '-',
        expiryDate: expiryDate.trim() || '-',
      };

      openConfirmDialog({
        title: `ยืนยันการเพิ่มสินค้าใหม่ "${cleanName}"?`,
        description:
          'ระบบจะทำการเพิ่มแถวข้อมูลสินค้าใหม่ลงใน Google Sheets ตาราง Products ของคุณ',
        details: [
          `รหัส SKU: ${cleanSku} · หมวดหมู่: ${newProduct.category}`,
          `ผู้ขาย/ซัพพลายเออร์: ${newProduct.seller} · วันหมดอายุ: ${newProduct.expiryDate}`,
          `ยอดคงเหลือเริ่มต้น: ${parsedStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${newProduct.unit}`,
          `ราคาต่อหน่วย: ฿${parsedPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} · สถานที่เก็บ: ${newProduct.location}`,
        ],
        confirmLabel: 'บันทึกสินค้าใหม่',
        variant: 'primary',
        onConfirm: async () => {
          await onAddProduct(newProduct);
          setIsModalOpen(false);
        },
      });
    }
  };

  const handleRequestDelete = (product: ProductItem) => {
    openConfirmDialog({
      title: `ยืนยันการลบสินค้า "${product.name}"?`,
      description:
        'การลบสินค้านี้จะลบแถวข้อมูลออกจากตาราง Products ใน Google Sheets ของคุณอย่างถาวร ไม่สามารถเรียกคืนได้',
      details: [
        `รหัส SKU: ${product.sku} (แถวที่ ${product.rowIndex} ใน Sheet)`,
        `คงเหลือปัจจุบัน: ${product.currentStock.toLocaleString()} ${product.unit}`,
      ],
      confirmLabel: 'ลบออกจาก Google Sheets',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteProduct(product);
      },
    });
  };

  const handleRequestSeed = () => {
    openConfirmDialog({
      title: 'สร้างข้อมูลสินค้าตัวอย่าง 6 รายการลงใน Google Sheets?',
      description:
        'ระบบจะทำการเพิ่มรายการสินค้าตัวอย่างสไตล์ Apple จำนวน 6 รายการ พร้อมประวัติการรับเข้าและเบิกจ่ายเริ่มต้นลงใน Google Sheets ของคุณ',
      details: [
        'MacBook Pro 14" M3 Pro · iPad Air 11" M2 · AirPods Pro 2',
        'Magic Mouse · สายชาร์จ USB-C 240W · Studio Display 27"',
      ],
      confirmLabel: 'เพิ่มข้อมูลตัวอย่าง',
      variant: 'primary',
      onConfirm: async () => {
        await onSeedSampleData();
      },
    });
  };

  const getStockStatusText = (item: ProductItem) => {
    if (item.currentStock <= 0) {
      return {
        label: 'สินค้าหมดสต๊อก',
        colorClass: 'text-[#DC2626]',
        Icon: XCircle,
      };
    }
    if (item.currentStock <= item.minStock) {
      return {
        label: 'ต่ำกว่าจุดสั่งซื้อ',
        colorClass: 'text-[#D97706]',
        Icon: AlertTriangle,
      };
    }
    return {
      label: 'พร้อมใช้งาน',
      colorClass: 'text-[#16A34A]',
      Icon: CheckCircle2,
    };
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">
            จัดการข้อมูลสต๊อกสินค้า
          </h1>
          <p className="text-xs text-[#6E6E73] mt-1">
            บริหารรายการสินค้า รหัส SKU ราคา และจุดสั่งซื้อขั้นต่ำ ซิงค์ข้อมูลตรงกับ Google Sheets
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มสินค้าใหม่</span>
          </button>
        </div>
      </div>

      {/* Quick Overview KPI Strip for Easy Scanning */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-3.5 sm:p-4">
          <div className="text-[11px] text-[#6E6E73]">สินค้าทั้งหมดในคลัง</div>
          <div className="text-lg sm:text-xl font-mono-tabular font-bold text-[#1D1D1F] mt-1">
            {products.length.toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-3.5 sm:p-4">
          <div className="text-[11px] text-[#6E6E73]">ใกล้หมดสต๊อก</div>
          <div className="text-lg sm:text-xl font-mono-tabular font-bold text-[#D97706] mt-1">
            {products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStock).length.toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-3.5 sm:p-4">
          <div className="text-[11px] text-[#6E6E73]">สินค้าหมดสต๊อก</div>
          <div className="text-lg sm:text-xl font-mono-tabular font-bold text-[#DC2626] mt-1">
            {products.filter((p) => p.currentStock <= 0).length.toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#6E6E73]">รายการ</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-[#E5E5EA] p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6E6E73] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาด้วยรหัส SKU, ชื่อสินค้า, หมวดหมู่ หรือโซนจัดเก็บ..."
              className="w-full pl-10 pr-9 py-2.5 bg-[#F5F5F7] rounded-xl text-xs text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E73] hover:text-[#1D1D1F]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-xs text-[#6E6E73] font-mono-tabular whitespace-nowrap shrink-0">
            แสดง {filteredProducts.length} จาก {products.length} รายการ
          </div>
        </div>

        {/* Interactive Category Segmented Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#1D1D1F] text-white'
                    : 'bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-11 bg-[#F5F5F7] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-10 text-center max-w-xl mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] text-[#0071E3] flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#1D1D1F]">
            ยังไม่มีรายการสินค้าใน Google Sheets
          </h3>
          <p className="mt-1.5 text-xs text-[#6E6E73] leading-relaxed">
            คุณสามารถเริ่มต้นเพิ่มรายการสินค้าตัวแรกของคุณด้วยตนเอง หรือคลิกปุ่มสร้างข้อมูลสินค้าตัวอย่างเพื่อให้ระบบจำลองรายการสต๊อกพร้อมใช้งานทันที
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มสินค้าชิ้นแรก</span>
            </button>
            <button
              type="button"
              onClick={handleRequestSeed}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#0071E3]" />
              <span>สร้างข้อมูลสินค้าตัวอย่าง (6 รายการ)</span>
            </button>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E5EA] p-8 text-center">
          <p className="text-sm font-medium text-[#1D1D1F]">ไม่พบสินค้าที่ตรงกับคำค้นหา</p>
          <p className="text-xs text-[#6E6E73] mt-1">ลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่ "ทั้งหมด"</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#E5E5EA] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E5EA] bg-[#F5F5F7]/60 text-[11px] font-semibold text-[#6E6E73]">
                    <th className="py-3 px-4">รหัส SKU</th>
                    <th className="py-3 px-4">ชื่อสินค้าและรายละเอียด</th>
                    <th className="py-3 px-4 text-right">ราคา/หน่วย</th>
                    <th className="py-3 px-4 text-right">คงเหลือ</th>
                    <th className="py-3 px-4 text-right">ขั้นต่ำ</th>
                    <th className="py-3 px-4">สถานะสต๊อก</th>
                    <th className="py-3 px-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5EA] text-xs">
                  {filteredProducts.map((item) => {
                    const status = getStockStatusText(item);
                    const StatusIcon = status.Icon;
                    return (
                      <tr
                        key={`${item.sku}-${item.rowIndex}`}
                        className="hover:bg-[#F5F5F7]/60 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono-tabular font-semibold text-[#1D1D1F] whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#1D1D1F]">{item.name}</div>
                          {/* Zero-Pill Metadata Discipline: Unboxed text with · separators */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6E6E73] mt-0.5">
                            <span>{item.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>คลัง {item.location}</span>
                            {item.seller && item.seller !== '-' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>ผู้ขาย: <strong className="font-medium text-[#1D1D1F]">{item.seller}</strong></span>
                              </>
                            )}
                            {item.expiryDate && item.expiryDate !== '-' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    getExpiryStatus(item.expiryDate).status === 'EXPIRED'
                                      ? 'text-[#DC2626] font-semibold'
                                      : getExpiryStatus(item.expiryDate).status === 'EXPIRING_SOON'
                                      ? 'text-[#D97706] font-semibold'
                                      : 'text-[#6E6E73]'
                                  }
                                >
                                  หมดอายุ: {item.expiryDate} ({getExpiryStatus(item.expiryDate).label})
                                </span>
                              </>
                            )}
                            {item.updatedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>อัปเดต {item.updatedAt}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-[#1D1D1F] whitespace-nowrap">
                          ฿{item.unitPrice.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#1D1D1F] whitespace-nowrap">
                          {item.currentStock.toLocaleString()} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-[#6E6E73] whitespace-nowrap">
                          {item.minStock.toLocaleString()} {item.unit}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className={`inline-flex items-center gap-1.5 font-medium ${status.colorClass}`}>
                            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{status.label}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onNavigateToMovement('IN', item.sku)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#16A34A] hover:bg-[#16A34A]/10 transition-colors cursor-pointer"
                              title="รับเข้าสินค้านี้"
                            >
                              +รับเข้า
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigateToMovement('OUT', item.sku)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#D97706] hover:bg-[#D97706]/10 transition-colors cursor-pointer"
                              title="เบิกสินค้านี้"
                            >
                              -เบิกออก
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors cursor-pointer"
                              title="แก้ไขสินค้า"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRequestDelete(item)}
                              className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-colors cursor-pointer"
                              title="ลบสินค้า"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Touch Card List */}
          <div className="md:hidden space-y-3">
            {filteredProducts.map((item) => {
              const status = getStockStatusText(item);
              const StatusIcon = status.Icon;
              return (
                <div
                  key={`${item.sku}-${item.rowIndex}`}
                  className="bg-white rounded-2xl border border-[#E5E5EA] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono-tabular font-semibold text-[#0071E3]">
                        {item.sku}
                      </div>
                      <h3 className="text-sm font-bold text-[#1D1D1F] mt-0.5">{item.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6E6E73] mt-1">
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>คลัง {item.location}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">฿{item.unitPrice.toLocaleString()}/{item.unit}</span>
                        {item.seller && item.seller !== '-' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>ผู้ขาย: {item.seller}</span>
                          </>
                        )}
                        {item.expiryDate && item.expiryDate !== '-' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                getExpiryStatus(item.expiryDate).status === 'EXPIRED'
                                  ? 'text-[#DC2626] font-semibold'
                                  : getExpiryStatus(item.expiryDate).status === 'EXPIRING_SOON'
                                  ? 'text-[#D97706] font-semibold'
                                  : 'text-[#6E6E73]'
                              }
                            >
                              หมดอายุ: {item.expiryDate} ({getExpiryStatus(item.expiryDate).label})
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-mono-tabular font-bold text-[#1D1D1F]">
                        {item.currentStock.toLocaleString()} {item.unit}
                      </div>
                      <div className={`inline-flex items-center gap-1 text-[11px] font-medium ${status.colorClass}`}>
                        <StatusIcon className="w-3 h-3" />
                        <span>{status.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#E5E5EA] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onNavigateToMovement('IN', item.sku)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#16A34A] bg-[#16A34A]/10 whitespace-nowrap shrink-0"
                      >
                        + รับเข้า
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateToMovement('OUT', item.sku)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#D97706] bg-[#D97706]/10 whitespace-nowrap shrink-0"
                      >
                        - เบิกสินค้า
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="p-2 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] bg-[#F5F5F7]"
                        aria-label="แก้ไข"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestDelete(item)}
                        className="p-2 rounded-lg text-[#DC2626] bg-[#DC2626]/10"
                        aria-label="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-[#E5E5EA] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E5EA] flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1D1D1F]">
                {editingProduct ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มรายการสินค้าใหม่'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-xs text-[#DC2626]">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    รหัสสินค้า (SKU) *
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="เช่น APL-MBP-14"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    หมวดหมู่สินค้า
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="เช่น คอมพิวเตอร์, อุปกรณ์เสริม"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                  ชื่อสินค้า *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ระบุชื่อรุ่นและรายละเอียดสินค้า"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    ชื่อผู้ขาย / ซัพพลายเออร์ (Seller / Supplier)
                  </label>
                  <input
                    type="text"
                    value={seller}
                    onChange={(e) => setSeller(e.target.value)}
                    placeholder="ระบุชื่อร้านค้า หรือซัพพลายเออร์..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-[#0071E3]" />
                    <span>วันหมดอายุ (ถ้ามี · เตือนล่วงหน้า 7 วัน)</span>
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    หน่วยนับ
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="ชิ้น / เครื่อง / กล่อง"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    ราคาต่อหน่วย (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    โซน/สถานที่จัดเก็บ
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="เช่น Zone A-01"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    {editingProduct ? 'จำนวนคงเหลือปัจจุบัน (ทศนิยมได้ 2 ตำแหน่ง)' : 'ยอดคงเหลือเริ่มต้น (ทศนิยมได้ 2 ตำแหน่ง)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    placeholder="เช่น 10 หรือ 12.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    จุดสั่งซื้อขั้นต่ำ (Min Stock)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="เช่น 5 หรือ 2.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E5EA] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors cursor-pointer"
                >
                  {editingProduct ? 'ตรวจสอบและบันทึกการแก้ไข' : 'ตรวจสอบและเพิ่มสินค้า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
