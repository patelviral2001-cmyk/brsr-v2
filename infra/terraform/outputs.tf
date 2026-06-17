# Module-level re-exports are defined in main.tf. Add cross-cutting outputs here.

output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "availability_zones" {
  value = local.azs
}

output "kms_cmk_arns" {
  description = "Per-tier KMS CMK ARNs."
  value       = module.kms.cmk_arns
}

output "iam_irsa_role_arns" {
  description = "Per-service IRSA role ARNs to inject into Helm values."
  value       = module.iam.irsa_role_arns
}

output "evidence_bucket_arn" {
  value = module.s3.evidence_bucket_arn
}

output "reports_bucket_arn" {
  value = module.s3.reports_bucket_arn
}
