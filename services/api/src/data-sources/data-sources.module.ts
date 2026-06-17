import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DataSourcesController } from './data-sources.controller';
import { DataSourcesService } from './data-sources.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'data-source-sync' })],
  controllers: [DataSourcesController],
  providers: [DataSourcesService],
})
export class DataSourcesModule {}
