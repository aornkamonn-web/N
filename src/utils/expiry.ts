import { ProductItem } from '../types';

export type ExpiryStatusType = 'NONE' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

export interface ExpiryStatusInfo {
  status: ExpiryStatusType;
  daysRemaining: number | null;
  label: string;
  formattedDate: string;
}

/**
 * Evaluates a YYYY-MM-DD expiry date string against today's local date.
 * Alerts 'EXPIRING_SOON' when 0 <= daysRemaining <= 7, and 'EXPIRED' when daysRemaining < 0.
 */
export function getExpiryStatus(expiryDate?: string): ExpiryStatusInfo {
  const raw = (expiryDate || '').trim();
  if (!raw || raw === '-') {
    return {
      status: 'NONE',
      daysRemaining: null,
      label: 'ไม่ระบุวันหมดอายุ',
      formattedDate: '-',
    };
  }

  // Parse YYYY-MM-DD safely in local timezone
  const parts = raw.split('-');
  let targetDate: Date;
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    targetDate = new Date(year, month, day);
  } else {
    targetDate = new Date(raw);
  }

  if (isNaN(targetDate.getTime())) {
    return {
      status: 'NONE',
      daysRemaining: null,
      label: raw,
      formattedDate: raw,
    };
  }

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMidnight = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );

  const diffMs = targetMidnight.getTime() - todayMidnight.getTime();
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return {
      status: 'EXPIRED',
      daysRemaining,
      label: `หมดอายุแล้ว (${Math.abs(daysRemaining)} วันก่อน)`,
      formattedDate: raw,
    };
  }

  if (daysRemaining === 0) {
    return {
      status: 'EXPIRING_SOON',
      daysRemaining: 0,
      label: 'หมดอายุวันนี้!',
      formattedDate: raw,
    };
  }

  if (daysRemaining <= 7) {
    return {
      status: 'EXPIRING_SOON',
      daysRemaining,
      label: `ใกล้หมดอายุ (อีก ${daysRemaining} วัน)`,
      formattedDate: raw,
    };
  }

  return {
    status: 'VALID',
    daysRemaining,
    label: `อีก ${daysRemaining} วัน (${raw})`,
    formattedDate: raw,
  };
}

/**
 * Filter products that have stock > 0 and are either expiring within 7 days or already expired.
 */
export function getExpiringAlertProducts(products: ProductItem[]) {
  return products
    .filter((p) => p.currentStock > 0)
    .map((product) => ({
      product,
      expiryInfo: getExpiryStatus(product.expiryDate),
    }))
    .filter(
      (item) =>
        item.expiryInfo.status === 'EXPIRING_SOON' || item.expiryInfo.status === 'EXPIRED'
    )
    .sort((a, b) => (a.expiryInfo.daysRemaining ?? 999) - (b.expiryInfo.daysRemaining ?? 999));
}
