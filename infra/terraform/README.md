# BRSR AI Platform - Terraform

Provisions all AWS infrastructure: VPC, EKS, RDS (Aurora Postgres 16), ElastiCache (Redis), S3 buckets with Object Lock, KMS CMKs per tenant tier, Secrets Manager, IAM roles for IRSA, CloudFront + WAF + Shield, ALB, and PrivateLink endpoints for customer-side ERP sync.

## Prerequisites

- Terraform >= 1.10
- AWS CLI v2 with SSO configured (`aws sso login --profile brsr-prod`)
- `kubectl` 1.31, `helm` 3.16, `aws-iam-authenticator`
- Permissions: a deploying role with `AdministratorAccess` (we tighten this post-bootstrap with SCPs)

One-time bootstrap (per AWS account, run once):

```bash
cd bootstrap
terraform init && terraform apply
# Creates: brsr-tfstate bucket, brsr-tflock DynamoDB table, KMS CMK for state
```

Then update `backends/<env>.hcl` with the bootstrap outputs.

## Layout

```
terraform/
├── main.tf                 # Wires the modules
├── variables.tf            # Root inputs
├── outputs.tf              # Cross-cutting outputs
├── backends.tf             # S3 + DynamoDB backend stanza
├── terraform.tfvars.example
├── backends/
│   ├── dev.hcl
│   ├── staging.hcl
│   ├── prod.hcl
│   └── dr.hcl
├── envs/
│   ├── dev.tfvars
│   ├── staging.tfvars
│   ├── prod.tfvars
│   └── dr.tfvars
└── modules/
    ├── vpc/        # 3-AZ, public + private + database subnets, flow logs
    ├── eks/        # Cluster + Karpenter + 3 node groups (app, ai-gpu, data)
    ├── rds/        # Aurora Postgres 16 with read replicas
    ├── redis/      # ElastiCache Redis cluster
    ├── s3/         # evidence-vault (Object Lock), reports, backups
    ├── kms/        # CMK per tenant tier (pool, enterprise, group, premium)
    ├── iam/        # IRSA roles for api, ai-engine, copilot, workflow, web
    ├── secrets/    # Secrets Manager + KMS-encrypted secrets
    ├── cloudfront/ # CDN distribution
    ├── waf/        # AWS WAF v2 (global + regional)
    ├── alb/        # Application Load Balancer + NLB shadow for PrivateLink
    └── privatelink/# PrivateLink service for customer SAP sync
```

## Apply workflow

We use **one workspace per environment** and a per-env tfvars + backend config.

```bash
# 1. Init with env backend
terraform init -backend-config=backends/prod.hcl

# 2. Select workspace
terraform workspace select prod || terraform workspace new prod

# 3. Plan
terraform plan -var-file=envs/prod.tfvars -out=tfplan-prod-$(date +%s)

# 4. Manual gate: open the plan, comment on Slack #infra-changes, get one SRE approval

# 5. Apply
terraform apply tfplan-prod-*
```

For dev / staging, the GitHub Actions workflow `deploy-staging.yml` runs `terraform apply` automatically on merge to `main` once a labeled review is present.

## CI integration

- PR: `terraform fmt -check`, `terraform validate`, `tflint`, `checkov`, and `terraform plan` posted to PR via comment.
- Plans for prod require manual approval (`environment: production` protection rule in GitHub).
- Apply runs through GitHub OIDC -> AWS STS AssumeRoleWithWebIdentity (no static keys).

## Cost estimate

Indicative monthly run rate at our target scale (prod env, 100 paid tenants):

| Item | USD / mo |
| :--- | ---: |
| EKS control plane | 73 |
| EC2 nodes (app + data + spot ai-gpu) | 10,500 |
| Aurora Postgres (writer + 2 readers, r7g.xlarge) | 2,500 |
| ElastiCache Redis (r7g.large x 2) | 600 |
| S3 (evidence + reports + backups, ~5 TB) | 1,400 |
| CloudFront + WAF + Shield | 700 |
| ALB + NLB | 60 |
| KMS CMKs (4) + Secrets | 200 |
| Data transfer | 400 |
| **Total** | **~16,400** |

Reservations and savings plans drop this by 30-40% in steady-state.

## Common operational tasks

```bash
# Rotate Aurora password (creates new secret version)
terraform apply -target=module.secrets -replace='module.secrets.aws_secretsmanager_secret_version.db_master'

# Add a new tenant tier
# Edit modules/kms/variables.tf -> append to tenant_tiers, apply

# Scale up writer (online via Aurora)
terraform apply -var='db_instance_class=db.r7g.2xlarge'
```

## Disaster recovery

- Backups: see modules/rds for snapshot schedule (35 days for prod) and cross-region copy to ap-south-2.
- State: state bucket is versioned + replicated to ap-south-2 (configured in bootstrap).
- DR runbook: `runbooks/dr-failover.md`.
