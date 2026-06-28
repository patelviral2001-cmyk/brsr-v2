# ElastiCache Redis cluster (single shard, multi-AZ replication group).

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.80" }
  }
}

variable "name"                  { type = string }
variable "environment"           { type = string }
variable "vpc_id"                { type = string }
variable "subnet_ids"            { type = list(string) }
variable "allowed_cidrs"         { type = list(string) }
variable "kms_key_arn"           { type = string }
variable "node_type"             { type = string, default = "cache.r7g.large" }
variable "num_cache_clusters"    { type = number, default = 2 }
variable "auth_token_secret_arn" { type = string }
variable "tags"                  { type = map(string), default = {} }

data "aws_secretsmanager_secret_version" "auth" {
  secret_id = var.auth_token_secret_arn
}

locals {
  auth_token = jsondecode(data.aws_secretsmanager_secret_version.auth.secret_string)["token"]
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "this" {
  name        = "${var.name}-redis"
  description = "Redis ingress from VPC"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "ingress" {
  type              = "ingress"
  security_group_id = aws_security_group.this.id
  from_port         = 6379
  to_port           = 6379
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidrs
}

resource "aws_security_group_rule" "egress" {
  type              = "egress"
  security_group_id = aws_security_group.this.id
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_elasticache_parameter_group" "this" {
  name   = "${var.name}-redis7"
  family = "redis7"

  parameter { name = "maxmemory-policy",      value = "allkeys-lru" }
  parameter { name = "notify-keyspace-events", value = "Ex" }
  parameter { name = "timeout",                value = "300" }

  tags = var.tags
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id        = "${var.name}-redis"
  description                 = "BRSR cache + queues + sessions"
  engine                      = "redis"
  engine_version              = "7.4"
  node_type                   = var.node_type
  num_cache_clusters          = var.num_cache_clusters
  parameter_group_name        = aws_elasticache_parameter_group.this.name
  subnet_group_name           = aws_elasticache_subnet_group.this.name
  security_group_ids          = [aws_security_group.this.id]

  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = local.auth_token
  kms_key_id                  = var.kms_key_arn

  automatic_failover_enabled  = var.num_cache_clusters > 1
  multi_az_enabled            = var.num_cache_clusters > 1
  snapshot_retention_limit    = 7
  snapshot_window             = "16:00-17:00"
  maintenance_window          = "sun:18:30-sun:19:30"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.slowlog.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.engine.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  apply_immediately = false

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "slowlog" {
  name              = "/aws/elasticache/${var.name}/slow"
  retention_in_days = 14
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "engine" {
  name              = "/aws/elasticache/${var.name}/engine"
  retention_in_days = 14
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

output "endpoint"           { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "reader_endpoint"    { value = aws_elasticache_replication_group.this.reader_endpoint_address }
output "port"               { value = 6379 }
output "security_group_id"  { value = aws_security_group.this.id }
