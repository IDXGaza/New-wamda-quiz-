import { Capacitor } from '@capacitor/core';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

// Modern Web Authentication with Firebase Auth
export const getAccessToken = async (): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      await GoogleAuth.initialize();
      const user = await GoogleAuth.signIn() as any;
      const accessToken = user?.authentication?.accessToken;
      if (!accessToken) throw new Error('accessToken فارغ');
      
      if (user) {
        const traneemUser = {
          displayName: user.displayName || (user.givenName + " " + user.familyName) || 'مستخدم ترانيم',
          email: user.email || '',
          photoURL: user.imageUrl || '',
          uid: user.id || ''
        };
        localStorage.setItem('traneem_user', JSON.stringify(traneemUser));
      }
      
      return accessToken;
    } catch (err: any) {
      let msg = err?.message || err?.code || (typeof err === 'string' ? err : '');
      if (!msg || msg === '{}' || msg === 'Something went wrong') {
        msg = 'خطأ في إعدادات Google OAuth / SHA-1 أو الخادم (تأكد من مطابقة SHA-1 في Firebase Console و Google Cloud Console)';
      }
      throw new Error(msg);
    }
  } else {
    try {
      const { auth } = await import('../firebase');
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      
      if (!accessToken) {
        throw new Error('فشل الحصول على رمز الوصول من قوقل (Access Token). تأكد من إعداد نطاقات الوصول (Scopes).');
      }
      return accessToken;
    } catch (err: any) {
      let friendlyMsg = '';
      const errorCode = err?.code || '';
      const errorMsg = err?.message || '';
      
      if (errorCode === 'auth/cancelled-popup-request' || errorMsg.includes('cancelled-popup-request')) {
        friendlyMsg = 'تم إلغاء طلب تسجيل الدخول بسبب تداخل مع نافذة أخرى أو إغلاقها (يرجى المحاولة مجدداً).';
      } else if (errorCode === 'auth/popup-closed-by-user' || errorMsg.includes('popup-closed-by-user')) {
        friendlyMsg = 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
      } else if (errorCode === 'auth/popup-blocked' || errorMsg.includes('popup-blocked')) {
        friendlyMsg = 'تم حظر نافذة تسجيل الدخول المنبثقة من قبل متصفحك. يرجى السماح بالنوافذ المنبثقة وحاول مجدداً.';
      } else {
        friendlyMsg = errorMsg || errorCode || 'خطأ غير معروف في المصادقة.';
      }
      throw new Error(`فشل تسجيل الدخول بالويب: ${friendlyMsg}`);
    }
  }
};

/**
 * Safely parses response errors from Google Drive REST API.
 */
const handleDriveResponseError = async (response: Response, actionContext: string): Promise<never> => {
  let errDetail = '';
  try {
    const errJson = await response.json();
    errDetail = errJson?.error?.message || errJson?.error_description || '';
  } catch {
    try {
      errDetail = await response.text();
    } catch {
      errDetail = '';
    }
  }

  if (
    response.status === 401 ||
    errDetail.toLowerCase().includes('invalid credentials') ||
    errDetail.toLowerCase().includes('unauthorized') ||
    errDetail.toLowerCase().includes('token expired')
  ) {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_acquired_at');
    throw new Error('ExpiredToken');
  }

  if (
    response.status === 403 ||
    errDetail.toLowerCase().includes('insufficient') ||
    errDetail.toLowerCase().includes('scope') ||
    errDetail.toLowerCase().includes('permission')
  ) {
    throw new Error('صلاحية Google Drive غير كافية. يرجى تسجيل الخروج وإعادة تسجيل الدخول لمنح الصلاحيات السحابية.');
  }

  const msg = errDetail ? `${errDetail} (كود ${response.status})` : (response.statusText || `كود ${response.status}`);
  throw new Error(`${actionContext}: ${msg}`);
};

export const uploadBackupToDrive = async (zipBlob: Blob, accessToken: string, customFilename?: string): Promise<any> => {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
  const filename = customFilename || `نسخة_احتياطية_ترانيم_${datePart}_${timePart}.zip`;
  
  // Use multipart/related for appDataFolder
  const metadata = { 
    name: filename, 
    mimeType: 'application/zip', 
    parents: ['appDataFolder'] 
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_backup_boundary_998877';
  
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    zipBlob,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBody
  });
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل رفع النسخة الاحتياطية');
  }
  return await response.json();
};

export const updateBackupInDrive = async (fileId: string, zipBlob: Blob, accessToken: string): Promise<any> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip'
    },
    body: zipBlob
  });
  
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل تحديث النسخة الاحتياطية');
  }
  return await response.json();
};

export const listBackupsInDrive = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const q = encodeURIComponent("(name contains 'traneem_backup' or name contains 'ترانيم') and mimeType = 'application/zip' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&orderBy=createdTime+desc&fields=files(id,name,size,createdTime)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل جلب قائمة النسخ الاحتياطية');
  }
  const data = await response.json();
  return data.files || [];
};

export const downloadBackupFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل تحميل النسخة الاحتياطية');
  }
  return await response.blob();
};

export const deleteBackupFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    await handleDriveResponseError(response, 'فشل حذف النسخة الاحتياطية');
  }
};

// --- New individual file helpers for auto-sync ---

/**
 * Calculates SHA-256 hash of a Blob for deduplication.
 */
export const getBlobSHA256 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Uploads a file to appDataFolder and returns the metadata including ID.
 */
export const uploadFileToDrive = async (
  filename: string,
  mimeType: string,
  blob: Blob,
  accessToken: string
): Promise<{ id: string }> => {
  const metadata = {
    name: filename,
    parents: ['appDataFolder']
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_boundary_unique_998';
  
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBody
  });
  
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل الرفع ${filename}`);
  }
  return response.json();
};

/**
 * Updates an existing file content in Drive.
 */
export const updateFileInDrive = async (
  fileId: string,
  blob: Blob,
  accessToken: string
): Promise<any> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': blob.type || 'application/octet-stream'
    },
    body: blob
  });
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل تحديث الملف ${fileId}`);
  }
  return response.json();
};

/**
 * Downloads file as Blob.
 */
export const downloadFileFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل تحميل الملف ${fileId}`);
  }
  return response.blob();
};

/**
 * Downloads file and parses as JSON.
 */
export const downloadJSONFromDrive = async (fileId: string, accessToken: string): Promise<any> => {
  const blob = await downloadFileFromDrive(fileId, accessToken);
  const text = await blob.text();
  return JSON.parse(text);
};

/**
 * Finds a file by exact name in appDataFolder, returning file ID if found.
 */
export const findFileInDrive = async (filename: string, accessToken: string): Promise<string | null> => {
  const q = encodeURIComponent(`name = '${filename}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل البحث عن الملف ${filename}`);
  }
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
};

/**
 * Deletes a file from Drive by ID.
 */
export const deleteFileFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    await handleDriveResponseError(response, `فشل حذف الملف ${fileId}`);
  }
};

