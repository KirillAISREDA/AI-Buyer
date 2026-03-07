'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { api, Invoice } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function DashboardPage() {
  const { token } = useAuthStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.invoices.list(token, { limit: 10 }).then((res) => {
      setInvoices(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);

  const stats = {
    total: invoices.length,
    done: invoices.filter((i) => i.status === 'done').length,
    processing: invoices.filter((i) => ['uploaded', 'parsing', 'checking'].includes(i.status)).length,
    errors: invoices.filter((i) => i.status === 'error').length,
  };

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

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Дашборд</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FileText} label="Всего счетов" value={stats.total} color="blue" />
        <StatCard icon={CheckCircle} label="Проверено" value={stats.done} color="green" />
        <StatCard icon={Clock} label="В обработке" value={stats.processing} color="yellow" />
        <StatCard icon={AlertTriangle} label="Ошибки" value={stats.errors} color="red" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-semibold">Последние счета</h3>
          <Link href="/invoices/upload" className="text-sm text-blue-600 hover:underline">
            Загрузить новый
          </Link>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Нет загруженных счетов</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="px-4 py-3 font-medium">Файл</th>
                <th className="px-4 py-3 font-medium">Поставщик</th>
                <th className="px-4 py-3 font-medium">Сумма</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Дата</th>
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
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {inv.supplierName || '—'}
                  </td>
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
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}
