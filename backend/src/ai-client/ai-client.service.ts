import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ParsedItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  price_per_unit: number | null;
  total: number | null;
}

export interface ParsedInvoiceData {
  supplier: { name: string | null; inn: string | null };
  document: { number: string | null; date: string | null };
  items: ParsedItem[];
  vat: { included: boolean | null; rate: number | null; amount: number | null };
  extra_costs: { type: string; amount: number }[];
  total: number | null;
  currency: string;
  confidence: number;
}

export interface ParseInvoiceResponse {
  success: boolean;
  data: ParsedInvoiceData | null;
  raw_text: string | null;
  error: string | null;
  tokens_used: number;
  model: string;
}

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
  }

  async parseInvoice(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<ParseInvoiceResponse> {
    const body = {
      file_content_base64: fileBuffer.toString('base64'),
      filename,
      mime_type: mimeType,
    };

    this.logger.log(`Calling AI service: parse-invoice for ${filename}`);

    const response = await fetch(`${this.baseUrl}/api/v1/parse-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI service error ${response.status}: ${text}`);
    }

    const result: ParseInvoiceResponse = await response.json();

    this.logger.log(
      `AI parse result: success=${result.success}, items=${result.data?.items?.length ?? 0}, tokens=${result.tokens_used}`,
    );

    return result;
  }
}
