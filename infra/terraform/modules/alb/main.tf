# Public ALB + shadow NLB used by PrivateLink.

variable "name"            { type = string }
variable "environment"     { type = string }
variable "vpc_id"          { type = string }
variable "subnet_ids"      { type = list(string) }
variable "certificate_arn" { type = string }
variable "waf_acl_arn"     { type = string }
variable "tags"            { type = map(string), default = {} }

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public ALB ingress 443"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "alb_ingress_443" {
  type              = "ingress"
  security_group_id = aws_security_group.alb.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_ingress_80" {
  type              = "ingress"
  security_group_id = aws_security_group.alb.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_egress" {
  type              = "egress"
  security_group_id = aws_security_group.alb.id
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_lb" "this" {
  name                       = "${var.name}-alb"
  internal                   = false
  load_balancer_type         = "application"
  subnets                    = var.subnet_ids
  security_groups            = [aws_security_group.alb.id]
  enable_deletion_protection = true
  idle_timeout               = 60
  drop_invalid_header_fields = true
  enable_http2               = true

  access_logs {
    enabled = true
    bucket  = "${var.name}-alb-logs"
    prefix  = var.environment
  }

  tags = var.tags
}

resource "aws_lb_listener" "redirect_http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = jsonencode({ error = "not_found" })
      status_code  = "404"
    }
  }
}

resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = aws_lb.this.arn
  web_acl_arn  = var.waf_acl_arn
}

# NLB for PrivateLink (terminates TLS, forwards to ALB target group) ----------

resource "aws_lb" "nlb" {
  name                       = "${var.name}-nlb"
  internal                   = true
  load_balancer_type         = "network"
  subnets                    = var.subnet_ids
  enable_deletion_protection = true
  tags                       = var.tags
}

resource "aws_lb_target_group" "nlb_tg" {
  name        = "${var.name}-nlb-tg"
  port        = 443
  protocol    = "TLS"
  target_type = "alb"
  vpc_id      = var.vpc_id
  health_check {
    protocol            = "HTTPS"
    path                = "/healthz"
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }
  tags = var.tags
}

output "dns_name"              { value = aws_lb.this.dns_name }
output "zone_id"               { value = aws_lb.this.zone_id }
output "arn"                   { value = aws_lb.this.arn }
output "https_listener_arn"    { value = aws_lb_listener.https.arn }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "nlb_arn"               { value = aws_lb.nlb.arn }
output "nlb_target_group_arn"  { value = aws_lb_target_group.nlb_tg.arn }
