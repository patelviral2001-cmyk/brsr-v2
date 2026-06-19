import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  // PrismaModule is @Global() — no explicit import needed.
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
