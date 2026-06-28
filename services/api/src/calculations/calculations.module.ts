import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CalculationsController } from './calculations.controller';
import { CalculationsService } from './calculations.service';
import { CalculationProcessor } from './calculation.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'calculations' })],
  controllers: [CalculationsController],
  providers: [CalculationsService, CalculationProcessor],
  exports: [CalculationsService],
})
export class CalculationsModule {}
