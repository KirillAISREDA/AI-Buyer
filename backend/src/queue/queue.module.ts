import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceProcessor, INVOICE_QUEUE } from './invoice.processor.js';
import { Invoice } from '../invoices/invoice.entity.js';
import { InvoiceItem } from '../invoices/invoice-item.entity.js';
import { StorageModule } from '../storage/storage.module.js';
import { AiClientModule } from '../ai-client/ai-client.module.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const parsed = new URL(url);
        return {
          connection: {
            host: parsed.hostname,
            port: parseInt(parsed.port || '6379', 10),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: INVOICE_QUEUE }),
    TypeOrmModule.forFeature([Invoice, InvoiceItem]),
    StorageModule,
    AiClientModule,
  ],
  providers: [InvoiceProcessor],
  exports: [BullModule],
})
export class QueueModule {}
