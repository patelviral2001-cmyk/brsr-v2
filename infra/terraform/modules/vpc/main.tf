# VPC module: 3-AZ, public + private + database subnets, flow logs to S3.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.80" }
  }
}

variable "name"               { type = string }
variable "cidr"               { type = string }
variable "azs"                { type = list(string) }
variable "public_subnets"     { type = list(string) }
variable "private_subnets"    { type = list(string) }
variable "database_subnets"   { type = list(string) }
variable "enable_nat_gateway" { type = bool, default = true }
variable "single_nat_gateway" { type = bool, default = false }
variable "enable_flow_log"    { type = bool, default = true }
variable "flow_log_kms_key"   { type = string, default = null }
variable "tags"               { type = map(string), default = {} }

# Main VPC --------------------------------------------------------------------

resource "aws_vpc" "this" {
  cidr_block                       = var.cidr
  enable_dns_support               = true
  enable_dns_hostnames             = true
  assign_generated_ipv6_cidr_block = false
  instance_tenancy                 = "default"

  tags = merge(var.tags, { Name = var.name })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-igw" })
}

# Subnets ---------------------------------------------------------------------

resource "aws_subnet" "public" {
  count                   = length(var.public_subnets)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnets[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name                                = "${var.name}-public-${var.azs[count.index]}"
    "kubernetes.io/role/elb"            = "1"
    "kubernetes.io/cluster/${var.name}" = "shared"
    Tier                                = "public"
  })
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnets)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.private_subnets[count.index]
  availability_zone = var.azs[count.index]

  tags = merge(var.tags, {
    Name                                = "${var.name}-private-${var.azs[count.index]}"
    "kubernetes.io/role/internal-elb"   = "1"
    "kubernetes.io/cluster/${var.name}" = "shared"
    "karpenter.sh/discovery"            = var.name
    Tier                                = "private"
  })
}

resource "aws_subnet" "database" {
  count             = length(var.database_subnets)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.database_subnets[count.index]
  availability_zone = var.azs[count.index]

  tags = merge(var.tags, {
    Name = "${var.name}-db-${var.azs[count.index]}"
    Tier = "database"
  })
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = aws_subnet.database[*].id
  tags       = var.tags
}

# NAT gateways ----------------------------------------------------------------

resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.azs)) : 0
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-eip-nat-${count.index}" })
}

resource "aws_nat_gateway" "this" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.azs)) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, { Name = "${var.name}-nat-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

# Route tables ----------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(var.tags, { Name = "${var.name}-rt-public" })
}

resource "aws_route_table_association" "public" {
  count          = length(var.public_subnets)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = length(var.private_subnets)
  vpc_id = aws_vpc.this.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.this[var.single_nat_gateway ? 0 : count.index].id
    }
  }

  tags = merge(var.tags, { Name = "${var.name}-rt-private-${count.index}" })
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnets)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table" "database" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-rt-database" })
}

resource "aws_route_table_association" "database" {
  count          = length(var.database_subnets)
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# VPC endpoints (for cost-savings on S3/ECR/SecretsManager egress) ------------

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(aws_route_table.private[*].id, [aws_route_table.database.id])
  tags              = merge(var.tags, { Name = "${var.name}-vpce-s3" })
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = merge(var.tags, { Name = "${var.name}-vpce-ecr-api" })
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = merge(var.tags, { Name = "${var.name}-vpce-ecr-dkr" })
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = merge(var.tags, { Name = "${var.name}-vpce-sm" })
}

resource "aws_security_group" "endpoints" {
  name        = "${var.name}-vpce"
  description = "VPC endpoint ingress from VPC CIDR"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# Flow logs -------------------------------------------------------------------

resource "aws_s3_bucket" "flow_logs" {
  count         = var.enable_flow_log ? 1 : 0
  bucket        = "${var.name}-flow-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = var.tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "flow_logs" {
  count  = var.enable_flow_log ? 1 : 0
  bucket = aws_s3_bucket.flow_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.flow_log_kms_key != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.flow_log_kms_key
    }
  }
}

resource "aws_s3_bucket_public_access_block" "flow_logs" {
  count                   = var.enable_flow_log ? 1 : 0
  bucket                  = aws_s3_bucket.flow_logs[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_flow_log" "this" {
  count                = var.enable_flow_log ? 1 : 0
  log_destination_type = "s3"
  log_destination      = aws_s3_bucket.flow_logs[0].arn
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.this.id

  destination_options {
    file_format        = "parquet"
    per_hour_partition = true
  }

  tags = var.tags
}

# Data sources & outputs ------------------------------------------------------

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

output "vpc_id"            { value = aws_vpc.this.id }
output "vpc_cidr"          { value = aws_vpc.this.cidr_block }
output "public_subnets"    { value = aws_subnet.public[*].id }
output "private_subnets"   { value = aws_subnet.private[*].id }
output "database_subnets"  { value = aws_subnet.database[*].id }
output "db_subnet_group"   { value = aws_db_subnet_group.this.name }
output "nat_gateway_ids"   { value = aws_nat_gateway.this[*].id }
