import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';
import { EmailService } from './email.service.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  providers: [TelegramService, EmailService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
