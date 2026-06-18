import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DataSourcesController } from './data-sources.controller';
import { DataSourcesService } from './data-sources.service';
import { DataSourceSyncProcessor } from './data-source-sync.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'data-source-sync' })],
  controllers: [DataSourcesController],
  providers: [DataSourcesService, DataSourceSyncProcessor],
})
export class DataSourcesModule {}
