# IRSA roles for each app service. Each role is scoped to a (service-account,
# namespace) pair and only granted the minimum AWS APIs it needs.

variable "name"                { type = string }
variable "environment"         { type = string }
variable "oidc_provider_arn"   { type = string }
variable "oidc_provider_url"   { type = string }
variable "evidence_bucket_arn" { type = string }
variable "reports_bucket_arn"  { type = string }
variable "kms_key_arns"        { type = list(string) }
variable "tags"                { type = map(string), default = {} }

locals {
  oidc_url_no_proto = replace(var.oidc_provider_url, "https://", "")

  services = {
    api = {
      namespace = "brsr-app"
      sa        = "api"
      s3_actions = ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"]
      buckets    = [var.evidence_bucket_arn, var.reports_bucket_arn]
    }
    ai_engine = {
      namespace = "brsr-ai"
      sa        = "ai-engine"
      s3_actions = ["s3:GetObject","s3:ListBucket"]
      buckets    = [var.evidence_bucket_arn]
    }
    copilot = {
      namespace = "brsr-ai"
      sa        = "copilot"
      s3_actions = ["s3:GetObject","s3:ListBucket"]
      buckets    = [var.evidence_bucket_arn, var.reports_bucket_arn]
    }
    workflow = {
      namespace = "brsr-app"
      sa        = "workflow"
      s3_actions = ["s3:GetObject","s3:PutObject","s3:ListBucket"]
      buckets    = [var.evidence_bucket_arn, var.reports_bucket_arn]
    }
    web = {
      namespace = "brsr-app"
      sa        = "web"
      s3_actions = ["s3:GetObject"]
      buckets    = [var.reports_bucket_arn]
    }
  }
}

resource "aws_iam_role" "service" {
  for_each = local.services
  name     = "${var.name}-${each.key}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_url_no_proto}:sub" = "system:serviceaccount:${each.value.namespace}:${each.value.sa}"
          "${local.oidc_url_no_proto}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(var.tags, { Service = each.key })
}

resource "aws_iam_role_policy" "service_s3" {
  for_each = local.services
  name     = "s3-access"
  role     = aws_iam_role.service[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = each.value.s3_actions
        Resource = concat(each.value.buckets, [for b in each.value.buckets : "${b}/*"])
        Condition = {
          StringEquals = { "s3:ExistingObjectTag/tenantId" = "$${aws:PrincipalTag/tenantId}" }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "service_kms" {
  for_each = local.services
  name     = "kms-access"
  role     = aws_iam_role.service[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt","kms:GenerateDataKey","kms:DescribeKey"]
      Resource = var.kms_key_arns
    }]
  })
}

resource "aws_iam_role_policy" "service_secrets" {
  for_each = local.services
  name     = "secrets-read"
  role     = aws_iam_role.service[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue","secretsmanager:DescribeSecret"]
      Resource = ["arn:aws:secretsmanager:*:*:secret:${var.name}/*"]
    }]
  })
}

output "irsa_role_arns" {
  value = { for k, r in aws_iam_role.service : k => r.arn }
}
