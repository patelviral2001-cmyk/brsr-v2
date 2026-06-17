# Per-tier KMS Customer Managed Keys. Each tenant tier gets a separate CMK so
# we can grant tier-scoped access, support BYOK / external-key options for
# Listed Premium, and isolate blast radius.

variable "name"         { type = string }
variable "environment"  { type = string }
variable "tenant_tiers" { type = list(string), default = ["pool","enterprise","group","premium"] }

resource "aws_kms_key" "cmk" {
  for_each                = toset(var.tenant_tiers)
  description             = "BRSR ${var.environment} ${each.key} tier CMK"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region            = each.key == "premium" ? true : false

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRoot"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowServices"
        Effect    = "Allow"
        Principal = { Service = ["rds.amazonaws.com","s3.amazonaws.com","secretsmanager.amazonaws.com","elasticache.amazonaws.com","eks.amazonaws.com","logs.amazonaws.com"] }
        Action    = ["kms:Encrypt","kms:Decrypt","kms:ReEncrypt*","kms:GenerateDataKey*","kms:DescribeKey","kms:CreateGrant"]
        Resource  = "*"
      },
    ]
  })

  tags = {
    Tier        = each.key
    Environment = var.environment
  }
}

resource "aws_kms_alias" "cmk" {
  for_each      = toset(var.tenant_tiers)
  name          = "alias/${var.name}-${each.key}"
  target_key_id = aws_kms_key.cmk[each.key].key_id
}

data "aws_caller_identity" "current" {}

output "cmk_arn" {
  description = "Map of tier => CMK ARN."
  value       = { for k, v in aws_kms_key.cmk : k => v.arn }
}

output "cmk_arns" {
  value = [for v in aws_kms_key.cmk : v.arn]
}
