
import express from 'express';
import cors from 'cors';
import pg from 'pg';
const { Pool } = pg;
import * as Minio from 'minio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const TEMP_UPLOAD_DIR = path.join(__dirname, 'temp_uploads');

if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

const PG_CONFIG = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'locopt',
  password: process.env.DB_PASSWORD || 'elsbksc2012',
  port: 5432,
};

const MINIO_CONFIG = {
  endPoint: process.env.MINIO_HOST || 'localhost',
  port: 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
};

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Private-Network']
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '50mb' }));

const pool = new Pool(PG_CONFIG);
const minioClient = new Minio.Client(MINIO_CONFIG);
const BUCKET_NAME = 'loco-images';

const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
  publicDomain: process.env.R2_PUBLIC_DOMAIN,
};

let s3Client = null;
if (R2_CONFIG.accountId && R2_CONFIG.accessKeyId && R2_CONFIG.secretAccessKey) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
  });
}

let isReady = false;
let lastError = null;

async function initInfrastructure() {
  try {
    const client = await pool.connect();
    
    // 1. Base Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, 
        hrms_id TEXT UNIQUE, 
        display_name TEXT, 
        role TEXT, 
        password TEXT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, 
        loco_number TEXT, 
        base_shed TEXT, 
        schedule TEXT, 
        pantograph TEXT, 
        image_url TEXT, 
        created_at TIMESTAMPTZ, 
        created_by TEXT, 
        raw_json JSONB,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Migration: Ensure columns exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_active') THEN
          ALTER TABLE users ADD COLUMN last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='updated_at') THEN
          ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='records' AND column_name='updated_at') THEN
          ALTER TABLE records ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END$$;
    `);

    // 3. Performance Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at);`);

    client.release();
    
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) { await minioClient.makeBucket(BUCKET_NAME, 'us-east-1'); }
    
    isReady = true;
    lastError = null;
    console.log('✅ HUB ENGINE ONLINE: Heartbeat Protocol Active');
  } catch (err) {
    isReady = false;
    lastError = err.message;
    console.error('❌ HUB ERROR:', err.message);
    setTimeout(initInfrastructure, 5000);
  }
}

initInfrastructure();

// Binary image header validator to detect truncated or corrupted uploads
function validateImageBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, format: '', error: 'Buffer is null or invalid' };
  }
  if (buffer.length < 128) {
    return { valid: false, format: '', error: `Image file is incomplete (${buffer.length} bytes)` };
  }

  // 1. JPEG: starts with FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    let hasEoi = false;
    const scanStart = Math.max(0, buffer.length - 1024);
    for (let i = scanStart; i < buffer.length - 1; i++) {
      if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
        hasEoi = true;
        break;
      }
    }
    if (!hasEoi) {
      return { valid: false, format: 'image/jpeg', error: 'Incomplete JPEG: Missing End-of-Image (EOI 0xFFD9) marker' };
    }
    return { valid: true, format: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    return { valid: true, format: 'image/png' };
  }

  // 3. WebP: RIFF ... WEBP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return { valid: true, format: 'image/webp' };
  }

  return { valid: false, format: '', error: 'Unrecognized image format: file headers do not match JPEG, PNG, or WebP' };
}

// FAST DIRECT UPLOAD (Single request for optimized images with integrity check)
app.post('/api/upload/direct', async (req, res) => {
  const { recordId, data } = req.body;
  if (!recordId || !data) return res.status(400).json({ error: 'Missing recordId or data' });
  try {
    const safeRecordId = String(recordId).replace(/[^a-zA-Z0-9_-]/g, '');
    let base64Data = data.includes(',') ? data.split(',')[1] : data;
    base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');

    if (!base64Data || base64Data.length < 100) {
      return res.status(400).json({ error: 'Payload base64 data too small or empty' });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const validation = validateImageBuffer(buffer);
    if (!validation.valid) {
      console.warn(`[Direct Upload Rejected] Record ${safeRecordId}: ${validation.error}`);
      return res.status(422).json({ error: `Corrupted image data: ${validation.error}`, corrupted: true });
    }

    const fileName = `${safeRecordId}.jpg`;
    await minioClient.putObject(
      BUCKET_NAME,
      fileName,
      buffer,
      buffer.length,
      { 'Content-Type': validation.format || 'image/jpeg' }
    );
    res.json({ success: true, imageUrl: `/storage/${BUCKET_NAME}/${fileName}`, size: buffer.length });
  } catch (err) {
    console.error('Direct upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// CHUNKED UPLOAD (Atomic file writes, no destructive wipes on chunk 0 retries)
app.post('/api/upload/chunk', async (req, res) => {
  const { recordId, chunkIndex, totalChunks, data } = req.body;
  if (!recordId || chunkIndex === undefined || !data) return res.status(400).json({ error: 'Missing chunk data' });

  const safeRecordId = String(recordId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeRecordId) return res.status(400).json({ error: 'Invalid recordId format' });

  const recordDir = path.join(TEMP_UPLOAD_DIR, safeRecordId);
  if (!fs.existsSync(recordDir)) {
    fs.mkdirSync(recordDir, { recursive: true });
  }

  // Sanitize base64 chunk string
  const cleanData = String(data).replace(/[^A-Za-z0-9+/=]/g, '');
  if (cleanData.length === 0) {
    return res.status(400).json({ error: 'Empty chunk data' });
  }

  const chunkBuffer = Buffer.from(cleanData, 'base64');
  const chunkFilePath = path.join(recordDir, `chunk_${chunkIndex}`);
  
  // Write to temporary file first then atomic rename to prevent partial chunk reads
  const tempChunkPath = `${chunkFilePath}.tmp_${Date.now()}`;
  fs.writeFileSync(tempChunkPath, chunkBuffer);
  fs.renameSync(tempChunkPath, chunkFilePath);

  res.json({ success: true, chunk: chunkIndex, bytesReceived: chunkBuffer.length });
});

// ASSEMBLE CHUNKS (Verifies 100% chunk completeness and validates image integrity)
app.post('/api/upload/assemble', async (req, res) => {
  const { recordId, totalChunks } = req.body;
  if (!recordId) return res.status(400).json({ error: 'Missing recordId' });

  const safeRecordId = String(recordId).replace(/[^a-zA-Z0-9_-]/g, '');
  const recordDir = path.join(TEMP_UPLOAD_DIR, safeRecordId);
  if (!fs.existsSync(recordDir)) return res.status(404).json({ error: 'Upload sequence directory not found' });

  try {
    const numChunks = typeof totalChunks === 'number' ? totalChunks : null;
    if (numChunks !== null) {
      const missingChunks = [];
      for (let i = 0; i < numChunks; i++) {
        const chunkPath = path.join(recordDir, `chunk_${i}`);
        if (!fs.existsSync(chunkPath) || fs.statSync(chunkPath).size === 0) {
          missingChunks.push(i);
        }
      }
      if (missingChunks.length > 0) {
        return res.status(400).json({
          error: `Incomplete upload: missing ${missingChunks.length} chunk(s)`,
          missingChunks,
          totalExpected: numChunks
        });
      }
    }

    // Read chunks strictly in numerical sequence
    const files = fs.readdirSync(recordDir).filter(f => f.startsWith('chunk_') && !f.includes('.tmp'));
    const chunkFiles = files.sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));

    if (chunkFiles.length === 0) {
      return res.status(400).json({ error: 'No chunks available to assemble' });
    }

    const buffers = [];
    for (const file of chunkFiles) {
      buffers.push(fs.readFileSync(path.join(recordDir, file)));
    }
    const finalBuffer = Buffer.concat(buffers);

    // CRITICAL: Integrity validation on assembled image before writing to MinIO
    const validation = validateImageBuffer(finalBuffer);
    if (!validation.valid) {
      console.warn(`[Integrity Check Failed] Record ${safeRecordId}: ${validation.error}`);
      fs.rmSync(recordDir, { recursive: true, force: true });
      return res.status(422).json({
        error: `Assembled image is corrupt: ${validation.error}`,
        corrupted: true
      });
    }

    // Validated image! Write to MinIO
    const fileName = `${safeRecordId}.jpg`;
    await minioClient.putObject(
      BUCKET_NAME,
      fileName,
      finalBuffer,
      finalBuffer.length,
      { 'Content-Type': validation.format || 'image/jpeg' }
    );

    // Clean up temporary chunks folder
    fs.rmSync(recordDir, { recursive: true, force: true });

    res.json({ success: true, imageUrl: `/storage/${BUCKET_NAME}/${fileName}`, size: finalBuffer.length });
  } catch (err) {
    console.error('Assemble failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// R2 BUFFERED UPLOAD
app.get('/api/upload/r2-presign', async (req, res) => {
  if (!s3Client) return res.status(503).json({ error: 'R2 not configured' });
  const { fileName, contentType } = req.query;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });

  try {
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileName,
      ContentType: contentType || 'image/jpeg',
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/r2-complete', async (req, res) => {
  if (!s3Client) return res.status(503).json({ error: 'R2 not configured' });
  const { recordId, fileName } = req.body;
  if (!recordId || !fileName) return res.status(400).json({ error: 'recordId and fileName required' });

  try {
    const safeRecordId = String(recordId).replace(/[^a-zA-Z0-9_-]/g, '');
    // 1. Download from R2
    const r2Url = R2_CONFIG.publicDomain 
      ? `${R2_CONFIG.publicDomain}/${fileName}`
      : await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: fileName }), { expiresIn: 3600 });

    const response = await axios.get(r2Url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Validate image integrity
    const validation = validateImageBuffer(buffer);
    if (!validation.valid) {
      return res.status(422).json({ error: `R2 downloaded image is corrupt: ${validation.error}` });
    }

    // 2. Save to MinIO
    const minioFileName = `${safeRecordId}.jpg`;
    await minioClient.putObject(BUCKET_NAME, minioFileName, buffer, buffer.length, { 'Content-Type': validation.format || 'image/jpeg' });

    // 3. Cleanup R2
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileName,
    }));

    res.json({ success: true, imageUrl: `/storage/${BUCKET_NAME}/${minioFileName}` });
  } catch (err) {
    console.error('R2 completion failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// HUB EXPLORER
app.get('/', async (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    try {
      if (!isReady) throw new Error("Hub database is still initializing...");
      const recordsResult = await pool.query('SELECT * FROM records ORDER BY created_at DESC');
      const usersResult = await pool.query('SELECT * FROM users ORDER BY last_active DESC NULLS LAST');
      
      const stats = { totalRecords: recordsResult.rowCount, totalUsers: usersResult.rowCount };

      return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>LocoPT Hub Explorer</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; background: #020617; color: #f8fafc; }
          .card-glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px); border: 1px solid rgba(51, 65, 85, 0.5); }
          .status-pulse { animation: pulse 2s infinite; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        </style>
      </head>
      <body class="p-8">
        <div class="max-w-6xl mx-auto">
          <header class="flex justify-between items-center mb-12">
            <div>
              <h1 class="text-5xl font-black tracking-tighter uppercase italic">Hub Explorer</h1>
              <p class="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                <span class="w-2 h-2 bg-emerald-500 rounded-full status-pulse"></span> Authorized Personnel Registry
              </p>
            </div>
            <div class="flex gap-4">
              <div class="card-glass p-6 rounded-[2rem] text-center min-w-[140px]">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Records</p>
                <p class="text-4xl font-black text-indigo-400">${stats.totalRecords}</p>
              </div>
              <div class="card-glass p-6 rounded-[2rem] text-center min-w-[140px]">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Staff</p>
                <p class="text-4xl font-black text-blue-400">${stats.totalUsers}</p>
              </div>
            </div>
          </header>

          <div class="space-y-16">
            <section>
              <h2 class="text-2xl font-black text-white flex items-center gap-4 mb-8">
                <span class="w-2.5 h-10 bg-blue-500 rounded-full"></span> Personnel Activity Log
              </h2>
              <div class="card-glass rounded-[3rem] overflow-hidden shadow-2xl">
                <table class="w-full text-left">
                  <thead class="bg-slate-900 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
                    <tr>
                      <th class="px-8 py-6">Staff Member</th>
                      <th class="px-8 py-6">HRMS ID</th>
                      <th class="px-8 py-6">Access Role</th>
                      <th class="px-8 py-6">Registry Update</th>
                      <th class="px-8 py-6 text-right">Last Active Time</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/50">
                    ${usersResult.rows.map(u => `
                      <tr class="hover:bg-slate-800/30 transition-colors">
                        <td class="px-8 py-8 font-bold text-white tracking-tight">${u.display_name}</td>
                        <td class="px-8 py-8 font-mono text-blue-400 tracking-widest">${u.hrms_id}</td>
                        <td class="px-8 py-8"><span class="px-3 py-1 bg-slate-800 border border-slate-700 text-[9px] font-black uppercase tracking-widest text-slate-400 rounded-full">${u.role}</span></td>
                        <td class="px-8 py-8 text-[10px] text-slate-600 font-mono">${new Date(u.updated_at).toLocaleString('en-GB')}</td>
                        <td class="px-8 py-8 text-right font-black ${Date.now() - new Date(u.last_active).getTime() < 60000 ? 'text-emerald-400' : 'text-slate-500'}">
                          ${new Date(u.last_active).toLocaleString('en-GB')}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div class="flex justify-between items-end mb-8">
                <h2 class="text-2xl font-black text-white flex items-center gap-4">
                  <span class="w-2.5 h-10 bg-indigo-600 rounded-full"></span> Recent Maintenance
                </h2>
                <button id="downloadPdf" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-900/20 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  Download PDF Report
                </button>
              </div>

              <div class="card-glass p-6 rounded-[2.5rem] mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-2">Loco Number</label>
                  <input type="text" id="filterLoco" placeholder="Search Loco #" class="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:border-indigo-500 outline-none transition-all">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-2">Date (DD/MM/YYYY)</label>
                  <input type="text" id="filterDate" placeholder="Filter Date" class="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:border-indigo-500 outline-none transition-all">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-2">Pantograph</label>
                  <select id="filterPanto" class="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:border-indigo-500 outline-none transition-all appearance-none">
                    <option value="ALL">All Pantographs</option>
                    <option value="PT1">PT1 Only</option>
                    <option value="PT2">PT2 Only</option>
                  </select>
                </div>
              </div>

              <div class="card-glass rounded-[3rem] overflow-hidden">
                <table class="w-full text-left">
                  <thead class="bg-slate-900 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
                    <tr>
                      <th class="px-8 py-6">Loco #</th>
                      <th class="px-8 py-6">Shed / Schedule</th>
                      <th class="px-8 py-6">Panto</th>
                      <th class="px-8 py-6">Staff</th>
                      <th class="px-8 py-6">Captured Date</th>
                      <th class="px-8 py-6">Evidence</th>
                      <th class="px-8 py-6 text-right">Receipt Time</th>
                    </tr>
                  </thead>
                  <tbody id="recordsTableBody" class="divide-y divide-slate-800/50">
                    <!-- Rows will be injected by JS -->
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <footer class="mt-32 py-16 border-t border-slate-900 text-center text-slate-700 text-[10px] font-black uppercase tracking-[0.4em]">
            Hub Engine v3.8 • Heartbeat Protocol • Authority Sync
          </footer>
        </div>

        <div id="imageModal" class="fixed inset-0 bg-black/90 z-50 hidden flex items-center justify-center p-8 backdrop-blur-sm">
          <div class="relative max-w-5xl w-full h-full flex flex-col">
            <button onclick="closeModal()" class="absolute -top-12 right-0 text-white hover:text-indigo-400 transition-colors flex items-center gap-2 font-black uppercase tracking-widest text-xs">
              Close Preview <span class="text-2xl">×</span>
            </button>
            <div class="flex-1 bg-slate-900 rounded-[3rem] overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
              <img id="modalImage" src="" class="max-w-full max-h-full object-contain" />
            </div>
          </div>
        </div>

        <script>
          const ALL_RECORDS = ${JSON.stringify(recordsResult.rows.map(r => ({...r, raw_json: r.raw_json})))};
          const tableBody = document.getElementById('recordsTableBody');
          const filterLoco = document.getElementById('filterLoco');
          const filterDate = document.getElementById('filterDate');
          const filterPanto = document.getElementById('filterPanto');
          const downloadBtn = document.getElementById('downloadPdf');

          function renderRecords(records) {
            tableBody.innerHTML = records.map(r => {
              const data = r.raw_json || {};
              const capturedDate = data.formattedDate || 'N/A';
              const capturedTime = data.formattedTime || '';
              
              return \`
                <tr class="hover:bg-slate-800/30 transition-colors">
                  <td class="px-8 py-8 font-black text-white text-xl tracking-tighter">\${r.loco_number}</td>
                  <td class="px-8 py-8">
                    <span class="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full text-[10px] font-black text-indigo-400 mr-2 uppercase tracking-widest">\${r.base_shed}</span>
                    <span class="text-slate-200 font-bold text-base">\${r.schedule}</span>
                  </td>
                  <td class="px-8 py-8 text-xs font-black text-indigo-400">\${r.pantograph}</td>
                  <td class="px-8 py-8 text-sm text-slate-400 font-medium">\${r.created_by}</td>
                  <td class="px-8 py-8">
                    <div class="text-slate-200 font-bold text-sm">\${capturedDate}</div>
                    <div class="text-[10px] text-slate-500 font-black uppercase tracking-widest">\${capturedTime}</div>
                  </td>
                  <td class="px-8 py-8">
                    \${r.image_url ? \`
                      <button onclick="viewImage('\${r.image_url}')" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View Image
                      </button>
                    \` : '<span class="text-slate-600 text-[10px] font-black uppercase tracking-widest">No Image</span>'}
                  </td>
                  <td class="px-8 py-8 text-right text-xs text-slate-600 font-mono">\${new Date(r.updated_at).toLocaleString('en-GB')}</td>
                </tr>
              \`;
            }).join('');
          }

          function getFilteredRecords() {
            const loco = filterLoco.value.toLowerCase();
            const date = filterDate.value;
            const panto = filterPanto.value;

            return ALL_RECORDS.filter(r => {
              const data = r.raw_json || {};
              const matchLoco = r.loco_number.toLowerCase().includes(loco);
              const matchDate = date ? (data.formattedDate || '').includes(date) : true;
              const matchPanto = panto === 'ALL' ? true : r.pantograph === panto;
              return matchLoco && matchDate && matchPanto;
            });
          }

          function handleFilter() {
            renderRecords(getFilteredRecords());
          }

          function viewImage(url) {
            const modal = document.getElementById('imageModal');
            const img = document.getElementById('modalImage');
            img.src = \`/api/view-image?path=\${encodeURIComponent(url)}\`;
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
          }

          function closeModal() {
            const modal = document.getElementById('imageModal');
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto';
          }

          document.getElementById('imageModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('imageModal')) closeModal();
          });

          filterLoco.addEventListener('input', handleFilter);
          filterDate.addEventListener('input', handleFilter);
          filterPanto.addEventListener('change', handleFilter);

          // Initial render
          renderRecords(ALL_RECORDS);

          // PDF Generation
          downloadBtn.addEventListener('click', async () => {
            const { jsPDF } = window.jspdf;
            const records = getFilteredRecords();
            if (records.length === 0) return alert('No records to export');

            downloadBtn.disabled = true;
            downloadBtn.innerHTML = 'Generating PDF...';

            const doc = new jsPDF();
            
            for (let i = 0; i < records.length; i++) {
              const r = records[i];
              const data = r.raw_json || {};
              if (i > 0) doc.addPage();

              // Header
              doc.setFillColor(15, 23, 42);
              doc.rect(0, 0, 210, 40, 'F');
              
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(24);
              doc.setFont("helvetica", "bold");
              doc.text(\`LOCO: \${r.loco_number}\`, 20, 25);
              
              doc.setFontSize(10);
              doc.setTextColor(148, 163, 184);
              doc.text(\`HUB RECORD ID: \${r.id}\`, 20, 33);

              doc.setTextColor(99, 102, 241);
              doc.setFontSize(12);
              doc.text("HUB MAINTENANCE REPORT", 190, 25, { align: 'right' });
              
              // Details
              doc.setTextColor(30, 41, 59);
              doc.setFontSize(10);
              doc.setFont("helvetica", "bold");
              doc.text("PARTICULARS", 20, 55);
              
              doc.setDrawColor(226, 232, 240);
              doc.line(20, 58, 190, 58);

              const details = [
                ["BASE SHED", r.base_shed],
                ["SCHEDULE", r.schedule],
                ["PANTOGRAPH", r.pantograph],
                ["STAFF", r.created_by],
                ["CAPTURED DATE", \`\${data.formattedDate} @ \${data.formattedTime}\`]
              ];

              let y = 68;
              details.forEach(([label, value]) => {
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(label, 20, y);
                doc.setFontSize(10);
                doc.setTextColor(30, 41, 59);
                doc.text(String(value), 60, y);
                y += 8;
              });

              // Image
              if (r.image_url) {
                try {
                  const imgUrl = \`/api/view-image?path=\${encodeURIComponent(r.image_url)}\`;
                  const img = await new Promise((resolve, reject) => {
                    const i = new Image();
                    i.crossOrigin = "anonymous";
                    i.onload = () => resolve(i);
                    i.onerror = reject;
                    i.src = imgUrl;
                  });

                  const pageWidth = 170;
                  const ratio = img.height / img.width;
                  const pageHeight = pageWidth * ratio;
                  
                  // If image is too tall, scale it down
                  let finalWidth = pageWidth;
                  let finalHeight = pageHeight;
                  const maxImageHeight = 150;
                  
                  if (finalHeight > maxImageHeight) {
                    finalHeight = maxImageHeight;
                    finalWidth = finalHeight / ratio;
                  }

                  doc.addImage(img, 'JPEG', 20, y + 10, finalWidth, finalHeight);
                } catch (e) {
                  doc.setTextColor(239, 68, 68);
                  doc.text("[!] Evidence image could not be rendered in report", 20, y + 15);
                }
              }

              // Footer
              doc.setFontSize(8);
              doc.setTextColor(148, 163, 184);
              doc.text("LOCOPT HUB ENGINE • SYSTEM GENERATED AUDIT REPORT", 105, 285, { align: 'center' });
            }

            doc.save(\`LocoPT_Hub_Report_\${Date.now()}.pdf\`);
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = \`
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Download PDF Report
            \`;
          });
        </script>
      </body>
      </html>`);
    } catch (err) { return res.status(500).send(`Critical Hub Failure: ${err.message}`); }
  }
  res.json({ status: 'online', ready: isReady });
});

app.get('/api/users', async (req, res) => {
  try {
    const { since } = req.query;
    let query = 'SELECT * FROM users';
    let params = [];
    if (since && since !== 'null' && since !== '') { query += ' WHERE updated_at > $1'; params.push(since); }
    const result = await pool.query(query, params);
    res.json(result.rows.map(u => ({ id: u.id, hrmsId: u.hrms_id, displayName: u.display_name, role: u.role, password: u.password, updatedAt: u.updated_at, lastActive: u.last_active })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
  const user = req.body;
  try {
    await pool.query(
      `INSERT INTO users (id, hrms_id, display_name, role, password, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
       ON CONFLICT (id) DO UPDATE SET 
         hrms_id = EXCLUDED.hrms_id, 
         display_name = EXCLUDED.display_name, 
         role = EXCLUDED.role, 
         password = EXCLUDED.password,
         updated_at = CURRENT_TIMESTAMP`,
      [user.id, user.hrmsId, user.displayName, user.role, user.password]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:id/heartbeat', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/records', async (req, res) => {
  try {
    const { since } = req.query;
    let query = 'SELECT raw_json, updated_at FROM records';
    let params = [];
    if (since && since !== 'null' && since !== '') { query += ' WHERE updated_at > $1'; params.push(since); }
    query += ' ORDER BY updated_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({ ...r.raw_json, serverUpdatedAt: r.updated_at })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/records', async (req, res) => {
  const record = req.body;
  try {
    await pool.query(
      `INSERT INTO records (id, loco_number, base_shed, schedule, pantograph, image_url, created_at, created_by, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) 
       ON CONFLICT (id) DO UPDATE SET 
         loco_number = EXCLUDED.loco_number,
         base_shed = EXCLUDED.base_shed,
         schedule = EXCLUDED.schedule,
         pantograph = EXCLUDED.pantograph,
         raw_json = EXCLUDED.raw_json,
         image_url = COALESCE(EXCLUDED.image_url, records.image_url),
         updated_at = CURRENT_TIMESTAMP`,
      [record.id, record.locoNumber, record.baseShed, record.schedule, record.pantograph, record.image, record.createdAt, record.createdBy, JSON.stringify(record)]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM records WHERE id = $1', [id]);
    await minioClient.removeObject(BUCKET_NAME, `${id}.jpg`).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/view-image', async (req, res) => {
  const imagePath = req.query.path;
  if (!imagePath) return res.status(400).send('Path required');
  try {
    const fileName = imagePath.split('/').pop();
    const stream = await minioClient.getObject(BUCKET_NAME, fileName);
    res.setHeader('Content-Type', 'image/jpeg');
    stream.pipe(res);
  } catch (err) { res.status(404).send('Not found'); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Hub Engine v3.8 online`));
