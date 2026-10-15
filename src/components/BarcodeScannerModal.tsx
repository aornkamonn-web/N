import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, RefreshCw, AlertTriangle, ImageUp, Keyboard, CheckCircle2 } from 'lucide-react';
import { ProductItem } from '../types';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedCode: string) => void;
  products: ProductItem[];
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  products,
}) => {
  const scannerRegionId = 'cupertino-qr-barcode-reader';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isStarting, setIsStarting] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>('');
  const [lastDetected, setLastDetected] = useState<string | null>(null);

  const stopScanner = async () => {
    const instance = html5QrCodeRef.current;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
        instance.clear();
      } catch {
        // Ignore stop errors when unmounting
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsStarting(true);
    setCameraError(null);
    setLastDetected(null);

    const initializeCamera = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (!devices || devices.length === 0) {
          setCameraError('ไม่พบอุปกรณ์กล้องบนเครื่องนี้ กรุณาอัปโหลดรูปภาพบาร์โค้ดหรือเลือกจากรายการด้านล่าง');
          setIsStarting(false);
          return;
        }

        setCameras(devices);
        // Prefer back/environment camera if available
        const backCam =
          devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        const camId = selectedCameraId || backCam.id;
        setSelectedCameraId(camId);

        const scanner = new Html5Qrcode(scannerRegionId);
        html5QrCodeRef.current = scanner;

        await scanner.start(
          camId,
          {
            fps: 12,
            qrbox: { width: 250, height: 160 },
            aspectRatio: 1.333334,
          },
          (decodedText) => {
            if (!isMounted) return;
            const cleanCode = decodedText.trim();
            if (cleanCode) {
              setLastDetected(cleanCode);
              stopScanner().finally(() => {
                onScanSuccess(cleanCode);
              });
            }
          },
          () => {
            // Frame scan error (no code in frame) — ignore
          }
        );

        if (isMounted) {
          setIsStarting(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setCameraError(
          'ไม่สามารถเปิดใช้งานกล้องได้ (กรุณาอนุญาตสิทธิ์การใช้กล้องในเบราว์เซอร์ หรือเลือกรูปภาพ QR/Barcode แทน)'
        );
        setIsStarting(false);
      }
    };

    const timer = setTimeout(() => {
      initializeCamera();
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, selectedCameraId]);

  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    await stopScanner();
    setSelectedCameraId(cameras[nextIndex].id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCameraError(null);
    try {
      await stopScanner();
      const scanner = new Html5Qrcode(scannerRegionId);
      html5QrCodeRef.current = scanner;
      const decodedText = await scanner.scanFile(file, true);
      const cleanCode = decodedText.trim();
      if (cleanCode) {
        setLastDetected(cleanCode);
        onScanSuccess(cleanCode);
      }
    } catch {
      setCameraError('ไม่พบรหัส QR Code หรือบาร์โค้ดในรูปภาพที่เลือก กรุณาลองภาพอื่น');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    stopScanner().finally(() => {
      onScanSuccess(clean);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E5EA] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5E5EA] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1D1D1F]">
                สแกน QR Code / Barcode สินค้า
              </h3>
              <p className="text-[11px] text-[#6E6E73]">
                หันกล้องไปที่รหัสบาร์โค้ดหรือ QR ของสินค้าเพื่อเลือก SKU อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanner().finally(onClose);
            }}
            className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors cursor-pointer"
            aria-label="ปิดหน้าต่างสแกน"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Camera Viewport Container */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-[#1D1D1F] min-h-[240px] flex flex-col items-center justify-center border border-[#E5E5EA]">
            <div id={scannerRegionId} className="w-full" />

            {isStarting && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1D1D1F] text-white text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-[#0071E3]" />
                <span>กำลังเปิดกล้องสแกนบาร์โค้ด...</span>
              </div>
            )}

            {lastDetected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#16A34A]/95 text-white text-xs font-bold">
                <CheckCircle2 className="w-8 h-8" />
                <span>พบรหัส: {lastDetected}</span>
              </div>
            )}

            {cameraError && (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-[#D97706]/20 text-[#FBBF24] flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <p className="text-xs text-white/90 leading-relaxed">{cameraError}</p>
              </div>
            )}
          </div>

          {/* Camera Action Controls */}
          <div className="flex items-center justify-between gap-2">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#0071E3]" />
                <span>สลับกล้องหน้า/หลัง</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
            >
              <ImageUp className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>สแกนจากรูปภาพ</span>
            </button>
          </div>

          {/* Hardware Scanner / Manual SKU Entry */}
          <form onSubmit={handleManualSubmit} className="pt-3 border-t border-[#E5E5EA] space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1D1D1F]">
              <Keyboard className="w-3.5 h-3.5 text-[#6E6E73]" />
              <span>หรือยิงเครื่องสแกน USB / พิมพ์รหัส SKU โดยตรง</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="เช่น APL-MBP-14M3..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-[#F5F5F7] text-xs font-mono-tabular text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#005BB5] text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                ตกลง
              </button>
            </div>
          </form>

          {/* Quick Select from existing SKU tags for rapid testing */}
          {products.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <div className="text-[11px] text-[#6E6E73]">
                ทดสอบสแกนด่วนจากรหัส SKU ในคลังของคุณ:
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {products.slice(0, 8).map((p) => (
                  <button
                    key={p.sku}
                    type="button"
                    onClick={() => {
                      stopScanner().finally(() => {
                        onScanSuccess(p.sku);
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-[11px] font-mono-tabular font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    {p.sku}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
