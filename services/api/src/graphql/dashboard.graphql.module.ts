import { Module } from '@nestjs/common';
import { DashboardResolver } from './dashboard.resolver';

@Module({
  providers: [DashboardResolver],
})
export class DashboardGraphqlModule {}
