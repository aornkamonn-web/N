import { ProductItem, StockTransaction, SheetDatabaseInfo, TransactionType } from '../types';
import { getAccessToken, clearAccessToken } from './auth';

const DEFAULT_DB_NAME = 'Cupertino_Stock_Database_v1';
const PRODUCTS_HEADERS = [
  'SKU',
  'ชื่อสินค้า',
  'หมวดหมู่',
  'หน่วยนับ',
  'ราคาต่อหน่วย',
  'คงเหลือ',
  'จุดสั่งซื้อขั้นต่ำ',
  'สถานที่จัดเก็บ',
  'อัปเดตล่าสุด',
  'ชื่อผู้ขาย',
  'วันหมดอายุ',
];

const TRANSACTIONS_HEADERS = [
  'รหัสรายการ',
  'วัน-เวลา',
  'ประเภท',
  'SKU',
  'ชื่อสินค้า',
  'จำนวน',
  'หน่วยนับ',
  'คงเหลือหลังทำรายการ',
  'เลขที่ใบสั่งซื้อ (PO)',
  'ผู้ทำรายการ',
  'หมายเหตุ',
  'ชื่อผู้ขาย',
  'วันหมดอายุ',
];

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    clearAccessToken();
    throw new Error('AUTH_REQUIRED');
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Sheets API Error (${res.status}): ${errBody}`);
  }

  return res.json();
}

/**
 * Find existing stock database created by this app or create a new one automatically.
 * Always reads spreadsheet metadata dynamically so we never hardcode tab names blindly.
 */
export async function findOrCreateStockSpreadsheet(customSpreadsheetId?: string): Promise<SheetDatabaseInfo> {
  let spreadsheetId = customSpreadsheetId?.trim();

  if (!spreadsheetId) {
    // Search in drive.file scope for our database spreadsheet
    const q = encodeURIComponent(
      `name = '${DEFAULT_DB_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
    );
    const searchData = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=5`
    );

    if (searchData.files && searchData.files.length > 0) {
      spreadsheetId = searchData.files[0].id;
    }
  }

  if (spreadsheetId) {
    return await verifyAndInitializeSpreadsheet(spreadsheetId);
  }

  // Create a brand new Google Spreadsheet with Products & Transactions sheets
  const createPayload = {
    properties: {
      title: DEFAULT_DB_NAME,
    },
    sheets: [
      {
        properties: {
          title: 'Products',
          gridProperties: { frozenRowCount: 1 },
        },
      },
      {
        properties: {
          title: 'Transactions',
          gridProperties: { frozenRowCount: 1 },
        },
      },
    ],
  };

  const created = await fetchWithAuth('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify(createPayload),
  });

  const newId = created.spreadsheetId;

  // Populate headers for both sheets
  await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${newId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `'Products'!A1:K1`,
          values: [PRODUCTS_HEADERS],
        },
        {
          range: `'Transactions'!A1:M1`,
          values: [TRANSACTIONS_HEADERS],
        },
      ],
    }),
  });

  return {
    spreadsheetId: newId,
    spreadsheetTitle: created.properties?.title || DEFAULT_DB_NAME,
    spreadsheetUrl: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${newId}/edit`,
    productsSheetName: 'Products',
    transactionsSheetName: 'Transactions',
  };
}

/**
 * Inspect spreadsheet metadata to discover actual sheet tab names and ensure required tabs exist.
 */
export async function verifyAndInitializeSpreadsheet(spreadsheetId: string): Promise<SheetDatabaseInfo> {
  const meta = await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`
  );

  const sheets: Array<{ properties: { title: string; sheetId: number } }> = meta.sheets || [];
  const existingTitles = sheets.map((s) => s.properties.title);

  // Determine Products tab name (either 'Products' or first sheet if user linked custom sheet)
  let productsSheetName = existingTitles.find((t) => t.toLowerCase() === 'products' || t === 'สินค้า') || '';
  let transactionsSheetName =
    existingTitles.find((t) => t.toLowerCase() === 'transactions' || t === 'ประวัติการทำรายการ') || '';

  const requests: any[] = [];

  if (!productsSheetName) {
    productsSheetName = 'Products';
    requests.push({
      addSheet: {
        properties: { title: productsSheetName, gridProperties: { frozenRowCount: 1 } },
      },
    });
  }

  if (!transactionsSheetName) {
    transactionsSheetName = 'Transactions';
    requests.push({
      addSheet: {
        properties: { title: transactionsSheetName, gridProperties: { frozenRowCount: 1 } },
      },
    });
  }

  if (requests.length > 0) {
    await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }

  // Check if headers exist in Products & Transactions
  const headerRanges = [
    encodeURIComponent(`'${productsSheetName}'!A1:K1`),
    encodeURIComponent(`'${transactionsSheetName}'!A1:M1`),
  ];
  const headerData = await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${headerRanges.join(
      '&ranges='
    )}`
  );

  const valueRanges = headerData.valueRanges || [];
  const prodHeaderRow = valueRanges[0]?.values?.[0];
  const txHeaderRow = valueRanges[1]?.values?.[0];

  const headerUpdates: any[] = [];
  if (!prodHeaderRow || prodHeaderRow.length < PRODUCTS_HEADERS.length) {
    headerUpdates.push({
      range: `'${productsSheetName}'!A1:K1`,
      values: [PRODUCTS_HEADERS],
    });
  }
  if (!txHeaderRow || txHeaderRow.length < TRANSACTIONS_HEADERS.length || txHeaderRow[8] !== 'เลขที่ใบสั่งซื้อ (PO)') {
    headerUpdates.push({
      range: `'${transactionsSheetName}'!A1:M1`,
      values: [TRANSACTIONS_HEADERS],
    });
  }

  if (headerUpdates.length > 0) {
    await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: headerUpdates,
      }),
    });
  }

  return {
    spreadsheetId,
    spreadsheetTitle: meta.properties?.title || DEFAULT_DB_NAME,
    spreadsheetUrl: meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    productsSheetName,
    transactionsSheetName,
  };
}

/**
 * Fetch all products and transactions from the Google Sheet.
 */
export async function loadAllStockData(dbInfo: SheetDatabaseInfo): Promise<{
  products: ProductItem[];
  transactions: StockTransaction[];
}> {
  const ranges = [
    encodeURIComponent(`'${dbInfo.productsSheetName}'!A2:K2000`),
    encodeURIComponent(`'${dbInfo.transactionsSheetName}'!A2:N3000`),
  ];

  const data = await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values:batchGet?ranges=${ranges.join(
      '&ranges='
    )}`
  );

  const prodRows: any[][] = data.valueRanges?.[0]?.values || [];
  const txRows: any[][] = data.valueRanges?.[1]?.values || [];

  const products: ProductItem[] = prodRows
    .map((row, idx) => ({
      rowIndex: idx + 2, // Row 2 is index 0
      sku: String(row[0] || '').trim(),
      name: String(row[1] || '').trim(),
      category: String(row[2] || 'ทั่วไป').trim(),
      unit: String(row[3] || 'ชิ้น').trim(),
      unitPrice: Number((parseFloat(String(row[4] || '0').replace(/,/g, '')) || 0).toFixed(2)),
      currentStock: Number((parseFloat(String(row[5] || '0').replace(/,/g, '')) || 0).toFixed(2)),
      minStock: Number((parseFloat(String(row[6] || '0').replace(/,/g, '')) || 0).toFixed(2)),
      location: String(row[7] || '-').trim(),
      updatedAt: String(row[8] || '').trim(),
      seller: String(row[9] || '-').trim(),
      expiryDate: String(row[10] || '-').trim(),
    }))
    .filter((item) => item.sku !== '' || item.name !== '');

  const transactions: StockTransaction[] = txRows
    .map((row, idx) => {
      const txType = (String(row[2] || 'IN').trim().toUpperCase() === 'OUT' ? 'OUT' : 'IN') as TransactionType;
      const colI = String(row[8] || '').trim();
      const colN = String(row[13] || '').trim();
      // If a legacy row stored the PO in column N while column I had a department description, prefer the PO in column N for OUT rows if colN looks like a PO
      const effectivePoRef =
        colN && colN !== '-' && (!colI || colI === '-' || (txType === 'OUT' && colI !== colN))
          ? colN
          : colI;
      return {
        rowIndex: idx + 2,
        txId: String(row[0] || '').trim(),
        timestamp: String(row[1] || '').trim(),
        type: txType,
        sku: String(row[3] || '').trim(),
        productName: String(row[4] || '').trim(),
        quantity: Number((parseFloat(String(row[5] || '0').replace(/,/g, '')) || 0).toFixed(2)),
        unit: String(row[6] || '').trim(),
        balanceAfter: Number((parseFloat(String(row[7] || '0').replace(/,/g, '')) || 0).toFixed(2)),
        reference: effectivePoRef,
        operator: String(row[9] || '').trim(),
        note: String(row[10] || '').trim(),
        seller: String(row[11] || '-').trim(),
        expiryDate: String(row[12] || '-').trim(),
      };
    })
    .filter((tx) => tx.txId !== '' || tx.sku !== '')
    .reverse(); // Newest first

  return { products, transactions };
}

/**
 * Add a new product to the Products tab and optionally record an initial stock-in transaction.
 */
export async function addProductToSheet(
  dbInfo: SheetDatabaseInfo,
  product: Omit<ProductItem, 'rowIndex' | 'updatedAt'>,
  operatorEmail: string
): Promise<void> {
  const nowStr = formatThaiTimestamp(new Date());
  const cleanSeller = product.seller?.trim() || '-';
  const cleanExpiry = product.expiryDate?.trim() || '-';
  const rowValues = [
    product.sku,
    product.name,
    product.category,
    product.unit,
    product.unitPrice,
    product.currentStock,
    product.minStock,
    product.location,
    nowStr,
    cleanSeller,
    cleanExpiry,
  ];

  const prodRange = encodeURIComponent(`'${dbInfo.productsSheetName}'!A:K`);
  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${prodRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  // If initial stock > 0, log an initial IN transaction
  if (product.currentStock > 0) {
    const txId = `IN-${Date.now().toString().slice(-6)}`;
    const initialPo = `PO-INIT-${product.sku}`;
    const txRange = encodeURIComponent(`'${dbInfo.transactionsSheetName}'!A:M`);
    await fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${txRange}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        body: JSON.stringify({
          values: [
            [
              txId,
              nowStr,
              'IN',
              product.sku,
              product.name,
              product.currentStock,
              product.unit,
              product.currentStock,
              initialPo,
              operatorEmail,
              'เพิ่มสินค้าใหม่เข้าสู่ระบบ',
              cleanSeller,
              cleanExpiry,
            ],
          ],
        }),
      }
    );
  }
}

/**
 * Update an existing product row in the Products tab.
 */
export async function updateProductInSheet(
  dbInfo: SheetDatabaseInfo,
  product: ProductItem
): Promise<void> {
  const nowStr = formatThaiTimestamp(new Date());
  const range = encodeURIComponent(`'${dbInfo.productsSheetName}'!A${product.rowIndex}:K${product.rowIndex}`);
  const rowValues = [
    product.sku,
    product.name,
    product.category,
    product.unit,
    product.unitPrice,
    product.currentStock,
    product.minStock,
    product.location,
    nowStr,
    product.seller?.trim() || '-',
    product.expiryDate?.trim() || '-',
  ];

  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );
}

/**
 * Delete a product row from the Products sheet by clearing or deleting the row dimension.
 */
export async function deleteProductFromSheet(
  dbInfo: SheetDatabaseInfo,
  product: ProductItem
): Promise<void> {
  // First fetch spreadsheet metadata to get sheetId for productsSheetName
  const meta = await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}?includeGridData=false`
  );
  const targetSheet = (meta.sheets || []).find(
    (s: any) => s.properties?.title === dbInfo.productsSheetName
  );

  if (targetSheet && typeof targetSheet.properties?.sheetId === 'number') {
    await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: targetSheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: product.rowIndex - 1,
                endIndex: product.rowIndex,
              },
            },
          },
        ],
      }),
    });
  } else {
    // Fallback clear values
    const range = encodeURIComponent(`'${dbInfo.productsSheetName}'!A${product.rowIndex}:K${product.rowIndex}`);
    await fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${range}:clear`,
      { method: 'POST' }
    );
  }
}

/**
 * Record a Stock In (รับเข้าสินค้า) or Stock Out (เบิกสินค้า) transaction:
 * 1. Updates the product's currentStock and updatedAt in the Products tab
 * 2. Appends a transaction audit row in the Transactions tab
 */
export async function recordStockMovement(
  dbInfo: SheetDatabaseInfo,
  params: {
    product: ProductItem;
    type: TransactionType;
    quantity: number;
    reference: string;
    operator: string;
    note: string;
    seller?: string;
    expiryDate?: string;
  }
): Promise<void> {
  const { product, type, quantity, reference, operator, note, seller, expiryDate } = params;
  const roundedQuantity = Number(quantity.toFixed(2));
  const rawNewBalance =
    type === 'IN' ? product.currentStock + roundedQuantity : product.currentStock - roundedQuantity;
  const newBalance = Number(rawNewBalance.toFixed(2));

  if (type === 'OUT' && newBalance < 0) {
    throw new Error(
      `จำนวนสินค้าคงเหลือไม่เพียงพอ (คงเหลือ ${product.currentStock.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} ${product.unit})`
    );
  }

  const nowStr = formatThaiTimestamp(new Date());
  const prefix = type === 'IN' ? 'RCV' : 'ISS';
  const txId = `${prefix}-${Date.now().toString().slice(-6)}`;
  const effectiveSeller = seller?.trim() || product.seller?.trim() || '-';
  const effectiveExpiry =
    type === 'IN' && expiryDate?.trim()
      ? expiryDate.trim()
      : product.expiryDate?.trim() || '-';

  // 1. Update stock balance, timestamp, seller, & expiryDate in Products sheet (Columns A:K)
  const prodRange = encodeURIComponent(
    `'${dbInfo.productsSheetName}'!A${product.rowIndex}:K${product.rowIndex}`
  );
  const updatedProductRow = [
    product.sku,
    product.name,
    product.category,
    product.unit,
    Number(product.unitPrice.toFixed(2)),
    newBalance,
    Number(product.minStock.toFixed(2)),
    product.location,
    nowStr,
    type === 'IN' && seller?.trim() ? seller.trim() : product.seller?.trim() || '-',
    effectiveExpiry,
  ];

  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${prodRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [updatedProductRow],
      }),
    }
  );

  // 2. Append transaction record to Transactions sheet (Columns A:M)
  const txRange = encodeURIComponent(`'${dbInfo.transactionsSheetName}'!A:M`);
  const txRow = [
    txId,
    nowStr,
    type,
    product.sku,
    product.name,
    roundedQuantity,
    product.unit,
    newBalance,
    reference?.trim() || '-',
    operator,
    note || '-',
    effectiveSeller,
    effectiveExpiry,
  ];

  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${txRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [txRow],
      }),
    }
  );
}

/**
 * Record multiple stock movement transactions (e.g. multi-PO withdrawal) atomically into Google Sheets
 */
export async function recordBatchStockMovements(
  dbInfo: SheetDatabaseInfo,
  movements: Array<{
    product: ProductItem;
    type: TransactionType;
    quantity: number;
    reference: string;
    operator: string;
    note: string;
    seller?: string;
    expiryDate?: string;
  }>
): Promise<void> {
  if (movements.length === 0) return;
  if (movements.length === 1) {
    return recordStockMovement(dbInfo, movements[0]);
  }

  const first = movements[0];
  const product = first.product;
  const now = new Date();
  const nowStr = formatThaiTimestamp(now);

  // Calculate cumulative balance
  let runningBalance = product.currentStock;
  const txRows: any[][] = [];

  for (let i = 0; i < movements.length; i++) {
    const m = movements[i];
    const roundedQty = Number(m.quantity.toFixed(2));
    const diff = m.type === 'IN' ? roundedQty : -roundedQty;
    runningBalance = Number(Math.max(0, runningBalance + diff).toFixed(2));

    const prefix = m.type === 'IN' ? 'RCV' : 'ISS';
    const txId = `${prefix}-${Date.now().toString().slice(-6)}-${i + 1}`;
    const effectiveSeller = m.seller?.trim() || product.seller?.trim() || '-';
    const effectiveExpiry = m.expiryDate?.trim() || product.expiryDate?.trim() || '-';

    txRows.push([
      txId,
      nowStr,
      m.type,
      product.sku,
      product.name,
      roundedQty,
      product.unit,
      runningBalance,
      m.reference?.trim() || '-',
      m.operator,
      m.note || '-',
      effectiveSeller,
      effectiveExpiry,
    ]);
  }

  const finalBalance = runningBalance;

  // 1. Update product balance in Products sheet
  const prodRange = encodeURIComponent(
    `'${dbInfo.productsSheetName}'!A${product.rowIndex}:K${product.rowIndex}`
  );
  const updatedProductRow = [
    product.sku,
    product.name,
    product.category,
    product.unit,
    Number(product.unitPrice.toFixed(2)),
    finalBalance,
    Number(product.minStock.toFixed(2)),
    product.location,
    nowStr,
    product.seller?.trim() || '-',
    product.expiryDate?.trim() || '-',
  ];

  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${prodRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [updatedProductRow],
      }),
    }
  );

  // 2. Append all transaction rows in a single batch append
  const txRange = encodeURIComponent(`'${dbInfo.transactionsSheetName}'!A:M`);
  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${txRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: txRows,
      }),
    }
  );
}

/**
 * Seed starter Apple-inspired inventory items into Google Sheets when requested by user on an empty sheet.
 */
export async function seedSampleInventoryData(
  dbInfo: SheetDatabaseInfo,
  operatorEmail: string
): Promise<void> {
  const now = new Date();
  const nowStr = formatThaiTimestamp(now);
  const in5Days = formatDateYMD(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));
  const in1Year = formatDateYMD(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000));

  const sampleProducts = [
    ['APL-MBP-14M3', 'MacBook Pro 14" M3 Pro (Space Black)', 'คอมพิวเตอร์', 'เครื่อง', 69900, 18, 5, 'Zone A-01', nowStr, 'Apple South Asia (Thailand)', in1Year],
    ['APL-IPA-11M2', 'iPad Air 11" M2 Wi-Fi 128GB', 'แท็บเล็ต', 'เครื่อง', 23900, 24, 8, 'Zone A-02', nowStr, 'Com7 Business Solutions', in1Year],
    ['APL-APP-USB', 'AirPods Pro 2 (USB-C MagSafe)', 'อุปกรณ์เสริม', 'กล่อง', 8990, 42, 15, 'Zone B-01', nowStr, 'Synnex (Thailand)', in5Days],
    ['APL-MGC-MSE', 'Magic Mouse (Multi-Touch Surface)', 'อุปกรณ์เสริม', 'ชิ้น', 3190, 6, 10, 'Zone B-04', nowStr, 'Synnex (Thailand)', '-'],
    ['APL-USBC-240W', 'สายชาร์จ USB-C Woven (2m, 240W)', 'สายเคเบิล', 'เส้น', 1190, 3, 12, 'Zone C-02', nowStr, 'Copperwired (iStudio)', '-'],
    ['APL-STD-DSP', 'Apple Studio Display 27" 5K Retina', 'จอมอนิเตอร์', 'เครื่อง', 54900, 0, 3, 'Zone A-05', nowStr, 'Apple South Asia (Thailand)', '-'],
  ];

  const sampleTransactions = [
    ['RCV-100101', nowStr, 'IN', 'APL-MBP-14M3', 'MacBook Pro 14" M3 Pro (Space Black)', 10, 'เครื่อง', 10, 'PO-2026-088', operatorEmail, 'รับเข้าล็อตที่ 1', 'Apple South Asia (Thailand)', in1Year],
    ['RCV-100102', nowStr, 'IN', 'APL-MBP-14M3', 'MacBook Pro 14" M3 Pro (Space Black)', 10, 'เครื่อง', 20, 'PO-2026-089', operatorEmail, 'รับเข้าล็อตที่ 2', 'Apple South Asia (Thailand)', in1Year],
    ['ISS-100103', nowStr, 'OUT', 'APL-MBP-14M3', 'MacBook Pro 14" M3 Pro (Space Black)', 2, 'เครื่อง', 18, 'PO-2026-088', operatorEmail, 'เบิกใช้งานพนักงานใหม่ (ฝ่ายวิศวกรรม)', 'Apple South Asia (Thailand)', in1Year],
    ['RCV-100104', nowStr, 'IN', 'APL-APP-USB', 'AirPods Pro 2 (USB-C MagSafe)', 42, 'กล่อง', 42, 'PO-2026-092', operatorEmail, 'สต๊อกพร้อมจำหน่าย', 'Synnex (Thailand)', in5Days],
    ['RCV-100105', nowStr, 'IN', 'APL-MGC-MSE', 'Magic Mouse (Multi-Touch Surface)', 10, 'ชิ้น', 10, 'PO-2026-075', operatorEmail, 'รับเข้าอุปกรณ์ประจำไตรมาส', 'Synnex (Thailand)', '-'],
    ['ISS-100106', nowStr, 'OUT', 'APL-MGC-MSE', 'Magic Mouse (Multi-Touch Surface)', 4, 'ชิ้น', 6, 'PO-2026-075', operatorEmail, 'เบิกอุปกรณ์ประจำโต๊ะทำงาน (แผนกออกแบบ)', 'Synnex (Thailand)', '-'],
  ];

  const prodRange = encodeURIComponent(`'${dbInfo.productsSheetName}'!A:K`);
  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${prodRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      body: JSON.stringify({ values: sampleProducts }),
    }
  );

  const txRange = encodeURIComponent(`'${dbInfo.transactionsSheetName}'!A:M`);
  await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${dbInfo.spreadsheetId}/values/${txRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      body: JSON.stringify({ values: sampleTransactions }),
    }
  );
}

export function formatDateYMD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatThaiTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
