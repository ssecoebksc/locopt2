const DB_NAME = 'LocoTrackDB';
const DB_VERSION = 4;
const STORES = {
  RECORDS: 'records',
  SETTINGS: 'settings'
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});

async function syncRecords() {
  const db = await openDB();
  const serverUrl = await getSetting(db, 'serverUrl');
  if (!serverUrl) return;

  const records = await getPendingRecords(db);
  for (const record of records) {
    try {
      await pushRecord(record, serverUrl, db);
    } catch (e) {
      console.error('Background sync failed for record', record.id, e);
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getSetting(db, key) {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORES.SETTINGS, 'readonly');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => resolve(null);
  });
}

function getPendingRecords(db) {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORES.RECORDS, 'readonly');
    const store = transaction.objectStore(STORES.RECORDS);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = request.result || [];
      resolve(records.filter(r => r.syncStatus !== 'synced'));
    };
    request.onerror = () => resolve([]);
  });
}

async function pushRecord(record, baseUrl, db) {
  if (record.syncStatus === 'synced' || record.syncStatus === 'uploading') return;
  
  baseUrl = cleanUrl(baseUrl);
  
  // Update status to uploading
  record.syncStatus = 'uploading';
  record.uploadProgress = 0;
  await saveRecord(db, record);

  let imageUrl = record.image;
  if (record.image && record.image.startsWith('data:image')) {
    // 1. Try fast single-request direct upload
    try {
      const rawBase64 = record.image.includes(',') ? record.image.split(',')[1] : record.image;
      const cleanBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');
      const directRes = await fetch(`${baseUrl}/api/upload/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: record.id, data: cleanBase64 })
      });
      if (directRes.ok) {
        const d = await directRes.json();
        imageUrl = d.imageUrl;
      }
    } catch (e) {
      // Fallback
    }

    // 2. Fallback to chunked upload if needed
    if (!imageUrl || imageUrl.startsWith('data:image')) {
      imageUrl = await uploadInChunks(record, baseUrl, db);
    }

    if (!imageUrl) {
      record.syncStatus = 'failed';
      await saveRecord(db, record);
      return;
    }
  }

  const response = await fetch(`${baseUrl}/api/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...record, image: imageUrl })
  });

  if (response.ok) {
    record.syncStatus = 'synced';
    record.uploadProgress = 100;
    record.image = imageUrl;
    await saveRecord(db, record);
  } else {
    record.syncStatus = 'failed';
    await saveRecord(db, record);
  }
}

async function uploadInChunks(record, baseUrl, db) {
  const BASE64_CHUNK_SIZE = 524288;
  const base64Data = record.image;
  const recordId = record.id;
  
  const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const cleanBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');
  const totalLen = cleanBase64.length;
  if (totalLen < 100) return null;

  const CHUNK_SIZE = Math.floor(BASE64_CHUNK_SIZE / 4) * 4;
  const totalChunks = Math.ceil(totalLen / CHUNK_SIZE);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalLen);
    const chunkData = cleanBase64.substring(start, end);
    
    const res = await fetch(`${baseUrl}/api/upload/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, chunkIndex: i, totalChunks, data: chunkData })
    });
    
    if (!res.ok) return null;

    record.uploadProgress = Math.min(95, Math.round(((i + 1) / totalChunks) * 90));
  }

  const assembleRes = await fetch(`${baseUrl}/api/upload/assemble`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, totalChunks })
  });

  if (assembleRes.ok) {
    const data = await assembleRes.json();
    return data.imageUrl;
  }
  return null;
}

function saveRecord(db, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.RECORDS, 'readwrite');
    const store = transaction.objectStore(STORES.RECORDS);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function cleanUrl(url) {
  let clean = url.trim();
  if (clean.includes('.ts.net')) {
    if (clean.startsWith('http://')) clean = clean.replace('http://', 'https://');
    else if (!clean.startsWith('https://')) clean = `https://${clean}`;
  } else if (!clean.startsWith('http')) clean = `http://${clean}`;
  if (clean.endsWith('/')) clean = clean.slice(0, -1);
  return clean;
}
