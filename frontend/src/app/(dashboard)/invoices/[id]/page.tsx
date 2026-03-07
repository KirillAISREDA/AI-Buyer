'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api, Invoice } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const assessmentColor: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  attention: 'bg-yellow-100 text-yellow-700',
  overpriced: 'bg-red-100 text-red-700',
  unknown: 'bg-gray-100 text-gray-600',
};

const assessmentLabel: Record<string, string> = {
  ok: 'OK',
  attention: 'Внимание',
  overpriced: 'Завышена',
  unknown: 'Нет данных',
};

const statusLabel: Record<string, string> = {
  uploaded: 'Загружен',
  parsing: 'Парсинг...',
  parsed: 'Распознан',
  checking: 'Проверка цен...',
  done: 'Готов',
  error: 'Ошибка',
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuthStore();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInvoice = () => {
    if (!token || !id) return;
    setLoading(true);
    api.invoices.get(token, id).then((data) => {
      setInvoice(data);
      setLoading(false);
    });
  };

  useEffect(loadInvoice, [token, id]);

  const handleRecheck = async () => {
    if (!token || !id) return;
    await api.invoices.recheck(token, id);
    loadInvoice();
  };

  if (loading) return <div className="text-center text-gray-400 py-12">Загрузка...</div>;
  if (!invoice) return <div className="text-center text-gray-400 py-12">Счёт не найден</div>;

  const isProcessing = ['uploaded', 'parsing', 'checking'].includes(invoice.status);

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> Назад
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold mb-1">{invoice.originalFilename}</h2>
            <p className="text-sm text-gray-500">
              Загружен {new Date(invoice.createdAt).toLocaleString('ru-RU')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {invoice.status === 'error' && (
              <button
                onClick={handleRecheck}
                className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
              >
                <RefreshCw size={14} /> Перепроверить
              </button>
            )}
            <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
              invoice.status === 'done' ? 'bg-green-100 text-green-700' :
              invoice.status === 'error' ? 'bg-red-100 text-red-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {statusLabel[invoice.status] || invoice.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <InfoBlock label="Поставщик" value={invoice.supplierName || '—'} />
          <InfoBlock label="№ документа" value={invoice.documentNumber || '—'} />
          <InfoBlock label="Дата документа" value={
            invoice.documentDate ? new Date(invoice.documentDate).toLocaleDateString('ru-RU') : '—'
          } />
          <InfoBlock label="Итого" value={
            invoice.totalAmount ? `${Number(invoice.totalAmount).toLocaleString('ru-RU')} ₽` : '—'
          } />
        </div>
      </div>

      {isProcessing && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-sm text-yellow-700">
          Счёт обрабатывается. Обновите страницу через несколько секунд.
        </div>
      )}

      {invoice.items && invoice.items.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Позиции ({invoice.items.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-4 py-3 font-medium">Наименование</th>
                <th className="px-4 py-3 font-medium text-right">Кол-во</th>
                <th className="px-4 py-3 font-medium text-right">Цена</th>
                <th className="px-4 py-3 font-medium text-right">Сумма</th>
                <th className="px-4 py-3 font-medium text-right">Рынок</th>
                <th className="px-4 py-3 font-medium text-right">Откл.</th>
                <th className="px-4 py-3 font-medium">Оценка</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>{item.name}</div>
                    {item.assessmentExplanation && (
                      <div className="text-xs text-gray-400 mt-1">{item.assessmentExplanation}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {Number(item.quantity)} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(item.pricePerUnit).toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {Number(item.total).toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.marketPrice ? `${Number(item.marketPrice).toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.marketDeviationPct != null ? (
                      <span className={Number(item.marketDeviationPct) > 10 ? 'text-red-600 font-medium' : ''}>
                        {Number(item.marketDeviationPct) > 0 ? '+' : ''}{Number(item.marketDeviationPct).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {item.assessment ? (
                      <span className={`text-xs px-2 py-1 rounded-full ${assessmentColor[item.assessment] || ''}`}>
                        {assessmentLabel[item.assessment] || item.assessment}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
