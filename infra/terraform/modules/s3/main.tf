# S3 buckets:
#   - evidence-vault: Object Lock (Compliance mode, 10y default retention)
#   - reports: versioned, KMS, Object Lock Governance
#   - backups: versioned, lifecycle to Glacier
#   - cross-region replication for evidence-vault to DR region

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.80"
      configuration_aliases = [aws.dr]
    }
  }
}

variable "name"        { type = string }
variable "environment" { type = string }
variable "kms_key_arn" { type = string }
variable "account_id"  { type = string }
variable "dr_region"   { type = string }
variable "tags"        { type = map(string), default = {} }

# Replica KMS key in DR region (created here for simplicity; production: separate module)
resource "aws_kms_key" "dr_replica" {
  provider                = aws.dr
  description             = "BRSR ${var.environment} replica encryption (DR)"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_kms_alias" "dr_replica" {
  provider      = aws.dr
  name          = "alias/${var.name}-replica"
  target_key_id = aws_kms_key.dr_replica.key_id
}

# Evidence vault --------------------------------------------------------------

resource "aws_s3_bucket" "evidence" {
  bucket              = "${var.name}-evidence-vault-${var.account_id}"
  object_lock_enabled = true
  force_destroy       = false
  tags = merge(var.tags, {
    Name        = "${var.name}-evidence-vault"
    DataClass   = "customer-evidence"
    Compliance  = "WORM-10y"
  })
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_object_lock_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = 10
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    id     = "transition-to-IA"
    status = "Enabled"
    filter { prefix = "" }
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 365
      storage_class = "GLACIER_IR"
    }
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
  }

  rule {
    id     = "abort-mpu"
    status = "Enabled"
    filter { prefix = "" }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

# CRR for evidence vault ------------------------------------------------------

resource "aws_iam_role" "replication" {
  name = "${var.name}-s3-replication"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_s3_bucket" "evidence_replica" {
  provider            = aws.dr
  bucket              = "${var.name}-evidence-vault-replica-${var.account_id}"
  object_lock_enabled = true
  tags                = var.tags
}

resource "aws_s3_bucket_versioning" "evidence_replica" {
  provider = aws.dr
  bucket   = aws_s3_bucket.evidence_replica.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_object_lock_configuration" "evidence_replica" {
  provider = aws.dr
  bucket   = aws_s3_bucket.evidence_replica.id
  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = 10
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence_replica" {
  provider = aws.dr
  bucket   = aws_s3_bucket.evidence_replica.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.dr_replica.arn
    }
  }
}

resource "aws_iam_role_policy" "replication" {
  name = "${var.name}-s3-replication"
  role = aws_iam_role.replication.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = ["s3:GetReplicationConfiguration","s3:ListBucket"]
        Effect = "Allow"
        Resource = [aws_s3_bucket.evidence.arn]
      },
      {
        Action = ["s3:GetObjectVersionForReplication","s3:GetObjectVersionAcl","s3:GetObjectVersionTagging"]
        Effect = "Allow"
        Resource = ["${aws_s3_bucket.evidence.arn}/*"]
      },
      {
        Action = ["s3:ReplicateObject","s3:ReplicateDelete","s3:ReplicateTags"]
        Effect = "Allow"
        Resource = ["${aws_s3_bucket.evidence_replica.arn}/*"]
      },
      {
        Action = ["kms:Decrypt"]
        Effect = "Allow"
        Resource = [var.kms_key_arn]
      },
      {
        Action = ["kms:Encrypt"]
        Effect = "Allow"
        Resource = [aws_kms_key.dr_replica.arn]
      },
    ]
  })
}

resource "aws_s3_bucket_replication_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  role   = aws_iam_role.replication.arn

  rule {
    id     = "evidence-dr"
    status = "Enabled"
    filter {}
    delete_marker_replication { status = "Enabled" }

    destination {
      bucket        = aws_s3_bucket.evidence_replica.arn
      storage_class = "STANDARD_IA"

      encryption_configuration {
        replica_kms_key_id = aws_kms_key.dr_replica.arn
      }
    }

    source_selection_criteria {
      sse_kms_encrypted_objects { status = "Enabled" }
    }
  }

  depends_on = [
    aws_s3_bucket_versioning.evidence,
    aws_s3_bucket_versioning.evidence_replica,
  ]
}

# Reports bucket --------------------------------------------------------------

resource "aws_s3_bucket" "reports" {
  bucket              = "${var.name}-reports-${var.account_id}"
  object_lock_enabled = true
  force_destroy       = false
  tags                = merge(var.tags, { Name = "${var.name}-reports", DataClass = "customer-reports" })
}

resource "aws_s3_bucket_versioning" "reports" {
  bucket = aws_s3_bucket.reports.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_object_lock_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      years = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket                  = aws_s3_bucket.reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Backups bucket --------------------------------------------------------------

resource "aws_s3_bucket" "backups" {
  bucket        = "${var.name}-backups-${var.account_id}"
  force_destroy = false
  tags          = merge(var.tags, { Name = "${var.name}-backups", DataClass = "backup" })
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "to-glacier"
    status = "Enabled"
    filter { prefix = "" }
    transition  { days = 30,  storage_class = "GLACIER" }
    transition  { days = 180, storage_class = "DEEP_ARCHIVE" }
    expiration  { days = 2557 } # 7 years
  }
}

# Bucket policy: TLS-only, deny non-KMS uploads --------------------------------

resource "aws_s3_bucket_policy" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.evidence.arn, "${aws_s3_bucket.evidence.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyUnencryptedPut"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.evidence.arn}/*"
        Condition = { StringNotEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" } }
      },
    ]
  })
}

# Outputs ---------------------------------------------------------------------

output "evidence_bucket_name" { value = aws_s3_bucket.evidence.id }
output "evidence_bucket_arn"  { value = aws_s3_bucket.evidence.arn }
output "reports_bucket_name"  { value = aws_s3_bucket.reports.id }
output "reports_bucket_arn"   { value = aws_s3_bucket.reports.arn }
output "backups_bucket_name"  { value = aws_s3_bucket.backups.id }
output "backups_bucket_arn"   { value = aws_s3_bucket.backups.arn }
