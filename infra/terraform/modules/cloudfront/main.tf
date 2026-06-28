# CloudFront distribution in front of the ALB. WAF (global) attached.

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.80"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

variable "name"                { type = string }
variable "environment"         { type = string }
variable "origin_dns_name"     { type = string }
variable "acm_certificate_arn" { type = string }
variable "web_acl_arn"         { type = string }
variable "domains"             { type = list(string) }
variable "tags"                { type = map(string), default = {} }

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name}-alb-oac"
  origin_access_control_origin_type = "s3" # unused for ALB, placeholder
  signing_behavior                  = "no-override"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "BRSR ${var.environment}"
  default_root_object = ""
  price_class         = "PriceClass_200"
  aliases             = var.domains
  web_acl_id          = var.web_acl_arn
  http_version        = "http2and3"

  origin {
    domain_name = var.origin_dns_name
    origin_id   = "alb-origin"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
      origin_keepalive_timeout = 5
    }
    custom_header {
      name  = "X-CF-Secret"
      value = "set-via-ssm" # rotated via Lambda; ALB verifies presence
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD"]
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 3600

    forwarded_values {
      query_string = true
      headers      = ["Authorization","Origin","Host","Accept","Content-Type","User-Agent","X-Tenant-Hint"]
      cookies { forward = "all" }
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD"]
    cached_methods         = ["GET","HEAD"]
    compress               = true
    min_ttl                = 86400
    default_ttl            = 604800
    max_ttl                = 31536000

    forwarded_values {
      query_string = false
      headers      = ["Accept-Encoding"]
      cookies { forward = "none" }
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/images/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD"]
    cached_methods         = ["GET","HEAD"]
    compress               = true
    min_ttl                = 86400
    default_ttl            = 604800
    max_ttl                = 31536000

    forwarded_values {
      query_string = true
      cookies { forward = "none" }
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  logging_config {
    bucket          = "${var.name}-cf-logs.s3.amazonaws.com"
    include_cookies = false
    prefix          = "${var.environment}/"
  }

  tags = var.tags
}

output "domain_name" { value = aws_cloudfront_distribution.this.domain_name }
output "id"          { value = aws_cloudfront_distribution.this.id }
output "arn"         { value = aws_cloudfront_distribution.this.arn }
