import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DashboardKpi {
  @Field()
  key!: string;

  @Field()
  label!: string;

  @Field(() => Float)
  value!: number;

  @Field({ nullable: true })
  unit?: string;

  @Field(() => Float, { nullable: true })
  deltaPct?: number;
}

@ObjectType()
export class EmissionsTrend {
  @Field(() => [String])
  months!: string[];

  @Field(() => [Float])
  scope1!: number[];

  @Field(() => [Float])
  scope2!: number[];

  @Field(() => [Float])
  scope3!: number[];
}

@ObjectType()
export class FacilityComparisonRow {
  @Field()
  nodeId!: string;

  @Field()
  name!: string;

  @Field(() => Float)
  emissionsTco2e!: number;

  @Field(() => Float, { nullable: true })
  emissionsIntensity?: number;

  @Field(() => Float, { nullable: true })
  energyMwh?: number;
}

@ObjectType()
export class AnomalyRow {
  @Field()
  id!: string;

  @Field()
  canonicalKey!: string;

  @Field()
  scopeNodeId!: string;

  @Field(() => Float)
  value!: number;

  @Field()
  unit!: string;

  @Field(() => Float)
  zScore!: number;

  @Field()
  reason!: string;

  @Field(() => Int)
  rank!: number;
}
