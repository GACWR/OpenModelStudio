use anyhow::Result;
use aws_sdk_s3::Client as S3Client;

/// Streaming data loader for S3 objects.
/// Paginates through objects under a prefix and yields them one at a time.
pub struct S3StreamLoader {
    client: S3Client,
    bucket: String,
    prefix: String,
}

impl S3StreamLoader {
    pub fn new(client: S3Client, bucket: String, prefix: String) -> Self {
        Self { client, bucket, prefix }
    }

    /// Iterate over all objects under the prefix, yielding (key, bytes).
    pub async fn iter(&self) -> Result<Vec<(String, Vec<u8>)>> {
        let mut results = Vec::new();
        let mut continuation_token: Option<String> = None;

        loop {
            let mut req = self.client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(&self.prefix);

            if let Some(token) = &continuation_token {
                req = req.continuation_token(token);
            }

            let resp = req.send().await?;
            for obj in resp.contents() {
                if let Some(key) = obj.key() {
                    let get_resp = self.client
                        .get_object()
                        .bucket(&self.bucket)
                        .key(key)
                        .send()
                        .await?;
                    let data = get_resp.body.collect().await?.into_bytes().to_vec();
                    results.push((key.to_string(), data));
                }
            }

            if resp.is_truncated() == Some(true) {
                continuation_token = resp.next_continuation_token().map(|s| s.to_string());
            } else {
                break;
            }
        }

        Ok(results)
    }
}
