import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { Organization } from '../organizations/organization.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.UPLOADED })
  status!: InvoiceStatus;

  @Column()
  originalFilename!: string;

  @Column()
  storagePath!: string;

  @Column()
  mimeType!: string;

  @Column({ type: 'bigint' })
  fileSize!: number;

  @Column({ nullable: true })
  supplierName?: string;

  @Column({ nullable: true })
  supplierInn?: string;

  @Column({ nullable: true })
  documentNumber?: string;

  @Column({ type: 'date', nullable: true })
  documentDate?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalAmount?: number;

  @Column({ default: 'RUB' })
  currency!: string;

  @Column({ type: 'jsonb', nullable: true })
  rawData?: Record<string, any>;

  @Column({ default: false })
  checkOnly!: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  extraCosts?: number;

  @Column({ nullable: true })
  errorMessage?: string;

  @Column({ type: 'uuid' })
  uploadedById!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy!: User;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organizationId' })
  organization!: Organization;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items!: InvoiceItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
