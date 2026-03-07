import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { InvoicesService } from './invoices.service.js';
import { UploadInvoiceDto } from './dto/upload-invoice.dto.js';
import { InvoiceFilterDto } from './dto/invoice-filter.dto.js';
import { User } from '../users/user.entity.js';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload invoice file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        checkOnly: { type: 'boolean' },
        extraCosts: { type: 'number' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadInvoiceDto,
    @CurrentUser() user: User,
  ) {
    return this.invoicesService.upload(file, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with filters and pagination' })
  findAll(@Query() dto: InvoiceFilterDto, @CurrentUser() user: User) {
    return this.invoicesService.findAll(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice details with items' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.invoicesService.findById(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete invoice (admin/manager)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.invoicesService.remove(id, user);
  }

  @Post(':id/recheck')
  @ApiOperation({ summary: 'Recheck invoice' })
  recheck(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.invoicesService.recheck(id, user);
  }
}
