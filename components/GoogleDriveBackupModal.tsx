import React, { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  createBackupZip: (metadataOnly?: boolean, excludedTrackIds?: string[], compressCovers?: boolean) => Promise<Blob>;
  restoreBackupZip: (blob: Blob) => Promise<void>;
  isBackupProcessing: boolean;
  setIsBackupProcessing: (val: boolean) => void;
  backupStatusMessage: string | null;
  setBackupStatusMessage: (msg: string | null) => void;
  onBackupSuccess: () => void;
  onCancelBackup?: () => void;
  initialMode?: 'backup' | 'import' | null;
}

export default function GoogleDriveBackupModal({
  isOpen,
  onClose,
  createBackupZip,
  restoreBackupZip,
  isBackupProcessing,
  setIsBackupProcessing,
  backupStatusMessage,
  setBackupStatusMessage,
  onBackupSuccess,
  onCancelBackup,
  initialMode
}: GoogleDriveBackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleCreateBackup = async () => {
    if (isBackupProcessing) return;
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري إنشاء وضغط الملفات والبيانات... 📦');
    try {
      // Create a full backup with compressed covers and no excluded tracks for safety
      const zipBlob = await createBackupZip(false, [], true);
      
      const now = new Date();
      const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const exportName = `نسخة_احتياطية_ترانيم_${datePart}_${timePart}.zip`;

      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const CHUNK_SIZE = 3145728;
        const totalSize = zipBlob.size;
        let numChunks = Math.ceil(totalSize / CHUNK_SIZE);
        if (numChunks === 0) numChunks = 1;

        const targetDirectory = Directory.Documents;

        try {
          await Filesystem.deleteFile({ path: exportName, directory: targetDirectory });
        } catch (e) {}

        let firstChunkUri = '';

        for (let i = 0; i < numChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, totalSize);
          const chunkBlob = zipBlob.slice(start, end);

          setBackupStatusMessage(`جاري حفظ الملف... (${i + 1} / ${numChunks})`);

          const base64Chunk = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.substring(result.indexOf(',') + 1);
              resolve(base64);
            };
            reader.readAsDataURL(chunkBlob);
          });

          if (i === 0) {
            const result = await Filesystem.writeFile({ path: exportName, data: base64Chunk, directory: targetDirectory });
            firstChunkUri = result.uri;
          } else {
            await Filesystem.appendFile({ path: exportName, data: base64Chunk, directory: targetDirectory });
          }
        }

        try {
          const { Share } = await import('@capacitor/share');
          setBackupStatusMessage('جاري فتح قائمة الحفظ والمشاركة...');
          await Share.share({
            title: 'نسخة ترانيم الاحتياطية',
            text: 'ملف النسخة الاحتياطية للأناشيد والتسجيلات',
            url: firstChunkUri,
            dialogTitle: 'حفظ أو مشاركة ملف النسخة الاحتياطية'
          });
        } catch (shareErr) {
          console.warn('Native share dialog dismissed or unsupported, file written to Documents:', shareErr);
        }
        setBackupStatusMessage('تم حفظ ملف النسخة بنجاح في المستندات! 🎉');
      } else {
        const file = new File([zipBlob], exportName, { type: "application/zip" });
        let shared = false;

        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "نسخة ترانيم الاحتياطية" });
            shared = true;
            setBackupStatusMessage('تمت مشاركة وحفظ الملف بنجاح! 🎉');
          } catch (shareErr: any) {
            if (shareErr.name !== 'AbortError') {
              console.warn('Navigator share error, falling back to direct download:', shareErr);
            }
          }
        }

        if (!shared) {
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = exportName;
          link.setAttribute('download', exportName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          setBackupStatusMessage('تم تنزيل وحفظ النسخة الاحتياطية بنجاح! ✅');
        }
      }
      onBackupSuccess();
    } catch (err: any) {
      console.error("Local backup failed", err);
      setBackupStatusMessage(`❌ فشل الحفظ: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 5000);
    }
  };

  const handleLocalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isBackupProcessing) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }

    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري استيراد النسخة الاحتياطية وفك الملفات... ⚡');
    try {
      await restoreBackupZip(file);
      setBackupStatusMessage('اكتمل الاستيراد بنجاح! تم تحديث المكتبة... ✅');
    } catch (err: any) {
      console.error("Local restore failed", err);
      setBackupStatusMessage('❌ فشلت الاستعادة! تأكد من صحة ملف الـ zip.');
    } finally {
      setIsBackupProcessing(false);
      e.target.value = '';
      setTimeout(() => setBackupStatusMessage(null), 5000);
    }
  };

  useEffect(() => {
    if (isOpen && initialMode) {
      if (initialMode === 'backup') {
        handleCreateBackup();
      } else if (initialMode === 'import') {
        fileInputRef.current?.click();
      }
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in font-sans">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-2xl overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#4da8ab]/10 dark:bg-[#4da8ab]/20 rounded-xl text-[#4da8ab]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">النسخ الاحتياطي واستعادة ZIP</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[75vh] space-y-5">
          {/* Status Messages */}
          {backupStatusMessage && (
            <div className={`p-4 text-xs text-center font-bold rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all duration-300 ${
              backupStatusMessage.includes('✅') || backupStatusMessage.includes('🎉') || backupStatusMessage.includes('نجاح')
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
              : backupStatusMessage.includes('❌') || backupStatusMessage.includes('فشل')
              ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
              : 'bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 text-[#4da8ab] border-[#4da8ab]/10'
            }`}>
              <div className="flex items-center justify-center gap-2.5">
                {isBackupProcessing && (
                  <svg className="w-4 h-4 animate-spin text-[#4da8ab]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span className={isBackupProcessing ? 'animate-pulse' : ''}>{backupStatusMessage}</span>
              </div>
            </div>
          )}

          {/* Just Two Action Buttons */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <button
              onClick={handleCreateBackup}
              disabled={isBackupProcessing}
              className="flex flex-col items-center justify-center gap-2.5 bg-[#4da8ab] hover:bg-[#3d9093] disabled:bg-slate-100 disabled:text-slate-400 text-white font-black text-xs py-4 px-3 rounded-2xl shadow-sm active:scale-95 transition-all cursor-pointer border border-[#4da8ab]/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>إنشاء نسخة احتياطية</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isBackupProcessing}
              className="flex flex-col items-center justify-center gap-2.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-50 font-black text-xs py-4 px-3 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60 cursor-pointer active:scale-95 transition-all"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
              </svg>
              <span>استعادة نسخة احتياطية</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-450 dark:text-slate-500 font-bold leading-relaxed text-center px-2">
            • تشمل النسخة الاحتياطية كامل الأناشيد بملفاتها الصوتية والأغلفة وسجل الاستماع والترتيب والمنشدين لتتمكن من استعادتها بأي وقت.
          </p>

          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".zip" 
            onChange={handleLocalImport} 
            className="hidden" 
          />
        </div>
      </div>
    </div>
  );
}
