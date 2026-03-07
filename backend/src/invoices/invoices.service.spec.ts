import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { Invoice } from './invoice.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { INVOICE_QUEUE } from '../queue/invoice.processor.js';
import { Role } from '../common/enums/role.enum.js';
import { User } from '../users/user.entity.js';

const mockUser = {
  id: 'user-1',
  organizationId: 'org-1',
  role: Role.UPLOADER,
} as User;

const mockInvoice: Partial<Invoice> = {
  id: 'inv-1',
  originalFilename: 'test.pdf',
  storagePath: 'abc123.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  status: InvoiceStatus.UPLOADED,
  uploadedById: 'user-1',
  organizationId: 'org-1',
};

const mockInvoiceRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
  update: jest.fn(),
};

const mockItemRepo = {};

const mockStorageService = {
  upload: jest.fn(),
  delete: jest.fn(),
};

const mockQueue = {
  add: jest.fn(),
};

describe('InvoicesService', () => {
  let service: InvoicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: getRepositoryToken(Invoice), useValue: mockInvoiceRepo },
        { provide: getRepositoryToken(InvoiceItem), useValue: mockItemRepo },
        { provide: StorageService, useValue: mockStorageService },
        { provide: getQueueToken(INVOICE_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('should upload file, create record and enqueue job', async () => {
      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('fake-pdf'),
        size: 1024,
      } as Express.Multer.File;

      mockStorageService.upload.mockResolvedValue({ key: 'abc123.pdf', size: 1024 });
      mockInvoiceRepo.create.mockReturnValue(mockInvoice);
      mockInvoiceRepo.save.mockResolvedValue(mockInvoice);
      mockQueue.add.mockResolvedValue({});

      const result = await service.upload(file, {}, mockUser);

      expect(result).toEqual(mockInvoice);
      expect(mockStorageService.upload).toHaveBeenCalledWith(file);
      expect(mockInvoiceRepo.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('process', { invoiceId: 'inv-1' });
    });

    it('should reject unsupported file type', async () => {
      const file = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('hello'),
        size: 5,
      } as Express.Multer.File;

      await expect(service.upload(file, {}, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should return invoice', async () => {
      mockInvoiceRepo.findOne.mockResolvedValue(mockInvoice);
      const result = await service.findById('inv-1', mockUser);
      expect(result).toEqual(mockInvoice);
    });

    it('should throw if not found', async () => {
      mockInvoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete file from storage and remove record', async () => {
      mockInvoiceRepo.findOne.mockResolvedValue(mockInvoice);
      mockStorageService.delete.mockResolvedValue(undefined);
      mockInvoiceRepo.remove.mockResolvedValue(mockInvoice);

      await service.remove('inv-1', mockUser);

      expect(mockStorageService.delete).toHaveBeenCalledWith('abc123.pdf');
      expect(mockInvoiceRepo.remove).toHaveBeenCalledWith(mockInvoice);
    });
  });

  describe('recheck', () => {
    it('should reset status and re-enqueue', async () => {
      mockInvoiceRepo.findOne.mockResolvedValue({ ...mockInvoice, status: InvoiceStatus.ERROR });
      mockInvoiceRepo.save.mockResolvedValue({ ...mockInvoice, status: InvoiceStatus.UPLOADED });
      mockQueue.add.mockResolvedValue({});

      const result = await service.recheck('inv-1', mockUser);

      expect(result.status).toBe(InvoiceStatus.UPLOADED);
      expect(mockQueue.add).toHaveBeenCalled();
    });
  });
});
