# EKS module: cluster + OIDC + 3 node groups + Karpenter (via Helm).

terraform {
  required_providers {
    aws        = { source = "hashicorp/aws",        version = "~> 5.80" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.34" }
    helm       = { source = "hashicorp/helm",       version = "~> 2.16" }
    tls        = { source = "hashicorp/tls",        version = "~> 4.0" }
  }
}

variable "name"             { type = string }
variable "environment"      { type = string }
variable "vpc_id"           { type = string }
variable "private_subnets"  { type = list(string) }
variable "cluster_version"  { type = string, default = "1.31" }
variable "kms_key_arn"      { type = string }
variable "node_groups" {
  type = map(object({
    desired_size   = number
    min_size       = number
    max_size       = number
    instance_types = list(string)
    capacity_type  = string
    labels         = map(string)
    taints         = list(object({ key = string, value = string, effect = string }))
  }))
}
variable "tags" { type = map(string), default = {} }

# Cluster IAM role ------------------------------------------------------------

resource "aws_iam_role" "cluster" {
  name = "${var.name}-eks-cluster"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_amazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# Cluster ---------------------------------------------------------------------

resource "aws_eks_cluster" "this" {
  name     = var.name
  version  = var.cluster_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = var.private_subnets
    endpoint_public_access  = false
    endpoint_private_access = true
    security_group_ids      = [aws_security_group.cluster.id]
  }

  encryption_config {
    provider { key_arn = var.kms_key_arn }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  access_config {
    authentication_mode = "API"
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy_attachment.cluster_amazonEKSClusterPolicy]
}

# OIDC provider for IRSA ------------------------------------------------------

data "tls_certificate" "cluster" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "this" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
  tags            = var.tags
}

# Cluster security group ------------------------------------------------------

resource "aws_security_group" "cluster" {
  name        = "${var.name}-eks-cluster"
  description = "EKS control plane SG"
  vpc_id      = var.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "cluster_egress_all" {
  type              = "egress"
  security_group_id = aws_security_group.cluster.id
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

# Node role -------------------------------------------------------------------

resource "aws_iam_role" "node" {
  name = "${var.name}-eks-node"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "node_AmazonEKSWorkerNodePolicy" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}
resource "aws_iam_role_policy_attachment" "node_AmazonEKS_CNI_Policy" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}
resource "aws_iam_role_policy_attachment" "node_AmazonEC2ContainerRegistryReadOnly" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}
resource "aws_iam_role_policy_attachment" "node_AmazonSSMManagedInstanceCore" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Managed node groups ---------------------------------------------------------

resource "aws_eks_node_group" "this" {
  for_each        = var.node_groups
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.name}-${each.key}"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnets

  capacity_type  = each.value.capacity_type
  instance_types = each.value.instance_types

  scaling_config {
    desired_size = each.value.desired_size
    min_size     = each.value.min_size
    max_size     = each.value.max_size
  }

  update_config {
    max_unavailable_percentage = 33
  }

  labels = each.value.labels

  dynamic "taint" {
    for_each = each.value.taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect == "NO_SCHEDULE" ? "NO_SCHEDULE" : (taint.value.effect == "PREFER_NO_SCHEDULE" ? "PREFER_NO_SCHEDULE" : "NO_EXECUTE")
    }
  }

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }

  tags = merge(var.tags, { Name = "${var.name}-${each.key}" })

  depends_on = [
    aws_iam_role_policy_attachment.node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.node_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.node_AmazonEC2ContainerRegistryReadOnly,
  ]
}

# EKS addons ------------------------------------------------------------------

resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "coredns"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "pod_identity_agent" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "eks-pod-identity-agent"
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = aws_eks_cluster.this.name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = aws_iam_role.ebs_csi.arn
}

resource "aws_iam_role" "ebs_csi" {
  name = "${var.name}-ebs-csi"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.this.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.this.url, "https://", "")}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
        }
      }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

# Karpenter -------------------------------------------------------------------
# IRSA role for Karpenter; Helm install lives in argocd app-of-apps.

resource "aws_iam_role" "karpenter_controller" {
  name = "${var.name}-karpenter"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.this.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.this.url, "https://", "")}:sub" = "system:serviceaccount:karpenter:karpenter"
        }
      }
    }]
  })
  tags = var.tags
}

# (Inline policy omitted for brevity; production wires the AWS-published policy doc here.)

# Outputs ---------------------------------------------------------------------

output "cluster_name"        { value = aws_eks_cluster.this.name }
output "cluster_endpoint"    { value = aws_eks_cluster.this.endpoint }
output "cluster_ca"          { value = aws_eks_cluster.this.certificate_authority[0].data }
output "oidc_provider_arn"   { value = aws_iam_openid_connect_provider.this.arn }
output "oidc_provider_url"   { value = aws_iam_openid_connect_provider.this.url }
output "cluster_sg_id"       { value = aws_security_group.cluster.id }
output "node_role_arn"       { value = aws_iam_role.node.arn }
output "karpenter_role_arn"  { value = aws_iam_role.karpenter_controller.arn }
