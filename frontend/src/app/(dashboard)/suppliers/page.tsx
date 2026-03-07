'use client';

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { api, Invoice } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface SupplierSummary {
  name: string;
  invoiceCount: number;
  lastDate: string;
}

export default function SuppliersPage() {
  const { token } = useAuthStore();
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    // Build supplier list from invoices since suppliers API requires backend support
    api.invoices.list(token, { limit: 100 }).then((res) => {
      const map = new Map<string, SupplierSummary>();
      for (const inv of res.data) {
        const name = inv.supplierName || 'Не определён';
        const existing = map.get(name);
        if (existing) {
          existing.invoiceCount++;
          if (inv.createdAt > existing.lastDate) existing.lastDate = inv.createdAt;
        } else {
          map.set(name, { name, invoiceCount: 1, lastDate: inv.createdAt });
        }
      }
      setSuppliers(Array.from(map.values()).sort((a, b) => b.invoiceCount - a.invoiceCount));
      setLoading(false);
    });
  }, [token]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Поставщики</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Truck className="mx-auto mb-2 text-gray-300" size={48} />
            Нет данных о поставщиках. Загрузите первый счёт.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="px-4 py-3 font-medium">Поставщик</th>
                <th className="px-4 py-3 font-medium text-right">Счетов</th>
                <th className="px-4 py-3 font-medium">Последний счёт</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.name} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-right">{s.invoiceCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(s.lastDate).toLocaleDateString('ru-RU')}
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
