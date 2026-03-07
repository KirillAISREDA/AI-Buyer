import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/invoice.entity.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';

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
  ) {
    super();
  }

  async process(job: Job<InvoiceJobData>): Promise<void> {
    const { invoiceId } = job.data;
    this.logger.log(`Processing invoice ${invoiceId}`);

    try {
      await this.invoiceRepository.update(invoiceId, {
        status: InvoiceStatus.PARSING,
      });

      // TODO Step 5: call AI service for parsing
      // TODO Step 6: call AI service for price checking

      this.logger.log(`Invoice ${invoiceId} queued for processing`);
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
