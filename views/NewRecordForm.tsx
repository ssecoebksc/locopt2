
import React, { useState, useRef } from 'react';
import { LocoRecord, ScheduleType, PantographType, User } from '../types';
import { db } from '../services/db';
import { Camera, X, Save, AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import CameraCapture from '../components/CameraCapture';
import { compressFile, optimizeBase64Image } from '../services/imageOptimizer';

interface NewRecordFormProps {
  onCancel: () => void;
  onSuccess: () => void;
  user: User;
  isHubOnline: boolean;
  editingRecord?: LocoRecord;
}

const NewRecordForm: React.FC<NewRecordFormProps> = ({ onCancel, onSuccess, user, isHubOnline, editingRecord }) => {
  const [locoNumber, setLocoNumber] = useState(editingRecord?.locoNumber || '');
  const [baseShed, setBaseShed] = useState(editingRecord?.baseShed || '');
  const [schedule, setSchedule] = useState<ScheduleType | ''>(editingRecord?.schedule || '');
  const [pantograph, setPantograph] = useState<PantographType | ''>(editingRecord?.pantograph || '');
  const [image, setImage] = useState<string | null>(editingRecord?.image || null);
  const [showCamera, setShowCamera] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!locoNumber.trim()) newErrors.locoNumber = 'Loco number is required';
    if (!baseShed.trim()) newErrors.baseShed = 'Base shed is required';
    if (!schedule) newErrors.schedule = 'Schedule selection is required';
    if (!pantograph) newErrors.pantograph = 'Pantograph selection is required';
    if (!image) newErrors.image = 'Evidence image is mandatory';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || isSaving) return;

    setIsSaving(true);
    const now = new Date();
    
    try {
      // Ensure image is fully optimized before saving to local database
      const optimizedImage = image ? await optimizeBase64Image(image) : undefined;

      const recordToSave: LocoRecord = {
        id: editingRecord?.id || Math.random().toString(36).substr(2, 9),
        locoNumber: locoNumber.trim(),
        baseShed: baseShed.trim().toUpperCase(), 
        schedule: schedule as ScheduleType,
        pantograph: pantograph as PantographType,
        image: optimizedImage,
        createdAt: editingRecord?.createdAt || now.toISOString(),
        formattedDate: editingRecord?.formattedDate || now.toLocaleDateString('en-GB'), 
        formattedTime: editingRecord?.formattedTime || now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        createdBy: editingRecord?.createdBy || `${user.displayName} (${user.hrmsId})`,
        syncStatus: 'pending' 
      };

      await db.saveRecord(recordToSave);
      onSuccess();
    } catch (e) {
      console.error("Save error:", e);
      setErrors({ general: 'Failed to save record locally.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsOptimizingImage(true);
      try {
        const compressedBase64 = await compressFile(file);
        setImage(compressedBase64);
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.image;
          return newErrors;
        });
      } catch (err) {
        console.error("Gallery compression failed", err);
        setErrors(prev => ({ ...prev, image: 'Could not process selected image' }));
      } finally {
        setIsOptimizingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  if (showCamera) {
    return (
      <CameraCapture 
        onCapture={(base64) => {
          setImage(base64);
          setShowCamera(false);
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.image;
            return newErrors;
          });
        }}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95">
      <div className="bg-indigo-700 p-6 text-white">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold">{editingRecord ? 'Edit Maintenance Record' : 'New Maintenance Record'}</h2>
            <p className="text-indigo-100 text-sm">{editingRecord ? 'Update the particulars of this record' : 'All fields are mandatory for submission'}</p>
          </div>
          {!isHubOnline && (
            <div className="bg-amber-500/20 border border-amber-400/30 px-3 py-1 rounded-full flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">Local Mode</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {errors.general && (
           <div className="flex items-center gap-1.5 p-3 bg-red-50 text-red-500 rounded-xl">
             <AlertCircle size={16} />
             <p className="text-xs font-medium">{errors.general}</p>
           </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Loco Number *</label>
          <input 
            type="text"
            className={`w-full p-4 rounded-xl border-2 ${errors.locoNumber ? 'border-red-500 bg-red-50/30' : 'border-gray-50 bg-gray-50'} focus:bg-white focus:border-indigo-500 outline-none transition-all font-bold tracking-tight`}
            placeholder="e.g. 30245"
            value={locoNumber}
            onChange={(e) => {
              setLocoNumber(e.target.value);
              if (errors.locoNumber) setErrors(prev => { const n = {...prev}; delete n.locoNumber; return n; });
            }}
            disabled={isSaving}
          />
          {errors.locoNumber && <p className="text-[10px] text-red-500 mt-1 ml-1 font-bold">{errors.locoNumber}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Base Shed *</label>
          <input 
            type="text"
            className={`w-full p-4 rounded-xl border-2 ${errors.baseShed ? 'border-red-500 bg-red-50/30' : 'border-gray-50 bg-gray-50'} focus:bg-white focus:border-indigo-500 outline-none transition-all font-bold uppercase tracking-widest`}
            placeholder="e.g. TKD"
            value={baseShed}
            onChange={(e) => {
              setBaseShed(e.target.value.toUpperCase());
              if (errors.baseShed) setErrors(prev => { const n = {...prev}; delete n.baseShed; return n; });
            }}
            disabled={isSaving}
          />
          {errors.baseShed && <p className="text-[10px] text-red-500 mt-1 ml-1 font-bold">{errors.baseShed}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Schedule *</label>
            <select 
              className={`w-full p-4 rounded-xl border-2 ${errors.schedule ? 'border-red-500 bg-red-50/30' : 'border-gray-50 bg-gray-50'} focus:bg-white focus:border-indigo-500 outline-none font-bold appearance-none`}
              value={schedule}
              onChange={(e) => {
                setSchedule(e.target.value as ScheduleType);
                if (errors.schedule) setErrors(prev => { const n = {...prev}; delete n.schedule; return n; });
              }}
              disabled={isSaving}
            >
              <option value="" disabled>Select</option>
              {Object.values(ScheduleType).map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            {errors.schedule && <p className="text-[10px] text-red-500 mt-1 ml-1 font-bold">{errors.schedule}</p>}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Pantograph *</label>
            <select 
              className={`w-full p-4 rounded-xl border-2 ${errors.pantograph ? 'border-red-500 bg-red-50/30' : 'border-gray-50 bg-gray-50'} focus:bg-white focus:border-indigo-500 outline-none font-bold appearance-none`}
              value={pantograph}
              onChange={(e) => {
                setPantograph(e.target.value as PantographType);
                if (errors.pantograph) setErrors(prev => { const n = {...prev}; delete n.pantograph; return n; });
              }}
              disabled={isSaving}
            >
              <option value="" disabled>Select</option>
              {Object.values(PantographType).map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
            {errors.pantograph && <p className="text-[10px] text-red-500 mt-1 ml-1 font-bold">{errors.pantograph}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Evidence Capture *</label>
          {image ? (
            <div className="relative rounded-2xl overflow-hidden border border-gray-200 aspect-video group bg-gray-50 shadow-inner">
              <img src={image} alt="Loco" className="w-full h-full object-contain" />
              {!isSaving && (
                <button 
                  onClick={() => setImage(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white p-2 rounded-full hover:bg-black transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowCamera(true)}
                disabled={isSaving}
                className={`py-8 border-2 border-dashed ${errors.image ? 'border-red-300 bg-red-50 text-red-500' : 'border-gray-200 text-gray-400'} rounded-2xl flex flex-col items-center justify-center hover:border-indigo-400 hover:text-indigo-500 transition-colors group`}
              >
                <Camera size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-[10px] uppercase tracking-widest">Camera</span>
              </button>
              <button 
                onClick={handleGalleryClick}
                disabled={isSaving || isOptimizingImage}
                className={`py-8 border-2 border-dashed ${errors.image ? 'border-red-300 bg-red-50 text-red-500' : 'border-gray-200 text-gray-400'} rounded-2xl flex flex-col items-center justify-center hover:border-indigo-400 hover:text-indigo-500 transition-colors group`}
              >
                {isOptimizingImage ? (
                  <>
                    <Loader2 size={32} className="mb-2 animate-spin text-indigo-500" />
                    <span className="font-bold text-[10px] uppercase tracking-widest text-indigo-500">Optimizing...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-[10px] uppercase tracking-widest">Gallery</span>
                  </>
                )}
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
          )}
          {errors.image && <p className="text-[10px] text-red-500 mt-2 ml-1 font-bold">{errors.image}</p>}
        </div>

        <div className="pt-4 flex gap-3">
          <button 
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 py-4 border-2 border-gray-100 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-4 bg-indigo-600 rounded-2xl font-bold text-white shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 active:bg-indigo-700 transition-all hover:shadow-xl active:scale-[0.98] disabled:bg-indigo-300"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} 
            {isSaving ? 'Saving...' : (editingRecord ? 'Update Record' : 'Confirm Entry')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewRecordForm;
