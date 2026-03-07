import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UploadInvoiceDto {
  @ApiPropertyOptional({ description: 'Check only, do not save to history', default: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  checkOnly?: boolean;

  @ApiPropertyOptional({ description: 'Extra costs (delivery, packaging, etc.)' })
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  extraCosts?: number;
}
