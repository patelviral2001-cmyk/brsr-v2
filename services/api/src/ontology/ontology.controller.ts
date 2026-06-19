import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OntologyService } from './ontology.service';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';

@ApiTags('ontology')
@ApiBearerAuth('bearer')
@UseInterceptors(TenantInterceptor)
@Controller('ontology')
export class OntologyController {
  constructor(private readonly svc: OntologyService) {}

  @Get('topics')
  topics() { return this.svc.listTopics(); }

  @Get('kpis')
  kpis(@Query('topic') topic?: string) { return this.svc.listKpis(topic); }

  @Get('kpis/code/:code')
  kpiByCode(@Param('code') code: string) { return this.svc.getKpiByCode(code); }

  @Get('kpis/:id')
  kpi(@Param('id') id: string) { return this.svc.getKpi(id); }

  @Get('standards')
  standards() { return this.svc.listStandards(); }

  @Get('standards/:code/disclosures')
  disclosures(@Param('code') code: string) { return this.svc.listDisclosures(code); }
}
