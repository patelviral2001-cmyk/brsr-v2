import { Module } from '@nestjs/common';
import { MaterialityController } from './materiality.controller';
import { MaterialityService } from './materiality.service';

@Module({
  controllers: [MaterialityController],
  providers: [MaterialityService],
  exports: [MaterialityService],
})
export class MaterialityModule {}
