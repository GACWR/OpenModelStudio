use sqlx::PgPool;
use uuid::Uuid;

/// Notification severity / category.
pub enum NotifyType {
    Info,
    Success,
    Warning,
    Error,
}

impl NotifyType {
    pub fn as_str(&self) -> &'static str {
        match self {
            NotifyType::Info => "info",
            NotifyType::Success => "success",
            NotifyType::Warning => "warning",
            NotifyType::Error => "error",
        }
    }
}

/// Fire-and-forget notification insert.
/// Errors are logged but never propagated to the calling handler.
pub async fn notify(
    db: &PgPool,
    user_id: Uuid,
    title: &str,
    message: &str,
    notification_type: NotifyType,
    link: Option<&str>,
) {
    let result = sqlx::query(
        "INSERT INTO notifications (id, user_id, title, message, notification_type, read, link, created_at)
         VALUES ($1, $2, $3, $4, $5, false, $6, NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(title)
    .bind(message)
    .bind(notification_type.as_str())
    .bind(link)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::warn!("Failed to create notification: {e}");
    }
}
