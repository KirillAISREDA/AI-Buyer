import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { InvoicesService } from './invoices.service.js';
import { InvoicesController } from './invoices.controller.js';
import { StorageModule } from '../storage/storage.module.js';
import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceItem]),
    StorageModule,
    QueueModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
