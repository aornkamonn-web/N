import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, ArrowUpFromLine } from 'lucide-react';
import { ProductItem } from '../types';
import { getExpiringAlertProducts } from '../utils/expiry';

interface ExpiryAlertBannerProps {
  products: ProductItem[];
  onQuickStockOut?: (sku: string) => void;
}

export const ExpiryAlertBanner: React.FC<ExpiryAlertBannerProps> = ({
  products,
  onQuickStockOut,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const alertItems = useMemo(() => getExpiringAlertProducts(products), [products]);

  if (alertItems.length === 0) {
    return null;
  }

  const expiredCount = alertItems.filter((i) => i.expiryInfo.status === 'EXPIRED').length;
  const expiringSoonCount = alertItems.filter(
    (i) => i.expiryInfo.status === 'EXPIRING_SOON'
  ).length;

  return (
    <div className="mb-6 rounded-2xl bg-[#FFFBEB] border border-[#F59E0B]/35 overflow-hidden shadow-xs">
      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D97706]/15 text-[#D97706] flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[#92400E]">
                แจ้งเตือนวันหมดอายุสินค้าล่วงหน้า (ภายใน 7 วัน)
              </span>
              <span className="text-[11px] font-mono-tabular font-semibold text-[#B45309]">
                พบ {alertItems.length} รายการ
                {expiringSoonCount > 0 ? ` · ใกล้หมดอายุ ${expiringSoonCount}` : ''}
                {expiredCount > 0 ? ` · หมดอายุแล้ว ${expiredCount}` : ''}
              </span>
            </div>
            <p className="text-[11px] text-[#B45309] mt-0.5">
              ระบบตรวจพบสินค้าคงเหลือที่จะหมดอายุภายใน 7 วันข้างหน้า หรือหมดอายุแล้ว กรุณาตรวจสอบและเร่งระบายสต๊อก (FEFO)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#92400E] hover:bg-[#D97706]/10 transition-colors shrink-0 cursor-pointer"
        >
          <span>{isExpanded ? 'ซ่อนรายการ' : 'ดูรายการ'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-3.5 pt-1 border-t border-[#F59E0B]/20 divide-y divide-[#F59E0B]/15">
          {alertItems.map(({ product, expiryInfo }) => {
            const isExpired = expiryInfo.status === 'EXPIRED';
            return (
              <div
                key={`${product.sku}-${product.rowIndex}`}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isExpired ? 'text-[#DC2626]' : 'text-[#D97706]'
                    }`}
                  />
                  <span className="font-mono-tabular font-bold text-[#1D1D1F]">
                    {product.sku}
                  </span>
                  <span className="font-semibold text-[#1D1D1F]">{product.name}</span>
                  <span className="text-[11px] text-[#6E6E73]">
                    (คงเหลือ {product.currentStock.toLocaleString()} {product.unit} · คลัง{' '}
                    {product.location}
                    {product.seller && product.seller !== '-'
                      ? ` · ผู้ขาย: ${product.seller}`
                      : ''}
                    )
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right">
                    <span
                      className={`font-semibold ${
                        isExpired ? 'text-[#DC2626]' : 'text-[#D97706]'
                      }`}
                    >
                      {expiryInfo.label}
                    </span>
                    <span className="text-[11px] font-mono-tabular text-[#6E6E73] ml-1.5">
                      (วันหมดอายุ: {expiryInfo.formattedDate})
                    </span>
                  </div>

                  {onQuickStockOut && (
                    <button
                      type="button"
                      onClick={() => onQuickStockOut(product.sku)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#F59E0B]/40 text-[11px] font-semibold text-[#B45309] hover:bg-[#FEF3C7] transition-colors cursor-pointer"
                    >
                      <ArrowUpFromLine className="w-3 h-3" />
                      <span>เบิกออกด่วน</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
