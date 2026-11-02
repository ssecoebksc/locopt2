
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCcw, Check, X } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
  onCancel: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    const constraints = [
      { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: true }
    ];

    let lastError: any = null;

    for (const constraint of constraints) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraint);
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        setError(null);
        return; 
      } catch (err) {
        lastError = err;
        console.warn(`Camera attempt failed:`, err);
      }
    }

    if (lastError?.name === 'NotFoundError' || lastError?.name === 'DevicesNotFoundError') {
      setError("No camera device found on this system.");
    } else if (lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError') {
      setError("Camera access denied. Please allow camera permissions.");
    } else {
      setError("Unable to access camera.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
        return;
      }

      let width = video.videoWidth;
      let height = video.videoHeight;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setCapturedImage(dataUrl);
      }
    }
  };

  const retake = () => {
    setCapturedImage(null);
  };

  const confirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Immersive Camera/Preview Layer */}
      <div className="flex-1 relative overflow-hidden bg-gray-950">
        {!capturedImage ? (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              className="w-full h-full object-cover"
            />
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-white bg-black/80 backdrop-blur-sm">
                <Camera size={48} className="mb-4 text-gray-500" />
                <p className="font-medium text-lg">{error}</p>
                <button 
                  onClick={onCancel}
                  className="mt-6 px-8 py-3 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all"
                >
                  Close Camera
                </button>
              </div>
            )}
          </>
        ) : (
          <img src={capturedImage} className="w-full h-full object-contain bg-black" alt="Captured" />
        )}

        {/* Top Header Controls */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start pointer-events-none">
          <button 
            onClick={onCancel}
            className="pointer-events-auto p-3 bg-black/30 backdrop-blur-md text-white rounded-full hover:bg-black/50 active:scale-90 transition-all border border-white/10"
          >
            <X size={24} />
          </button>
          {!capturedImage && (
            <div className="bg-black/30 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
               <span className="text-[10px] font-black text-white uppercase tracking-widest">Live View</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-black p-8 pb-12 flex items-center justify-center gap-12 border-t border-white/5">
        {!capturedImage ? (
          <>
            <div className="w-16" /> {/* Spacer */}
            <button 
              onClick={capturePhoto}
              disabled={!!error || !stream}
              className={`group relative w-20 h-20 flex items-center justify-center rounded-full bg-white border-4 border-gray-300 transition-all active:scale-90 ${(!stream || !!error) ? 'opacity-30 grayscale' : 'hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.3)]'}`}
            >
              <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                <Camera size={32} />
              </div>
            </button>
            <div className="w-16" /> {/* Spacer */}
          </>
        ) : (
          <div className="flex gap-4 w-full max-w-md">
            <button 
              onClick={retake}
              className="flex-1 py-4 flex items-center justify-center gap-2 rounded-2xl bg-white/10 text-white font-bold hover:bg-white/20 transition-all active:scale-95 border border-white/10"
            >
              <RefreshCcw size={20} /> Retake
            </button>
            <button 
              onClick={confirm}
              className="flex-1 py-4 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest shadow-xl shadow-indigo-900/50 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Check size={20} /> Save Record
            </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
