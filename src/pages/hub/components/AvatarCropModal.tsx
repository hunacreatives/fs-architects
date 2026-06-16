import { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { getCroppedImageBlob } from '@/lib/cropImage';

interface AvatarCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

export default function AvatarCropModal({ imageSrc, onCancel, onCropped }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      onCropped(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-[#111827]">Crop photo</p>
        </div>

        <div className="relative w-full h-80 bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <i className="ri-zoom-out-line text-gray-400 text-sm"></i>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
            <i className="ri-zoom-in-line text-gray-400 text-sm"></i>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !croppedAreaPixels}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[#1c2b3a] hover:bg-[#1c2b3a]/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
