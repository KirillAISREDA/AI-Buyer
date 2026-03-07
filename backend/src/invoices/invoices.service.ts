import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Invoice } from './invoice.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadInvoiceDto } from './dto/upload-invoice.dto.js';
import { InvoiceFilterDto } from './dto/invoice-filter.dto.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { INVOICE_QUEUE, InvoiceJobData } from '../queue/invoice.processor.js';
import { User } from '../users/user.entity.js';

const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
];

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private itemRepository: Repository<InvoiceItem>,
    private storageService: StorageService,
    @InjectQueue(INVOICE_QUEUE)
    private invoiceQueue: Queue<InvoiceJobData>,
  ) {}

  async upload(
    file: Express.Multer.File,
    dto: UploadInvoiceDto,
    user: User,
  ): Promise<Invoice> {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new NotFoundException(
        `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, XLSX, JPG, PNG`,
      );
    }

    const { key, size } = await this.storageService.upload(file);

    const invoice = this.invoiceRepository.create({
      originalFilename: file.originalname,
      storagePath: key,
      mimeType: file.mimetype,
      fileSize: size,
      checkOnly: dto.checkOnly ?? false,
      extraCosts: dto.extraCosts,
      uploadedById: user.id,
      organizationId: user.organizationId,
      status: InvoiceStatus.UPLOADED,
    });

    const saved = await this.invoiceRepository.save(invoice);

    await this.invoiceQueue.add('process', { invoiceId: saved.id });

    return saved;
  }

  async findAll(dto: InvoiceFilterDto, user: User) {
    const qb = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.uploadedBy', 'user')
      .where('invoice.organizationId = :orgId', { orgId: user.organizationId })
      .orderBy('invoice.createdAt', 'DESC');

    if (dto.status) {
      qb.andWhere('invoice.status = :status', { status: dto.status });
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string, user: User): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, organizationId: user.organizationId },
      relations: ['items', 'uploadedBy'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async remove(id: string, user: User): Promise<void> {
    const invoice = await this.findById(id, user);
    await this.storageService.delete(invoice.storagePath);
    await this.invoiceRepository.remove(invoice);
  }

  async recheck(id: string, user: User): Promise<Invoice> {
    const invoice = await this.findById(id, user);
    invoice.status = InvoiceStatus.UPLOADED;
    invoice.errorMessage = undefined;
    const saved = await this.invoiceRepository.save(invoice);
    await this.invoiceQueue.add('process', { invoiceId: saved.id });
    return saved;
  }
}
