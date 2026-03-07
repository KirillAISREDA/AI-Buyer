import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/invoice.entity.js';
import { InvoiceItem } from '../invoices/invoice-item.entity.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { StorageService } from '../storage/storage.service.js';
import { AiClientService, PriceCheckItemInput } from '../ai-client/ai-client.service.js';
import { ItemAssessment } from '../invoices/invoice-item.entity.js';

export const INVOICE_QUEUE = 'invoice-processing';

export interface InvoiceJobData {
  invoiceId: string;
}

@Processor(INVOICE_QUEUE)
export class InvoiceProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceProcessor.name);

  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private itemRepository: Repository<InvoiceItem>,
    private storageService: StorageService,
    private aiClientService: AiClientService,
  ) {
    super();
  }

  async process(job: Job<InvoiceJobData>): Promise<void> {
    const { invoiceId } = job.data;
    this.logger.log(`Processing invoice ${invoiceId}`);

    try {
      // 1. Set status to PARSING
      await this.invoiceRepository.update(invoiceId, {
        status: InvoiceStatus.PARSING,
      });

      // 2. Get invoice record
      const invoice = await this.invoiceRepository.findOneByOrFail({ id: invoiceId });

      // 3. Download file from storage
      const fileBuffer = await this.storageService.getFile(invoice.storagePath);

      // 4. Call AI service for parsing
      const result = await this.aiClientService.parseInvoice(
        fileBuffer,
        invoice.originalFilename,
        invoice.mimeType,
      );

      if (!result.success || !result.data) {
        throw new Error(result.error || 'AI parsing failed');
      }

      const parsed = result.data;

      // 5. Save raw_data and extracted fields
      await this.invoiceRepository.update(invoiceId, {
        rawData: parsed as any,
        supplierName: parsed.supplier?.name ?? undefined,
        supplierInn: parsed.supplier?.inn ?? undefined,
        documentNumber: parsed.document?.number ?? undefined,
        documentDate: parsed.document?.date ? new Date(parsed.document.date) : undefined,
        totalAmount: parsed.total ?? undefined,
        currency: parsed.currency || 'RUB',
        status: InvoiceStatus.PARSED,
      });

      // 6. Create invoice_items
      if (parsed.items && parsed.items.length > 0) {
        const items = parsed.items.map((item) =>
          this.itemRepository.create({
            invoiceId,
            name: item.name,
            quantity: item.quantity ?? 0,
            unit: item.unit || 'шт',
            pricePerUnit: item.price_per_unit ?? 0,
            total: item.total ?? 0,
          }),
        );
        await this.itemRepository.save(items);
      }

      this.logger.log(
        `Invoice ${invoiceId} parsed: ${parsed.items?.length ?? 0} items, total=${parsed.total}`,
      );

      // 7. Price checking
      await this.invoiceRepository.update(invoiceId, {
        status: InvoiceStatus.CHECKING,
      });

      const savedItems = await this.itemRepository.find({ where: { invoiceId } });

      if (savedItems.length > 0) {
        const priceCheckItems: PriceCheckItemInput[] = savedItems.map((item) => ({
          name: item.name,
          price_per_unit: Number(item.pricePerUnit),
          quantity: Number(item.quantity),
          unit: item.unit,
        }));

        const priceResult = await this.aiClientService.checkPrices(
          priceCheckItems,
          parsed.supplier?.name ?? undefined,
        );

        if (priceResult.success && priceResult.items.length > 0) {
          // Match assessments to saved items by name
          const assessmentMap = new Map(
            priceResult.items.map((a) => [a.name.toLowerCase(), a]),
          );

          for (const item of savedItems) {
            const assessment = assessmentMap.get(item.name.toLowerCase());
            if (assessment) {
              await this.itemRepository.update(item.id, {
                marketPrice: assessment.market_price ?? undefined,
                marketSource: assessment.market_source ?? undefined,
                historyAvgPrice: assessment.history_avg_price ?? undefined,
                marketDeviationPct: assessment.market_deviation_pct ?? undefined,
                historyDeviationPct: assessment.history_deviation_pct ?? undefined,
                assessment: (assessment.assessment as ItemAssessment) ?? undefined,
                assessmentExplanation: assessment.explanation ?? undefined,
              });
            }
          }

          this.logger.log(
            `Invoice ${invoiceId} price-checked: ${priceResult.items.length} assessments`,
          );
        }
      }

      // 8. Mark as done
      await this.invoiceRepository.update(invoiceId, {
        status: InvoiceStatus.DONE,
      });

    } catch (error) {
      this.logger.error(`Failed to process invoice ${invoiceId}`, error);
      await this.invoiceRepository.update(invoiceId, {
        status: InvoiceStatus.ERROR,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
