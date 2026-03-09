const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { headers, ...rest });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: string } }>(
        '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) },
      ),
    register: (data: { email: string; password: string; firstName: string; lastName: string; organizationName: string }) =>
      request<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: string } }>(
        '/api/auth/register', { method: 'POST', body: JSON.stringify(data) },
      ),
    refresh: (refreshToken: string) =>
      request<{ accessToken: string; refreshToken: string }>(
        '/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) },
      ),
    me: (token: string) =>
      request<{ id: string; email: string; firstName: string; lastName: string; role: string }>(
        '/api/users/me', { token },
      ),
  },
  invoices: {
    list: (token: string, params?: { page?: number; limit?: number; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.status) query.set('status', params.status);
      return request<{ data: Invoice[]; total: number; page: number; limit: number }>(
        `/api/invoices?${query}`, { token },
      );
    },
    get: (token: string, id: string) =>
      request<Invoice>(`/api/invoices/${id}`, { token }),
    upload: async (token: string, file: File, checkOnly?: boolean, extraCosts?: number) => {
      const form = new FormData();
      form.append('file', file);
      if (checkOnly) form.append('checkOnly', 'true');
      if (extraCosts) form.append('extraCosts', String(extraCosts));
      const res = await fetch(`${API_URL}/api/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<Invoice>;
    },
    delete: (token: string, id: string) =>
      request<void>(`/api/invoices/${id}`, { token, method: 'DELETE' }),
    recheck: (token: string, id: string) =>
      request<Invoice>(`/api/invoices/${id}/recheck`, { token, method: 'POST' }),
  },
  suppliers: {
    list: (token: string) =>
      request<Supplier[]>('/api/suppliers', { token }),
  },
};

export interface Invoice {
  id: string;
  status: string;
  originalFilename: string;
  supplierName?: string;
  documentNumber?: string;
  documentDate?: string;
  totalAmount?: number;
  currency: string;
  checkOnly: boolean;
  createdAt: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  total: number;
  marketPrice?: number;
  marketSource?: string;
  marketDeviationPct?: number;
  historyDeviationPct?: number;
  assessment?: string;
  assessmentExplanation?: string;
}

export interface Supplier {
  id: string;
  name: string;
  inn?: string;
}
