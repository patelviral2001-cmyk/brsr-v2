# Aurora PostgreSQL 16 cluster: writer + N readers, multi-AZ, KMS encrypted,
# Performance Insights on, IAM authentication enabled, parameter group tuned.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.80" }
  }
}

variable "name"                       { type = string }
variable "environment"                { type = string }
variable "vpc_id"                     { type = string }
variable "subnet_ids"                 { type = list(string) }
variable "allowed_cidrs"              { type = list(string) }
variable "kms_key_arn"                { type = string }
variable "instance_class"             { type = string, default = "db.r7g.xlarge" }
variable "reader_count"               { type = number, default = 2 }
variable "engine_version"             { type = string, default = "16.4" }
variable "backup_retention"           { type = number, default = 35 }
variable "deletion_protection"        { type = bool,   default = true }
variable "master_password_secret_arn" { type = string }
variable "tags"                       { type = map(string), default = {} }

data "aws_secretsmanager_secret_version" "master" {
  secret_id = var.master_password_secret_arn
}

locals {
  master_password = jsondecode(data.aws_secretsmanager_secret_version.master.secret_string)["password"]
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-aurora"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "this" {
  name        = "${var.name}-aurora"
  description = "Aurora ingress from VPC private subnets"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "ingress_pg" {
  type              = "ingress"
  security_group_id = aws_security_group.this.id
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidrs
}

resource "aws_security_group_rule" "egress_all" {
  type              = "egress"
  security_group_id = aws_security_group.this.id
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_rds_cluster_parameter_group" "this" {
  name        = "${var.name}-aurora-pg16"
  family      = "aurora-postgresql16"
  description = "BRSR Aurora 16 cluster params"

  parameter { name = "rds.force_ssl",                   value = "1"   }
  parameter { name = "log_statement",                   value = "ddl" }
  parameter { name = "log_min_duration_statement",      value = "500" }
  parameter { name = "shared_preload_libraries",        value = "pg_stat_statements,pgaudit,pg_cron", apply_method = "pending-reboot" }
  parameter { name = "pgaudit.log",                     value = "ddl,role,write" }
  parameter { name = "pg_stat_statements.track",        value = "all" }
  parameter { name = "track_io_timing",                 value = "on" }
  parameter { name = "max_connections",                 value = "1000" }

  tags = var.tags
}

resource "aws_db_parameter_group" "instance" {
  name        = "${var.name}-aurora-instance-pg16"
  family      = "aurora-postgresql16"
  description = "BRSR Aurora 16 instance params"

  parameter { name = "log_min_duration_statement", value = "500" }
  parameter { name = "log_connections",            value = "1" }
  parameter { name = "log_disconnections",         value = "1" }
  parameter { name = "log_lock_waits",             value = "1" }

  tags = var.tags
}

resource "aws_rds_cluster" "this" {
  cluster_identifier            = "${var.name}-aurora"
  engine                        = "aurora-postgresql"
  engine_version                = var.engine_version
  database_name                 = "brsr"
  master_username               = "brsr_master"
  master_password               = local.master_password

  db_subnet_group_name          = aws_db_subnet_group.this.name
  vpc_security_group_ids        = [aws_security_group.this.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.this.name

  storage_encrypted             = true
  kms_key_id                    = var.kms_key_arn

  backup_retention_period       = var.backup_retention
  preferred_backup_window       = "16:00-17:00"   # IST 21:30-22:30
  preferred_maintenance_window  = "sun:18:30-sun:19:30"

  copy_tags_to_snapshot         = true
  deletion_protection           = var.deletion_protection
  iam_database_authentication_enabled = true

  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 16
  }

  apply_immediately = false

  lifecycle {
    ignore_changes = [master_password] # rotated by Secrets Manager
  }

  tags = var.tags
}

resource "aws_rds_cluster_instance" "writer" {
  identifier              = "${var.name}-aurora-writer"
  cluster_identifier      = aws_rds_cluster.this.id
  instance_class          = var.instance_class
  engine                  = aws_rds_cluster.this.engine
  engine_version          = aws_rds_cluster.this.engine_version
  db_parameter_group_name = aws_db_parameter_group.instance.name
  publicly_accessible     = false
  promotion_tier          = 0
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.kms_key_arn
  performance_insights_retention_period = 7
  auto_minor_version_upgrade            = true
  monitoring_interval                   = 30
  monitoring_role_arn                   = aws_iam_role.monitoring.arn
  tags = merge(var.tags, { Role = "writer" })
}

resource "aws_rds_cluster_instance" "reader" {
  count                   = var.reader_count
  identifier              = "${var.name}-aurora-reader-${count.index}"
  cluster_identifier      = aws_rds_cluster.this.id
  instance_class          = var.instance_class
  engine                  = aws_rds_cluster.this.engine
  engine_version          = aws_rds_cluster.this.engine_version
  db_parameter_group_name = aws_db_parameter_group.instance.name
  publicly_accessible     = false
  promotion_tier          = count.index + 1
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.kms_key_arn
  performance_insights_retention_period = 7
  auto_minor_version_upgrade            = true
  monitoring_interval                   = 30
  monitoring_role_arn                   = aws_iam_role.monitoring.arn
  tags = merge(var.tags, { Role = "reader" })
}

resource "aws_iam_role" "monitoring" {
  name = "${var.name}-aurora-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  role       = aws_iam_role.monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Outputs ---------------------------------------------------------------------

output "cluster_id"          { value = aws_rds_cluster.this.id }
output "cluster_arn"         { value = aws_rds_cluster.this.arn }
output "cluster_endpoint"    { value = aws_rds_cluster.this.endpoint, sensitive = true }
output "reader_endpoint"     { value = aws_rds_cluster.this.reader_endpoint, sensitive = true }
output "security_group_id"   { value = aws_security_group.this.id }
output "port"                { value = 5432 }
