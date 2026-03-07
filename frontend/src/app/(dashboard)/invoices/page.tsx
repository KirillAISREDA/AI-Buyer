'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Invoice } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const statusLabel: Record<string, string> = {
  uploaded: 'Загружен',
  parsing: 'Парсинг...',
  parsed: 'Распознан',
  checking: 'Проверка цен...',
  done: 'Готов',
  error: 'Ошибка',
};

const statusColor: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-700',
  parsing: 'bg-yellow-100 text-yellow-700',
  parsed: 'bg-blue-100 text-blue-700',
  checking: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

export default function InvoicesPage() {
  const { token } = useAuthStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.invoices.list(token, { page, limit: 20 }).then((res) => {
      setInvoices(res.data);
      setTotal(res.total);
      setLoading(false);
    });
  }, [token, page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Счета</h2>
        <Link
          href="/invoices/upload"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          Загрузить счёт
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Нет счетов</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="px-4 py-3 font-medium">Файл</th>
                <th className="px-4 py-3 font-medium">Поставщик</th>
                <th className="px-4 py-3 font-medium">№ документа</th>
                <th className="px-4 py-3 font-medium">Сумма</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Дата загрузки</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline text-sm">
                      {inv.originalFilename}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{inv.supplierName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.documentNumber || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {inv.totalAmount ? `${Number(inv.totalAmount).toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColor[inv.status] || ''}`}>
                      {statusLabel[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(inv.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm rounded border disabled:opacity-50"
            >
              ←
            </button>
            <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm rounded border disabled:opacity-50"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
