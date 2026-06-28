# =============================================================================
# BRSR AI Platform - Root Terraform configuration
# =============================================================================
# Provider: AWS, region ap-south-1 (Mumbai), DPDPA data-residency default.
# Calling pattern: one workspace per environment (dev, staging, prod, dr).
# Usage:   terraform init -backend-config=backends/prod.hcl
#          terraform workspace select prod
#          terraform plan -var-file=envs/prod.tfvars
# =============================================================================

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.34"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Providers
# -----------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "brsr-ai-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
      CostCenter  = var.cost_center
      Owner       = "platform-team"
      Compliance  = "DPDPA,ISO27001,SOC2"
    }
  }
}

# Secondary provider for DR region (Hyderabad)
provider "aws" {
  alias  = "dr"
  region = var.aws_region_dr

  default_tags {
    tags = {
      Project     = "brsr-ai-platform"
      Environment = "${var.environment}-dr"
      ManagedBy   = "terraform"
      CostCenter  = var.cost_center
    }
  }
}

# us-east-1 for ACM (CloudFront-attached certs must live there)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# -----------------------------------------------------------------------------
# Data sources
# -----------------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs       = slice(data.aws_availability_zones.available.names, 0, 3)
  name      = "brsr-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id

  common_tags = {
    Environment = var.environment
    Project     = "brsr-ai-platform"
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Modules
# -----------------------------------------------------------------------------

module "kms" {
  source      = "./modules/kms"
  name        = local.name
  environment = var.environment
  tenant_tiers = ["pool", "enterprise", "group", "premium"]
}

module "vpc" {
  source             = "./modules/vpc"
  name               = local.name
  cidr               = var.vpc_cidr
  azs                = local.azs
  public_subnets     = var.public_subnets
  private_subnets    = var.private_subnets
  database_subnets   = var.database_subnets
  enable_nat_gateway = true
  single_nat_gateway = var.environment == "dev"
  enable_flow_log    = true
  flow_log_kms_key   = module.kms.cmk_arn["pool"]
  tags               = local.common_tags
}

module "secrets" {
  source       = "./modules/secrets"
  name         = local.name
  kms_key_arn  = module.kms.cmk_arn["pool"]
  environment  = var.environment
  tags         = local.common_tags
}

module "s3" {
  source      = "./modules/s3"
  name        = local.name
  environment = var.environment
  kms_key_arn = module.kms.cmk_arn["pool"]
  account_id  = local.account_id
  dr_region   = var.aws_region_dr
  tags        = local.common_tags

  providers = {
    aws    = aws
    aws.dr = aws.dr
  }
}

module "iam" {
  source              = "./modules/iam"
  name                = local.name
  environment         = var.environment
  oidc_provider_arn   = module.eks.oidc_provider_arn
  oidc_provider_url   = module.eks.oidc_provider_url
  evidence_bucket_arn = module.s3.evidence_bucket_arn
  reports_bucket_arn  = module.s3.reports_bucket_arn
  kms_key_arns        = module.kms.cmk_arns
  tags                = local.common_tags
}

module "rds" {
  source             = "./modules/rds"
  name               = local.name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.database_subnets
  allowed_cidrs      = [var.vpc_cidr]
  kms_key_arn        = module.kms.cmk_arn["pool"]
  instance_class     = var.db_instance_class
  reader_count       = var.db_reader_count
  engine_version     = "16.4"
  backup_retention   = var.environment == "prod" ? 35 : 7
  deletion_protection = var.environment == "prod"
  master_password_secret_arn = module.secrets.db_master_password_arn
  tags               = local.common_tags
}

module "redis" {
  source              = "./modules/redis"
  name                = local.name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnets
  allowed_cidrs       = [var.vpc_cidr]
  kms_key_arn         = module.kms.cmk_arn["pool"]
  node_type           = var.redis_node_type
  num_cache_clusters  = var.environment == "prod" ? 2 : 1
  auth_token_secret_arn = module.secrets.redis_auth_arn
  tags                = local.common_tags
}

module "alb" {
  source       = "./modules/alb"
  name         = local.name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.public_subnets
  certificate_arn = var.acm_certificate_arn
  waf_acl_arn  = module.waf.regional_acl_arn
  tags         = local.common_tags
}

module "waf" {
  source       = "./modules/waf"
  name         = local.name
  environment  = var.environment
  scope_global = true
  rate_limit_per_5m = 6000
  tags         = local.common_tags

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

module "cloudfront" {
  source             = "./modules/cloudfront"
  name               = local.name
  environment        = var.environment
  origin_dns_name    = module.alb.dns_name
  acm_certificate_arn = var.cloudfront_acm_arn
  web_acl_arn        = module.waf.global_acl_arn
  domains            = var.cloudfront_domains
  tags               = local.common_tags

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

module "eks" {
  source           = "./modules/eks"
  name             = local.name
  environment      = var.environment
  vpc_id           = module.vpc.vpc_id
  private_subnets  = module.vpc.private_subnets
  cluster_version  = "1.31"
  kms_key_arn      = module.kms.cmk_arn["pool"]

  # Three node groups: app, ai-gpu, data
  node_groups = {
    app = {
      desired_size    = var.environment == "prod" ? 6 : 2
      min_size        = 2
      max_size        = 60
      instance_types  = ["m7g.xlarge", "m7g.2xlarge"]
      capacity_type   = "ON_DEMAND"
      labels          = { role = "app", "karpenter.sh/discovery" = "managed" }
      taints          = []
    }
    ai_gpu = {
      desired_size    = var.environment == "prod" ? 1 : 0
      min_size        = 0
      max_size        = 8
      instance_types  = ["g5.xlarge", "g5.2xlarge"]
      capacity_type   = "SPOT"
      labels          = { role = "ai-gpu", "nvidia.com/gpu" = "true" }
      taints = [
        { key = "nvidia.com/gpu", value = "true", effect = "NO_SCHEDULE" }
      ]
    }
    data = {
      desired_size    = var.environment == "prod" ? 3 : 1
      min_size        = 1
      max_size        = 12
      instance_types  = ["r7g.xlarge", "r7g.2xlarge"]
      capacity_type   = "ON_DEMAND"
      labels          = { role = "data" }
      taints = [
        { key = "role", value = "data", effect = "NO_SCHEDULE" }
      ]
    }
  }

  tags = local.common_tags
}

module "privatelink" {
  source       = "./modules/privatelink"
  name         = local.name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnets
  allowed_principals = var.privatelink_allowed_principals
  nlb_target_group_arn = module.alb.nlb_target_group_arn
  tags         = local.common_tags
}

# -----------------------------------------------------------------------------
# Outputs (re-exported)
# -----------------------------------------------------------------------------

output "vpc_id"               { value = module.vpc.vpc_id }
output "eks_cluster_endpoint" { value = module.eks.cluster_endpoint }
output "eks_cluster_name"     { value = module.eks.cluster_name }
output "rds_endpoint"         { value = module.rds.cluster_endpoint, sensitive = true }
output "redis_endpoint"       { value = module.redis.endpoint }
output "evidence_bucket"      { value = module.s3.evidence_bucket_name }
output "reports_bucket"       { value = module.s3.reports_bucket_name }
output "alb_dns_name"         { value = module.alb.dns_name }
output "cloudfront_domain"    { value = module.cloudfront.domain_name }
