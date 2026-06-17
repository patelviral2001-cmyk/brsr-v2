import { Module } from '@nestjs/common';
import { AssuranceController } from './assurance.controller';
import { AssuranceService } from './assurance.service';

@Module({
  controllers: [AssuranceController],
  providers: [AssuranceService],
  exports: [AssuranceService],
})
export class AssuranceModule {}
