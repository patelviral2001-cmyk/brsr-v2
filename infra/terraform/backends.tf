# S3 backend with DynamoDB state locking.
# Bootstrapped once per AWS account by ./bootstrap/.

terraform {
  backend "s3" {
    # Overridden per env via -backend-config=backends/<env>.hcl
    bucket         = "brsr-tfstate-PLACEHOLDER"
    key            = "brsr-ai-platform/main.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "brsr-tflock"
    encrypt        = true
    kms_key_id     = "alias/aws/s3"
  }
}
