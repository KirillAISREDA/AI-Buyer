import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: configService.get<string>('DATABASE_URL'),
  autoLoadEntities: true,
  synchronize: true,
  logging: configService.get<string>('NODE_ENV') === 'development',
});
