# PrivateLink endpoint service - exposes our NLB to allow-listed customer
# AWS accounts so customer SAP / Oracle can sync ERP deltas without crossing
# the public internet.

variable "name"                 { type = string }
variable "environment"          { type = string }
variable "vpc_id"               { type = string }
variable "subnet_ids"           { type = list(string) }
variable "allowed_principals"   { type = list(string), default = [] }
variable "nlb_target_group_arn" { type = string }
variable "tags"                 { type = map(string), default = {} }

data "aws_lb_target_group" "this" {
  arn = var.nlb_target_group_arn
}

data "aws_lb" "this" {
  name = data.aws_lb_target_group.this.load_balancer_arns[0]
}

resource "aws_vpc_endpoint_service" "this" {
  acceptance_required        = true
  network_load_balancer_arns = [data.aws_lb.this.arn]
  allowed_principals         = var.allowed_principals

  private_dns_name = "erp-sync.${var.environment}.brsrai.com"

  tags = merge(var.tags, { Name = "${var.name}-pls" })
}

output "service_name" { value = aws_vpc_endpoint_service.this.service_name }
output "service_id"   { value = aws_vpc_endpoint_service.this.id }
