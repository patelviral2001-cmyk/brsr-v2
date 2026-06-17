import { Module } from '@nestjs/common';
import { CarbonController } from './carbon.controller';
import { CarbonService } from './carbon.service';
import { CalculationsModule } from '../calculations/calculations.module';

@Module({
  imports: [CalculationsModule],
  controllers: [CarbonController],
  providers: [CarbonService],
  exports: [CarbonService],
})
export class CarbonModule {}
