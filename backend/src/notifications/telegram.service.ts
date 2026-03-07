import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.enabled = !!this.botToken;
    if (!this.enabled) {
      this.logger.warn('Telegram notifications disabled: TELEGRAM_BOT_TOKEN not set');
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.enabled) return;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Telegram API error: ${response.status} ${body}`);
      }
    } catch (error) {
      this.logger.error('Failed to send Telegram message', error);
    }
  }

  formatInvoiceReport(data: {
    filename: string;
    supplier: string;
    total: string;
    itemsCount: number;
    overpricedCount: number;
    attentionCount: number;
    items: { name: string; assessment: string; deviation: string }[];
  }): string {
    const lines = [
      `📋 <b>Отчёт по счёту</b>`,
      `Файл: ${data.filename}`,
      `Поставщик: ${data.supplier}`,
      `Сумма: ${data.total}`,
      `Позиций: ${data.itemsCount}`,
      '',
    ];

    if (data.overpricedCount > 0) {
      lines.push(`🔴 Завышено: ${data.overpricedCount}`);
    }
    if (data.attentionCount > 0) {
      lines.push(`🟡 Внимание: ${data.attentionCount}`);
    }
    if (data.overpricedCount === 0 && data.attentionCount === 0) {
      lines.push(`🟢 Все цены в норме`);
    }

    if (data.items.length > 0) {
      lines.push('', '<b>Проблемные позиции:</b>');
      for (const item of data.items.slice(0, 10)) {
        const icon = item.assessment === 'overpriced' ? '🔴' : '🟡';
        lines.push(`${icon} ${item.name}: ${item.deviation}`);
      }
    }

    return lines.join('\n');
  }
}
