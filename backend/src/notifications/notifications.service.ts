import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service.js';
import { EmailService } from './email.service.js';
import { Invoice } from '../invoices/invoice.entity.js';
import { InvoiceItem } from '../invoices/invoice-item.entity.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly alertThreshold: number;
  private readonly telegramChatId: string;
  private readonly managerEmail: string;

  constructor(
    private telegramService: TelegramService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    this.alertThreshold = this.configService.get<number>('ALERT_THRESHOLD_PCT', 15);
    this.telegramChatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '');
    this.managerEmail = this.configService.get<string>('MANAGER_EMAIL', '');
  }

  async notifyInvoiceProcessed(invoice: Invoice, items: InvoiceItem[]): Promise<void> {
    const overpriced = items.filter((i) => i.assessment === 'overpriced');
    const attention = items.filter((i) => i.assessment === 'attention');
    const hasAlerts = overpriced.length > 0 || attention.length > 0;

    const maxDeviation = Math.max(
      ...items
        .map((i) => Math.abs(Number(i.marketDeviationPct ?? 0)))
        .filter((v) => !isNaN(v)),
      0,
    );

    if (!hasAlerts || maxDeviation < this.alertThreshold) {
      this.logger.log(`Invoice ${invoice.id}: no alerts to send (max deviation ${maxDeviation}%)`);
      return;
    }

    const problemItems = [...overpriced, ...attention].map((item) => ({
      name: item.name,
      price: `${Number(item.pricePerUnit).toLocaleString('ru-RU')} ₽`,
      marketPrice: item.marketPrice ? `${Number(item.marketPrice).toLocaleString('ru-RU')} ₽` : '—',
      deviation: item.marketDeviationPct != null
        ? `${Number(item.marketDeviationPct) > 0 ? '+' : ''}${Number(item.marketDeviationPct).toFixed(1)}%`
        : '—',
      assessment: item.assessment || 'unknown',
    }));

    // Telegram notification
    if (this.telegramChatId) {
      const message = this.telegramService.formatInvoiceReport({
        filename: invoice.originalFilename,
        supplier: invoice.supplierName || 'Не определён',
        total: invoice.totalAmount
          ? `${Number(invoice.totalAmount).toLocaleString('ru-RU')} ₽`
          : '—',
        itemsCount: items.length,
        overpricedCount: overpriced.length,
        attentionCount: attention.length,
        items: problemItems,
      });
      await this.telegramService.sendMessage(this.telegramChatId, message);
      this.logger.log(`Telegram alert sent for invoice ${invoice.id}`);
    }

    // Email notification
    if (this.managerEmail) {
      await this.emailService.sendInvoiceReport(this.managerEmail, {
        filename: invoice.originalFilename,
        supplier: invoice.supplierName || 'Не определён',
        total: invoice.totalAmount
          ? `${Number(invoice.totalAmount).toLocaleString('ru-RU')} ₽`
          : '—',
        items: problemItems,
      });
    }
  }
}
