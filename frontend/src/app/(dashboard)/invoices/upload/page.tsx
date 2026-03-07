'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function UploadPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [checkOnly, setCheckOnly] = useState(false);
  const [extraCosts, setExtraCosts] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
    ];
    if (!allowed.includes(f.type)) {
      setError('Поддерживаются: PDF, DOCX, XLSX, JPG, PNG');
      return;
    }
    setFile(f);
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleSubmit = async () => {
    if (!file || !token) return;
    setUploading(true);
    setError('');
    try {
      const extra = extraCosts ? parseFloat(extraCosts) : undefined;
      const invoice = await api.invoices.upload(token, file, checkOnly, extra);
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Загрузить счёт</h2>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
        }`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="text-blue-600" size={24} />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-gray-400">
              ({(file.size / 1024 / 1024).toFixed(1)} МБ)
            </span>
            <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600 mb-2">
              Перетащите файл сюда или{' '}
              <label className="text-blue-600 hover:underline cursor-pointer">
                выберите
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </p>
            <p className="text-xs text-gray-400">PDF, DOCX, XLSX, JPG, PNG — до 20 МБ</p>
          </>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checkOnly}
            onChange={(e) => setCheckOnly(e.target.checked)}
            className="rounded"
          />
          Только проверить (без записи в историю)
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Дополнительные расходы (доставка, упаковка), ₽
          </label>
          <input
            type="number"
            value={extraCosts}
            onChange={(e) => setExtraCosts(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!file || uploading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Загрузка...' : 'Загрузить и проверить'}
        </button>
      </div>
    </div>
  );
}
