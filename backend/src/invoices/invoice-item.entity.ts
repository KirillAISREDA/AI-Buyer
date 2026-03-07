import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity.js';

export enum ItemAssessment {
  OK = 'ok',
  ATTENTION = 'attention',
  OVERPRICED = 'overpriced',
  UNKNOWN = 'unknown',
}

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  normalizedName?: string;

  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantity!: number;

  @Column()
  unit!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  pricePerUnit!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  marketPrice?: number;

  @Column({ nullable: true })
  marketSource?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  historyAvgPrice?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  marketDeviationPct?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  historyDeviationPct?: number;

  @Column({
    type: 'enum',
    enum: ItemAssessment,
    nullable: true,
  })
  assessment?: ItemAssessment;

  @Column({ nullable: true })
  assessmentExplanation?: string;

  @Column({ type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice!: Invoice;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
