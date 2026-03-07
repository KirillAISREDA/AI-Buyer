import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    this.fromAddress = this.configService.get<string>('SMTP_FROM', 'noreply@ai-buyer.local');

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.configService.get<string>('SMTP_USER', ''),
          pass: this.configService.get<string>('SMTP_PASS', ''),
        },
      });
    } else {
      this.logger.warn('Email notifications disabled: SMTP_HOST not set');
    }
  }

  async sendInvoiceReport(
    to: string,
    data: {
      filename: string;
      supplier: string;
      total: string;
      items: {
        name: string;
        price: string;
        marketPrice: string;
        deviation: string;
        assessment: string;
      }[];
    },
  ): Promise<void> {
    if (!this.transporter) return;

    const itemRows = data.items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd">${item.name}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">${item.price}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">${item.marketPrice}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">${item.deviation}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">
            <span style="padding:2px 8px;border-radius:12px;font-size:12px;${assessmentStyle(item.assessment)}">
              ${assessmentLabel(item.assessment)}
            </span>
          </td>
        </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
        <h2>Отчёт по счёту</h2>
        <p><strong>Файл:</strong> ${data.filename}</p>
        <p><strong>Поставщик:</strong> ${data.supplier}</p>
        <p><strong>Итого:</strong> ${data.total}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Позиция</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:right">Цена</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:right">Рынок</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:right">Откл.</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:center">Оценка</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="color:#888;margin-top:24px;font-size:12px">AI-Buyer — автоматический контроль закупок</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `AI-Buyer: Отчёт по счёту — ${data.filename}`,
        html,
      });
      this.logger.log(`Email report sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
    }
  }
}

function assessmentLabel(assessment: string): string {
  const labels: Record<string, string> = {
    ok: 'OK',
    attention: 'Внимание',
    overpriced: 'Завышена',
    unknown: 'Нет данных',
  };
  return labels[assessment] || assessment;
}

function assessmentStyle(assessment: string): string {
  const styles: Record<string, string> = {
    ok: 'background:#dcfce7;color:#166534',
    attention: 'background:#fef9c3;color:#854d0e',
    overpriced: 'background:#fee2e2;color:#991b1b',
    unknown: 'background:#f3f4f6;color:#4b5563',
  };
  return styles[assessment] || '';
}
