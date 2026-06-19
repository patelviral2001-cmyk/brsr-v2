import { Module } from '@nestjs/common';
import { DataPointsController } from './data-points.controller';
import { DataPointsService } from './data-points.service';

@Module({
  controllers: [DataPointsController],
  providers: [DataPointsService],
  exports: [DataPointsService],
})
export class DataPointsModule {}
