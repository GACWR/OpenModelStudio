use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::presigning::PresigningConfig;
use std::time::Duration;

use crate::config::Config;

pub struct S3Service {
    client: S3Client,
    bucket: String,
}

impl S3Service {
    pub async fn new(config: &Config) -> Self {
        let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(aws_sdk_s3::config::Region::new(config.s3_region.clone()))
            .load()
            .await;
        let client = S3Client::new(&aws_config);
        Self {
            client,
            bucket: config.s3_bucket.clone(),
        }
    }

    /// Generate a presigned upload URL
    pub async fn presign_upload(
        &self,
        key: &str,
        content_type: &str,
        expires_in_secs: u64,
    ) -> Result<String, aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::put_object::PutObjectError>>
    {
        let presigning = PresigningConfig::builder()
            .expires_in(Duration::from_secs(expires_in_secs))
            .build()
            .expect("valid presigning config");

        let req = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(content_type)
            .presigned(presigning)
            .await?;

        Ok(req.uri().to_string())
    }

    /// Generate a presigned download URL
    pub async fn presign_download(
        &self,
        key: &str,
        expires_in_secs: u64,
    ) -> Result<String, aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::get_object::GetObjectError>>
    {
        let presigning = PresigningConfig::builder()
            .expires_in(Duration::from_secs(expires_in_secs))
            .build()
            .expect("valid presigning config");

        let req = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(presigning)
            .await?;

        Ok(req.uri().to_string())
    }
}
