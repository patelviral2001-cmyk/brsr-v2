# AWS WAF v2: a global (CLOUDFRONT) ACL + a regional ACL for the ALB.

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.80"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

variable "name"              { type = string }
variable "environment"       { type = string }
variable "scope_global"      { type = bool,   default = true }
variable "rate_limit_per_5m" { type = number, default = 6000 }
variable "tags"              { type = map(string), default = {} }

locals {
  managed_groups = [
    "AWSManagedRulesCommonRuleSet",
    "AWSManagedRulesKnownBadInputsRuleSet",
    "AWSManagedRulesAmazonIpReputationList",
    "AWSManagedRulesAnonymousIpList",
    "AWSManagedRulesSQLiRuleSet",
    "AWSManagedRulesLinuxRuleSet",
  ]
}

# Global (CLOUDFRONT) ACL -----------------------------------------------------

resource "aws_wafv2_web_acl" "global" {
  provider = aws.us_east_1
  name     = "${var.name}-global"
  scope    = "CLOUDFRONT"

  default_action { allow {} }

  dynamic "rule" {
    for_each = local.managed_groups
    iterator = rg
    content {
      name     = rg.value
      priority = rg.key + 10

      override_action { none {} }

      statement {
        managed_rule_group_statement {
          name        = rg.value
          vendor_name = "AWS"
        }
      }

      visibility_config {
        sampled_requests_enabled   = true
        cloudwatch_metrics_enabled = true
        metric_name                = rg.value
      }
    }
  }

  rule {
    name     = "rate-limit"
    priority = 100
    action { block {} }
    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5m
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-global"
  }

  tags = var.tags
}

# Regional ACL (for ALB) ------------------------------------------------------

resource "aws_wafv2_web_acl" "regional" {
  name  = "${var.name}-regional"
  scope = "REGIONAL"

  default_action { allow {} }

  dynamic "rule" {
    for_each = local.managed_groups
    iterator = rg
    content {
      name     = rg.value
      priority = rg.key + 10

      override_action { none {} }

      statement {
        managed_rule_group_statement {
          name        = rg.value
          vendor_name = "AWS"
        }
      }

      visibility_config {
        sampled_requests_enabled   = true
        cloudwatch_metrics_enabled = true
        metric_name                = rg.value
      }
    }
  }

  rule {
    name     = "require-cloudfront-header"
    priority = 1
    action {
      block {
        custom_response {
          response_code = 403
          custom_response_body_key = "must-go-through-cdn"
        }
      }
    }
    statement {
      not_statement {
        statement {
          byte_match_statement {
            field_to_match { single_header { name = "x-cf-secret" } }
            positional_constraint = "EXACTLY"
            search_string         = "set-via-ssm"
            text_transformation { priority = 0, type = "NONE" }
          }
        }
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "no-cdn"
    }
  }

  custom_response_body {
    key          = "must-go-through-cdn"
    content      = "Direct requests to ALB are blocked. Please use the public domain."
    content_type = "TEXT_PLAIN"
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-regional"
  }

  tags = var.tags
}

output "global_acl_arn"   { value = aws_wafv2_web_acl.global.arn }
output "regional_acl_arn" { value = aws_wafv2_web_acl.regional.arn }
