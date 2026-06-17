import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BrsrController } from './brsr.controller';
import { BrsrService } from './brsr.service';
import { BrsrReportProcessor } from './brsr-report.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'brsr-report' })],
  controllers: [BrsrController],
  providers: [BrsrService, BrsrReportProcessor],
  exports: [BrsrService],
})
export class BrsrModule {}
