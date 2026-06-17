# -----------------------------------------------------------------------------
# Root variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Environment name: dev, staging, prod, dr"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod", "dr"], var.environment)
    error_message = "environment must be one of: dev, staging, prod, dr."
  }
}

variable "aws_region" {
  description = "Primary AWS region. Default Mumbai (DPDPA residency)."
  type        = string
  default     = "ap-south-1"
}

variable "aws_region_dr" {
  description = "DR AWS region. Default Hyderabad."
  type        = string
  default     = "ap-south-2"
}

variable "cost_center" {
  description = "Finance cost center for billing tags."
  type        = string
  default     = "ENG-PLATFORM"
}

# Networking ------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnets" {
  description = "Public subnet CIDRs (one per AZ)."
  type        = list(string)
  default     = ["10.40.0.0/22", "10.40.4.0/22", "10.40.8.0/22"]
}

variable "private_subnets" {
  description = "Private subnet CIDRs (one per AZ)."
  type        = list(string)
  default     = ["10.40.16.0/20", "10.40.32.0/20", "10.40.48.0/20"]
}

variable "database_subnets" {
  description = "Database subnet CIDRs (one per AZ)."
  type        = list(string)
  default     = ["10.40.64.0/22", "10.40.68.0/22", "10.40.72.0/22"]
}

# RDS -------------------------------------------------------------------------

variable "db_instance_class" {
  description = "Aurora instance class."
  type        = string
  default     = "db.r7g.xlarge"
}

variable "db_reader_count" {
  description = "Number of Aurora reader instances."
  type        = number
  default     = 2
}

# Redis -----------------------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.r7g.large"
}

# TLS / DNS -------------------------------------------------------------------

variable "acm_certificate_arn" {
  description = "ACM cert ARN for ALB."
  type        = string
}

variable "cloudfront_acm_arn" {
  description = "ACM cert ARN in us-east-1 for CloudFront."
  type        = string
}

variable "cloudfront_domains" {
  description = "Aliases for the CloudFront distribution."
  type        = list(string)
  default     = ["app.brsrai.com", "supplier.brsrai.com"]
}

# PrivateLink -----------------------------------------------------------------

variable "privatelink_allowed_principals" {
  description = "AWS account principals allowed to consume PrivateLink (customer SAP endpoints)."
  type        = list(string)
  default     = []
}
