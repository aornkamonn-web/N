import React, { useState } from 'react';
import { Package, ArrowDownToLine, ArrowUpFromLine, BarChart3, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { OfflineIndicator } from './OfflineIndicator';

interface GoogleSignInProps {
  onLogin: () => Promise<void>;
  userEmail?: string | null;
}

export const GoogleSignInScreen: React.FC<GoogleSignInProps> = ({ onLogin, userEmail }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignInClick = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onLogin();
    } catch (err: any) {
      setError(err?.message || 'การเข้าสู่ระบบด้วย Google ถูกยกเลิกหรือไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col justify-between">
      {/* Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white/80 backdrop-blur-md border-b border-[#E5E5EA]">
        <a href="#top" className="text-lg font-bold tracking-tight text-[#1D1D1F] whitespace-nowrap shrink-0">
          Cupertino Stock
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#6E6E73]">
          <span className="whitespace-nowrap shrink-0">จัดการสต๊อกสินค้า</span>
          <span className="whitespace-nowrap shrink-0">รับเข้าสินค้า</span>
          <span className="whitespace-nowrap shrink-0">เบิกจ่ายสินค้า</span>
          <span className="whitespace-nowrap shrink-0">รายงานคงเหลือ</span>
        </nav>
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleSignInClick}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0071E3] rounded-lg hover:bg-[#005BB5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            เข้าสู่ระบบ
          </button>
        </div>
      </header>

      {/* Main Content Split */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Hero & Value Proposition */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-[#E5E5EA] p-8 md:p-10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-[#0071E3] tracking-tight">
                Google Sheets Cloud Inventory System
              </p>
              <h1
                className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-[#1D1D1F] leading-tight"
                style={{ textWrap: 'balance' }}
              >
                จัดการสต๊อกสินค้า เบิกจ่าย และรับเข้า เชื่อมต่อ Google Sheets แบบเรียลไทม์
              </h1>
              <p className="mt-4 text-sm md:text-base text-[#6E6E73] leading-relaxed max-w-xl">
                ระบบบริหารคลังสินค้าดีไซน์ทันสมัยสไตล์ Apple ออกแบบมาให้ใช้งานง่ายทั้งบนสมาร์ทโฟนและคอมพิวเตอร์ ข้อมูลทุกการเคลื่อนไหวถูกบันทึกตรงลงใน Google Sheets ของคุณทันที
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E5E5EA] grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="w-9 h-9 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center mb-2.5">
                  <Package className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-[#1D1D1F]">จัดการสต๊อก</div>
                <div className="text-xs text-[#6E6E73] mt-0.5">เพิ่ม แก้ไข ค้นหาไว</div>
              </div>

              <div>
                <div className="w-9 h-9 rounded-xl bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center mb-2.5">
                  <ArrowDownToLine className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-[#1D1D1F]">รับเข้าสินค้า</div>
                <div className="text-xs text-[#6E6E73] mt-0.5">บันทึก PO และล็อตเข้า</div>
              </div>

              <div>
                <div className="w-9 h-9 rounded-xl bg-[#D97706]/10 text-[#D97706] flex items-center justify-center mb-2.5">
                  <ArrowUpFromLine className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-[#1D1D1F]">เบิกสินค้า</div>
                <div className="text-xs text-[#6E6E73] mt-0.5">ตัดยอดพร้อมเช็คสต๊อก</div>
              </div>

              <div>
                <div className="w-9 h-9 rounded-xl bg-[#1D1D1F]/10 text-[#1D1D1F] flex items-center justify-center mb-2.5">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-[#1D1D1F]">รายงานคงเหลือ</div>
                <div className="text-xs text-[#6E6E73] mt-0.5">สรุปมูลค่าและจุดสั่งซื้อ</div>
              </div>
            </div>
          </div>

          {/* Right Auth Card */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-[#E5E5EA] p-8 md:p-10 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center text-[#0071E3]">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-[#1D1D1F]">
                เข้าสู่ระบบด้วยบัญชี Google
              </h2>
              <p className="mt-2 text-xs text-[#6E6E73] leading-relaxed">
                {userEmail
                  ? `ตรวจพบบัญชี ${userEmail} กรุณายืนยันสิทธิ์การเชื่อมต่อ Google Sheets เพื่อโหลดฐานข้อมูลคลังสินค้าของคุณ`
                  : 'เข้าสู่ระบบด้วย Google Account เพื่อสร้างหรือเชื่อมต่อไฟล์ Google Sheets สำหรับจัดเก็บฐานข้อมูลสินค้าและประวัติการเบิก-รับเข้า'}
              </p>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleSignInClick}
                  disabled={isLoading}
                  className="gsi-material-button w-full!"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        ></path>
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        ></path>
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        ></path>
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        ></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoading ? 'กำลังเชื่อมต่อบัญชี Google...' : 'Sign in with Google'}
                    </span>
                    <span style={{ display: 'none' }}>Sign in with Google</span>
                  </div>
                </button>
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-xs text-[#DC2626]">
                  {error}
                </div>
              )}
            </div>

            <div className="mt-8 pt-5 border-t border-[#E5E5EA] space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-[#6E6E73]">
                <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>
                  ระบบจะสร้างไฟล์ตาราง <strong className="font-medium text-[#1D1D1F]">Cupertino_Stock_Database_v1</strong> ใน Google Drive ของคุณโดยอัตโนมัติ หรือคุณสามารถเลือกผูกกับไฟล์ Sheet เดิมที่มีอยู่ได้
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[#6E6E73]">รองรับการติดตั้งเป็น WebApp บนมือถือและคอมพิวเตอร์</span>
                <PWAInstallButton />
              </div>
            </div>
          </div>
        </div>
      </main>

      <OfflineIndicator />

      <footer className="py-4 px-6 text-center text-xs text-[#6E6E73]">
        Cupertino Stock · ระบบบริหารคลังสินค้าเชื่อมต่อ Google Sheets API (Progressive Web App)
      </footer>
    </div>
  );
};
