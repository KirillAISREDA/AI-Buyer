import { Module } from '@nestjs/common';
import { AiClientService } from './ai-client.service.js';

@Module({
  providers: [AiClientService],
  exports: [AiClientService],
})
export class AiClientModule {}
