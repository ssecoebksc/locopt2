
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LocoRecord, PantographType, User, UserRole } from '../types';
import { db } from '../services/db';
import { Filter, Calendar, Search, ChevronDown, ChevronUp, Trash2, FileText, Loader2, Cloud, Clock, RefreshCw, Globe, ArrowUpCircle, Zap, Edit, AlertCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';

interface PreviousRecordsProps {
  user: User;
  syncKey?: number;
  isHubOnline: boolean;
  onEdit: (record: LocoRecord) => void;
}

const PreviousRecords: React.FC<PreviousRecordsProps> = ({ user, syncKey, isHubOnline, onEdit }) => {
  const [allRecords, setAllRecords] = useState<LocoRecord[]>([]);
  const [filterLoco, setFilterLoco] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterPanto, setFilterPanto] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const loadData = useCallback(async () => {
    const data = await db.getRecords();
    setAllRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, syncKey]);

  useEffect(() => {
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const pendingRecords = useMemo(() => allRecords.filter(r => r.syncStatus !== 'synced'), [allRecords]);
  const syncedRecords = useMemo(() => allRecords.filter(r => r.syncStatus === 'synced'), [allRecords]);

  const filteredRecords = useMemo(() => {
    return allRecords.filter(rec => {
      const matchLoco = (rec.locoNumber || '').toLowerCase().includes(filterLoco.toLowerCase());
      const matchDate = filterDate ? (rec.formattedDate || '').includes(filterDate) : true;
      const matchPanto = filterPanto === 'ALL' ? true : rec.pantograph === filterPanto;
      return matchLoco && matchDate && matchPanto;
    });
  }, [allRecords, filterLoco, filterDate, filterPanto]);

  const handleManualSync = async () => {
    if (!isHubOnline || isSyncing) return;
    setIsSyncing(true);
    setSyncStatus('Connecting to Hub...');
    try {
      const result = await db.syncRecords();
      setSyncStatus(`Sync Finished: Pulled ${result.pulled}, Pushed ${result.pushed}`);
      await loadData();
      setTimeout(() => setSyncStatus(''), 5000);
    } catch (e) {
      setSyncStatus('Sync failed. Check connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  const downloadPDF = async () => {
    if (filteredRecords.length === 0) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    const loadImage = (src: string): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; 
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn("PDF Image Load Failed:", src);
          resolve(null);
        };
        img.src = src;
      });
    };

    for (let i = 0; i < filteredRecords.length; i++) {
      const record = filteredRecords[i];
      if (i > 0) doc.addPage();
      
      let y = 25;
      doc.setFillColor(245, 247, 250);
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      doc.setFontSize(24);
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.text(`LOCO: ${record.locoNumber}`, margin, y);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.text(`RECORD ID: ${record.id}`, margin, y + 8);
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text(`MAINTENANCE LOG`, pageWidth - margin, y, { align: 'right' });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`${record.formattedDate} @ ${record.formattedTime}`, pageWidth - margin, y + 8, { align: 'right' });
      
      y = 60;
      const details = [
        { label: "BASE SHED", value: record.baseShed },
        { label: "SCHEDULE", value: record.schedule },
        { label: "PANTOGRAPH", value: record.pantograph },
        { label: "RECORDED BY", value: record.createdBy }
      ];

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.setFont("helvetica", "bold");
      
      details.forEach((item, idx) => {
        const xPos = margin + (idx * (contentWidth / 4));
        doc.text(item.label, xPos, y);
        doc.setFontSize(11);
        doc.setTextColor(30);
        doc.setFont("helvetica", "bold");
        doc.text(item.value, xPos, y + 7);
      });

      y += 20;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text("VISUAL EVIDENCE / CAPTURED FRAME:", margin, y);
      y += 8;

      if (record.image) {
        try {
          const imgObj = await loadImage(record.image);
          if (imgObj) {
            const ratio = imgObj.height / imgObj.width;
            let finalWidth = contentWidth;
            let finalHeight = finalWidth * ratio;

            const maxHeight = pageHeight - y - margin - 15;
            if (finalHeight > maxHeight) {
              finalHeight = maxHeight;
              finalWidth = finalHeight / ratio;
            }

            const xOffset = margin + (contentWidth - finalWidth) / 2;
            doc.addImage(imgObj, 'JPEG', xOffset, y, finalWidth, finalHeight, undefined, 'FAST');
          } else {
             doc.setTextColor(239, 68, 68);
             doc.text("[!] Evidence Image could not be fetched from Hub.", margin, y + 10);
          }
        } catch (err) {
          doc.setTextColor(239, 68, 68);
          doc.text("[!] Image rendering failed.", margin, y + 10);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.text("(No evidence image provided for this record)", margin, y + 10);
      }

      doc.setFontSize(7);
      doc.setTextColor(200);
      doc.setFont("helvetica", "normal");
      doc.text("LOCOPT_IMAGE VERIFIED AUDIT REPORT • SYSTEM GENERATED", pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    doc.save(`LocoPT_Full_Report_${Date.now()}.pdf`);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this record permanently from BOTH Local Storage and Hub Server?')) {
      await db.deleteRecord(id);
      loadData();
    }
  };

  const handleRetry = async (record: LocoRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isHubOnline) return;
    record.syncStatus = 'uploading';
    record.uploadProgress = 0;
    loadData();
    db.pushRecord(record).finally(loadData);
  };

  const handleCancel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.cancelUpload(id);
    loadData();
  };

  const canDelete = [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OFFICER].includes(user.role);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
        <p className="text-gray-500 font-medium">Loading history registry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-emerald-500 p-6 text-white flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold italic uppercase tracking-tighter flex items-center gap-2">
              History Log
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-emerald-50 text-[10px] font-black uppercase tracking-widest bg-emerald-600/50 px-2 py-0.5 rounded">
                {allRecords.length} Total
              </span>
              {pendingRecords.length > 0 && (
                <span className="text-amber-100 text-[10px] font-black uppercase tracking-widest bg-amber-600/50 px-2 py-0.5 rounded flex items-center gap-1">
                   <ArrowUpCircle size={10} /> {pendingRecords.length} Pending
                </span>
              )}
              <span className="text-emerald-50 text-[10px] font-black uppercase tracking-widest bg-emerald-600/50 px-2 py-0.5 rounded flex items-center gap-1">
                <Cloud size={10} /> {syncedRecords.length} Hub Linked
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleManualSync}
              disabled={!isHubOnline || isSyncing}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-tighter transition-all active:scale-95 ${
                isHubOnline 
                  ? 'bg-white text-emerald-600 hover:bg-emerald-50 shadow-md' 
                  : 'bg-emerald-600/50 text-white/50 cursor-not-allowed border border-white/20'
              }`}
            >
              {isSyncing ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              {isSyncing ? 'Syncing...' : 'Sync with Hub'}
            </button>
            <button 
              onClick={downloadPDF}
              className="flex-1 sm:flex-none bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-3 border border-emerald-400"
            >
              <FileText size={18} />
              <span className="font-black text-xs uppercase tracking-tighter">PDF Report</span>
            </button>
          </div>
        </div>

        {syncStatus && (
          <div className="bg-emerald-50 px-6 py-2 border-b border-emerald-100 flex items-center justify-center gap-2 animate-in slide-in-from-top-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{syncStatus}</span>
          </div>
        )}

        <div className="p-4 bg-emerald-50/50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search Loco #"
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
              value={filterLoco}
              onChange={(e) => setFilterLoco(e.target.value)}
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Filter Date (DD/MM/YYYY)"
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
          <select 
            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white font-bold"
            value={filterPanto}
            onChange={(e) => setFilterPanto(e.target.value)}
          >
            <option value="ALL">All Pantographs</option>
            <option value={PantographType.PT1}>PT1 Only</option>
            <option value={PantographType.PT2}>PT2 Only</option>
          </select>
        </div>

        <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto no-scrollbar">
          {filteredRecords.length > 0 ? (
            filteredRecords.map(record => (
              <div key={record.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div 
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleExpand(record.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`font-black px-3 py-1 rounded-lg text-lg min-w-[80px] text-center ${record.syncStatus === 'synced' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                      {record.locoNumber}
                    </div>
                    <div>
                      <div className="font-bold text-gray-800 flex items-center gap-2">
                        {record.schedule} <span className="text-gray-200 font-normal">|</span> {record.baseShed}
                        <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ml-1">
                          <Zap size={10} className="fill-current" /> {record.pantograph}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <span className="flex items-center gap-1"><Calendar size={10} /> {record.formattedDate}</span>
                        <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-1.5 rounded"><Clock size={10} /> {record.formattedTime}</span>
                        {record.syncStatus === 'synced' ? (
                          <span className="flex items-center gap-1 text-indigo-500 font-black">
                            <Cloud size={10} /> HUB LINKED
                          </span>
                        ) : record.syncStatus === 'uploading' ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-blue-500 font-black">
                              <RefreshCw size={10} className="animate-spin" /> UPLOADING ({record.uploadProgress || 0}%)
                            </span>
                            <button 
                              onClick={(e) => handleCancel(record.id, e)}
                              className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[9px] font-black hover:bg-blue-200 transition-colors"
                              title="Cancel Upload"
                            >
                              CANCEL
                            </button>
                          </div>
                        ) : record.syncStatus === 'failed' ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-red-500 font-black">
                              <AlertCircle size={10} /> FAILED
                            </span>
                            <button 
                              onClick={(e) => handleRetry(record, e)}
                              className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[9px] font-black hover:bg-red-200 transition-colors flex items-center gap-1"
                              title="Retry Upload"
                            >
                              <RefreshCw size={8} /> RETRY
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-amber-500 font-black">
                              <RefreshCw size={10} className="animate-spin" /> PENDING
                            </span>
                            <button 
                              onClick={(e) => handleCancel(record.id, e)}
                              className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded text-[9px] font-black hover:bg-amber-200 transition-colors"
                              title="Cancel Upload"
                            >
                              CANCEL
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {user.role === UserRole.ADMIN && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(record); }}
                        className="p-1.5 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Edit Record"
                      >
                        <Edit size={18} />
                      </button>
                    )}
                    {canDelete && (
                      <button 
                        onClick={(e) => handleDelete(record.id, e)}
                        className="p-1.5 text-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Record"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    {expandedId === record.id ? <ChevronUp size={20} className="text-gray-300" /> : <ChevronDown size={20} className="text-gray-300" />}
                  </div>
                </div>

                {expandedId === record.id && (
                  <div className="mt-4 pt-4 border-t border-dashed border-gray-100 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-3 gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <div>
                        <p>Recorded By</p>
                        <p className="text-gray-800 text-xs mt-1 font-bold">{record.createdBy}</p>
                      </div>
                      <div>
                        <p>Pantograph</p>
                        <p className="text-indigo-600 text-xs mt-1 font-black">{record.pantograph}</p>
                      </div>
                      <div className="text-right">
                        <p>Evidence ID</p>
                        <p className="text-slate-400 font-mono text-[10px] mt-1">{record.id}</p>
                      </div>
                    </div>
                    {record.image && (
                      <div className="rounded-2xl overflow-hidden border border-gray-100 bg-slate-900 aspect-video flex items-center justify-center group relative shadow-inner">
                        <img 
                          src={record.image} 
                          alt="Evidence Capture" 
                          className="w-full h-full object-contain"
                          crossOrigin="anonymous" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-20 text-center opacity-30">
              <Search size={48} className="mx-auto mb-4" />
              <p className="font-black uppercase tracking-[0.2em] text-xs">No records found matching filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviousRecords;
